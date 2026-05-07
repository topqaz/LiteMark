import json
from urllib import request, error
from typing import Optional

VERSION = "2.1.0"

VERSION_INFO = {
    "version": VERSION,
    "name": "LiteMark",
    "description": "智能书签管理系统",
    "author": "topqaz",
}


def get_version() -> str:
    """获取版本号"""
    return VERSION


def get_version_info() -> dict:
    """获取完整版本信息"""
    return VERSION_INFO.copy()


def _normalize_version(version: str) -> str:
    """去掉前导 'v' 并保留数字和点"""
    if not version:
        return ""
    return version.strip().lstrip("vV").strip()


def get_latest_github_version() -> Optional[str]:
    """从 GitHub 获取最新版本号"""
    github_api = "https://api.github.com/repos/topqaz/LiteMark/releases/latest"
    headers = {"User-Agent": "LiteMark-Version-Checker"}
    try:
        req = request.Request(github_api, headers=headers)
        with request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode("utf-8", errors="ignore")
            data = json.loads(body)
            tag_name = data.get("tag_name") or data.get("name")
            return _normalize_version(str(tag_name)) if tag_name else None
    except Exception:
        return None


def is_update_available(current_version: str, latest_version: str) -> bool:
    """比较版本号是否有更新"""
    def version_to_tuple(v: str):
        parts = _normalize_version(v).split(".")
        nums = []
        for part in parts:
            try:
                nums.append(int(part))
            except ValueError:
                break
        return tuple(nums)

    try:
        return version_to_tuple(latest_version) > version_to_tuple(current_version)
    except Exception:
        return False
