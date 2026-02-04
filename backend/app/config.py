"""
应用配置管理
"""
from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional


class Settings(BaseSettings):
    """应用配置"""

    # 应用基础配置
    app_name: str = "LiteMark API"
    debug: bool = False

    # 数据库配置
    database_url: str = "sqlite+aiosqlite:///./litemark.db"

    # JWT 配置
    jwt_secret: str = "your-secret-key-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_days: int = 7

    # CORS 配置
    cors_origins: str = "*"

    # OpenAI 配置
    openai_api_key: Optional[str] = None
    openai_base_url: Optional[str] = None  # 支持代理
    openai_model: str = "gpt-4o-mini"

    # WebDAV 备份配置
    webdav_url: Optional[str] = None
    webdav_username: Optional[str] = None
    webdav_password: Optional[str] = None
    webdav_backup_path: str = "/litemark-backups"

    # 默认管理员
    default_admin_username: str = "admin"
    default_admin_password: str = "admin123"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """获取配置单例"""
    return Settings()
