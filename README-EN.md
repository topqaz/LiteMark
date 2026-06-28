<p align="center">
    <a href="https://github.com/topqaz/LiteMark" target="_blank" rel="noopener noreferrer">
        <img width="100" src="public/LiteMark.png" alt="LiteMark logo" />
    </a>
</p>
<p align="center"><b>LiteMark</b> - A lightweight and easy-to-use bookmark navigation system</p>

---

LiteMark is a personal bookmark management application based on **Vue 3 + FastAPI**, providing responsive dual-end experience, admin panel, AI-powered features, and multiple deployment options.

---

## Key Features

- 📚 **Bookmark Management**: Support for adding, editing, deleting, hiding and sorting; drag-and-drop adjustment for category order and internal ordering
- 🤖 **AI-Powered Features**: Smart category recommendation, content summarization, tag extraction, quick bookmark addition
- 🔐 **Admin Panel**: Located at `/admin`, includes login verification, site settings, backup management, etc.
- 💾 **WebDAV Scheduled Backup**: Support for configuring WebDAV server for automatic scheduled backups
- 🐳 **Docker Deployment**: One-click deployment supporting both x64 and ARM64 architectures

---

## Quick Start

### Linux One-Click Deployment Script

The script lets you choose Docker local deployment or independent Cloudflare Workers deployment interactively:

```bash
# Download the script from GitHub and run it
curl -fsSL https://raw.githubusercontent.com/topqaz/LiteMark/main/deploy.sh -o deploy.sh
chmod +x deploy.sh
./deploy.sh
```


### Docker Deployment (Recommended)

```bash
# Using docker-compose
curl -O https://raw.githubusercontent.com/topqaz/LiteMark/main/docker-compose.yml
docker-compose up -d

# Or use docker run directly
docker run -d -p 8080:80 \
  -v litemark-data:/app/data \
  -e JWT_SECRET=your-secret-key \
  -e DEFAULT_ADMIN_USERNAME=admin \
  -e DEFAULT_ADMIN_PASSWORD=admin123 \
  --name litemark \
  topqaz/litemark:amd64
```
# For ARM64 architecture use: topqaz/litemark:arm64

Access address: `http://localhost:8080`, Admin panel: `http://localhost:8080/admin`

### Cloudflare Workers Deployment

Cloudflare Workers deployment is an independent deployment option. It runs the API in a Worker and stores bookmark data in D1, without requiring the local Docker/FastAPI backend. You can choose either Docker local deployment above or Cloudflare Workers deployment.

The Workers version currently supports login, bookmark management, category management, site settings, JSON/CSV/HTML export, JSON/CSV/HTML file import, page-title fetching, OpenAI-compatible AI summarization/classification/quick-add, WebDAV configuration/testing/manual backup/scheduled backup/retention cleanup, basic MCP tool calls, and OAuth Client Credentials. WebDAV scheduled backup is evaluated in Asia/Shanghai time; AI background batch processing is still best handled by the Docker/FastAPI version.

1. Install dependencies and log in to Cloudflare:

```bash
npm install
npx wrangler login
```

2. Create a D1 database:

```bash
npm run cf:d1:create
```

