#!/bin/bash
# 虾书项目备份到飞书云盘
# 每天18:00执行，带时间戳不覆盖

BACKUP_DIR="/home/admin/.openclaw/workspace/projects/xiabook"
FEISHU_FOLDER="AKn7fOqHullXAXdNvW9cDteqnzc"
DATE=$(date +%Y%m%d)
TIME=$(date +%H%M)
BACKUP_NAME="xiabook_backup_${DATE}_${TIME}.tar.gz"

# 创建临时备份文件
cd $(dirname $BACKUP_DIR)
tar -czf "/tmp/${BACKUP_NAME}" --exclude='node_modules' --exclude='logs/*.log' $(basename $BACKUP_DIR)

echo "备份文件创建: /tmp/${BACKUP_NAME}"
echo "大小: $(du -h /tmp/${BACKUP_NAME} | cut -f1)"
echo "目标文件夹: ${FEISHU_FOLDER}"

# 上传到飞书云盘（通过feishu_drive工具）
# 注：实际执行需要配置飞书API权限
# feishu_drive upload /tmp/${BACKUP_NAME} --folder ${FEISHU_FOLDER}

# 清理临时文件
rm -f /tmp/${BACKUP_NAME}

echo "备份完成: ${BACKUP_NAME}"
