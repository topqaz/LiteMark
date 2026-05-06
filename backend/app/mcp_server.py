"""LiteMark built-in MCP server mounted by the FastAPI application at /mcp."""
from __future__ import annotations

import asyncio
import hmac
import json
from typing import Any, Optional

from mcp.server.fastmcp import FastMCP
from sqlalchemy import select

from app.database import async_session_maker, init_db
from app.models.settings import SiteSettings
from app.schemas.bookmark import BookmarkCreate, BookmarkUpdate
from app.services.bookmark import (
    create_bookmark,
    create_category,
    delete_bookmark,
    delete_category,
    get_bookmark_by_id,
    get_bookmarks,
    get_categories,
    reorder_bookmarks as reorder_bookmarks_service,
    reorder_categories as reorder_categories_service,
    update_bookmark,
    update_category,
)


mcp = FastMCP(
    "LiteMark",
    instructions=(
        "Manage LiteMark bookmarks and categories. Use these tools to list, add, "
        "edit, move, reorder, hide, and delete bookmarks."
    ),
    stateless_http=True,
    streamable_http_path="/",
)


def _serialize_bookmark(bookmark: Any) -> dict[str, Any]:
    return bookmark.to_dict()


def _normalize_tags(tags: Optional[str | list[str]]) -> Optional[str]:
    if tags is None:
        return None
    if isinstance(tags, list):
        return json.dumps(tags, ensure_ascii=False)
    return tags


def _compact_payload(data: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in data.items() if value is not None}


@mcp.tool()
async def list_litemark_bookmarks(
    include_hidden: bool = True,
    category: Optional[str] = None,
    query: Optional[str] = None,
    limit: int = 200,
) -> dict[str, Any]:
    """List LiteMark bookmarks, optionally filtered by category and text query."""
    limit = max(1, min(limit, 1000))
    query_text = query.lower().strip() if query else None

    async with async_session_maker() as session:
        bookmarks = await get_bookmarks(session, include_hidden=include_hidden)

    items = []
    for bookmark in bookmarks:
        item = _serialize_bookmark(bookmark)
        if category is not None and item.get("category") != category:
            continue
        if query_text:
            haystack = " ".join(
                str(item.get(field) or "")
                for field in ("title", "url", "category", "description", "tags")
            ).lower()
            if query_text not in haystack:
                continue
        items.append(item)
        if len(items) >= limit:
            break

    return {"count": len(items), "bookmarks": items}


@mcp.tool()
async def get_litemark_bookmark(bookmark_id: str) -> dict[str, Any]:
    """Get one LiteMark bookmark by id."""
    async with async_session_maker() as session:
        bookmark = await get_bookmark_by_id(session, bookmark_id)
        if bookmark is None:
            return {"success": False, "error": "书签不存在"}
        return {"success": True, "bookmark": _serialize_bookmark(bookmark)}


@mcp.tool()
async def add_litemark_bookmark(
    title: str,
    url: str,
    category: Optional[str] = None,
    description: Optional[str] = None,
    tags: Optional[str | list[str]] = None,
    visible: bool = True,
) -> dict[str, Any]:
    """Add a LiteMark bookmark."""
    title_text = title.strip()
    url_text = url.strip()
    if not title_text or not url_text:
        return {"success": False, "error": "标题和 URL 不能为空"}

    data = BookmarkCreate(
        title=title_text,
        url=url_text,
        category=category.strip() if category else None,
        description=description,
        tags=_normalize_tags(tags),
        visible=visible,
    )

    async with async_session_maker() as session:
        bookmark = await create_bookmark(session, data)
        return {"success": True, "bookmark": _serialize_bookmark(bookmark)}


@mcp.tool()
async def update_litemark_bookmark(
    bookmark_id: str,
    title: Optional[str] = None,
    url: Optional[str] = None,
    category: Optional[str] = None,
    description: Optional[str] = None,
    tags: Optional[str | list[str]] = None,
    visible: Optional[bool] = None,
    order: Optional[int] = None,
) -> dict[str, Any]:
    """Update a LiteMark bookmark. Omitted fields are left unchanged."""
    payload = _compact_payload(
        {
            "title": title.strip() if title is not None else None,
            "url": url.strip() if url is not None else None,
            "category": category.strip() if category is not None else None,
            "description": description,
            "tags": _normalize_tags(tags),
            "visible": visible,
            "order": order,
        }
    )
    if payload.get("title") == "" or payload.get("url") == "":
        return {"success": False, "error": "标题和 URL 不能为空"}

    async with async_session_maker() as session:
        bookmark = await update_bookmark(session, bookmark_id, BookmarkUpdate(**payload))
        if bookmark is None:
            return {"success": False, "error": "书签不存在"}
        return {"success": True, "bookmark": _serialize_bookmark(bookmark)}


@mcp.tool()
async def delete_litemark_bookmark(bookmark_id: str) -> dict[str, Any]:
    """Delete a LiteMark bookmark by id."""
    async with async_session_maker() as session:
        success = await delete_bookmark(session, bookmark_id)
    if not success:
        return {"success": False, "error": "书签不存在"}
    return {"success": True, "deleted_id": bookmark_id}


@mcp.tool()
async def list_litemark_categories() -> dict[str, Any]:
    """List LiteMark categories in display order."""
    async with async_session_maker() as session:
        categories = await get_categories(session)
    return {"categories": categories}


@mcp.tool()
async def add_litemark_category(category: str) -> dict[str, Any]:
    """Create a LiteMark category if it does not already exist."""
    category_name = category.strip()
    if not category_name:
        return {"success": False, "error": "分类名称不能为空"}

    async with async_session_maker() as session:
        cat_order = await create_category(session, category_name)
        return {
            "success": True,
            "category": cat_order.category,
            "order": cat_order.order,
        }


