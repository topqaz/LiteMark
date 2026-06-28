
<p align="center">
    <a href="https://github.com/topqaz/LiteMark" target="_blank" rel="noopener noreferrer">
        <img width="100" src="public/LiteMark.png" alt="LiteMark logo" />
    </a>
</p>
<p align="center"><b>LiteMark，</b>轻量易用的书签导航系统</p>

---

LiteMark 是一款基于 **Vue 3 + FastAPI** 的个人书签管理应用，提供响应式双端体验、后台管理面板、AI 智能功能以及多种部署方式。

---

## 功能亮点

- 📚 **书签管理**：支持添加、编辑、删除、隐藏与排序；分类顺序与分类内顺序均可拖拽调整
- 🤖 **AI 智能功能**：智能分类推荐、内容摘要生成、标签提取、快速添加书签
- 🔐 **后台面板**：位于 `/admin`，含登录校验、站点设置、备份管理等
- 💾 **WebDAV 定时备份**：支持配置 WebDAV 服务器，实现定时自动备份
- 🐳 **Docker 部署**：一键部署，支持 x64 和 ARM64 架构

---

## 快速开始

### Linux 一键部署脚本

脚本支持交互选择 Docker 本地部署或 Cloudflare Workers 独立部署：

```bash
# 从 GitHub 下载脚本后运行
curl -fsSL https://raw.githubusercontent.com/topqaz/LiteMark/main/deploy.sh -o deploy.sh
chmod +x deploy.sh
./deploy.sh
```

### Docker 部署（推荐）

```bash
# 使用 docker-compose
curl -O https://raw.githubusercontent.com/topqaz/LiteMark/main/docker-compose.yml
docker-compose up -d

# 或直接使用 docker run
docker run -d -p 8080:80 \
  -v litemark-data:/app/data \
  -e JWT_SECRET=your-secret-key \
  -e DEFAULT_ADMIN_USERNAME=admin \
  -e DEFAULT_ADMIN_PASSWORD=admin123 \
  --name litemark \
  topqaz/litemark:amd64
```
# 或 ARM64 架构使用： topqaz/litemark:arm64

访问地址：`http://localhost:8080`，后台入口：`http://localhost:8080/admin`

### Cloudflare Workers 部署

Cloudflare Workers 部署是独立部署方式，使用 Worker 运行 API，使用 D1 保存书签数据，不依赖本地 Docker/FastAPI 后端。你可以二选一：使用上面的 Docker 本地部署，或使用 Cloudflare Workers 部署。

当前 Workers 版本支持：登录、书签管理、分类管理、站点设置、JSON/CSV/HTML 导出、JSON/CSV/HTML 文件导入、网页标题抓取、OpenAI 兼容 AI 摘要/分类/快速添加、WebDAV 配置/测试/手动备份/定时备份/保留数量清理、MCP 基础工具调用和 OAuth Client Credentials。WebDAV 定时备份按 Asia/Shanghai（上海时间）判断；AI 批量后台任务仍建议使用 Docker/FastAPI 版本。

1. 安装依赖并登录 Cloudflare：

```bash
npm install
npx wrangler login
```

2. 创建 D1 数据库：

```bash
npm run cf:d1:create
```

命令会输出 `database_id`，复制后填入 `wrangler.jsonc`：

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "litemark",
    "database_id": "复制到这里",
    "migrations_dir": "worker/migrations"
  }
]
```

3. 修改 `wrangler.jsonc` 中的 `JWT_SECRET`、`DEFAULT_ADMIN_USERNAME`、`DEFAULT_ADMIN_PASSWORD`。

4. 初始化 D1 表结构并发布：

```bash
npm run cf:d1:migrate
npm run deploy:cloudflare
```

也可以本地预览 Worker：

```bash
npm run cf:d1:migrate:local
npm run preview:cloudflare
```

部署后访问 Cloudflare Workers 提供的域名或你绑定的自定义域名即可。

## 更新

```bash
# 拉取最新镜像
docker-compose pull
# 启动新容器
docker-compose up -d
```

### docker-compose.yml 示例

```yaml
services:
  litemark:
    image: topqaz/litemark:latest
    container_name: litemark
    restart: unless-stopped
    ports:
      - "8080:80"
    volumes:
      - litemark-data:/app/data
    environment:
      - JWT_SECRET=change-this-to-a-secure-random-string
      - DATABASE_URL=sqlite+aiosqlite:///./data/litemark.db
      - DEFAULT_ADMIN_USERNAME=admin
      - DEFAULT_ADMIN_PASSWORD=admin123
      - DEBUG=false
      - CORS_ORIGINS=*

