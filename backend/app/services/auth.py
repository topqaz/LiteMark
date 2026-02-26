"""
认证服务
"""
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import AdminUser
from app.utils.security import hash_password, verify_password, create_access_token
from app.config import get_settings
from app.database import async_session_maker

settings = get_settings()


async def init_admin():
    """初始化默认管理员账户"""
    async with async_session_maker() as session:
        result = await session.execute(select(AdminUser).where(AdminUser.id == 1))
        admin = result.scalar_one_or_none()

        if admin is None:
            admin = AdminUser(
                id=1,
                username=settings.default_admin_username,
                password_hash=hash_password(settings.default_admin_password),
            )
            session.add(admin)
            await session.commit()
            print(f"✓ 创建默认管理员: {settings.default_admin_username}")


async def authenticate_user(
    session: AsyncSession,
    username: str,
    password: str
) -> Optional[AdminUser]:
    """验证用户"""
    result = await session.execute(
        select(AdminUser).where(AdminUser.username == username)
    )
    user = result.scalar_one_or_none()

    if user is None:
        return None

    if not verify_password(password, user.password_hash):
        return None

    return user


async def update_credentials(
    session: AsyncSession,
    current_password: str,
    new_username: Optional[str] = None,
    new_password: Optional[str] = None,
) -> Optional[AdminUser]:
    """更新管理员凭证"""
    result = await session.execute(select(AdminUser).where(AdminUser.id == 1))
    admin = result.scalar_one_or_none()

    if admin is None:
        return None

    if not verify_password(current_password, admin.password_hash):
        return None

    if new_username:
        admin.username = new_username

    if new_password:
        admin.password_hash = hash_password(new_password)

    await session.commit()
    return admin


def create_token_for_user(user: AdminUser) -> str:
    """为用户创建 JWT token"""
    return create_access_token({
        "sub": user.username,
        "user_id": user.id,
    })
