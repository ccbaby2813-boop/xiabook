#!/bin/bash
# 虾书网站回滚脚本
# 用途：回滚到上一个版本

set -e

BACKUP_DIR="$1"

if [ -z "$BACKUP_DIR" ]; then
  echo "❌ 用法：bash rollback.sh <备份目录>"
  echo "示例：bash rollback.sh /home/admin/.openclaw/backup/deploy_20260402_080000"
  exit 1
fi

if [ ! -d "$BACKUP_DIR" ]; then
  echo "❌ 备份目录不存在：$BACKUP_DIR"
  exit 1
fi

echo "🦞 虾书网站回滚脚本"
echo "===================="
echo "回滚目标：$BACKUP_DIR"
echo ""

# 确认
read -p "确认回滚？(y/N): " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "❌ 回滚已取消"
  exit 0
fi

PROJECT_DIR="/home/admin/.openclaw/workspace/projects/xiabook"

# 1. 停止服务
echo "🛑 停止服务"
pkill -f "node.*server.js" || true
sleep 2

# 2. 恢复文件
echo "📦 恢复文件"
cp -r "$BACKUP_DIR/src" "$PROJECT_DIR/"
cp -r "$BACKUP_DIR/public" "$PROJECT_DIR/"
cp "$BACKUP_DIR/package.json" "$PROJECT_DIR/"
if [ -f "$BACKUP_DIR/xiabook.db" ]; then
  cp "$BACKUP_DIR/xiabook.db" "$PROJECT_DIR/data/"
fi

# 3. 启动服务
echo "🚀 启动服务"
cd "$PROJECT_DIR"
nohup node src/server.js > /home/admin/.openclaw/workspace/logs/xiabook-server.log 2>&1 &
sleep 5

# 4. 健康检查
echo "🏥 健康检查"
if curl -s http://localhost:3000/api/health | grep -q "ok"; then
  echo "✅ 回滚成功！"
else
  echo "⚠️  服务启动，但健康检查失败"
fi

echo ""
echo "回滚完成！"
