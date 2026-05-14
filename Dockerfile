# 基础镜像
FROM node:20-alpine AS base

# 安装 OpenSSL（Prisma 需要）
RUN apk add --no-cache openssl

# 仅安装生产依赖
FROM base AS deps
# 查看 https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine 了解为什么需要 libc6-compat
RUN apk add --no-cache libc6-compat
WORKDIR /app

# 设置 npm 国内镜像源
RUN npm config set registry https://registry.npmmirror.com

# 根据首选包管理器安装依赖
COPY package.json package-lock.json* ./
RUN \
  if [ -f package-lock.json ]; then npm ci; \
  else echo "Lockfile not found." && exit 1; \
  fi

# 仅在需要时重新构建源代码
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 在构建期间禁用遥测
ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_BASE_PATH=/
ENV NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}

# 设置 Prisma 引擎镜像（加速国内下载）
ENV PRISMA_ENGINES_MIRROR="https://registry.npmmirror.com/-/binary/prisma"

# 生成 Prisma 客户端
RUN npx prisma generate

# 构建应用程序
RUN npm run build

# 生产环境镜像，复制所有文件并运行 Next.js
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 复制 public 文件夹
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/server ./server

# 设置预渲染缓存的正确权限
RUN mkdir .next
RUN chown nextjs:nodejs .next

# 自动利用输出追踪来减少镜像大小
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 复制 Prisma 相关文件（用于数据库迁移）
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@socket.io ./node_modules/@socket.io
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/accepts ./node_modules/accepts
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/base64id ./node_modules/base64id
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/cookie ./node_modules/cookie
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/cors ./node_modules/cors
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/debug ./node_modules/debug
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/engine.io ./node_modules/engine.io
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/engine.io-client ./node_modules/engine.io-client
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/engine.io-parser ./node_modules/engine.io-parser
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/mime-db ./node_modules/mime-db
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/mime-types ./node_modules/mime-types
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/ms ./node_modules/ms
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/negotiator ./node_modules/negotiator
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/object-assign ./node_modules/object-assign
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/socket.io ./node_modules/socket.io
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/socket.io-adapter ./node_modules/socket.io-adapter
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/socket.io-parser ./node_modules/socket.io-parser
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/vary ./node_modules/vary
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/ws ./node_modules/ws
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/xmlhttprequest-ssl ./node_modules/xmlhttprequest-ssl

# 复制入口脚本
COPY --from=builder --chown=nextjs:nodejs /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs

# 允许 PORT / SOCKET_PORT 通过 build args 或环境变量传入
ARG PORT=3000
ARG SOCKET_PORT=4000
EXPOSE ${PORT}
EXPOSE ${SOCKET_PORT}

ENV HOSTNAME="0.0.0.0"

# 使用入口脚本启动（会先运行数据库迁移）
CMD ["./docker-entrypoint.sh"]
