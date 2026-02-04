"""
FastAPI 应用入口
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import init_db
from app.api import auth, bookmarks, settings as settings_api, backup, ai
from app.services.auth import init_admin
from app.services.scheduler import init_scheduler, shutdown_scheduler
from app.version import VERSION, get_version_info

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时
    print("启动 LiteMark API...")
    await init_db()
    await init_admin()
    await load_ai_config()
    await init_scheduler()
    yield
    # 关闭时
    shutdown_scheduler()
    print("关闭 LiteMark API...")


async def load_ai_config():
    """从数据库加载 AI 配置"""
    from app.database import async_session_maker
    from app.api.settings import get_ai_config_dict
    from app.services.ai import llm

    async with async_session_maker() as session:
        try:
            config = await get_ai_config_dict(session)
            llm.runtime_config = {
                "api_key": config.get("ai_api_key") or None,
                "base_url": config.get("ai_base_url") or None,
                "model": config.get("ai_model") or None,
            }
            print(f"✓ 加载 AI 配置: {config.get('ai_model', 'default')}")
        except Exception as e:
            print(f"⚠ 加载 AI 配置失败: {e}")


app = FastAPI(
    title="LiteMark API",
    description="书签管理系统 API - 支持 AI 智能功能",
    version=VERSION,
    lifespan=lifespan,
)

# CORS 中间件
origins = settings.cors_origins.split(",") if settings.cors_origins != "*" else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(auth.router, prefix="/api/auth", tags=["认证"])
app.include_router(auth.router, prefix="/api/admin", tags=["认证"])
app.include_router(bookmarks.router, prefix="/api/bookmarks", tags=["书签"])
app.include_router(settings_api.router, prefix="/api/settings", tags=["设置"])
app.include_router(backup.router, prefix="/api/backup", tags=["备份"])
app.include_router(ai.router, prefix="/api/ai", tags=["AI"])


@app.get("/", tags=["健康检查"])
async def root():
    """API 根路径"""
    return get_version_info()


@app.get("/health", tags=["健康检查"])
async def health_check():
    """健康检查"""
    return {"status": "healthy", "version": VERSION}


@app.get("/version", tags=["健康检查"])
async def version():
    """获取版本信息"""
    return get_version_info()