The command prints a `database_id`. Copy it into `wrangler.jsonc`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "litemark",
    "database_id": "paste-it-here",
    "migrations_dir": "worker/migrations"
  }
]
```

3. Update `JWT_SECRET`, `DEFAULT_ADMIN_USERNAME`, and `DEFAULT_ADMIN_PASSWORD` in `wrangler.jsonc`.

4. Initialize D1 tables and deploy:

```bash
npm run cf:d1:migrate
npm run deploy:cloudflare
```

You can also preview the Worker locally:

```bash
npm run cf:d1:migrate:local
npm run preview:cloudflare
```

After deployment, visit the Cloudflare Workers URL or your custom domain.

## Updates

```bash
# Pull the latest image
docker-compose pull
# Start new container
docker-compose up -d
```

### docker-compose.yml Example

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

## Project Demo

### Homepage Display

<p align="center">
  <img src="project_img/home1.jpg" alt="Homepage screenshot 1" width="800" />
</p>

<p align="center">
  <img src="project_img/home2.jpg" alt="Homepage screenshot 2" width="800" />
</p>

### MCP Demo

<p align="center">
  <img src="project_img/mcp4.jpg" alt="MCP demo screenshot 1" width="800" />
</p>
<p align="center">
  <img src="project_img/mcp5.jpg" alt="MCP demo screenshot 2" width="800" />
</p>
<p align="center">
  <img src="project_img/mcp6.jpg" alt="MCP demo screenshot 3" width="800" />
</p>

### Login Page

<p align="center">
  <img src="project_img/login.jpg" alt="Login page" width="800" />
</p>

### Admin Panel

<p align="center">
  <img src="project_img/admin1.jpg" alt="Admin panel screenshot 1" width="800" />
</p>

<p align="center">
  <img src="project_img/admin2.jpg" alt="Admin panel screenshot 2" width="800" />
</p>

---

## WebDAV Scheduled Backup

LiteMark supports scheduled backup of data to a WebDAV server to ensure data security.

### Configuration Steps

1. **Configure WebDAV in Admin Panel**
   - Go to Admin Panel → Data Backup
   - Enter WebDAV address, username, password
   - Set backup path and retention count
   - Click "Test Connection" to verify configuration

2. **Enable Scheduled Backup**
   - Enable "Scheduled Backup" toggle
   - Set daily backup time
   - Save configuration

### Manual Backup

In Admin Panel → Data Backup page, click the "Backup Now" button to trigger a manual backup.

### Backup File Format

- File format: JSON
- Contents: All bookmark data, category order
- File naming format: `litemark-backup-YYYY-MM-DD-HH-MM-SS.json`

---

## Import/Export Bookmarks

LiteMark supports "batch import/export" functionality compatible with JSON/CSV/HTML formats.

### Export

In Admin Panel -> Data Backup, select export format:

- JSON: Complete backup (bookmarks + category order)
- CSV: Row-based bookmark export containing id/title/url/category/description/tags/visible/order fields
- HTML: Netscape Bookmark standard format for easy browser bookmark import

Click "Export Data" to get the corresponding file (`litemark-bookmarks-YYYY-MM-DD.{json|csv|html}`).

### Import

In Admin Panel -> Data Backup, select "Import Backup" file: supports `.json`, `.csv`, `.html`.

- JSON files can directly use LiteMark backup export files and may contain `bookmarks` + `category_order` data.
- CSV files should include `title,url` fields, recommended to include `category,description,tags,visible,order`.
- HTML files will extract `<A HREF="...">` bookmark items.

When "Overwrite Existing Data" option is enabled, existing bookmarks and categories will be cleared before importing.

---

## Browser Extension

https://github.com/topqaz/LiteMark-extension-browser

- Support one-click add for current page
- Support one-click import browser bookmarks

---

## MCP Tools

LiteMark has a built-in Streamable HTTP MCP Server that supports AI clients to directly organize, add, modify, hide, delete bookmarks, and manage category order. MCP is disabled by default and can be enabled in the admin panel with a dedicated token generated. Authentication supports direct Bearer Token or OAuth 2.0 Client Credentials.

### Enable MCP

Go to Admin Panel → System Settings → MCP Settings:

1. Click "Generate" to create MCP Token
2. Enable MCP
3. Save MCP settings
4. Copy Bearer Token configuration or OAuth 2.0 configuration according to client capabilities

After enabling, the MCP address is:

```text
https://your-litemark.example.com/mcp/
```

### Client Configuration Example

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

OAuth 2.0 Client Credentials configuration example:

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

OAuth discovery endpoints:

```text
https://your-litemark.example.com/.well-known/oauth-protected-resource
https://your-litemark.example.com/.well-known/oauth-authorization-server
```

### Reverse Proxy Considerations

If you have another layer of Nginx, Baota, 1Panel, Cloudflare Tunnel, etc. reverse proxy outside the Docker container, please ensure `/mcp/` supports long connections and disables response buffering. It's recommended to use `/mcp/` with trailing slash for client address to avoid some clients losing the port when redirecting from `/mcp` to `/mcp/`. At least preserve request headers `Authorization`, `MCP-Protocol-Version`, `MCP-Session-Id`, `Last-Event-ID`, and disable buffering / gzip to avoid Streamable HTTP connections being cached or disconnected by the proxy in advance.

External Nginx example:

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

Exposed tools include:

- `list_litemark_bookmarks`: Query bookmarks, filter by category and keywords
- `add_litemark_bookmark`: Add bookmark
- `update_litemark_bookmark`: Modify title, link, category, description, tags, visibility and sort value
- `delete_litemark_bookmark`: Delete bookmark
- `list_litemark_categories` / `add_litemark_category` / `rename_litemark_category` / `delete_litemark_category`
- `reorder_litemark_bookmarks` / `reorder_litemark_categories`

---

## Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `JWT_SECRET` | JWT signing key, **must be changed in production** | `change-this-to-a-secure-random-string` |
| `DATABASE_URL` | Database connection URL | `sqlite+aiosqlite:///./data/litemark.db` |
| `DEFAULT_ADMIN_USERNAME` | Default admin username (only effective on first startup) | `admin` |
| `DEFAULT_ADMIN_PASSWORD` | Default admin password (only effective on first startup) | `admin123` |
| `DEBUG` | Debug mode | `false` |
| `CORS_ORIGINS` | CORS allowed origins | `*` |

---

## Project Structure

```
├─ backend/                 # Python Backend
│  ├─ app/
│  │  ├─ api/              # API Routes
│  │  ├─ models/           # Data Models
│  │  ├─ schemas/          # Pydantic Schemas
│  │  ├─ services/         # Business Logic
│  │  └─ utils/            # Utility Functions
│  └─ requirements.txt
├─ src/                     # Vue Frontend
│  ├─ pages/
│  │  ├─ HomePageV2.vue    # Frontend Bookmark Display
│  │  └─ admin/            # Admin Panel Pages
│  ├─ App.vue
│  └─ main.ts
├─ docker/                  # Docker Configuration
│  ├─ nginx.conf
│  ├─ supervisord.conf
│  └─ entrypoint.sh
├─ Dockerfile
├─ docker-compose.yml
└─ public/                  # Static Assets
```

---

## Local Development

### Frontend

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start service
uvicorn app.main:app --reload --port 8000
```

---

For more API usage instructions, please refer to [`api.md`](./api.md). Welcome to submit Issue / PR to optimize features.
