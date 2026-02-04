"""
AI 相关 Schema
"""
from pydantic import BaseModel
from typing import Optional, List


class ClassifyRequest(BaseModel):
    """分类请求"""
    bookmark_id: Optional[str] = None  # 指定书签ID
    url: Optional[str] = None  # 或提供 URL
    title: Optional[str] = None
    description: Optional[str] = None


class ClassifyResponse(BaseModel):
    """分类响应"""
    suggested_category: str
    confidence: float
    reasoning: str
    existing_categories: List[str]  # 现有分类供参考


class SummarizeRequest(BaseModel):
    """摘要请求"""
    bookmark_id: Optional[str] = None
    url: Optional[str] = None


class SummarizeResponse(BaseModel):
    """摘要响应"""
    summary: str
    tags: List[str]
    reading_time: Optional[int] = None  # 预计阅读时间(分钟)


class BatchProcessRequest(BaseModel):
    """批量处理请求"""
    bookmark_ids: Optional[List[str]] = None  # None 表示处理所有
    operations: List[str]  # ["summarize", "classify"]


class BatchProcessResponse(BaseModel):
    """批量处理响应"""
    processed: int
    failed: int
    errors: List[str]


class QuickAddRequest(BaseModel):
    """快速添加书签请求 - 只需 URL"""
    url: str


class QuickAddWithTitleRequest(BaseModel):
    """快速添加书签请求 - URL + 标题"""
    url: str
    title: str


class QuickAddWithCategoryRequest(BaseModel):
    """快速添加书签请求 - URL + 标题 + 分类"""
    url: str
    title: str
    category: str


class QuickAddResponse(BaseModel):
    """快速添加书签响应"""
    id: str
    title: str
    url: str
    description: str
    category: str
    tags: str
    visible: bool = True
