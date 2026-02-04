"""
网页抓取工具
"""
import httpx
from bs4 import BeautifulSoup
from typing import Optional
import re


async def fetch_page_content(url: str, timeout: int = 10) -> Optional[dict]:
    """
    抓取网页内容

    Returns:
        {
            "title": str,
            "description": str,
            "content": str,  # 主要文本内容
            "favicon": str,
        }
    """
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=timeout,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
            }
        ) as client:
            response = await client.get(url)
            response.raise_for_status()

            soup = BeautifulSoup(response.text, "lxml")

            # 提取标题
            title = ""
            if soup.title:
                title = soup.title.string or ""
            og_title = soup.find("meta", property="og:title")
            if og_title and og_title.get("content"):
                title = og_title["content"]

            # 提取描述
            description = ""
            meta_desc = soup.find("meta", attrs={"name": "description"})
            if meta_desc and meta_desc.get("content"):
                description = meta_desc["content"]
            og_desc = soup.find("meta", property="og:description")
            if og_desc and og_desc.get("content"):
                description = og_desc["content"]

            # 提取主要内容
            # 移除脚本和样式
            for script in soup(["script", "style", "nav", "footer", "header"]):
                script.decompose()

            # 尝试找主要内容区域
            main_content = soup.find("main") or soup.find("article") or soup.find("body")
            content = ""
            if main_content:
                content = main_content.get_text(separator=" ", strip=True)
                # 清理多余空白
                content = re.sub(r"\s+", " ", content)
                # 限制长度
                content = content[:5000]

            # 提取 favicon
            favicon = ""
            icon_link = soup.find("link", rel=lambda x: x and "icon" in x.lower() if x else False)
            if icon_link and icon_link.get("href"):
                favicon = icon_link["href"]
                if favicon.startswith("/"):
                    from urllib.parse import urlparse
                    parsed = urlparse(url)
                    favicon = f"{parsed.scheme}://{parsed.netloc}{favicon}"

            return {
                "title": title.strip(),
                "description": description.strip(),
                "content": content.strip(),
                "favicon": favicon,
            }

    except Exception as e:
        print(f"抓取页面失败 {url}: {e}")
        return None
