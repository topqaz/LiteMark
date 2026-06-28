#!/usr/bin/env bash
if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

set -euo pipefail

GITHUB_RAW_BASE="https://raw.githubusercontent.com/topqaz/LiteMark/main"
GITHUB_API_BASE="https://api.github.com/repos/topqaz/LiteMark/contents"
PROJECT_DIR="litemark-cloudflare"
DEPLOY_DIR=".deploy"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.yml"
CLOUDFLARE_ROOT_FILES=(
  "package.json"
  "package-lock.json"
  "wrangler.jsonc"
  "index.html"
  "vite.config.ts"
  "tsconfig.json"
  "tsconfig.node.json"
)
CLOUDFLARE_DIRS=(
  "src"
  "public"
  "worker"
)

info() {
  printf '\033[1;34m[INFO]\033[0m %s\n' "$*"
}

warn() {
  printf '\033[1;33m[WARN]\033[0m %s\n' "$*"
}

fail() {
  printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "缺少命令: $1"
}

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    date +%s%N | sha256sum | awk '{print $1}'
  fi
}

ask() {
  local prompt="$1"
  local default="${2:-}"
  local value
  if [ -n "$default" ]; then
    read -r -p "${prompt} [${default}]: " value
    printf '%s' "${value:-$default}"
  else
    read -r -p "${prompt}: " value
    printf '%s' "$value"
  fi
}

detect_image() {
  local arch
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) printf 'topqaz/litemark:amd64' ;;
    aarch64|arm64) printf 'topqaz/litemark:arm64' ;;
    *) printf 'topqaz/litemark:latest' ;;
  esac
}

compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    fail "缺少 Docker Compose。请安装 docker compose 插件或 docker-compose。"
  fi
}

download_file() {
  local url="$1"
  local output="$2"
  mkdir -p "$(dirname "$output")"

  if has_cmd curl; then
    curl -fsSL "$url" -o "$output"
    return
  fi

  if has_cmd wget; then
    wget -qO "$output" "$url"
    return
  fi

  fail "缺少下载工具。请安装 curl 或 wget。"
}

fetch_url() {
  local url="$1"

  if has_cmd curl; then
    curl -fsSL "$url"
    return
  fi

  if has_cmd wget; then
    wget -qO- "$url"
    return
  fi

  fail "缺少下载工具。请安装 curl 或 wget。"
}

download_github_dir() {
  local dir="$1"
  local api_url="${GITHUB_API_BASE}/${dir}?ref=main"
  local entries

  entries="$(fetch_url "$api_url")"
  printf '%s' "$entries" | node -e '
const fs = require("fs");
const entries = JSON.parse(fs.readFileSync(0, "utf8"));
for (const entry of entries) {
  if (entry.type === "file") {
    console.log("file\t" + entry.path + "\t" + entry.download_url);
  } else if (entry.type === "dir") {
    console.log("dir\t" + entry.path);
  }
}
' | while IFS="$(printf '\t')" read -r type path url; do
    if [ "$type" = "file" ]; then
      download_file "$url" "$path"
    elif [ "$type" = "dir" ]; then
      download_github_dir "$path"
    fi
  done
}

download_cloudflare_files() {
  if [ -f "package.json" ] && [ -f "wrangler.jsonc" ] && [ -d "worker" ]; then
    return
  fi

  if [ -d "$PROJECT_DIR" ]; then
    info "检测到 ${PROJECT_DIR} 目录，使用已有 Cloudflare 部署文件。"
    cd "$PROJECT_DIR"
    return
  fi

  need_cmd node

  info "当前目录没有 LiteMark Cloudflare 部署文件，将从 GitHub 下载所需文件。"
  mkdir -p "$PROJECT_DIR"
  cd "$PROJECT_DIR"

  local file
  for file in "${CLOUDFLARE_ROOT_FILES[@]}"; do
    download_file "${GITHUB_RAW_BASE}/${file}" "$file"
  done

  local dir
  for dir in "${CLOUDFLARE_DIRS[@]}"; do
    download_github_dir "$dir"
  done

  info "Cloudflare 部署文件已下载到: $(pwd)"
}

