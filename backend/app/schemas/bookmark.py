"""
书签相关 Schema
"""
from datetime import datetime
from pydantic import BaseModel, HttpUrl
from typing import Optional, List


class BookmarkBase(BaseModel):
    """书签基础字段"""
    title: str
    url: str
    category: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[str] = None
    visible: bool = True


class BookmarkCreate(BookmarkBase):
    """创建书签"""
    pass


class BookmarkUpdate(BaseModel):
    """更新书签"""
    title: Optional[str] = None
    url: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[str] = None
    visible: Optional[bool] = None
    order: Optional[int] = None


class BookmarkResponse(BookmarkBase):
    """书签响应"""
    id: str
    order: int
    tags: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BookmarkImport(BaseModel):
    """导入书签"""
    bookmarks: List[BookmarkBase]


class ReorderRequest(BaseModel):
    """书签排序请求 - 兼容新旧格式"""
    category: Optional[str] = None
    bookmark_ids: Optional[List[str]] = None
    order: Optional[List[str]] = None  # 兼容旧格式

    def get_ids(self) -> List[str]:
        """获取书签 ID 列表"""
        return self.bookmark_ids or self.order or []


class CategoryReorderRequest(BaseModel):
    """分类排序请求 - 兼容新旧格式"""
    categories: Optional[List[str]] = None
    order: Optional[List[str]] = None  # 兼容旧格式

    def get_categories(self) -> List[str]:
        """获取分类列表"""
        return self.categories or self.order or []
