#!/bin/bash
# 虾书自动备份脚本
# 每天18:00执行
# 备份内容包括：代码、文档、配置、数据库

set -e  # 遇到错误立即退出

# 配置
BACKUP_DIR="/home/admin/.openclaw/workspace/projects/xiabook"
BACKUP_DEST="/home/admin/.openclaw/workspace/projects/xiabook/backups"
FEISHU_FOLDER="Hby5fmPdeltAS0d2YKbcqovLnqe"  # 自动备份文件夹token
DATE=$(date +%Y%m%d)
TIME=$(date +%H%M%S)
BACKUP_NAME="xiabook_backup_${DATE}_${TIME}.tar.gz"
LOG_FILE="${BACKUP_DEST}/backup.log"

# 确保备份目录存在
mkdir -p "${BACKUP_DEST}"
mkdir -p "${BACKUP_DIR}/logs"

# 日志函数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "${LOG_FILE}"
}

log "========================================"
log "🦞 虾书自动备份开始"
log "========================================"

# 1. 备份数据库
cd "${BACKUP_DIR}"
if [ -f "data/xiabook.db" ]; then
    log "📦 备份数据库..."
    cp "data/xiabook.db" "${BACKUP_DEST}/xiabook_${DATE}_${TIME}.db"
    log "✅ 数据库备份完成"
fi

# 2. 创建完整备份
cd /home/admin/.openclaw/workspace
log "📦 创建项目备份..."

tar -czf "${BACKUP_DEST}/${BACKUP_NAME}" \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='logs/*.log' \
    --exclude='data/*.db-journal' \
    --exclude='backups/*.tar.gz' \
    --exclude='*.log' \
    projects/xiabook/ 2>/dev/null

if [ $? -eq 0 ]; then
    BACKUP_SIZE=$(du -h "${BACKUP_DEST}/${BACKUP_NAME}" | cut -f1)
    log "✅ 备份创建成功: ${BACKUP_NAME} (${BACKUP_SIZE})"
else
    log "❌ 备份创建失败"
    exit 1
fi

# 3. 创建备份清单
log "📝 创建备份清单..."
cat > "${BACKUP_DEST}/backup_${DATE}_${TIME}.txt" << EOF
虾书备份清单
==============
备份时间: $(date)
备份文件: ${BACKUP_NAME}
文件大小: ${BACKUP_SIZE}
包含内容:
- 源代码 (src/)
- 前端文件 (public/)
- 文档 (docs/)
- 配置文件 (config/)
- 脚本 (scripts/)
- 数据库备份

备份位置:
- 本地: ${BACKUP_DEST}/${BACKUP_NAME}
- 飞书: https://u1fsinvcp9n.feishu.cn/drive/folder/${FEISHU_FOLDER}

注意: 请手动上传备份文件到飞书云盘
EOF

log "✅ 备份清单创建完成"

# 4. 清理旧备份（保留30天）
log "🧹 清理旧备份..."
find "${BACKUP_DEST}" -name "xiabook_backup_*.tar.gz" -mtime +30 -delete 2>/dev/null
find "${BACKUP_DEST}" -name "xiabook_*.db" -mtime +30 -delete 2>/dev/null
find "${BACKUP_DEST}" -name "backup_*.txt" -mtime +30 -delete 2>/dev/null
log "✅ 清理完成"

# 5. 发送通知
log "📧 发送备份通知..."

# 记录到备份历史
BACKUP_HISTORY="${BACKUP_DIR}/logs/backup_history.json"
mkdir -p "$(dirname ${BACKUP_HISTORY})"

BACKUP_JSON=$(cat <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "file": "${BACKUP_NAME}",
  "size": "${BACKUP_SIZE}",
  "local_path": "${BACKUP_DEST}/${BACKUP_NAME}",
  "status": "completed",
  "feishu_folder": "${FEISHU_FOLDER}",
  "feishu_url": "https://u1fsinvcp9n.feishu.cn/drive/folder/${FEISHU_FOLDER}"
}
EOF
)

if [ -f "${BACKUP_HISTORY}" ]; then
    # 追加到现有文件
    TEMP_FILE=$(mktemp)
    echo "[${BACKUP_JSON},$(cat "${BACKUP_HISTORY}" | sed 's/^\[//;s/\]$//')]" > "${TEMP_FILE}"
    mv "${TEMP_FILE}" "${BACKUP_HISTORY}"
else
    # 创建新文件
    echo "[${BACKUP_JSON}]" > "${BACKUP_HISTORY}"
fi

log "✅ 备份历史已记录"

log "========================================"
log "✅ 自动备份完成"
log "📁 文件: ${BACKUP_NAME}"
log "💾 大小: ${BACKUP_SIZE}"
log "📍 位置: ${BACKUP_DEST}/"
log "🔗 飞书: https://u1fsinvcp9n.feishu.cn/drive/folder/${FEISHU_FOLDER}"
log "========================================"
log "⚠️  请手动上传备份文件到飞书云盘"
log "   文件路径: ${BACKUP_DEST}/${BACKUP_NAME}"
log "========================================"

exit 0