@mcp.tool()
async def rename_litemark_category(old_name: str, new_name: str) -> dict[str, Any]:
    """Rename a LiteMark category and move all bookmarks in that category."""
    old_category = old_name.strip()
    new_category = new_name.strip()
    if not old_category or not new_category:
        return {"success": False, "error": "分类名称不能为空"}

    async with async_session_maker() as session:
        success = await update_category(session, old_category, new_category)
    if not success:
        return {"success": False, "error": "分类不存在或新名称已被使用"}
    return {"success": True, "category": new_category}


@mcp.tool()
async def delete_litemark_category(category: str) -> dict[str, Any]:
    """Delete a LiteMark category record. Bookmarks in the category are not deleted."""
    category_name = category.strip()
    if not category_name:
        return {"success": False, "error": "分类名称不能为空"}

    async with async_session_maker() as session:
        success = await delete_category(session, category_name)
    if not success:
        return {"success": False, "error": "分类不存在"}
    return {"success": True, "category": category_name}


@mcp.tool()
async def reorder_litemark_bookmarks(
    category: str,
    bookmark_ids: list[str],
) -> dict[str, Any]:
    """Set display order for bookmarks in a category using an ordered id list."""
    async with async_session_maker() as session:
        await reorder_bookmarks_service(session, category, bookmark_ids)
    return {"success": True, "ordered_ids": bookmark_ids}


@mcp.tool()
async def reorder_litemark_categories(categories: list[str]) -> dict[str, Any]:
    """Set category display order using an ordered category-name list."""
    clean_categories = [category.strip() for category in categories if category.strip()]
    async with async_session_maker() as session:
        await reorder_categories_service(session, clean_categories)
    return {"success": True, "categories": clean_categories}


class MCPAuthMiddleware:
    """Small ASGI wrapper that protects the mounted MCP endpoint."""

    def __init__(
        self,
        app: Any,
    ) -> None:
        self.app = app

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        config = await self._load_config()
        if not config["enabled"]:
            await self._send_json(send, 404, {"detail": "MCP 未启用"}, origin=None)
            return

        headers = {
            key.decode("latin-1").lower(): value.decode("latin-1")
            for key, value in scope.get("headers", [])
        }
        origin = headers.get("origin")
        allowed_origins = self._parse_origins(config["allowed_origins"])

        if not self._origin_allowed(origin, allowed_origins):
            await self._send_json(
                send,
                403,
                {"detail": "MCP Origin 不被允许"},
                origin=None,
            )
            return

        if scope.get("method") == "OPTIONS":
            await self._send_empty(send, 204, origin=origin)
            return

        bearer = self._extract_bearer(headers.get("authorization", ""))
        if not config["token"] or not bearer or not hmac.compare_digest(bearer, config["token"]):
            await self._send_json(
                send,
                401,
                {"detail": "MCP Token 无效或缺失"},
                origin=origin,
                extra_headers=[(b"www-authenticate", b"Bearer")],
            )
            return

        await self.app(scope, receive, send)

    async def _load_config(self) -> dict[str, str | bool]:
        async with async_session_maker() as session:
            result = await session.execute(
                select(SiteSettings).where(
                    SiteSettings.key.in_(
                        ("mcp_enabled", "mcp_token", "mcp_allowed_origins")
                    )
                )
            )
            settings = {item.key: item.value for item in result.scalars().all()}

        return {
            "enabled": settings.get("mcp_enabled", "false").lower() == "true",
            "token": settings.get("mcp_token", ""),
            "allowed_origins": settings.get("mcp_allowed_origins", ""),
        }

    @staticmethod
    def _parse_origins(value: str) -> set[str]:
        return {item.strip() for item in value.split(",") if item.strip()}

    @staticmethod
    def _origin_allowed(origin: Optional[str], allowed_origins: set[str]) -> bool:
        if not origin:
            return True
        return "*" in allowed_origins or origin in allowed_origins

    @staticmethod
    def _extract_bearer(value: str) -> Optional[str]:
        scheme, _, token = value.partition(" ")
        if scheme.lower() != "bearer" or not token:
            return None
        return token.strip()

    async def _send_empty(
        self,
        send: Any,
        status: int,
        *,
        origin: Optional[str],
    ) -> None:
        headers = self._cors_headers(origin)
        await send({"type": "http.response.start", "status": status, "headers": headers})
        await send({"type": "http.response.body", "body": b""})

    async def _send_json(
        self,
        send: Any,
        status: int,
        payload: dict[str, Any],
        *,
        origin: Optional[str],
        extra_headers: Optional[list[tuple[bytes, bytes]]] = None,
    ) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers = [
            (b"content-type", b"application/json; charset=utf-8"),
            *self._cors_headers(origin),
            *(extra_headers or []),
        ]
        await send({"type": "http.response.start", "status": status, "headers": headers})
        await send({"type": "http.response.body", "body": body})

    def _cors_headers(self, origin: Optional[str]) -> list[tuple[bytes, bytes]]:
        headers = [
            (b"access-control-allow-methods", b"GET, POST, DELETE, OPTIONS"),
            (
                b"access-control-allow-headers",
                b"authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id",
            ),
            (b"access-control-expose-headers", b"mcp-session-id"),
        ]
        if origin:
            headers.append((b"access-control-allow-origin", origin.encode("latin-1")))
        return headers


def create_mcp_asgi_app() -> Any:
    """Create the authenticated ASGI app mounted by FastAPI."""
    return MCPAuthMiddleware(mcp.streamable_http_app())


def main() -> None:
    asyncio.run(init_db())
    mcp.run(transport="streamable-http")


if __name__ == "__main__":
    main()
