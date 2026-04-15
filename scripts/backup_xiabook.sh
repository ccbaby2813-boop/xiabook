#!/bin/bash
# 虾书数据库备份脚本
# 执行时间: 每天 23:30

set -e

DATE=$(date +%Y%m%d)
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PROJECT_DIR="/home/admin/.openclaw/workspace/projects/xiabook"
BACKUP_DIR="/home/admin/.openclaw/backup/xiabook"
DB_FILE="$PROJECT_DIR/data/xiabook.db"
LOG_FILE="/home/admin/.openclaw/logs/backup.log"

# 创建目录
mkdir -p $BACKUP_DIR/{daily,weekly,monthly}
mkdir -p $(dirname $LOG_FILE)

echo "[$(date)] 开始备份..." >> $LOG_FILE

# 检查数据库完整性
sqlite3 $DB_FILE "PRAGMA integrity_check;" > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "[$(date)] 错误: 数据库完整性检查失败!" >> $LOG_FILE
    exit 1
fi

# 执行备份
BACKUP_FILE="$BACKUP_DIR/daily/xiabook_$TIMESTAMP.db"
cp $DB_FILE $BACKUP_FILE

# 压缩
gzip $BACKUP_FILE
BACKUP_FILE="${BACKUP_FILE}.gz"

# 计算MD5
MD5=$(md5sum $BACKUP_FILE | cut -d' ' -f1)
echo "$MD5  $(basename $BACKUP_FILE)" > "${BACKUP_FILE}.md5"

# 记录备份清单
echo "{\"file\":\"$(basename $BACKUP_FILE)\",\"size\":$(stat -c%s $BACKUP_FILE),\"md5\":\"$MD5\",\"time\":\"$(date -Iseconds)\"}" >> $BACKUP_DIR/backup_manifest.jsonl

# 清理旧备份（保留30天）
find $BACKUP_DIR/daily -name "*.gz" -mtime +30 -delete
find $BACKUP_DIR/daily -name "*.md5" -mtime +30 -delete

echo "[$(date)] 备份完成: $(basename $BACKUP_FILE) ($(stat -c%s $BACKUP_FILE) bytes)" >> $LOG_FILE

# 周备份（周日）
if [ $(date +%u) -eq 7 ]; then
    WEEK=$(date +%Y_W%V)
    cp $BACKUP_FILE "$BACKUP_DIR/weekly/xiabook_${WEEK}.db.gz"
    echo "[$(date)] 周备份: xiabook_${WEEK}.db.gz" >> $LOG_FILE
fi

# 月备份（每月1日）
if [ $(date +%d) -eq 01 ]; then
    MONTH=$(date +%Y%m)
    cp $BACKUP_FILE "$BACKUP_DIR/monthly/xiabook_${MONTH}.db.gz"
    echo "[$(date)] 月备份: xiabook_${MONTH}.db.gz" >> $LOG_FILE
fi

echo "备份完成: $BACKUP_FILE"