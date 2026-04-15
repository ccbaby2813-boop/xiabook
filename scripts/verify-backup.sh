#!/bin/bash
# 虾书备份验证脚本
# 执行时间：每周日 06:00
# 功能：验证备份可恢复性

set -e

PROJECT_DIR="/home/admin/.openclaw/workspace/projects/xiabook"
BACKUP_DIR="/home/admin/.openclaw/backup/xiabook"
VERIFY_DIR="/tmp/xiabook_verify_$$"
LOG_FILE="/home/admin/.openclaw/logs/backup-verify.log"
DB_FILE="$PROJECT_DIR/data/xiabook.db"

echo "[$(date)] 开始备份验证..." >> $LOG_FILE

# 创建临时验证目录
mkdir -p $VERIFY_DIR

# 获取最新备份
LATEST_BACKUP=$(ls -t $BACKUP_DIR/daily/*.gz 2>/dev/null | head -1)

if [ -z "$LATEST_BACKUP" ]; then
    echo "[$(date)] 错误：未找到备份文件!" >> $LOG_FILE
    exit 1
fi

echo "[$(date)] 验证备份：$(basename $LATEST_BACKUP)" >> $LOG_FILE

# 验证 MD5
MD5_FILE="${LATEST_BACKUP}.md5"
if [ -f "$MD5_FILE" ]; then
    EXPECTED_MD5=$(cat $MD5_FILE | cut -d' ' -f1)
    ACTUAL_MD5=$(md5sum $LATEST_BACKUP | cut -d' ' -f1)
    if [ "$EXPECTED_MD5" != "$ACTUAL_MD5" ]; then
        echo "[$(date)] 错误：MD5 校验失败!" >> $LOG_FILE
        echo "  期望：$EXPECTED_MD5" >> $LOG_FILE
        echo "  实际：$ACTUAL_MD5" >> $LOG_FILE
        rm -rf $VERIFY_DIR
        exit 1
    fi
    echo "[$(date)] MD5 校验通过 ✅" >> $LOG_FILE
fi

# 解压备份
gunzip -c $LATEST_BACKUP > $VERIFY_DIR/xiabook.db

# 验证数据库完整性
INTEGRITY=$(sqlite3 $VERIFY_DIR/xiabook.db "PRAGMA integrity_check;")
if [ "$INTEGRITY" != "ok" ]; then
    echo "[$(date)] 错误：数据库完整性检查失败!" >> $LOG_FILE
    echo "  结果：$INTEGRITY" >> $LOG_FILE
    rm -rf $VERIFY_DIR
    exit 1
fi
echo "[$(date)] 数据库完整性检查通过 ✅" >> $LOG_FILE

# 验证关键表存在
TABLES=("users" "posts" "comments" "likes" "circles" "realms")
for TABLE in "${TABLES[@]}"; do
    COUNT=$(sqlite3 $VERIFY_DIR/xiabook.db "SELECT COUNT(*) FROM $TABLE;")
    if [ $? -ne 0 ]; then
        echo "[$(date)] 错误：表 $TABLE 不存在!" >> $LOG_FILE
        rm -rf $VERIFY_DIR
        exit 1
    fi
    echo "[$(date)] 表 $TABLE: $COUNT 条记录" >> $LOG_FILE
done

# 验证外键约束
FK_CHECK=$(sqlite3 $VERIFY_DIR/xiabook.db "PRAGMA foreign_key_check;")
if [ -n "$FK_CHECK" ]; then
    echo "[$(date)] 警告：发现外键约束问题" >> $LOG_FILE
    echo "  $FK_CHECK" >> $LOG_FILE
else
    echo "[$(date)] 外键约束检查通过 ✅" >> $LOG_FILE
fi

# 清理临时文件
rm -rf $VERIFY_DIR

echo "[$(date)] 备份验证完成 ✅" >> $LOG_FILE
echo "备份验证完成：$(basename $LATEST_BACKUP)"
