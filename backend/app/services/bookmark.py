"""
书签服务
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from sqlalchemy.orm import selectinload
from typing import List, Optional
import uuid
import asyncio

from app.models.bookmark import Bookmark
from app.models.category import CategoryOrder
from app.schemas.bookmark import BookmarkCreate, BookmarkUpdate


async def get_bookmarks(
    session: AsyncSession,
    include_hidden: bool = False,
) -> List[Bookmark]:
    """获取所有书签 (按分类和顺序排列)"""
    # 先获取分类顺序
    cat_result = await session.execute(
        select(CategoryOrder).order_by(CategoryOrder.order)
    )
    category_orders = {c.category: c.order for c in cat_result.scalars().all()}

    # 获取书签
    query = select(Bookmark)
    if not include_hidden:
        query = query.where(Bookmark.visible == True)

    result = await session.execute(query)
    bookmarks = result.scalars().all()

    # 按分类顺序和书签顺序排序
    def sort_key(b):
        cat_order = category_orders.get(b.category, 999999)
        return (cat_order, b.order)

    return sorted(bookmarks, key=sort_key)


async def get_bookmark_by_id(
    session: AsyncSession,
    bookmark_id: str
) -> Optional[Bookmark]:
    """获取单个书签"""
    result = await session.execute(
        select(Bookmark).where(Bookmark.id == bookmark_id)
    )
    return result.scalar_one_or_none()


async def create_bookmark(
    session: AsyncSession,
    data: BookmarkCreate
) -> Bookmark:
    """创建书签"""
    # 获取该分类的最大顺序
    result = await session.execute(
        select(func.max(Bookmark.order)).where(Bookmark.category == data.category)
    )
    max_order = result.scalar() or 0

    bookmark = Bookmark(
        id=str(uuid.uuid4()),
        title=data.title,
        url=data.url,
        category=data.category,
        description=data.description,
        tags=data.tags,
        visible=data.visible,
        order=max_order + 1,
    )
    session.add(bookmark)

    # 确保分类在排序表中
    if data.category:
        await ensure_category_exists(session, data.category)

    await session.commit()
    await session.refresh(bookmark)

    return bookmark


async def update_bookmark(
    session: AsyncSession,
    bookmark_id: str,
    data: BookmarkUpdate
) -> Optional[Bookmark]:
    """更新书签"""
    bookmark = await get_bookmark_by_id(session, bookmark_id)
    if bookmark is None:
        return None

    update_data = data.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        setattr(bookmark, key, value)

    # 如果分类变了，确保新分类存在
    if "category" in update_data and update_data["category"]:
        await ensure_category_exists(session, update_data["category"])

    await session.commit()
    await session.refresh(bookmark)

    return bookmark


async def delete_bookmark(
    session: AsyncSession,
    bookmark_id: str
) -> bool:
    """删除书签"""
    bookmark = await get_bookmark_by_id(session, bookmark_id)
    if bookmark is None:
        return False

    await session.delete(bookmark)
    await session.commit()
    return True


async def reorder_bookmarks(
    session: AsyncSession,
    category: str,
    bookmark_ids: List[str]
) -> bool:
    """重新排序分类内的书签"""
    for index, bid in enumerate(bookmark_ids):
        result = await session.execute(
            select(Bookmark).where(Bookmark.id == bid)
        )
        bookmark = result.scalar_one_or_none()
        if bookmark:
            bookmark.order = index

    await session.commit()
    return True


async def get_categories(session: AsyncSession) -> List[str]:
    """获取所有分类"""
    result = await session.execute(
        select(Bookmark.category)
        .where(Bookmark.category.isnot(None))
        .distinct()
    )
    return [r[0] for r in result.all() if r[0]]


async def ensure_category_exists(session: AsyncSession, category: str):
    """确保分类在排序表中"""
    result = await session.execute(
        select(CategoryOrder).where(CategoryOrder.category == category)
    )
    if result.scalar_one_or_none() is None:
        # 获取最大顺序
        max_result = await session.execute(select(func.max(CategoryOrder.order)))
        max_order = max_result.scalar() or 0

        cat_order = CategoryOrder(category=category, order=max_order + 1)
        session.add(cat_order)


async def get_category_order(session: AsyncSession) -> List[CategoryOrder]:
    """获取分类排序"""
    result = await session.execute(
        select(CategoryOrder).order_by(CategoryOrder.order)
    )
    return list(result.scalars().all())


async def reorder_categories(
    session: AsyncSession,
    categories: List[str]
) -> bool:
    """重新排序分类"""
    for index, cat in enumerate(categories):
        result = await session.execute(
            select(CategoryOrder).where(CategoryOrder.category == cat)
        )
        cat_order = result.scalar_one_or_none()
        if cat_order:
            cat_order.order = index
        else:
            session.add(CategoryOrder(category=cat, order=index))

    await session.commit()
    return True


async def create_category(session: AsyncSession, category: str) -> CategoryOrder:
    """创建新分类"""
    # 检查是否已存在
    result = await session.execute(
        select(CategoryOrder).where(CategoryOrder.category == category)
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing

    # 获取最大顺序
    max_result = await session.execute(select(func.max(CategoryOrder.order)))
    max_order = max_result.scalar() or 0

    cat_order = CategoryOrder(category=category, order=max_order + 1)
    session.add(cat_order)
    await session.commit()
    await session.refresh(cat_order)
    return cat_order


async def delete_category(session: AsyncSession, category: str) -> bool:
    """删除分类（仅从排序表中删除，不影响书签）"""
    result = await session.execute(
        select(CategoryOrder).where(CategoryOrder.category == category)
    )
    cat_order = result.scalar_one_or_none()
    if cat_order:
        await session.delete(cat_order)
        await session.commit()
        return True
    return False


async def import_bookmarks(
    session: AsyncSession,
    bookmarks_data: List[dict],
    skip_category: bool = False
) -> int:
    """批量导入书签"""
    count = 0
    added_categories = set()

    for data in bookmarks_data:
        bookmark = Bookmark(
            id=data.get("id") or str(uuid.uuid4()),
            title=data["title"],
            url=data["url"],
            category=data.get("category"),
            description=data.get("description"),
            tags=data.get("tags"),
            visible=data.get("visible", True),
            order=data.get("order", 0),
        )
        session.add(bookmark)

        # 只在不跳过分类且分类未添加过时处理
        if not skip_category and bookmark.category and bookmark.category not in added_categories:
            await ensure_category_exists(session, bookmark.category)
            added_categories.add(bookmark.category)

        count += 1

    await session.commit()
    return count
