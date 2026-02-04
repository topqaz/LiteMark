"""
分类排序模型
"""
from sqlalchemy import String, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CategoryOrder(Base):
    """分类排序表"""

    __tablename__ = "category_order"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    category: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "category": self.category,
            "order": self.order,
        }
