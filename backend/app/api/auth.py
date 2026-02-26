"""
认证 API
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    CredentialsUpdate,
    CredentialsResponse,
)
from app.services.auth import authenticate_user, create_token_for_user, update_credentials
from app.utils.security import get_current_user

router = APIRouter()


@router.post("/login", response_model=LoginResponse)
async def login(
    data: LoginRequest,
    session: AsyncSession = Depends(get_db)
):
    """管理员登录"""
    user = await authenticate_user(session, data.username, data.password)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误"
        )

    token = create_token_for_user(user)

    return LoginResponse(
        token=token,
        username=user.username
    )


@router.get("/me", response_model=CredentialsResponse)
async def get_me(
    current_user: dict = Depends(get_current_user)
):
    """获取当前用户信息"""
    return CredentialsResponse(username=current_user["sub"])


@router.get("/credentials", response_model=CredentialsResponse)
async def get_credentials(
    current_user: dict = Depends(get_current_user)
):
    """获取当前用户凭证 (兼容前端)"""
    return CredentialsResponse(username=current_user["sub"])


@router.put("/credentials", response_model=CredentialsResponse)
async def update_admin_credentials(
    data: CredentialsUpdate,
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """更新管理员凭证"""
    user = await update_credentials(
        session,
        data.current_password,
        data.username,
        data.new_password,
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="当前密码错误"
        )

    return CredentialsResponse(username=user.username)
