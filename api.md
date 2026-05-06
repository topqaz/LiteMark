# LiteMark API 手册

LiteMark 的接口前缀统一为 `/api`，除特别说明外均返回 JSON。若端点需要鉴权，请在请求头加入 `Authorization: Bearer <token>`，token 通过登录接口获取，默认有效期 7 天。

---

## 数据模型

### BookmarkRecord
```json
{
  "id": "string",
  "title": "string",
  "url": "string",
  "category": "string | null",
  "description": "string | null",
  "tags": "string | null",
  "visible": true,
  "order": 0,
  "created_at": "2024-01-01T00:00:00",
  "updated_at": "2024-01-01T00:00:00"
}
```

### Settings
```json
{
  "theme": "light",
  "siteTitle": "LiteMark",
  "siteIcon": "/LiteMark.png"
}
```

---

## 认证接口

### `POST /api/auth/login`
- **描述**：管理员登录，返回 JWT
- **请求体**：
  ```json
  {"username": "admin", "password": "admin123"}
  ```
- **响应**：
  ```json
  {"token": "<jwt>", "username": "admin"}
  ```
- **错误**：400 参数缺失；401 凭证错误

### `GET /api/health`
- **描述**：健康检查
- **鉴权**：不需要
- **响应**：`{"status": "healthy", "version": "x.x.x"}`

### `GET /api/version`
- **描述**：获取版本信息
- **鉴权**：不需要

---

## MCP 接口

### `POST/GET /mcp`
- **描述**：Streamable HTTP MCP Server，用于 AI 客户端整理、添加、修改、删除书签和管理分类
- **默认状态**：关闭
- **启用方式**：后台管理 → 系统设置 → MCP 设置，生成 Token 后开启
- **鉴权**：需要 `Authorization: Bearer <MCP_TOKEN>`
- **浏览器 Origin 限制**：如需允许浏览器来源访问，在后台填写允许来源
- **客户端地址**：`https://your-litemark.example.com/mcp`

---

## 书签接口

### `GET /api/bookmarks`
- **描述**：获取书签列表
- **鉴权**：可选（登录后返回隐藏书签）
- **响应**：`BookmarkRecord[]`

### `POST /api/bookmarks`
- **描述**：新增书签
- **鉴权**：需要
- **请求体**：
  ```json
  {
    "title": "示例",
    "url": "https://example.com",
    "category": "工具",
    "description": "描述",
    "tags": "[\"标签1\", \"标签2\"]",
    "visible": true
  }
  ```
- **响应**：201 + 新建对象

### `PUT /api/bookmarks/{id}`
- **描述**：更新书签
- **鉴权**：需要
- **响应**：更新后的书签；404 未找到

### `DELETE /api/bookmarks/{id}`
- **描述**：删除书签
- **鉴权**：需要
- **响应**：204 成功；404 未找到

### `GET /api/bookmarks/categories`
- **描述**：获取所有分类
- **响应**：`{"categories": ["分类1", "分类2"]}`

### `POST /api/bookmarks/categories`
- **描述**：创建新分类
- **鉴权**：需要
- **请求体**：`{"category": "新分类"}`

### `DELETE /api/bookmarks/categories/{category_name}`
- **描述**：删除分类
- **鉴权**：需要

### `POST /api/bookmarks/reorder`
- **描述**：分类内书签排序
- **鉴权**：需要
- **请求体**：
  ```json
  {"category": "工具", "bookmark_ids": ["id1", "id2"]}
  ```

### `POST /api/bookmarks/reorder-categories`
- **描述**：分类排序
- **鉴权**：需要
- **请求体**：
  ```json
  {"categories": ["工具", "学习", "娱乐"]}
  ```

---

## 站点设置接口

### `GET /api/settings`
- **描述**：获取站点设置
- **鉴权**：不需要
- **响应**：`Settings`

### `PUT /api/settings`
- **描述**：更新站点设置
- **鉴权**：需要
- **请求体**：
  ```json
  {
    "theme": "dark",
    "siteTitle": "我的书签",
    "siteIcon": "🔖"
  }
  ```

---

## 管理员账号接口

### `GET /api/admin/credentials`
- **描述**：获取当前管理员用户名
- **鉴权**：需要
- **响应**：`{"username": "admin"}`

### `PUT /api/admin/credentials`
- **描述**：更新管理员账号密码
- **鉴权**：需要
- **请求体**：
  ```json
  {"username": "new-admin", "password": "new-password"}
  ```

---

## AI 接口

### `GET /api/ai/status`
- **描述**：检查 AI 服务状态
- **响应**：
  ```json
  {
    "openai_configured": true,
    "openai_model": "gpt-4o-mini",
    "openai_base_url": ""
  }
  ```

### `POST /api/ai/classify`
- **描述**：智能分类推荐
- **鉴权**：可选
- **请求体**：
  ```json
  {
    "url": "https://example.com",
    "title": "示例网站",
    "description": "描述"
  }
  ```
