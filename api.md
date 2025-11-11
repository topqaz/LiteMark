# LiteMark API 手册

LiteMark 的接口前缀统一为 `/api`，除特别说明外均返回 JSON。若端点需要鉴权，请在请求头加入 `Authorization: Bearer <token>`，token 通过登录接口获取，默认有效期 7 天。

> 开发提示：本地只跑函数时，可执行 `vercel dev --listen 127.0.0.1:<port>` 并将前端 `.env.local` 中的 `VITE_API_BASE_URL` 指向该地址。

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
  "visible": true
}
```

- 返回时已按 **分类顺序 → 分类内顺序** 排好；默认分类的 `category` 为空字符串。
- 新增书签默认插入在分类末尾。

### Settings
```json
{
  "theme": "light",
  "siteTitle": "个人书签",
  "siteIcon": "🔖"
}
```

---

## 认证

### `POST /api/auth/login`
- **描述**：管理员登录，返回 JWT。
- **请求体**：`{"username":"admin","password":"admin123"}`
- **响应**：`{"token":"<jwt>","username":"admin"}`
- **错误**：400 参数缺失；401 凭证错误；500 服务错误。

### `GET /api/health`
- **描述**：健康检查。
- **鉴权**：不需要。
- **响应**：`{"status":"ok"}`

---

## 书签接口

### `GET /api/bookmarks`
- **描述**：获取全部书签，顺序遵循分类顺序与分类内顺序。
- **鉴权**：不需要。
- **响应**：`BookmarkRecord[]`

### `POST /api/bookmarks`
- **描述**：新增书签。
- **鉴权**：需要。
- **请求体**：
  ```json
  {
    "title": "示例",
    "url": "https://example.com",
    "category": "可选分类",
    "description": "可选描述",
    "visible": true
  }
  ```
- **响应**：201 + 新建对象。
- **校验**：`title`、`url` 必填，`url` 会自动补全协议。

### `PUT /api/bookmarks/{id}`
- **描述**：更新指定书签。
- **鉴权**：需要。
- **请求体**：与新增一致。
- **响应**：更新后的书签；未找到返回 404。

### `DELETE /api/bookmarks/{id}`
- **描述**：删除书签。
- **鉴权**：需要。
- **响应**：被删除的书签；未找到返回 404。

### `POST /api/bookmarks/reorder`
- **描述**：保存书签顺序（分类内）。
- **鉴权**：需要。
- **请求体**：`{"order": ["id1","id2",...]} `
- **说明**：数组应包含所有书签 ID，未出现的 ID 会被自动追加至末尾。
- **响应**：`BookmarkRecord[]`

### `POST /api/bookmarks/reorder-categories`
- **描述**：保存分类顺序。
- **鉴权**：需要。
- **请求体**：`{"order": ["", "学习", "工具", ...]}` （空字符串代表默认分类）。
- **说明**：仅调整分类顺序，分类内书签顺序保持不变；未提交的分类自动追加到末尾。
- **响应**：`BookmarkRecord[]`

## 站点设置接口

### `GET /api/settings`
- **描述**：获取站点设置。
- **鉴权**：不需要。
- **响应**：`Settings`

### `PUT /api/settings`
- **描述**：更新站点设置。
- **鉴权**：需要。
- **请求体**：任意字段组合，例如：
  ```json
  {
    "theme": "dark",
    "siteTitle": "我的书签",
    "siteIcon": "🔥"
  }
  ```
- **限制**：`theme` 必须是 `light/dark/forest/ocean/sunrise/twilight` 之一；`siteTitle` ≤ 60 字符；`siteIcon` ≤ 512 字符。
- **响应**：更新后的 `Settings`。

## 返回规范与错误处理

- 成功：`200 OK`，新增使用 `201 Created`。
- 预检：`OPTIONS` 返回 `204`，附带允许的 CORS 头。
- 常见错误状态：
  - `400 Bad Request`：参数缺失或格式错误。
  - `401 Unauthorized`：未携带或携带无效的 Bearer Token。
  - `404 Not Found`：目标资源不存在。
  - `405 Method Not Allowed`：不支持的 HTTP 方法。
  - `500 Internal Server Error`：服务器异常，具体日志可在 Vercel Dashboard → Functions 查看。

---

## 调试建议

- 本地函数：`vercel dev`，或 `vercel dev --listen 127.0.0.1:3005`。
- 前端联调：前端 `.env.local` 设置 `VITE_API_BASE_URL` 为上述函数地址。
- 生产排障：部署后在 Vercel 后台查看 Function Logs，定位 4xx/5xx 具体原因。