write_docker_compose() {
  local image="$1"
  local port="$2"
  local jwt_secret="$3"
  local username="$4"
  local password="$5"

  mkdir -p "$DEPLOY_DIR"
  info "从 GitHub 下载 docker-compose.yml..."
  download_file "${GITHUB_RAW_BASE}/docker-compose.yml" "$COMPOSE_FILE"

  node -e '
const fs = require("fs");
const file = process.argv[1];
const [image, port, jwtSecret, username, password] = process.argv.slice(2);
let text = fs.readFileSync(file, "utf8");
text = text.replace(/image:\s*[^\n#]+(\s*#.*)?/, `image: ${image}$1`);
text = text.replace(/-\s*"\d+:80"(\s*#.*)?/, `- "${port}:80"$1`);
text = text.replace(/-\s*JWT_SECRET=.*/, `- JWT_SECRET=${jwtSecret}`);
text = text.replace(/-\s*DEFAULT_ADMIN_USERNAME=.*/, `- DEFAULT_ADMIN_USERNAME=${username}`);
text = text.replace(/-\s*DEFAULT_ADMIN_PASSWORD=.*/, `- DEFAULT_ADMIN_PASSWORD=${password}`);
fs.writeFileSync(file, text);
' "$COMPOSE_FILE" "$image" "$port" "$jwt_secret" "$username" "$password"
}

deploy_docker() {
  need_cmd docker

  local image
  local port
  local username
  local password
  local jwt_secret

  image="$(ask "Docker 镜像" "$(detect_image)")"
  port="$(ask "宿主机访问端口" "8080")"
  username="$(ask "默认管理员用户名（仅首次初始化有效）" "admin")"
  password="$(ask "默认管理员密码（仅首次初始化有效）" "admin123")"
  jwt_secret="$(ask "JWT_SECRET" "$(random_secret)")"

  write_docker_compose "$image" "$port" "$jwt_secret" "$username" "$password"

  info "启动 Docker 部署..."
  compose_cmd -f "$COMPOSE_FILE" up -d

  info "部署完成"
  printf '访问地址: http://localhost:%s\n' "$port"
  printf '后台入口: http://localhost:%s/admin\n' "$port"
  printf 'Compose 文件: %s\n' "$COMPOSE_FILE"
}

replace_jsonc_value() {
  local key="$1"
  local value="$2"
  local file="$3"
  node -e '
const fs = require("fs");
const file = process.argv[1];
const key = process.argv[2];
const value = process.argv[3];
let text = fs.readFileSync(file, "utf8");
const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const re = new RegExp("(\"" + escapedKey + "\"\\s*:\\s*)\"[^\"]*\"");
if (!re.test(text)) {
  throw new Error("Cannot find key: " + key);
}
const escapedValue = value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
text = text.replace(re, "$1\"" + escapedValue + "\"");
fs.writeFileSync(file, text);
' "$file" "$key" "$value"
}

extract_database_id() {
  sed -n 's/.*database_id = "\([^"]*\)".*/\1/p' | tail -n 1
}

assert_cloudflare_build() {
  if grep -R -E '127\.0\.0\.1:8000|localhost:8000' dist >/dev/null 2>&1; then
    fail "Cloudflare 构建产物仍包含本地 API 地址。请检查 VITE_API_BASE_URL 环境变量。"
  fi
}

find_d1_database_id() {
  local db_name="$1"
  npx wrangler d1 list --json 2>/dev/null | node -e '
const fs = require("fs");
const dbName = process.argv[1];
const input = fs.readFileSync(0, "utf8").trim();
if (!input) process.exit(0);
const databases = JSON.parse(input);
const found = databases.find((db) => db.name === dbName);
if (found?.uuid) {
  console.log(found.uuid);
} else if (found?.id) {
  console.log(found.id);
}
' "$db_name"
}

deploy_cloudflare() {
  need_cmd node
  need_cmd npm
  download_cloudflare_files

  [ -f "wrangler.jsonc" ] || fail "未找到 wrangler.jsonc，请在项目根目录运行脚本。"
  [ -f "worker/migrations/0001_init.sql" ] || fail "未找到 D1 migration 文件。"

  info "安装前端和 Wrangler 依赖..."
  npm install

  local worker_name
  local db_name
  local username
  local password
  local jwt_secret
  local create_db
  local database_id

  worker_name="$(ask "Cloudflare Worker 名称" "litemark")"
  db_name="$(ask "D1 数据库名称" "litemark")"
  username="$(ask "默认管理员用户名（仅首次初始化有效）" "admin")"
  password="$(ask "默认管理员密码（仅首次初始化有效）" "admin123")"
  jwt_secret="$(ask "JWT_SECRET" "$(random_secret)")"

  replace_jsonc_value "name" "$worker_name" "wrangler.jsonc"
  replace_jsonc_value "database_name" "$db_name" "wrangler.jsonc"
  replace_jsonc_value "JWT_SECRET" "$jwt_secret" "wrangler.jsonc"
  replace_jsonc_value "DEFAULT_ADMIN_USERNAME" "$username" "wrangler.jsonc"
  replace_jsonc_value "DEFAULT_ADMIN_PASSWORD" "$password" "wrangler.jsonc"

  info "请按提示登录 Cloudflare。若已经登录，Wrangler 会直接继续。"
  npx wrangler login

  create_db="$(ask "是否创建新的 D1 数据库？输入 y 创建，输入 n 使用已有 database_id" "y")"
  if [ "$create_db" = "y" ] || [ "$create_db" = "Y" ]; then
    info "创建 D1 数据库: ${db_name}"
    database_id="$(npx wrangler d1 create "$db_name" 2>&1 | tee /dev/stderr | extract_database_id || true)"
    if [ -z "$database_id" ]; then
      warn "创建失败或数据库已存在，尝试从 D1 列表中查找 ${db_name}..."
      database_id="$(find_d1_database_id "$db_name" || true)"
    fi
    if [ -z "$database_id" ]; then
      database_id="$(ask "未能自动解析 database_id，请从 Cloudflare D1 控制台复制后粘贴")"
    fi
    [ -n "$database_id" ] || fail "database_id 不能为空"
  else
    database_id="$(ask "请输入已有 D1 database_id")"
    [ -n "$database_id" ] || fail "database_id 不能为空"
  fi

  replace_jsonc_value "database_id" "$database_id" "wrangler.jsonc"

  info "应用 D1 远程迁移..."
  npx wrangler d1 migrations apply "$db_name" --remote

  info "构建并部署 Cloudflare Worker..."
  VITE_API_BASE_URL= npm run build
  assert_cloudflare_build
  npx wrangler deploy

  info "Cloudflare Workers 部署完成"
}

main() {
  cd "$(dirname "$0")"

  printf '\nLiteMark Linux 一键部署脚本\n'
  printf '1) Docker 本地部署（完整 FastAPI 版本）\n'
  printf '2) Cloudflare Workers 部署（独立 D1 版本）\n'
  printf '0) 退出\n\n'

  local choice
  choice="$(ask "请选择部署方式" "1")"
  case "$choice" in
    1) deploy_docker ;;
    2) deploy_cloudflare ;;
    0) exit 0 ;;
    *) fail "无效选择: $choice" ;;
  esac
}

main "$@"