- **响应**：
  ```json
  {
    "suggested_category": "工具",
    "confidence": 0.85,
    "reasoning": "推荐理由",
    "existing_categories": ["工具", "学习"]
  }
  ```

### `POST /api/ai/summarize`
- **描述**：生成网页摘要和标签
- **鉴权**：可选
- **请求体**：
  ```json
  {"url": "https://example.com"}
  ```
- **响应**：
  ```json
  {
    "summary": "网页内容摘要",
    "tags": ["标签1", "标签2"],
    "reading_time": 5
  }
  ```

### `POST /api/ai/fetch-page-info`
- **描述**：获取网页基本信息（无需 AI）
- **请求体**：`{"url": "https://example.com"}`
- **响应**：
  ```json
  {
    "title": "网页标题",
    "description": "网页描述",
    "favicon": "https://example.com/favicon.ico"
  }
  ```

### `POST /api/ai/quick-add`
- **描述**：快速添加书签（只需 URL，AI 自动生成标题、描述、标签、分类）
- **鉴权**：需要
- **请求体**：
  ```json
  {"url": "https://example.com"}
  ```
- **响应**：
  ```json
  {
    "id": "bookmark_id",
    "title": "AI 生成的标题",
    "url": "https://example.com",
    "description": "AI 生成的描述",
    "category": "AI 推荐的分类",
    "tags": "[\"标签1\", \"标签2\"]",
    "visible": true
  }
  ```

### `POST /api/ai/quick-add-with-title`
- **描述**：快速添加书签（提供 URL 和标题，AI 生成描述、标签、分类）
- **鉴权**：需要
- **请求体**：
  ```json
  {
    "url": "https://example.com",
    "title": "网站标题"
  }
  ```

### `POST /api/ai/quick-add-with-category`
- **描述**：快速添加书签（提供 URL、标题和分类，AI 生成描述和标签）
- **鉴权**：需要
- **请求体**：
  ```json
  {
    "url": "https://example.com",
    "title": "网站标题",
    "category": "工具"
  }
  ```

### `POST /api/ai/batch`
- **描述**：批量 AI 处理（后台执行）
- **鉴权**：需要
- **请求体**：
  ```json
  {
    "operations": ["summarize", "classify"],
    "bookmark_ids": ["id1", "id2"]
  }
  ```
- **响应**：
  ```json
  {
    "task_id": "xxx",
    "message": "任务已创建",
    "status": "pending"
  }
  ```

### `GET /api/ai/task/{task_id}`
- **描述**：获取批量任务进度
- **鉴权**：需要

### `GET /api/ai/tasks`
- **描述**：获取所有任务列表
- **鉴权**：需要

---

## 备份接口

### `GET /api/backup/export`
- **描述**：导出备份文件
- **鉴权**：需要
- **响应**：JSON 文件下载

### `POST /api/backup/import`
- **描述**：导入备份文件
- **鉴权**：需要
- **请求体**：
  ```json
  {
    "version": "1.0.0",
    "bookmarks": [...],
    "category_order": [...]
  }
  ```
- **响应**：
  ```json
  {
    "success": true,
    "imported_bookmarks": 10,
    "imported_categories": 3
  }
  ```

### `GET /api/backup/webdav`
- **描述**：获取 WebDAV 配置
- **鉴权**：需要
- **参数**：`?test=true` 测试连接
- **响应**：
  ```json
  {
    "url": "https://dav.example.com",
    "username": "user",
    "password": "",
    "path": "litemark-backup/",
    "keepBackups": 7,
    "enabled": true,
    "backupTime": "02:00",
    "lastBackup": "2024-01-01T02:00:00",
    "configured": true
  }
  ```

### `PUT /api/backup/webdav`
- **描述**：保存 WebDAV 配置
- **鉴权**：需要
- **请求体**：
  ```json
  {
    "url": "https://dav.example.com",
    "username": "user",
    "password": "pass",
    "path": "litemark-backup/",
    "keepBackups": 7,
    "enabled": true,
    "backupTime": "02:00"
  }
  ```

### `POST /api/backup/webdav`
- **描述**：立即执行 WebDAV 备份
- **鉴权**：需要
- **响应**：
  ```json
  {
    "success": true,
    "message": "备份成功: litemark-backup-2024-01-01-02-00-00.json",
    "filename": "litemark-backup-2024-01-01-02-00-00.json"
  }
  ```

---

## 返回规范与错误处理

- 成功：`200 OK`，新增使用 `201 Created`，删除使用 `204 No Content`
- 常见错误状态：
  - `400 Bad Request`：参数缺失或格式错误
  - `401 Unauthorized`：未携带或携带无效的 Bearer Token
  - `404 Not Found`：目标资源不存在
  - `500 Internal Server Error`：服务器异常
  - `503 Service Unavailable`：AI 服务未配置
