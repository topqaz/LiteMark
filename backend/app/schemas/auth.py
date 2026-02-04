"""
认证相关 Schema
"""
from typing import Optional
from pydantic import BaseModel


class LoginRequest(BaseModel):
    """登录请求"""
    username: str
    password: str


class LoginResponse(BaseModel):
    """登录响应"""
    token: str
    username: str


class CredentialsUpdate(BaseModel):
    """更新凭证"""
    username: Optional[str] = None
    current_password: str
    new_password: Optional[str] = None


class CredentialsResponse(BaseModel):
    """凭证响应"""
    username: str
