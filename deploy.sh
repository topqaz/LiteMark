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
NODE_DOCKER_IMAGE="${NODE_DOCKER_IMAGE:-node:20-alpine}"
CF_RUNTIME="local"
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

run_node() {
  if [ "$CF_RUNTIME" = "docker" ]; then
    docker run --rm -i \
      -u "$(id -u):$(id -g)" \
      -v "$(pwd):/work" \
      -w /work \
      "$NODE_DOCKER_IMAGE" \
      node "$@"
  else
    node "$@"
  fi
}

run_npm() {
  if [ "$CF_RUNTIME" = "docker" ]; then
    docker run --rm -i \
      -u "$(id -u):$(id -g)" \
      -v "$(pwd):/work" \
      -w /work \
      -e HOME=/tmp \
      -e VITE_API_BASE_URL="${VITE_API_BASE_URL:-}" \
      "$NODE_DOCKER_IMAGE" \
      npm "$@"
  else
    VITE_API_BASE_URL="${VITE_API_BASE_URL:-}" npm "$@"
  fi
}

run_npx() {
  if [ "$CF_RUNTIME" = "docker" ]; then
    docker run --rm -i \
      -u "$(id -u):$(id -g)" \
      -v "$(pwd):/work" \
      -w /work \
      -e HOME=/tmp \
      -e CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-}" \
      -e VITE_API_BASE_URL="${VITE_API_BASE_URL:-}" \
      "$NODE_DOCKER_IMAGE" \
      npx "$@"
  else
    CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-}" npx "$@"
  fi
}

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    date +%s%N | sha256sum | awk '{print $1}'
  fi
}

escape_sed_replacement() {
  printf '%s' "$1" | sed 's/[\/&\\]/\\&/g'
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

ask_secret() {
  local prompt="$1"
  local value
  read -r -s -p "${prompt}: " value
  printf '\n' >&2
  printf '%s' "$value"
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
  printf '%s' "$entries" | run_node -e '
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

  info "当前目录没有 LiteMark Cloudflare 部署文件，将从 GitHub 下载所需文件。"
  need_cmd tar
  mkdir -p "$PROJECT_DIR"

  local archive
  local archive_root
  local paths=()
  local file
  local dir

  archive="${TMPDIR:-/tmp}/litemark-main.tar.gz.$$"
  archive_root="LiteMark-main"

  download_file "https://github.com/topqaz/LiteMark/archive/refs/heads/main.tar.gz" "$archive"

  for file in "${CLOUDFLARE_ROOT_FILES[@]}"; do
    paths+=("${archive_root}/${file}")
  done
  for dir in "${CLOUDFLARE_DIRS[@]}"; do
    paths+=("${archive_root}/${dir}")
  done

  tar -xzf "$archive" -C "$PROJECT_DIR" --strip-components=1 "${paths[@]}"
  rm -f "$archive"
  cd "$PROJECT_DIR"

  info "Cloudflare 部署文件已下载到: $(pwd)"
}

write_docker_compose() {
  local image="$1"
  local port="$2"
  local jwt_secret="$3"
  local username="$4"
  local password="$5"
  local escaped_image
  local escaped_jwt_secret
  local escaped_username
  local escaped_password

  mkdir -p "$DEPLOY_DIR"
  info "从 GitHub 下载 docker-compose.yml..."
  download_file "${GITHUB_RAW_BASE}/docker-compose.yml" "$COMPOSE_FILE"

  escaped_image="$(escape_sed_replacement "$image")"
  escaped_jwt_secret="$(escape_sed_replacement "$jwt_secret")"
  escaped_username="$(escape_sed_replacement "$username")"
  escaped_password="$(escape_sed_replacement "$password")"

  sed -i.bak \
    -e "s|image:[[:space:]]*[^#]*|image: ${escaped_image}|" \
    -e "s|- \"[0-9][0-9]*:80\"|- \"${port}:80\"|" \
    -e "s|- JWT_SECRET=.*|- JWT_SECRET=${escaped_jwt_secret}|" \
    -e "s|- DEFAULT_ADMIN_USERNAME=.*|- DEFAULT_ADMIN_USERNAME=${escaped_username}|" \
    -e "s|- DEFAULT_ADMIN_PASSWORD=.*|- DEFAULT_ADMIN_PASSWORD=${escaped_password}|" \
    "$COMPOSE_FILE"
  rm -f "${COMPOSE_FILE}.bak"
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
  run_node -e '
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
  run_npx wrangler d1 list --json 2>/dev/null | run_node -e '
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
  local runtime
  runtime="$(ask "Cloudflare 部署运行环境：local=本机 Node.js，docker=仅使用 Docker" "local")"
  case "$runtime" in
    local)
      need_cmd node
      need_cmd npm
      CF_RUNTIME="local"
      ;;
    docker)
      need_cmd docker
      CF_RUNTIME="docker"
      info "将使用 Docker 镜像 ${NODE_DOCKER_IMAGE} 执行 npm、node 和 wrangler。"
      ;;
    *) fail "无效运行环境: $runtime" ;;
  esac

  if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
    CLOUDFLARE_API_TOKEN="$(ask_secret "Cloudflare API Token")"
    export CLOUDFLARE_API_TOKEN
  fi
  [ -n "$CLOUDFLARE_API_TOKEN" ] || fail "Cloudflare API Token 不能为空"

  download_cloudflare_files

  [ -f "wrangler.jsonc" ] || fail "未找到 wrangler.jsonc，请在项目根目录运行脚本。"
  [ -f "worker/migrations/0001_init.sql" ] || fail "未找到 D1 migration 文件。"

  info "安装前端和 Wrangler 依赖..."
  run_npm install

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

  info "使用 CLOUDFLARE_API_TOKEN 验证 Cloudflare 凭据..."
  run_npx wrangler whoami >/dev/null

  create_db="$(ask "是否创建新的 D1 数据库？输入 y 创建，输入 n 使用已有 database_id" "y")"
  if [ "$create_db" = "y" ] || [ "$create_db" = "Y" ]; then
    info "创建 D1 数据库: ${db_name}"
    database_id="$(run_npx wrangler d1 create "$db_name" 2>&1 | tee /dev/stderr | extract_database_id || true)"
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
  run_npx wrangler d1 migrations apply "$db_name" --remote

  info "构建并部署 Cloudflare Worker..."
  VITE_API_BASE_URL= run_npm run build
  assert_cloudflare_build
  run_npx wrangler deploy

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
