from openai import AsyncOpenAI
from typing import Optional
import json
import re

from app.config import get_settings

settings = get_settings()


runtime_config = {
    "api_key": None,
    "base_url": None,
    "model": None,
}


def get_effective_config():
    """获取有效配置"""
    return {
        "api_key": runtime_config.get("api_key") or settings.openai_api_key or "sk-no-key-required",
        "base_url": runtime_config.get("base_url") or settings.openai_base_url,
        "model": runtime_config.get("model") or settings.openai_model or "gpt-4o-mini",
    }


def get_openai_client() -> AsyncOpenAI:
    """获取 LLM 客户端"""
    config = get_effective_config()
    return AsyncOpenAI(
        api_key=config["api_key"],
        base_url=config["base_url"],
    )


async def chat_completion(
    prompt: str,
    system_prompt: str = "",
    model: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 1000,
) -> str:
    """调用 LLM"""
    client = get_openai_client()
    config = get_effective_config()

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    response = await client.chat.completions.create(
        model=model or config["model"],
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )

    return response.choices[0].message.content


def extract_json_from_text(text: str) -> dict:
    """从文本中提取 JSON (兼容不支持 json_object 格式的模型)"""
    # 尝试直接解析
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 尝试提取 ```json ... ``` 代码块
    json_match = re.search(r'```json\s*([\s\S]*?)\s*```', text)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass

    # 尝试提取 { ... } 格式
    json_match = re.search(r'\{[\s\S]*\}', text)
    if json_match:
        try:
            return json.loads(json_match.group(0))
        except json.JSONDecodeError:
            pass

    # 返回空字典
    return {}


async def chat_completion_json(
    prompt: str,
    system_prompt: str = "",
    model: Optional[str] = None,
    use_json_mode: bool = True,
) -> dict:
    """调用 LLM 并返回 JSON"""
    client = get_openai_client()
    config = get_effective_config()

    # 增强 system prompt 确保返回 JSON
    enhanced_system = system_prompt
    if not enhanced_system:
        enhanced_system = "你是一个助手，请始终以 JSON 格式返回结果。"
    else:
        enhanced_system += "\n\n请始终以 JSON 格式返回结果，不要添加其他文字说明。"

    messages = [
        {"role": "system", "content": enhanced_system},
        {"role": "user", "content": prompt}
    ]

    effective_model = model or config["model"]

    # 尝试使用 json_object 格式 (OpenAI 支持)
    try:
        if use_json_mode:
            response = await client.chat.completions.create(
                model=effective_model,
                messages=messages,
                temperature=0.3,
                max_tokens=1000,
                response_format={"type": "json_object"},
            )
        else:
            raise Exception("Skip json_mode")
    except Exception:
        # 不支持 json_object 格式，使用普通模式
        response = await client.chat.completions.create(
            model=effective_model,
            messages=messages,
            temperature=0.3,
            max_tokens=1000,
        )

    content = response.choices[0].message.content
    return extract_json_from_text(content)
