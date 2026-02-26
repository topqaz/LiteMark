"""
内容摘要服务
"""
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import json
from datetime import datetime

from app.models.bookmark import Bookmark
from app.services.ai.llm import chat_completion_json
from app.utils.web_scraper import fetch_page_content


SUMMARIZE_SYSTEM_PROMPT = """你是一个网页内容分析专家。请分析网页内容并生成摘要。

要求：
1. 生成简洁的摘要（50-150字）
2. 提取3-5个关键标签
3. 估算阅读时间（分钟）

请以 JSON 格式返回：
{
    "summary": "网页内容摘要...",
    "tags": ["标签1", "标签2", "标签3"],
    "reading_time": 5
}
"""


async def summarize_url(url: str, title: Optional[str] = None) -> dict:
    """
    生成 URL 内容摘要

    Returns:
        {
            "summary": str,
            "tags": List[str],
            "reading_time": int
        }
    """
    # 抓取网页内容
    page_data = await fetch_page_content(url)

    if not page_data:
        return {
            "summary": "无法获取网页内容",
            "tags": [],
            "reading_time": None,
        }

    content = page_data.get("content", "")
    if not content:
        return {
            "summary": page_data.get("description", "无内容"),
            "tags": [],
            "reading_time": None,
        }

    # 构建提示
    prompt = f"""请分析以下网页并生成摘要：

标题：{title or page_data.get('title', '未知')}
URL：{url}
描述：{page_data.get('description', '无')}

网页内容：
{content[:3000]}

请生成摘要、标签和预计阅读时间。"""

    result = await chat_completion_json(prompt, SUMMARIZE_SYSTEM_PROMPT)

    return {
        "summary": result.get("summary", ""),
        "tags": result.get("tags", []),
        "reading_time": result.get("reading_time"),
    }


async def summarize_bookmark(
    session: AsyncSession,
    bookmark_id: str
) -> dict:
    """为书签生成摘要"""
    result = await session.execute(
        select(Bookmark).where(Bookmark.id == bookmark_id)
    )
    bookmark = result.scalar_one_or_none()

    if not bookmark:
        raise ValueError(f"书签不存在: {bookmark_id}")

    summary_data = await summarize_url(bookmark.url, bookmark.title)

    # 更新书签
    bookmark.description = summary_data["summary"]
    bookmark.tags = json.dumps(summary_data["tags"], ensure_ascii=False)
    await session.commit()

    return summary_data


async def batch_summarize(
    session: AsyncSession,
    bookmark_ids: Optional[List[str]] = None,
    task=None
) -> dict:
    """批量生成摘要"""
    query = select(Bookmark).where(Bookmark.description.is_(None))
    if bookmark_ids:
        query = query.where(Bookmark.id.in_(bookmark_ids))

    result = await session.execute(query)
    bookmarks = result.scalars().all()

    processed = 0
    failed = 0
    errors = []

    # 更新任务总数
    if task:
        task.total = len(bookmarks)
        task.status = "running"
        task.started_at = datetime.now()

    for bookmark in bookmarks:
        try:
            summary_data = await summarize_url(bookmark.url, bookmark.title)
            bookmark.description = summary_data["summary"]
            bookmark.tags = json.dumps(summary_data["tags"], ensure_ascii=False)
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
