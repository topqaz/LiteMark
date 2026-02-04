"""
书签 API
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.database import get_db
from app.schemas.bookmark import (
    BookmarkCreate,
    BookmarkUpdate,
    BookmarkResponse,
    BookmarkImport,
    ReorderRequest,
    CategoryReorderRequest,
)
from app.services.bookmark import (
    get_bookmarks,
    get_bookmark_by_id,
    create_bookmark,
    update_bookmark,
    delete_bookmark,
    reorder_bookmarks,
    reorder_categories,
    get_categories,
    get_category_order,
    import_bookmarks,
    create_category,
    delete_category,
)
from app.utils.security import get_current_user, get_optional_user

router = APIRouter()


@router.get("", response_model=List[BookmarkResponse])
async def list_bookmarks(
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_optional_user)
):
    """获取书签列表"""
    include_hidden = current_user is not None
    bookmarks = await get_bookmarks(session, include_hidden=include_hidden)
    return [BookmarkResponse.model_validate(b.to_dict()) for b in bookmarks]


@router.get("/categories")
async def list_categories(
    session: AsyncSession = Depends(get_db)
):
    """获取所有分类"""
    categories = await get_categories(session)
    category_order = await get_category_order(session)

    # 按顺序返回
    order_map = {c.category: c.order for c in category_order}
    sorted_categories = sorted(categories, key=lambda c: order_map.get(c, 999999))

    return {"categories": sorted_categories}


@router.get("/{bookmark_id}", response_model=BookmarkResponse)
async def get_bookmark(
    bookmark_id: str,
    session: AsyncSession = Depends(get_db)
):
    """获取单个书签"""
    bookmark = await get_bookmark_by_id(session, bookmark_id)
    if bookmark is None:
        raise HTTPException(status_code=404, detail="书签不存在")

    return BookmarkResponse.model_validate(bookmark.to_dict())


@router.post("", response_model=BookmarkResponse, status_code=status.HTTP_201_CREATED)
async def create_new_bookmark(
    data: BookmarkCreate,
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """创建书签"""
    bookmark = await create_bookmark(session, data)
    return BookmarkResponse.model_validate(bookmark.to_dict())


@router.put("/{bookmark_id}", response_model=BookmarkResponse)
async def update_existing_bookmark(
    bookmark_id: str,
    data: BookmarkUpdate,
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """更新书签"""
    bookmark = await update_bookmark(session, bookmark_id, data)
    if bookmark is None:
        raise HTTPException(status_code=404, detail="书签不存在")

    return BookmarkResponse.model_validate(bookmark.to_dict())


@router.delete("/{bookmark_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_existing_bookmark(
    bookmark_id: str,
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """删除书签"""
    success = await delete_bookmark(session, bookmark_id)
    if not success:
        raise HTTPException(status_code=404, detail="书签不存在")


@router.post("/import")
async def import_bookmarks_endpoint(
    data: BookmarkImport,
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """批量导入书签"""
    bookmarks_data = [b.model_dump() for b in data.bookmarks]
    count = await import_bookmarks(session, bookmarks_data)
    return {"imported": count}


@router.post("/reorder")
async def reorder_bookmarks_endpoint(
    data: ReorderRequest,
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """重新排序书签"""
    bookmark_ids = data.get_ids()
    if not bookmark_ids:
        return {"success": True}
    await reorder_bookmarks(session, data.category, bookmark_ids)
    return {"success": True}


@router.post("/reorder-categories")
async def reorder_categories_endpoint(
    data: CategoryReorderRequest,
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """重新排序分类"""
    categories = data.get_categories()
    if not categories:
        return {"success": True}
    await reorder_categories(session, categories)
    return {"success": True}


@router.post("/categories")
async def create_category_endpoint(
    data: dict,
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """创建新分类"""
    category_name = data.get("category", "").strip()
    if not category_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="分类名称不能为空"
        )
    cat_order = await create_category(session, category_name)
    return {"success": True, "category": cat_order.category, "order": cat_order.order}


@router.delete("/categories/{category_name}")
async def delete_category_endpoint(
    category_name: str,
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """删除分类"""
    success = await delete_category(session, category_name)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="分类不存在"
        )
    return {"success": True}
