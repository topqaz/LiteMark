# ===========================================
# LiteMark 统一部署镜像
# 前端 + 后端 + Nginx 代理
# ===========================================

# =====================
# 阶段1: 构建前端
# =====================
FROM node:20-alpine AS frontend-builder

# 安装构建依赖（Python 和编译工具）
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 复制前端依赖文件
COPY package.json package-lock.json* yarn.lock* ./

# 安装依赖
RUN if [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then npm ci; \
    else npm install; fi

# 复制前端源码
COPY index.html tsconfig.json tsconfig.node.json vite.config.ts ./
COPY src ./src
COPY public ./public

# 构建前端
RUN npm run build

# =====================
# 阶段2: 最终镜像
# =====================
FROM python:3.11-slim

# 安装 nginx 和 supervisor
RUN apt-get update && apt-get install -y \
    nginx \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /app

# 复制后端依赖并安装
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# 复制后端代码
COPY backend/app ./app

# 从前端构建阶段复制静态文件
COPY --from=frontend-builder /app/dist /var/www/html

# 复制 nginx 配置
COPY docker/nginx.conf /etc/nginx/nginx.conf

# 复制 supervisor 配置
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# 复制启动脚本
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# 创建数据目录
RUN mkdir -p /app/data

# 暴露端口
EXPOSE 80

# 设置环境变量
ENV DATABASE_URL=sqlite+aiosqlite:///./data/litemark.db
ENV DEBUG=false

# 启动
ENTRYPOINT ["/entrypoint.sh"]
CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
