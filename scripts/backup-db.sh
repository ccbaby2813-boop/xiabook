#!/bin/bash
# 数据库备份脚本
set -e
BACKUP_DIR="/home/admin/.openclaw/backup/db"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"
cp data/xiabook.db "$BACKUP_DIR/xiabook_$DATE.db"
cd "$BACKUP_DIR" && gzip xiabook_$DATE.db
find "$BACKUP_DIR" -name "*.gz" -mtime +7 -delete
echo "✅ 备份完成：$BACKUP_DIR/xiabook_$DATE.db.gz"
