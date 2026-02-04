"""
批量任务进度管理
"""
from typing import Dict, Optional
from datetime import datetime
from dataclasses import dataclass, field
import uuid


@dataclass
class TaskProgress:
    """任务进度"""
    task_id: str
    operation: str
    total: int = 0
    processed: int = 0
    failed: int = 0
    status: str = "pending"  # pending, running, completed, failed
    errors: list = field(default_factory=list)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    @property
    def progress(self) -> float:
        """进度百分比"""
        if self.total == 0:
            return 0
        return round(self.processed / self.total * 100, 1)

    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "operation": self.operation,
            "total": self.total,
            "processed": self.processed,
            "failed": self.failed,
            "progress": self.progress,
            "status": self.status,
            "errors": self.errors[:10],  # 只返回前10个错误
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


# 内存存储任务进度
_task_store: Dict[str, TaskProgress] = {}


def create_task(operation: str) -> TaskProgress:
    """创建新任务"""
    task_id = str(uuid.uuid4())[:8]
    task = TaskProgress(task_id=task_id, operation=operation)
    _task_store[task_id] = task
    return task


def get_task(task_id: str) -> Optional[TaskProgress]:
    """获取任务"""
    return _task_store.get(task_id)


def get_all_tasks() -> list:
    """获取所有任务"""
    return [t.to_dict() for t in _task_store.values()]


def cleanup_old_tasks(max_age_hours: int = 1):
    """清理旧任务"""
    now = datetime.now()
    to_delete = []
    for task_id, task in _task_store.items():
        if task.completed_at:
            age = (now - task.completed_at).total_seconds() / 3600
            if age > max_age_hours:
                to_delete.append(task_id)
    for task_id in to_delete:
        del _task_store[task_id]
