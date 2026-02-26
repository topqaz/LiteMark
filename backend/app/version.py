VERSION = "2.0.0"

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
