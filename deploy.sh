#!/usr/bin/env bash
if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

set -euo pipefail

PROJECT_DIR="litemark-cloudflare"
NODE_DOCKER_IMAGE="${NODE_DOCKER_IMAGE:-node:20-alpine}"
CF_RUNTIME="local"
CF_DOWNLOAD_DIR=""
CF_DOWNLOADED_BY_SCRIPT="false"
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

is_yes() {
  case "$1" in
    y|Y|yes|YES|Yes) return 0 ;;
    *) return 1 ;;
  esac
}

run_as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif has_cmd sudo; then
    sudo "$@"
  else
    fail "需要 root 权限执行: $*"
  fi
}

install_system_packages() {
  local packages=("$@")
  [ "${#packages[@]}" -gt 0 ] || return 0

  if has_cmd apt-get; then
    info "更新系统包索引..."
    run_as_root apt-get update
    info "安装系统依赖: ${packages[*]}"
    run_as_root apt-get install -y "${packages[@]}"
    return
  fi

  if has_cmd dnf; then
    run_as_root dnf install -y "${packages[@]}"
    return
  fi

  if has_cmd yum; then
    run_as_root yum install -y "${packages[@]}"
    return
  fi

  if has_cmd apk; then
    run_as_root apk add --no-cache "${packages[@]}"
    return
  fi

  fail "未识别系统包管理器，请手动安装: ${packages[*]}"
}

ensure_cloudflare_system_deps() {
  local packages=()
  local install_deps

  if ! has_cmd curl && ! has_cmd wget; then
    packages+=("curl")
  fi
  if ! has_cmd tar; then
    packages+=("tar")
  fi
  if ! has_cmd node && ! has_cmd docker; then
    packages+=("docker.io")
  fi

  [ "${#packages[@]}" -gt 0 ] || return 0

  warn "缺少系统依赖: ${packages[*]}"
  install_deps="$(ask "是否自动更新系统并安装缺失依赖？输入 y 安装，输入 n 退出" "y")"
  if is_yes "$install_deps"; then
    install_system_packages "${packages[@]}"
    if ! has_cmd node && has_cmd docker && has_cmd systemctl; then
      run_as_root systemctl enable --now docker >/dev/null 2>&1 || warn "Docker 已安装，但未能自动启动服务；如后续失败，请手动启动 docker。"
    fi
  else
    fail "缺少系统依赖，无法继续。"
  fi
}

