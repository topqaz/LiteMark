"""
AI 功能 API - 智能分类和内容摘要
"""
import asyncio
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, async_session_maker
from app.schemas.ai import (
    ClassifyRequest,
    ClassifyResponse,
    SummarizeRequest,
    SummarizeResponse,
    BatchProcessRequest,
    BatchProcessResponse,
)
from app.services.ai.classifier import classify_bookmark, batch_classify
from app.services.ai.summarizer import summarize_bookmark, summarize_url, batch_summarize
from app.services.ai.task_progress import create_task, get_task, get_all_tasks, cleanup_old_tasks
from app.services.bookmark import get_bookmark_by_id, get_categories
from app.utils.security import get_current_user, get_optional_user
from app.config import get_settings

router = APIRouter()
settings = get_settings()


def check_openai_configured():
    """检查 AI 是否配置"""
    from app.services.ai.llm import get_effective_config

    config = get_effective_config()
    if not config["api_key"] or config["api_key"] == "sk-no-key-required":
        raise HTTPException(
            status_code=503,
            detail="AI 未配置。请在后台设置中配置 AI API"
        )


@router.post("/classify", response_model=ClassifyResponse)
async def classify_endpoint(
    data: ClassifyRequest,
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_optional_user)
):
    """智能分类 - 为书签推荐分类"""
    check_openai_configured()

    # 获取书签信息
    if data.bookmark_id:
        bookmark = await get_bookmark_by_id(session, data.bookmark_id)
        if not bookmark:
            raise HTTPException(status_code=404, detail="书签不存在")
        title = bookmark.title
        url = bookmark.url
        description = bookmark.description
    elif data.url:
        title = data.title or ""
        url = data.url
        description = data.description
    else:
        raise HTTPException(status_code=400, detail="请提供 bookmark_id 或 url")

    existing_categories = await get_categories(session)

    result = await classify_bookmark(
        session,
        title=title,
        url=url,
        description=description,
        existing_categories=existing_categories,
    )

    return ClassifyResponse(**result)


@router.post("/summarize", response_model=SummarizeResponse)
async def summarize_endpoint(
    data: SummarizeRequest,
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_optional_user)
):
    """内容摘要 - 抓取网页并生成摘要"""
    check_openai_configured()

    if data.bookmark_id:
        result = await summarize_bookmark(session, data.bookmark_id)
    elif data.url:
        result = await summarize_url(data.url)
    else:
        raise HTTPException(status_code=400, detail="请提供 bookmark_id 或 url")

    return SummarizeResponse(**result)


async def run_batch_task(task, operations: list, bookmark_ids: list = None):
    """后台执行批量任务"""
    async with async_session_maker() as session:
        try:
            for operation in operations:
                if operation == "summarize":
                    await batch_summarize(session, bookmark_ids, task=task)
                elif operation == "classify":
                    await batch_classify(session, bookmark_ids, task=task)
        except Exception as e:
            task.status = "failed"
            task.errors.append(str(e))


@router.post("/batch")
async def batch_process_endpoint(
    data: BatchProcessRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    批量处理 - 为书签批量生成 AI 内容（后台执行）

    operations 可选值:
    - summarize: 生成摘要
    - classify: 智能分类

    返回 task_id，可通过 /api/ai/task/{task_id} 查询进度
    """
    check_openai_configured()

    # 清理旧任务
    cleanup_old_tasks()

    # 创建任务
    operation_name = "+".join(data.operations)
    task = create_task(operation_name)

    # 后台执行
    background_tasks.add_task(
        run_batch_task,
        task,
        data.operations,
        data.bookmark_ids
    )

    return {
        "task_id": task.task_id,
        "message": "任务已创建，正在后台执行",
        "status": task.status,
    }


@router.get("/task/{task_id}")
async def get_task_progress(
    task_id: str,
    current_user: dict = Depends(get_current_user)
):
    """获取批量任务进度"""
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    return task.to_dict()


@router.get("/tasks")
async def list_tasks(
    current_user: dict = Depends(get_current_user)
):
    """获取所有任务列表"""
    return get_all_tasks()


@router.get("/status")
async def ai_status(
    session: AsyncSession = Depends(get_db)
):
    """检查 AI 服务状态"""
    from app.services.ai.llm import get_effective_config

    config = get_effective_config()

    return {
        "openai_configured": bool(config["api_key"] and config["api_key"] != "sk-no-key-required"),
        "openai_model": config["model"],
        "openai_base_url": config["base_url"] or "",
    }


@router.post("/fetch-page-info")
async def fetch_page_info_endpoint(
    data: SummarizeRequest,
    current_user: dict = Depends(get_optional_user)
):
    """获取网页信息（标题、描述等）- 不需要 AI"""
    from app.utils.web_scraper import fetch_page_content

    if not data.url:
        raise HTTPException(status_code=400, detail="请提供 url")

    page_data = await fetch_page_content(data.url)

    if not page_data:
        raise HTTPException(status_code=400, detail="无法获取网页信息")

    return {
        "title": page_data.get("title", ""),
        "description": page_data.get("description", ""),
        "favicon": page_data.get("favicon", ""),
    }
