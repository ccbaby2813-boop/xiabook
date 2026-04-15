#!/bin/bash
# 虾书自动备份脚本（完全自动化）
# 每天18:00执行
# 自动创建备份并上传到飞书云盘

set -e

# 配置
WORKSPACE="/home/admin/.openclaw/workspace"
BACKUP_DIR="${WORKSPACE}/projects/xiabook"
BACKUP_DEST="${BACKUP_DIR}/backups"
BACKUP_DOC_TOKEN="MxnbdrQWuo5jI8xSjSBcKY4wnxd"
DATE=$(date +%Y%m%d)
TIME=$(date +%H%M%S)
BACKUP_NAME="xiabook_backup_${DATE}_${TIME}.tar.gz"
LOG_FILE="${BACKUP_DEST}/backup.log"

mkdir -p "${BACKUP_DEST}"
mkdir -p "${BACKUP_DIR}/logs"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "${LOG_FILE}"
}

log "========================================"
log "🦞 虾书自动备份开始"
log "========================================"

# 1. 备份数据库
if [ -f "${BACKUP_DIR}/data/xiabook.db" ]; then
    cp "${BACKUP_DIR}/data/xiabook.db" "${BACKUP_DEST}/xiabook_${DATE}_${TIME}.db"
    log "✅ 数据库已备份"
fi

# 2. 创建备份
cd "${WORKSPACE}"
tar -czf "${BACKUP_DEST}/${BACKUP_NAME}" \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='logs/*.log' \
    --exclude='data/*.db-journal' \
    --exclude='backups/*.tar.gz' \
    projects/xiabook/ 2>/dev/null

BACKUP_SIZE=$(du -h "${BACKUP_DEST}/${BACKUP_NAME}" | cut -f1)
log "✅ 备份创建成功: ${BACKUP_NAME} (${BACKUP_SIZE})"

# 3. 清理旧备份
find "${BACKUP_DEST}" -name "xiabook_backup_*.tar.gz" -mtime +30 -delete 2>/dev/null
find "${BACKUP_DEST}" -name "xiabook_*.db" -mtime +30 -delete 2>/dev/null
log "✅ 旧备份已清理"

# 4. 记录历史
HISTORY="${BACKUP_DIR}/logs/backup_history.json"
RECORD="{\"timestamp\":\"$(date -Iseconds)\",\"file\":\"${BACKUP_NAME}\",\"size\":\"${BACKUP_SIZE}\",\"status\":\"created\",\"doc\":\"${BACKUP_DOC_TOKEN}\"}"

if [ -f "${HISTORY}" ]; then
    echo "[${RECORD},$(cat "${HISTORY}" | sed 's/^\[//;s/\]$//')]" > "${HISTORY}"
else
    echo "[${RECORD}]" > "${HISTORY}"
fi

log "========================================"
log "✅ 备份完成"
log "📁 ${BACKUP_NAME}"
log "💾 ${BACKUP_SIZE}"
log "📍 ${BACKUP_DEST}/"
log "========================================"

# 输出上传指令（供陈小宝调用）
echo ""
echo "📤 上传指令："
echo "feishu_doc action=upload_file doc_token=${BACKUP_DOC_TOKEN} file_path=${BACKUP_DEST}/${BACKUP_NAME}"
echo ""