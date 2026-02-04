"""
定时任务调度器
"""
import json
import asyncio
from typing import Optional
from datetime import datetime
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

# 全局调度器实例
scheduler: Optional[AsyncIOScheduler] = None


def get_scheduler() -> AsyncIOScheduler:
    """获取调度器实例"""
    global scheduler
    if scheduler is None:
        scheduler = AsyncIOScheduler()
    return scheduler


async def run_webdav_backup():
    """执行 WebDAV 备份任务"""
    from app.database import async_session_maker
    from app.models.bookmark import Bookmark
    from app.models.category import CategoryOrder
    from app.models.settings import SiteSettings
    from app.version import VERSION
    from sqlalchemy import select

    print(f"[{datetime.now()}] 开始执行定时备份...")

    async with async_session_maker() as session:
        try:
            # 获取设置
            async def get_setting(key: str) -> Optional[str]:
                result = await session.execute(
                    select(SiteSettings).where(SiteSettings.key == key)
                )
                setting = result.scalar_one_or_none()
                return setting.value if setting else None

            # 检查是否启用
            enabled = (await get_setting("webdav_enabled") or "false") == "true"
            if not enabled:
                print(f"[{datetime.now()}] 自动备份未启用，跳过")
                return

            # 获取配置
            url = await get_setting("webdav_url")
            username = await get_setting("webdav_username")
            password = await get_setting("webdav_password")
            path = await get_setting("webdav_path") or "litemark-backup/"
            keep_backups = int(await get_setting("webdav_keep_backups") or "7")

            if not url or not username or not password:
                print(f"[{datetime.now()}] WebDAV 配置不完整，跳过备份")
                return

            from webdav3.client import Client

            # 创建 WebDAV 客户端
            options = {
                "webdav_hostname": url,
                "webdav_login": username,
                "webdav_password": password,
            }
            client = Client(options)

            # 逐级创建目录
            path_parts = [p for p in path.strip('/').split('/') if p]
            current_path = ""
            for part in path_parts:
                current_path = f"{current_path}/{part}"
                try:
                    if not client.check(current_path):
                        client.mkdir(current_path)
                except:
                    try:
                        client.mkdir(current_path)
                    except:
                        pass  # 目录可能已存在

            # 获取备份数据
            result = await session.execute(select(Bookmark))
            bookmarks = [b.to_dict(include_ai=False) for b in result.scalars().all()]

            result = await session.execute(select(CategoryOrder).order_by(CategoryOrder.order))
            category_order = [{"category": c.category, "order": c.order} for c in result.scalars().all()]

            backup_data = {
                "version": VERSION,
                "exported_at": datetime.now().isoformat(),
                "bookmarks": bookmarks,
                "category_order": category_order,
            }

            # 生成文件名
            timestamp = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
            filename = f"litemark-backup-{timestamp}.json"
            remote_path = f"{path.rstrip('/')}/{filename}"

            # 上传备份
            import tempfile
            import os

            with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False, encoding='utf-8') as f:
                json.dump(backup_data, f, ensure_ascii=False, indent=2)
                temp_path = f.name

            try:
                client.upload_sync(remote_path=remote_path, local_path=temp_path)
            finally:
                os.unlink(temp_path)

            # 清理旧备份
            deleted_count = 0
            if keep_backups > 0:
                try:
                    files = client.list(path)
                    backup_files = [f for f in files if f.startswith("litemark-backup-") and f.endswith(".json")]
                    backup_files.sort(reverse=True)

                    if len(backup_files) > keep_backups:
                        for old_file in backup_files[keep_backups:]:
                            try:
                                client.clean(f"{path.rstrip('/')}/{old_file}")
                                deleted_count += 1
                            except:
                                pass
                except:
                    pass

            # 更新最后备份时间
            result = await session.execute(
                select(SiteSettings).where(SiteSettings.key == "webdav_last_backup")
            )
            setting = result.scalar_one_or_none()
            if setting:
                setting.value = datetime.now().isoformat()
            else:
                session.add(SiteSettings(key="webdav_last_backup", value=datetime.now().isoformat()))
            await session.commit()

            message = f"定时备份成功: {filename}"
            if deleted_count > 0:
                message += f"，已清理 {deleted_count} 个旧备份"
            print(f"[{datetime.now()}] {message}")

        except Exception as e:
            print(f"[{datetime.now()}] 定时备份失败: {e}")


async def init_scheduler():
    """初始化调度器"""
    from app.database import async_session_maker
    from app.models.settings import SiteSettings
    from sqlalchemy import select

    sched = get_scheduler()

    async with async_session_maker() as session:
        # 获取备份时间配置
        result = await session.execute(
            select(SiteSettings).where(SiteSettings.key == "webdav_backup_time")
        )
        setting = result.scalar_one_or_none()
        backup_time = setting.value if setting else "02:00"

        # 解析时间
        try:
            hour, minute = backup_time.split(":")
            hour = int(hour)
            minute = int(minute)
        except:
            hour, minute = 2, 0

    # 添加定时备份任务
    sched.add_job(
        run_webdav_backup,
        CronTrigger(hour=hour, minute=minute),
        id="webdav_backup",
        replace_existing=True,
        name="WebDAV 定时备份"
    )

    if not sched.running:
        sched.start()
        print(f"✓ 定时任务调度器已启动，备份时间: {hour:02d}:{minute:02d}")


async def update_backup_schedule(backup_time: str):
    """更新备份时间"""
    sched = get_scheduler()

    try:
        hour, minute = backup_time.split(":")
        hour = int(hour)
        minute = int(minute)
    except:
        raise ValueError("无效的时间格式，请使用 HH:MM 格式")

    # 更新任务
    sched.reschedule_job(
        "webdav_backup",
        trigger=CronTrigger(hour=hour, minute=minute)
    )
    print(f"✓ 备份时间已更新为: {hour:02d}:{minute:02d}")


def shutdown_scheduler():
    """关闭调度器"""
    global scheduler
    if scheduler and scheduler.running:
        scheduler.shutdown()
        print("✓ 定时任务调度器已关闭")
