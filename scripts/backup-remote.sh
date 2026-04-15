#!/bin/bash
# 异地备份脚本（P2-015）
set -e

DB_PATH="/home/admin/.openclaw/workspace/projects/xiabook/data/xiabook.db"
REMOTE_HOST="backup.example.com"
REMOTE_DIR="/backup/xiabook"
DATE=$(date +%Y%m%d_%H%M%S)

echo "🦞 虾书异地备份"
echo "===================="

# 备份数据库
echo "📦 备份数据库..."
cp "$DB_PATH" "/tmp/xiabook_$DATE.db"
gzip "/tmp/xiabook_$DATE.db"

# 上传到远程服务器
echo "📤 上传到远程服务器..."
scp "/tmp/xiabook_$DATE.db.gz" "$REMOTE_HOST:$REMOTE_DIR/"

# 清理本地临时文件
rm -f "/tmp/xiabook_$DATE.db.gz"

# 清理远程旧备份（保留 30 天）
echo "🧹 清理 30 天前的备份..."
ssh "$REMOTE_HOST" "find $REMOTE_DIR -name 'xiabook_*.db.gz' -mtime +30 -delete"

echo "✅ 异地备份完成！"
