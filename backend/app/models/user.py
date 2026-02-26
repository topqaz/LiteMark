"""
管理员用户模型
"""
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AdminUser(Base):
    """管理员用户表"""

    __tablename__ = "admin_credentials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    username: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=func.now(),
        onupdate=func.now(),
        server_default=func.now()
    )

    def to_dict(self) -> dict:
        """转换为字典 (不包含密码)"""
        return {
            "id": self.id,
            "username": self.username,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
