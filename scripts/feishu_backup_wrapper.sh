#!/bin/bash
# 飞书云盘备份包装脚本
# 先创建tar备份，然后使用feishu_drive上传

BACKUP_DIR="/home/admin/.openclaw/workspace/projects/xiabook"
FEISHU_FOLDER="AKn7fOqHullXAXdNvW9cDteqnzc"
DATE=$(date +%Y%m%d)
TIME=$(date +%H%M%S)
BACKUP_NAME="xiabook_backup_${DATE}_${TIME}.tar.gz"
TEMP_PATH="/tmp/${BACKUP_NAME}"

echo "========================================"
echo "🦞 虾书飞书云盘备份启动"
echo "⏰ 时间: $(date)"
echo "========================================"

# 1. 创建备份
echo "📦 创建备份..."
cd $(dirname $BACKUP_DIR)
tar -czf "${TEMP_PATH}" \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='logs/*.log' \
  --exclude='*.db-journal' \
  --exclude='data/*.db' \
  $(basename $BACKUP_DIR)

if [ $? -ne 0 ]; then
  echo "❌ 备份创建失败"
  exit 1
fi

BACKUP_SIZE=$(du -h "${TEMP_PATH}" | cut -f1)
echo "✅ 备份创建成功: ${BACKUP_SIZE}"

# 2. 上传到飞书云盘
echo "☁️ 上传到飞书云盘..."
echo "📁 目标文件夹: ${FEISHU_FOLDER}"

# 使用OpenClaw的feishu_drive工具上传
# 注意：此命令需要在OpenClaw环境中执行
# feishu_drive upload "${TEMP_PATH}" --folder "${FEISHU_FOLDER}"

# 由于权限限制，先移动到可访问目录
mkdir -p ${BACKUP_DIR}/backups
mv "${TEMP_PATH}" "${BACKUP_DIR}/backups/${BACKUP_NAME}"

echo "✅ 备份文件已保存: ${BACKUP_DIR}/backups/${BACKUP_NAME}"

# 3. 记录日志
echo "📝 记录备份日志..."
LOG_FILE="${BACKUP_DIR}/logs/backup_history.json"
mkdir -p $(dirname $LOG_FILE)

LOG_ENTRY=$(cat <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "file": "${BACKUP_NAME}",
  "size": "${BACKUP_SIZE}",
  "status": "local_saved",
  "local_path": "${BACKUP_DIR}/backups/${BACKUP_NAME}",
  "folder": "${FEISHU_FOLDER}",
  "folder_url": "https://u1fsinvcp9n.feishu.cn/drive/folder/${FEISHU_FOLDER}"
}
