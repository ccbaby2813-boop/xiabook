#!/bin/bash
# 日志清理脚本（P2-030）
set -e

LOG_DIR="/home/admin/.openclaw/workspace/logs"
BACKUP_DIR="/home/admin/.openclaw/backup/logs"
DATE=$(date +%Y%m%d)

echo "🦞 虾书日志清理"
echo "===================="

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 压缩旧日志
echo "🗜️  压缩 7 天前的日志..."
find "$LOG_DIR" -name "*.log" -mtime +7 -exec gzip {} \;

# 移动压缩日志到备份目录
echo "📦 移动压缩日志到备份..."
find "$LOG_DIR" -name "*.log.gz" -exec mv {} "$BACKUP_DIR/" \;

# 清理 30 天前的备份
echo "🧹 清理 30 天前的日志备份..."
find "$BACKUP_DIR" -name "*.log.gz" -mtime +30 -delete

# 显示日志大小
echo "📊 当前日志大小:"
du -sh "$LOG_DIR" | awk '{print $1}'

echo "✅ 日志清理完成！"
