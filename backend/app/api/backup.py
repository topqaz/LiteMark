"""
备份 API
"""
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from datetime import datetime

from typing import Optional

from app.database import get_db
from app.models.bookmark import Bookmark
from app.models.category import CategoryOrder
from app.models.settings import SiteSettings
from app.schemas.settings import BackupData, WebDAVConfig, WebDAVConfigUpdate
from app.utils.security import get_current_user
from app.services.bookmark import import_bookmarks
from app.version import VERSION

router = APIRouter()


# WebDAV 配置 keys
WEBDAV_CONFIG_KEYS = ["webdav_url", "webdav_username", "webdav_password", "webdav_path", "webdav_keep_backups", "webdav_enabled"]


async def get_setting(session: AsyncSession, key: str) -> Optional[str]:
    """获取单个设置"""
    result = await session.execute(select(SiteSettings).where(SiteSettings.key == key))
    setting = result.scalar_one_or_none()
    return setting.value if setting else None


async def set_setting(session: AsyncSession, key: str, value: str):
    """设置单个设置"""
    result = await session.execute(select(SiteSettings).where(SiteSettings.key == key))
    setting = result.scalar_one_or_none()
    if setting:
        setting.value = value
    else:
        session.add(SiteSettings(key=key, value=value))


async def get_webdav_config(session: AsyncSession) -> dict:
    """获取 WebDAV 配置"""
    config = {
        "url": await get_setting(session, "webdav_url") or "",
        "username": await get_setting(session, "webdav_username") or "",
        "password": "",  # 不返回密码
        "path": await get_setting(session, "webdav_path") or "litemark-backup/",
        "keepBackups": int(await get_setting(session, "webdav_keep_backups") or "7"),
        "enabled": (await get_setting(session, "webdav_enabled") or "false") == "true",
        "backupTime": await get_setting(session, "webdav_backup_time") or "02:00",
        "lastBackup": await get_setting(session, "webdav_last_backup") or "",
    }
    return config