detect_cloudflare_runtime() {
  if has_cmd node && has_cmd npm; then
    CF_RUNTIME="local"
    info "检测到本机 Node.js，将使用本机 Node.js/npm/Wrangler 部署。"
    return
  fi

  if has_cmd docker; then
    CF_RUNTIME="docker"
    if ! docker info >/dev/null 2>&1; then
      if has_cmd systemctl; then
        run_as_root systemctl start docker >/dev/null 2>&1 || true
      fi
    fi
    docker info >/dev/null 2>&1 || fail "Docker 未运行。请启动 Docker 后重试。"
    info "未检测到本机 Node.js，将使用 Docker 镜像 ${NODE_DOCKER_IMAGE} 执行 npm、node 和 wrangler。"
    return
  fi

  fail "缺少 Node.js/npm 或 Docker，无法执行 Cloudflare 部署。"
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

trim_value() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

ask_trimmed() {
  local value
  value="$(ask "$@")"
  trim_value "$value"
}

ask_worker_name() {
  local prompt="$1"
  local default="$2"
  local value
  while true; do
    value="$(ask_trimmed "$prompt" "$default")"
    if printf '%s' "$value" | grep -Eq '^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$'; then
      printf '%s' "$value"
      return
    fi
    warn "Worker 名称只能包含小写字母、数字和短横线，且不能以短横线开头或结尾。"
  done
}

ask_secret() {
  local prompt="$1"
  local value
  read -r -s -p "${prompt}: " value
  printf '\n' >&2
  printf '%s' "$value"
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

cloudflare_api_get() {
  local path="$1"
  local url="https://api.cloudflare.com/client/v4${path}"

  if has_cmd curl; then
    curl -sS \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json" \
      "$url"
    return
  fi

  if has_cmd wget; then
    wget -qO- \
      --header="Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      --header="Content-Type: application/json" \
      "$url"
    return
  fi

  fail "缺少下载工具。请安装 curl 或 wget。"
}

assert_cloudflare_api_success() {
  local label="$1"
  run_node -e '
const fs = require("fs");
const label = process.argv[1];
const input = fs.readFileSync(0, "utf8").trim();
let data;
try {
  data = JSON.parse(input);
} catch {
  console.error(`${label} 失败：Cloudflare API 返回了无法解析的响应。`);
  if (input) console.error(input.slice(0, 500));
  process.exit(1);
}
if (!data.success) {
  const errors = Array.isArray(data.errors) ? data.errors : [];
  const detail = errors.length
    ? errors.map((err) => `[${err.code ?? "unknown"}] ${err.message ?? "Unknown error"}`).join("; ")
    : "Unknown Cloudflare API error";
  console.error(`${label} 失败：${detail}`);
  process.exit(1);
}
' "$label"
}

extract_cloudflare_account_id() {
  run_node -e '
const fs = require("fs");
const input = fs.readFileSync(0, "utf8").trim();
let data;
try {
  data = JSON.parse(input);
} catch {
  console.error("账号权限检查失败：Cloudflare API 返回了无法解析的响应。");
  if (input) console.error(input.slice(0, 500));
  process.exit(1);
}
if (!data.success) {
  const errors = Array.isArray(data.errors) ? data.errors : [];
  const detail = errors.length
    ? errors.map((err) => `[${err.code ?? "unknown"}] ${err.message ?? "Unknown error"}`).join("; ")
    : "Unknown Cloudflare API error";
  console.error(`账号权限检查失败：${detail}`);
  process.exit(1);
}
const memberships = Array.isArray(data.result) ? data.result : [];
const accounts = memberships
  .map((membership) => membership && membership.account)
  .filter((account) => account && account.id);
if (!accounts.length) {
  console.error("账号权限检查失败：Token 未返回可用的 Cloudflare Account。");
  process.exit(1);
}
if (accounts.length > 1) {
  console.error(`检测到多个 Cloudflare Account，将使用第一个：${accounts[0].name || accounts[0].id}`);
}
console.log(accounts[0].id);
'
}

validate_cloudflare_token() {
  local account_id

  info "校验 Cloudflare API Token..."
  cloudflare_api_get "/user/tokens/verify" \
    | assert_cloudflare_api_success "Token 校验"

  info "检查账号读取权限..."
  if ! account_id="$(cloudflare_api_get "/memberships" | extract_cloudflare_account_id)"; then
    fail "Token 无法读取账号成员信息。请确认 Token 包含 User Memberships Read 或使用 Cloudflare 推荐的 Workers/D1 编辑权限模板。"
  fi
  info "Cloudflare Account ID: ${account_id}"

  info "检查 D1 权限..."
  if ! cloudflare_api_get "/accounts/${account_id}/d1/database" \
    | assert_cloudflare_api_success "D1 权限检查"; then
    fail "Token 无法访问 D1 API。请确认 Token 包含 Account / D1 / Edit 权限。"
  fi

  info "检查 Workers 权限..."
  if ! cloudflare_api_get "/accounts/${account_id}/workers/scripts" \
    | assert_cloudflare_api_success "Workers 权限检查"; then
    fail "Token 无法访问 Workers Scripts API。请确认 Token 包含 Account / Workers Scripts / Edit 权限。"
  fi

  info "Cloudflare Token 与基础权限校验通过。"
}

download_cloudflare_files() {
  if [ -f "package.json" ] && [ -f "wrangler.jsonc" ] && [ -d "worker" ]; then
    CF_DOWNLOAD_DIR=""
    CF_DOWNLOADED_BY_SCRIPT="false"
    return
  fi

  if [ -d "$PROJECT_DIR" ]; then
    warn "检测到已有 ${PROJECT_DIR} 目录，将刷新部署文件以避免旧配置残留。"
    rm -rf "$PROJECT_DIR"
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
  CF_DOWNLOAD_DIR="$(pwd)"
  CF_DOWNLOADED_BY_SCRIPT="true"

  info "Cloudflare 部署文件已下载到: $(pwd)"
}

cleanup_cloudflare_download() {
  if [ "$CF_DOWNLOADED_BY_SCRIPT" = "true" ] && [ -n "$CF_DOWNLOAD_DIR" ] && [ -d "$CF_DOWNLOAD_DIR" ]; then
    if [ "$(basename "$CF_DOWNLOAD_DIR")" != "$PROJECT_DIR" ]; then
      warn "跳过清理异常目录: ${CF_DOWNLOAD_DIR}"
      return
    fi
    info "清理临时 Cloudflare 部署文件: ${CF_DOWNLOAD_DIR}"
    cd "$(dirname "$CF_DOWNLOAD_DIR")"
    rm -rf "$CF_DOWNLOAD_DIR"
    CF_DOWNLOAD_DIR=""
    CF_DOWNLOADED_BY_SCRIPT="false"
  fi
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
  local mode="${1:-new}"
  ensure_cloudflare_system_deps
  detect_cloudflare_runtime

  if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
    CLOUDFLARE_API_TOKEN="$(ask_secret "Cloudflare API Token")"
    export CLOUDFLARE_API_TOKEN
  fi
  [ -n "$CLOUDFLARE_API_TOKEN" ] || fail "Cloudflare API Token 不能为空"
  validate_cloudflare_token

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
  local create_db_default
  local database_id

  worker_name="${LITEMARK_WORKER_NAME:-litemark}"
  db_name="${LITEMARK_D1_DATABASE:-litemark}"
  if [ "$mode" = "update" ]; then
    worker_name="$(ask_worker_name "已部署的 Cloudflare Worker 名称" "$worker_name")"
    db_name="$(ask_trimmed "已部署使用的 D1 数据库名称" "$db_name")"
  else
    worker_name="$(ask_worker_name "Cloudflare Worker 名称" "$worker_name")"
    db_name="$(ask_trimmed "D1 数据库名称" "$db_name")"
  fi
  [ -n "$db_name" ] || fail "D1 数据库名称不能为空"

  if [ "$mode" = "update" ]; then
    info "更新配置: Worker=${worker_name}, D1=${db_name}"
  else
    username="${LITEMARK_ADMIN_USERNAME:-admin}"
    password="${LITEMARK_ADMIN_PASSWORD:-admin123}"
    jwt_secret="${LITEMARK_JWT_SECRET:-$(random_secret)}"
    username="$(ask_trimmed "默认管理员用户名（仅首次初始化有效）" "$username")"
    password="$(ask_trimmed "默认管理员密码（仅首次初始化有效）" "$password")"
    info "部署配置: Worker=${worker_name}, D1=${db_name}, 管理员=${username}"
    warn "默认管理员密码为 ${password}，部署完成后建议立即在后台修改。"
  fi

  replace_jsonc_value "name" "$worker_name" "wrangler.jsonc"
  replace_jsonc_value "database_name" "$db_name" "wrangler.jsonc"
  if [ "$mode" != "update" ]; then
    replace_jsonc_value "JWT_SECRET" "$jwt_secret" "wrangler.jsonc"
    replace_jsonc_value "DEFAULT_ADMIN_USERNAME" "$username" "wrangler.jsonc"
    replace_jsonc_value "DEFAULT_ADMIN_PASSWORD" "$password" "wrangler.jsonc"
  fi

  if [ "$mode" = "update" ]; then
    create_db="n"
  else
    create_db_default="y"
    create_db="${LITEMARK_CREATE_D1:-}"
    if [ -z "$create_db" ]; then
      create_db="$(ask "是否创建新的 D1 数据库？输入 y 创建，输入 n 使用已有 database_id" "$create_db_default")"
    fi
  fi

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
    info "尝试从 D1 列表中查找 ${db_name}..."
    database_id="$(find_d1_database_id "$db_name" || true)"
    if [ -z "$database_id" ]; then
      database_id="$(ask "未能自动查找 D1 database_id，请从 Cloudflare D1 控制台复制后粘贴")"
    fi
    [ -n "$database_id" ] || fail "database_id 不能为空"
  fi

  replace_jsonc_value "database_id" "$database_id" "wrangler.jsonc"

  if [ "$mode" != "update" ]; then
    info "应用 D1 远程迁移..."
    run_npx wrangler d1 migrations apply "$db_name" --remote
  else
    info "更新模式跳过 D1 初始化和站点账号配置，仅发布最新代码。"
  fi

  info "构建并部署 Cloudflare Worker..."
  VITE_API_BASE_URL= run_npm run build
  assert_cloudflare_build
  run_npx wrangler deploy

  info "Cloudflare Workers 部署完成"
  cleanup_cloudflare_download
}

main() {
  cd "$(dirname "$0")"

  printf '\nLiteMark Cloudflare Workers 一键部署脚本\n\n'
  printf '1) 新部署 Cloudflare Workers\n'
  printf '2) 更新 Cloudflare Workers\n'
  printf '0) 退出\n\n'

  local choice
  choice="$(ask "请选择操作" "1")"
  case "$choice" in
    1) deploy_cloudflare "new" ;;
    2) deploy_cloudflare "update" ;;
    0) exit 0 ;;
    *) fail "无效选择: $choice" ;;
  esac
}

main "$@"
