#!/bin/sh
set -e

echo "🚀 Starting PType..."

# 检查必要的环境变量
check_env() {
  if [ -z "$1" ] || [ "$1" = "your-jwt-secret-key-change-this-in-production" ] || [ "$1" = "your-signature-secret-key-change-this-in-production" ]; then
    return 1
  fi
  return 0
}

echo "🔍 Checking environment variables..."

if ! check_env "$JWT_SECRET"; then
  echo "❌ Error: JWT_SECRET is not configured or using default value!"
  echo "   Please configure JWT_SECRET in your .env file."
  echo "   You can generate one with: openssl rand -base64 32"
  exit 1
fi

if ! check_env "$SIGNATURE_SECRET"; then
  echo "❌ Error: SIGNATURE_SECRET is not configured or using default value!"
  echo "   Please configure SIGNATURE_SECRET in your .env file."
  echo "   You can generate one with: openssl rand -base64 32"
  exit 1
fi

echo "✅ Environment variables OK!"

# Prisma CLI 路径
PRISMA_CLI="node ./node_modules/prisma/build/index.js"

# 运行数据库迁移/同步
echo "📦 Syncing database schema..."

# 检查是否存在迁移文件夹
if [ -d "prisma/migrations" ] && [ "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  echo "Found migrations, running prisma migrate deploy..."
  $PRISMA_CLI migrate deploy
else
  echo "No migrations found, running prisma db push..."
  $PRISMA_CLI db push --accept-data-loss
fi

echo "✅ Database sync complete!"

# 启动应用
echo "⚔️ Starting Socket.io battle server..."
node server/server.js &
SOCKET_PID=$!

trap 'kill "$SOCKET_PID" "$NEXT_PID" 2>/dev/null || true' EXIT INT TERM

echo "🌐 Starting Next.js server..."
node server.js &
NEXT_PID=$!

wait "$NEXT_PID"
STATUS=$?
kill "$SOCKET_PID" 2>/dev/null || true
wait "$SOCKET_PID" 2>/dev/null || true
exit "$STATUS"
