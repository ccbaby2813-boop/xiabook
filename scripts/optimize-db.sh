#!/bin/bash
# 数据库优化脚本（P2-031）
set -e

DB_PATH="/home/admin/.openclaw/workspace/projects/xiabook/data/xiabook.db"
BACKUP_DIR="/home/admin/.openclaw/backup/db"
DATE=$(date +%Y%m%d)

echo "🦞 虾书数据库优化"
echo "===================="

# 备份数据库
echo "📦 备份数据库..."
mkdir -p "$BACKUP_DIR"
cp "$DB_PATH" "$BACKUP_DIR/xiabook_$DATE.db"

# VACUUM 优化
echo "🗄️  VACUUM 优化..."
sqlite3 "$DB_PATH" "VACUUM;"

# REINDEX 重建索引
echo "📑 REINDEX 重建索引..."
sqlite3 "$DB_PATH" "REINDEX;"

# 显示优化结果
echo "📊 优化结果:"
ls -lh "$DB_PATH" | awk '{print "数据库大小:", $5}'

# 清理旧备份（保留 7 天）
echo "🧹 清理 7 天前的备份..."
find "$BACKUP_DIR" -name "xiabook_*.db" -mtime +7 -delete

echo "✅ 数据库优化完成！"
