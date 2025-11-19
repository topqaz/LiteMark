# LiteMark

LiteMark 是一款基于 **Vue 3 + Vite** 的个人书签管理应用，提供响应式双端体验、后台管理面板以及 Postgres 持久化存储。当前前端和后端（Vercel Functions + Vercel Postgres）已深度集成，只需少量配置即可在本地或 Vercel 上快速运行。
---

## 功能亮点

- 📚 **书签管理**：支持添加、编辑、删除、隐藏与排序；分类顺序与分类内顺序均可拖拽调整。
- 🎨 **主题定制**：内置多套主题，可在后台即时切换；支持自定义站点标题和图标。
- 🔍 **高效浏览**：搜索框置于顶栏，移动端卡片两列展示并自动适配描述内容。
- 🔐 **后台面板**：位于 `/admin`，含登录校验、缓存刷新、站点设置等管理动作。
- 🚀 **极佳体验**：SSR 友好的 API、前端缓存提示、响应式布局与移动端操作优化。
- 💾 **WebDAV 定时备份**：支持配置 WebDAV 服务器，实现定时自动循环备份（每天/每周/每月）。

---

## WebDAV 定时备份

LiteMark 支持将数据定时备份到 WebDAV 服务器，确保数据安全。

### 配置步骤

1. **在后台配置 WebDAV**
   - 进入后台管理 → 数据备份
   - 在 "WebDAV 定时备份" 区域填写：
     - WebDAV 地址（如：`https://dav.example.com`）
     - 用户名和密码
     - 备份路径（可选，默认为 `litemark-backup/`）
     - 备份频率（每天/每周/每月）
   - 点击"测试连接"验证配置
   - 点击"保存配置"保存设置

2. **启用定时备份**
   - 打开"启用定时备份"开关
   - 保存配置

3. **配置 Vercel Cron Job**  （默认每天凌晨2点，如需自定义备份频率可以更改）
   
   在项目根目录的 `vercel.json` 中添加 cron 配置：

   ```json
   {
     "crons": [{
       "path": "/api/cron/backup",
       "schedule": "0 2 * * *"
     }]
   }
   ```

   - `schedule` 使用 cron 表达式，根据你选择的备份频率：
     - **每天**：`0 2 * * *` - 每天凌晨 2 点
     - **每周**：`0 2 * * 0` - 每周日凌晨 2 点
     - **每月**：`0 2 1 * *` - 每月 1 号凌晨 2 点

4. **设置 CRON_SECRET（推荐）**
   
   在 Vercel 环境变量中添加 `CRON_SECRET`，用于保护 cron 端点：

   ```
   CRON_SECRET=your-random-secret-key
   ```

   Cron Job 会自动在请求头中添加 `Authorization: Bearer ${CRON_SECRET}`。

### 手动备份

在后台管理 → 数据备份页面，点击"立即备份"按钮可手动触发备份到 WebDAV。

### 备份文件格式

备份文件为 JSON 格式，包含：
- 所有书签数据
- 站点设置（主题、标题、图标等）
- 导出时间戳
- 文件名格式：`litemark-backup-YYYY-MM-DD.json`

---

## 部署到 Vercel

1. **Fork / Clone** 仓库，并推送至自己的 Git 仓库。
2. 在 Vercel 创建新项目，导入仓库。
3. 项目设置 → **Environment Variables**，填入 `.env.example` 中的变量（见下表）。
4. 点击 **Deploy**，等待构建完成。前端地址为 `https://<project>.vercel.app`，后台入口 `https://<project>.vercel.app/admin`。

> 若部署后 `/api` 返回静态页面或 404，多半是 `vercel.json` 不存在或命名错误（确保文件名为 `vercel.json`）。

---

##  浏览器插件

https://github.com/topqaz/LiteMark-extension-browser


## 环境变量清单

在根目录 `.env.example` 或 Vercel 控制台中配置：

| 变量 | 说明 | 默认值 | 是否必需 |
| --- | --- | --- | --- |
| `VITE_API_BASE_URL` | 前端调用 API 的基础地址；留空则使用当前域名。 | _(空字符串)_ | 否 |
| `JWT_SECRET` | JWT 令牌签名密钥，用于用户认证。生产环境必须修改。 | `your-secret-key-change-in-production` | **是（生产环境）** |
| `CORS_ORIGIN` | CORS 跨域允许的来源。设置为 `*` 允许所有来源，或指定具体域名。 | `*` | 否 |
| `POSTGRES_URL` | Vercel Postgres 数据库连接 URL（Vercel 自动提供） | - | 是（Vercel 部署） |
| `POSTGRES_PRISMA_URL` | Vercel Postgres Prisma 连接 URL（Vercel 自动提供） | - | 是（Vercel 部署） |
| `POSTGRES_URL_NON_POOLING` | Vercel Postgres 非连接池 URL（Vercel 自动提供） | - | 是（Vercel 部署） |
| `CRON_SECRET` | Cron Job 安全密钥（用于保护自动备份端点） | - | 否（推荐） |

### 环境变量说明

- **`VITE_API_BASE_URL`**：如果前端和 API 部署在同一域名下，可以留空。如果 API 部署在不同域名，需要填写完整的 API 地址（如 `https://api.example.com`）。
- **`JWT_SECRET`**：用于签名和验证 JWT 令牌。**生产环境必须设置一个强随机字符串**，建议使用至少 32 位的随机字符串。
- **`CORS_ORIGIN`**：控制跨域请求的来源。设置为 `*` 允许所有来源（开发环境），生产环境建议设置为具体的域名（如 `https://example.com`）。
- **Vercel Postgres 变量**：在 Vercel 上部署时，连接 Vercel Postgres 数据库后会自动提供这些环境变量，无需手动配置。

> **注意**：
> - 管理员账号密码存储在数据库的 `admin_credentials` 表中，默认账号为 `admin / admin123`，可在后台「账号管理」中修改，无需通过环境变量配置。
> - 在 Vercel 部署时，需要在 Vercel 项目设置中手动添加 `JWT_SECRET` 和 `CORS_ORIGIN`（如需要）。
> - 本地开发时，可以在根目录创建 `.env.local` 文件来配置这些变量。

---

## 项目结构

```
├─ api/
│  ├─ auth/                 # 登录接口
│  ├─ bookmarks/            # 书签 CRUD、排序、刷新
│  ├─ settings/             # 站点设置获取/修改
│  ├─ admin/                # 管理员账号管理
│  └─ _lib/                 # 鉴权、数据库、HTTP 等辅助模块
├─ src/
│  ├─ pages/
│  │  ├─ HomePage.vue       # 前台书签展示
│  │  └─ AdminDashboard.vue # 后台管理面板
│  ├─ App.vue               # 路由容器
│  └─ main.ts               # 应用入口
└─ public/                  # 静态资源
```

---

更多使用说明请参考 [`api.md`](./api.md)。欢迎提交 Issue / PR 优化功能。