@router.get("/export")
async def export_backup(
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    # 获取书签
    result = await session.execute(select(Bookmark))
    bookmarks = [b.to_dict(include_ai=False) for b in result.scalars().all()]

    # 获取分类顺序
    result = await session.execute(select(CategoryOrder).order_by(CategoryOrder.order))
    category_order = [{"category": c.category, "order": c.order} for c in result.scalars().all()]

    backup_data = {
        "version": VERSION,
        "exported_at": datetime.now().isoformat(),
        "bookmarks": bookmarks,
        "category_order": category_order,
    }

    return JSONResponse(
        content=backup_data,
        headers={
            "Content-Disposition": f"attachment; filename=litemark-backup-{datetime.now().strftime('%Y-%m-%d')}.json"
        }
    )


@router.post("/import")
async def import_backup(
    data: BackupData,
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    导入备份 - 只导入书签和分类顺序

    格式:
    {
        "version": "x.x.x",
        "exported_at": "...",
        "bookmarks": [...],
        "category_order": [...]
    }
    """
    # 清空现有书签和分类数据
    await session.execute(delete(Bookmark))
    await session.execute(delete(CategoryOrder))
    await session.commit()

    # 导入书签
    bookmarks_data = []
    for b in data.bookmarks:
        if isinstance(b, dict):
            bookmarks_data.append(b)
        else:
            bookmarks_data.append(b.dict() if hasattr(b, 'dict') else dict(b))

    count = await import_bookmarks(session, bookmarks_data, skip_category=True)

    # 导入分类顺序
    category_order = data.category_order or data.categoryOrder or []
    categories_count = 0
    added_categories = set()

    if category_order:
        for cat in category_order:
            if isinstance(cat, dict):
                cat_name = cat.get("category", "")
                cat_order = cat.get("order", 0)
            else:
                cat_name = str(cat)
                cat_order = 0

            if cat_name and cat_name not in added_categories:
                session.add(CategoryOrder(category=cat_name, order=cat_order))
                added_categories.add(cat_name)
                categories_count += 1
    else:
        # 从书签中提取分类
        categories = set()
        for b in bookmarks_data:
            cat = b.get("category")
            if cat:
                categories.add(cat)

        for i, cat in enumerate(sorted(categories)):
            if cat not in added_categories:
                session.add(CategoryOrder(category=cat, order=i))
                added_categories.add(cat)
                categories_count += 1

    await session.commit()

    return {
        "success": True,
        "imported_bookmarks": count,
        "imported_categories": categories_count,
    }


@router.get("/webdav")
async def get_webdav_config_endpoint(
    test: bool = Query(False, description="是否测试连接"),
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """获取 WebDAV 配置状态"""
    config = await get_webdav_config(session)

    # 如果请求测试连接
    if test:
        password = await get_setting(session, "webdav_password")
        if not config["url"] or not config["username"] or not password:
            raise HTTPException(status_code=400, detail="WebDAV 配置不完整")

        try:
            from webdav3.client import Client
            options = {
                "webdav_hostname": config["url"],
                "webdav_login": config["username"],
                "webdav_password": password,
            }
            client = Client(options)
            backup_path = config["path"]

            # 逐级创建目录
            path_parts = [p for p in backup_path.strip('/').split('/') if p]
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
                        pass

            return {"success": True, "message": "WebDAV 连接成功"}
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"WebDAV 连接失败: {str(e)}")

    config["configured"] = bool(config["url"])
    return config


@router.put("/webdav")
async def save_webdav_config(
    config: WebDAVConfigUpdate,
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """保存 WebDAV 配置"""
    try:
        # 保存配置
        if config.url is not None:
            await set_setting(session, "webdav_url", config.url)
        if config.username is not None:
            await set_setting(session, "webdav_username", config.username)
        if config.password is not None and config.password:  # 只在密码非空时更新
            await set_setting(session, "webdav_password", config.password)
        if config.path is not None:
            await set_setting(session, "webdav_path", config.path)
        if config.keepBackups is not None:
            await set_setting(session, "webdav_keep_backups", str(config.keepBackups))
        if config.enabled is not None:
            await set_setting(session, "webdav_enabled", "true" if config.enabled else "false")
        if config.backupTime is not None:
            await set_setting(session, "webdav_backup_time", config.backupTime)
            # 更新调度器
            from app.services.scheduler import update_backup_schedule
            try:
                await update_backup_schedule(config.backupTime)
            except Exception as e:
                print(f"更新备份时间失败: {e}")

        await session.commit()

        # 如果提供了密码，测试连接
        if config.password and config.url and config.username:
            try:
                from webdav3.client import Client
                options = {
                    "webdav_hostname": config.url,
                    "webdav_login": config.username,
                    "webdav_password": config.password,
                }
                client = Client(options)
                backup_path = config.path or "litemark-backup/"

                # 逐级创建目录
                path_parts = [p for p in backup_path.strip('/').split('/') if p]
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
                            pass
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"配置已保存，但连接测试失败: {str(e)}")

        return {"success": True, "message": "WebDAV 配置已保存"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存配置失败: {str(e)}")


@router.post("/webdav")
async def trigger_webdav_backup(
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """立即备份到 WebDAV"""
    # 获取配置
    url = await get_setting(session, "webdav_url")
    username = await get_setting(session, "webdav_username")
    password = await get_setting(session, "webdav_password")
    path = await get_setting(session, "webdav_path") or "litemark-backup/"
    keep_backups = int(await get_setting(session, "webdav_keep_backups") or "7")

    if not url or not username or not password:
        raise HTTPException(status_code=400, detail="WebDAV 配置不完整，请先配置 WebDAV")

    try:
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

        message = f"备份成功: {filename}"
        if deleted_count > 0:
            message += f"，已清理 {deleted_count} 个旧备份"

        return {"success": True, "message": message, "filename": filename}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"备份失败: {str(e)}")
