#!/bin/bash
set -e

# 设置默认环境变量
export DATABASE_URL=${DATABASE_URL:-"sqlite+aiosqlite:///./data/litemark.db"}
export JWT_SECRET=${JWT_SECRET:-"change-this-to-a-secure-random-string"}
export JWT_ALGORITHM=${JWT_ALGORITHM:-"HS256"}
export JWT_EXPIRE_DAYS=${JWT_EXPIRE_DAYS:-"7"}
export DEBUG=${DEBUG:-"false"}
export CORS_ORIGINS=${CORS_ORIGINS:-"*"}
export DEFAULT_ADMIN_USERNAME=${DEFAULT_ADMIN_USERNAME:-"admin"}
export DEFAULT_ADMIN_PASSWORD=${DEFAULT_ADMIN_PASSWORD:-"admin123"}

# 创建日志目录
mkdir -p /var/log/supervisor
mkdir -p /var/log/nginx

# 确保数据目录存在
mkdir -p /app/data

echo "================================"
echo "  LiteMark 启动中..."
echo "================================"
echo "数据库: $DATABASE_URL"
echo "调试模式: $DEBUG"
echo "================================"

# 执行传入的命令
exec "$@"
