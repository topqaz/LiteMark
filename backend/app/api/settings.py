"""
设置 API
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.settings import SiteSettings
from app.schemas.settings import SettingsResponse, SettingsUpdate, AIConfigResponse, AIConfigUpdate
from app.utils.security import get_current_user

router = APIRouter()

# 默认设置
DEFAULT_SETTINGS = {
    "theme": "light",
    "siteTitle": "LiteMark",
    "siteIcon": "",
}

# AI 默认配置
DEFAULT_AI_CONFIG = {
    "ai_provider": "openai",
    "ai_api_key": "",
    "ai_base_url": "https://api.openai.com/v1",
    "ai_model": "gpt-4o-mini",
}


async def get_settings_dict(session: AsyncSession) -> dict:
    """获取设置字典"""
    result = await session.execute(select(SiteSettings))
    settings = {s.key: s.value for s in result.scalars().all()}

    # 合并默认值
    return {**DEFAULT_SETTINGS, **settings}


async def get_ai_config_dict(session: AsyncSession) -> dict:
    """获取 AI 配置字典"""
    result = await session.execute(select(SiteSettings))
    settings = {s.key: s.value for s in result.scalars().all()}

    # 只返回 AI 相关配置
    ai_config = {}
    for key in DEFAULT_AI_CONFIG:
        ai_config[key] = settings.get(key, DEFAULT_AI_CONFIG[key])

    return ai_config


@router.get("", response_model=SettingsResponse)
async def get_settings(
    session: AsyncSession = Depends(get_db)
):
    """获取站点设置"""
    settings = await get_settings_dict(session)
    return SettingsResponse(**settings)


@router.put("", response_model=SettingsResponse)
async def update_settings(
    data: SettingsUpdate,
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """更新站点设置"""
    update_data = data.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        if value is not None:
            result = await session.execute(
                select(SiteSettings).where(SiteSettings.key == key)
            )
            setting = result.scalar_one_or_none()

            if setting:
                setting.value = value
            else:
                session.add(SiteSettings(key=key, value=value))

    await session.commit()

    settings = await get_settings_dict(session)
    return SettingsResponse(**settings)


@router.get("/ai", response_model=AIConfigResponse)
async def get_ai_config(
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """获取 AI 配置"""
    config = await get_ai_config_dict(session)
    return AIConfigResponse(**config)


@router.put("/ai", response_model=AIConfigResponse)
async def update_ai_config(
    data: AIConfigUpdate,
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """更新 AI 配置"""
    update_data = data.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        if value is not None:
            result = await session.execute(
                select(SiteSettings).where(SiteSettings.key == key)
            )
            setting = result.scalar_one_or_none()

            if setting:
                setting.value = value
            else:
                session.add(SiteSettings(key=key, value=value))

    await session.commit()

    # 重新加载 AI 配置到运行时
    await reload_ai_config(session)

    config = await get_ai_config_dict(session)
    return AIConfigResponse(**config)


@router.post("/ai/test")
async def test_ai_config(
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """测试 AI 配置是否可用"""
    from app.services.ai.llm import chat_completion

    try:
        result = await chat_completion(
            "请回复'连接成功'四个字",
            temperature=0.1,
            max_tokens=50,
        )
        return {"success": True, "message": result.strip()}
    except Exception as e:
        return {"success": False, "message": str(e)}


async def reload_ai_config(session: AsyncSession):
    """重新加载 AI 配置到运行时"""
    from app.services.ai import llm

    config = await get_ai_config_dict(session)

    # 更新 LLM 模块的配置
    llm.runtime_config = {
        "api_key": config.get("ai_api_key") or None,
        "base_url": config.get("ai_base_url") or None,
        "model": config.get("ai_model") or "gpt-4o-mini",
    }
