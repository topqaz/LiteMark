"""
智能分类服务
"""
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime

from app.models.bookmark import Bookmark
from app.services.ai.llm import chat_completion_json
from app.utils.web_scraper import fetch_page_content


CLASSIFY_SYSTEM_PROMPT = """你是一个书签分类专家。根据书签的信息，推荐一个合适的分类。

要求：
1. 分析书签的标题、描述和网页内容
2. 优先从现有分类中选择最匹配的
3. 如果现有分类都不合适，可以建议一个新分类
4. 分类名称应该简洁（2-4个字）
5. 给出推荐理由和置信度

请以 JSON 格式返回：
{
    "suggested_category": "分类名称",
    "confidence": 0.85,
    "reasoning": "推荐理由"
}
"""


async def classify_bookmark(
    session: AsyncSession,
    title: str,
    url: str,
    description: Optional[str] = None,
    existing_categories: Optional[List[str]] = None,
) -> dict:
    """
    对书签进行智能分类

    Returns:
        {
            "suggested_category": str,
            "confidence": float,
            "reasoning": str,
            "existing_categories": List[str]
        }
    """
    # 获取现有分类
    if existing_categories is None:
        result = await session.execute(
            select(Bookmark.category).distinct().where(Bookmark.category.isnot(None))
        )
        existing_categories = [r[0] for r in result.all() if r[0]]

    # 尝试抓取网页内容
    page_content = None
    try:
        page_data = await fetch_page_content(url)
        if page_data:
            page_content = page_data.get("content", "")[:2000]
    except Exception:
        pass

    # 构建提示
    prompt = f"""请对以下书签进行分类：

标题：{title}
URL：{url}
描述：{description or '无'}
网页内容摘要：{page_content or '无法获取'}

现有分类：{', '.join(existing_categories) if existing_categories else '暂无分类'}

请推荐最合适的分类。"""

    result = await chat_completion_json(prompt, CLASSIFY_SYSTEM_PROMPT)

    return {
        "suggested_category": result.get("suggested_category", "未分类"),
        "confidence": result.get("confidence", 0.5),
        "reasoning": result.get("reasoning", ""),
        "existing_categories": existing_categories,
    }


async def batch_classify(
    session: AsyncSession,
    bookmark_ids: Optional[List[str]] = None,
    task=None
) -> dict:
    """批量分类书签"""
    # 获取需要分类的书签（没有分类的书签）
    query = select(Bookmark).where(Bookmark.category.is_(None))
    if bookmark_ids:
        query = query.where(Bookmark.id.in_(bookmark_ids))

    result = await session.execute(query)
    bookmarks = result.scalars().all()

    processed = 0
    failed = 0
    errors = []

    # 获取现有分类
    cat_result = await session.execute(
        select(Bookmark.category).distinct().where(Bookmark.category.isnot(None))
    )
    existing_categories = [r[0] for r in cat_result.all() if r[0]]

    # 更新任务总数
    if task:
        task.total = len(bookmarks)
        task.status = "running"
        task.started_at = datetime.now()

    for bookmark in bookmarks:
        try:
            classification = await classify_bookmark(
                session,
                bookmark.title,
                bookmark.url,
                bookmark.description,
                existing_categories,
            )
            bookmark.category = classification["suggested_category"]
            processed += 1
        except Exception as e:
            failed += 1
            errors.append(f"{bookmark.title[:20]}: {str(e)[:50]}")

        # 更新进度
        if task:
            task.processed = processed
            task.failed = failed
            task.errors = errors

    await session.commit()

    # 完成任务
    if task:
        task.status = "completed"
        task.completed_at = datetime.now()

    return {
        "processed": processed,
        "failed": failed,
        "errors": errors,
    }