volumes:
  litemark-data:
```

---

## 项目演示

### 主页展示

<p align="center">
  <img src="project_img/home1.jpg" alt="主页截图1" width="800" />
</p>

<p align="center">
  <img src="project_img/home2.jpg" alt="主页截图2" width="800" />
</p>

### mcp演示

<p align="center">
  <img src="project_img/mcp4.jpg" alt="mcp截图演示1" width="800" />
</p>
<p align="center">
  <img src="project_img/mcp5.jpg" alt="mcp截图演示2" width="800" />
</p>
<p align="center">
  <img src="project_img/mcp6.jpg" alt="mcp截图演示3" width="800" />
</p>
### 登录页面

<p align="center">
  <img src="project_img/login.jpg" alt="登录页面" width="800" />
</p>

### 管理后台

<p align="center">
  <img src="project_img/admin1.jpg" alt="管理后台截图1" width="800" />
</p>

<p align="center">
  <img src="project_img/admin2.jpg" alt="管理后台截图2" width="800" />
</p>

---

## WebDAV 定时备份

LiteMark 支持将数据定时备份到 WebDAV 服务器，确保数据安全。

### 配置步骤

1. **在后台配置 WebDAV**
   - 进入后台管理 → 数据备份
   - 填写 WebDAV 地址、用户名、密码
   - 设置备份路径和保留份数
   - 点击"测试连接"验证配置

2. **启用定时备份**
   - 打开"启用定时备份"开关
   - 设置每日备份时间
   - 保存配置

### 手动备份

在后台管理 → 数据备份页面，点击"立即备份"按钮可手动触发备份。

### 备份文件格式

- 文件格式：JSON
- 包含内容：所有书签数据、分类顺序
- 文件名格式：`litemark-backup-YYYY-MM-DD-HH-MM-SS.json`

---

## 导入/导出书签

LiteMark 已支持“批量导入/导出”功能，兼容 JSON/CSV/HTML 三种格式。

### 导出

在后台管理 -> 数据备份，选择导出格式：

- JSON：完整备份（书签 + 分类顺序）
- CSV：行式书签导出，包含 id/title/url/category/description/tags/visible/order 等字段
- HTML：Netscape Bookmark 标准格式，方便导入浏览器书签

点击“导出数据”后可获得对应文件（`litemark-bookmarks-YYYY-MM-DD.{json|csv|html}`）。

### 导入

在后台管理 -> 数据备份，选择“导入备份”文件：支持`.json`、`.csv`、`.html`。

- JSON 文件可直接使用 LiteMark 备份导出文件，并可包含 `bookmarks` + `category_order` 数据。
- CSV 文件应包含 `title,url` 字段，建议携带 `category,description,tags,visible,order`。
- HTML 文件会提取 `<A HREF="...">` 书签项。

`覆盖现有数据` 选项开启后，将先清空现有书签与分类再导入。

---

## 浏览器插件

https://github.com/topqaz/LiteMark-extension-browser

- 支持当前页面一键添加
- 支持浏览器书签一键导入

---

## MCP 工具

LiteMark 内置 Streamable HTTP MCP Server，支持 AI 客户端直接整理、添加、修改、隐藏、删除书签，以及管理分类顺序。MCP 默认关闭，可在后台管理中启用并生成专用 Token。认证支持直接 Bearer Token，也支持 OAuth 2.0 Client Credentials。

### 启用 MCP

进入后台管理 → 系统设置 → MCP 设置：

1. 点击“生成”创建 MCP Token
2. 开启 MCP
3. 保存 MCP 设置
4. 按客户端能力复制 Bearer Token 配置或 OAuth 2.0 配置

启用后，MCP 地址为：

```text
https://your-litemark.example.com/mcp/
```

### 客户端配置示例

```json
{
  "mcpServers": {
    "litemark": {
      "url": "https://your-litemark.example.com/mcp/",
      "headers": {
        "Authorization": "Bearer replace-with-a-long-random-token"
      }
    }
  }
}
```

OAuth 2.0 Client Credentials 配置示例：

```json
{
  "mcpServers": {
    "litemark": {
      "url": "https://your-litemark.example.com/mcp/",
      "oauth": {
        "grant_type": "client_credentials",
        "token_url": "https://your-litemark.example.com/oauth/token",
        "client_id": "litemark-mcp",
        "client_secret": "replace-with-a-long-random-token",
        "scope": "bookmarks:read bookmarks:write"
      }
    }
  }
}
```

OAuth discovery endpoints：

```text
https://your-litemark.example.com/.well-known/oauth-protected-resource
https://your-litemark.example.com/.well-known/oauth-authorization-server
```

### 反向代理注意事项

如果你在 Docker 容器外层又套了一层 Nginx、宝塔、1Panel、Cloudflare Tunnel 等反向代理，请确保 `/mcp/` 支持长连接并关闭响应缓冲。客户端地址建议使用带尾斜杠的 `/mcp/`，避免部分客户端跟随 `/mcp` 到 `/mcp/` 时丢失端口。至少需要保留 `Authorization`、`MCP-Protocol-Version`、`MCP-Session-Id`、`Last-Event-ID` 请求头，并关闭 buffering / gzip，避免 Streamable HTTP 连接被代理提前缓存或断开。


外部 Nginx 示例：

```nginx
server {
    listen 443 ssl http2;
    server_name your-litemark.example.com;

    # ssl_certificate     /path/to/fullchain.pem;
    # ssl_certificate_key /path/to/privkey.pem;

    location = /mcp {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
        proxy_set_header MCP-Protocol-Version $http_mcp_protocol_version;
        proxy_set_header MCP-Session-Id $http_mcp_session_id;
        proxy_set_header Last-Event-ID $http_last_event_id;
        proxy_set_header Cache-Control "no-cache";
        proxy_cache off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_connect_timeout 75s;
        proxy_buffering off;
        proxy_request_buffering off;
        gzip off;
        add_header X-Accel-Buffering no always;
    }

    location /mcp/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
        proxy_set_header MCP-Protocol-Version $http_mcp_protocol_version;
        proxy_set_header MCP-Session-Id $http_mcp_session_id;
        proxy_set_header Last-Event-ID $http_last_event_id;
        proxy_set_header Cache-Control "no-cache";
        proxy_cache off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_connect_timeout 75s;
        proxy_buffering off;
        proxy_request_buffering off;
        gzip off;
        add_header X-Accel-Buffering no always;
    }

    location /.well-known/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /oauth/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
    }

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

