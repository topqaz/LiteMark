"""
设置相关 Schema
"""
from pydantic import BaseModel
from typing import Optional, List, Any


class SettingsResponse(BaseModel):
    """设置响应"""
    theme: str = "light"
    siteTitle: str = "LiteMark"
    siteIcon: str = ""


class SettingsUpdate(BaseModel):
    """更新设置"""
    theme: Optional[str] = None
    siteTitle: Optional[str] = None
    siteIcon: Optional[str] = None


class AIConfigResponse(BaseModel):
    """AI 配置响应"""
    ai_provider: str = "openai"  # openai, ollama, custom
    ai_api_key: str = ""
    ai_base_url: str = ""
    ai_model: str = "gpt-4o-mini"


class AIConfigUpdate(BaseModel):
    """更新 AI 配置"""
    ai_provider: Optional[str] = None
    ai_api_key: Optional[str] = None
    ai_base_url: Optional[str] = None
    ai_model: Optional[str] = None


class WebDAVConfig(BaseModel):
    """WebDAV 配置"""
    url: str = ""
    username: str = ""
    password: str = ""
    path: str = "litemark-backup/"
    keepBackups: int = 7
    enabled: bool = False
    backupTime: str = "02:00"
    provider: str = "webdav"


class WebDAVConfigUpdate(BaseModel):
    """更新 WebDAV 配置"""
    url: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    path: Optional[str] = None
    keepBackups: Optional[int] = None
    enabled: Optional[bool] = None
    backupTime: Optional[str] = None
    provider: Optional[str] = None


class BackupData(BaseModel):
    """备份数据"""
    version: Optional[str] = None
    exported_at: Optional[str] = None

    # 核心数据 - 只包含书签和分类
    bookmarks: List[Any]
    category_order: Optional[List[Any]] = None

    # 兼容旧格式
    categoryOrder: Optional[List[Any]] = None
    exportedAt: Optional[str] = None