暴露的工具包括：

- `list_litemark_bookmarks`：查询书签，可按分类、关键词过滤
- `add_litemark_bookmark`：添加书签
- `update_litemark_bookmark`：修改标题、链接、分类、描述、标签、可见性和排序值
- `delete_litemark_bookmark`：删除书签
- `list_litemark_categories` / `add_litemark_category` / `rename_litemark_category` / `delete_litemark_category`
- `reorder_litemark_bookmarks` / `reorder_litemark_categories`

---

## 环境变量

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `JWT_SECRET` | JWT 签名密钥，**生产环境必须修改** | `change-this-to-a-secure-random-string` |
| `DATABASE_URL` | 数据库连接 URL | `sqlite+aiosqlite:///./data/litemark.db` |
| `DEFAULT_ADMIN_USERNAME` | 默认管理员用户名（仅首次启动有效） | `admin` |
| `DEFAULT_ADMIN_PASSWORD` | 默认管理员密码（仅首次启动有效） | `admin123` |
| `DEBUG` | 调试模式 | `false` |
| `CORS_ORIGINS` | CORS 允许的来源 | `*` |

---

## 项目结构

```
├─ backend/                 # Python 后端
│  ├─ app/
│  │  ├─ api/              # API 路由
│  │  ├─ models/           # 数据模型
│  │  ├─ schemas/          # Pydantic 模式
│  │  ├─ services/         # 业务逻辑
│  │  └─ utils/            # 工具函数
│  └─ requirements.txt
├─ src/                     # Vue 前端
│  ├─ pages/
│  │  ├─ HomePageV2.vue    # 前台书签展示
│  │  └─ admin/            # 后台管理页面
│  ├─ App.vue
│  └─ main.ts
├─ docker/                  # Docker 配置
│  ├─ nginx.conf
│  ├─ supervisord.conf
│  └─ entrypoint.sh
├─ Dockerfile
├─ docker-compose.yml
└─ public/                  # 静态资源
```

---

## 本地开发

### 前端

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 后端

```bash
cd backend

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 启动服务
uvicorn app.main:app --reload --port 8000
```

---

更多 API 使用说明请参考 [`api.md`](./api.md)。欢迎提交 Issue / PR 优化功能。
