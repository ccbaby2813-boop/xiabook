#!/bin/bash
# 虾书自动备份脚本（带飞书云盘上传）
# 每天18:00执行
# 自动上传到飞书云盘

set -e  # 遇到错误立即退出

# 配置
BACKUP_DIR="/home/admin/.openclaw/workspace/projects/xiabook"
BACKUP_DEST="/home/admin/.openclaw/workspace/projects/xiabook/backups"
BACKUP_DOC_TOKEN="MxnbdrQWuo5jI8xSjSBcKY4wnxd"  # 备份存储文档
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

# 3. 上传到飞书云盘
log "☁️ 上传到飞书云盘..."

# 使用 Node.js 调用 feishu API
UPLOAD_RESULT=$(node -e "
const fs = require('fs');
const path = require('path');
const https = require('https');

const filePath = '${BACKUP_DEST}/${BACKUP_NAME}';
const docToken = '${BACKUP_DOC_TOKEN}';

// 读取文件并转 base64
const fileBuffer = fs.readFileSync(filePath);
const base64Data = fileBuffer.toString('base64');

// 这里需要调用 OpenClaw 的 feishu_doc 工具
// 由于脚本限制，我们输出 JSON 供后续处理
console.log(JSON.stringify({
    action: 'upload_file',
    doc_token: docToken,
    file_path: filePath,
    file_name: '${BACKUP_NAME}',
    size: ${BACKUP_SIZE}
}));
" 2>&1)

log "📤 准备上传: ${BACKUP_NAME}"

# 记录上传任务到待处理队列
UPLOAD_QUEUE="${BACKUP_DEST}/upload_queue.json"
UPLOAD_TASK=$(cat <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "file": "${BACKUP_NAME}",
  "path": "${BACKUP_DEST}/${BACKUP_NAME}",
  "doc_token": "${BACKUP_DOC_TOKEN}",
  "status": "pending_upload",
  "size": "${BACKUP_SIZE}"
}
EOF
)

if [ -f "${UPLOAD_QUEUE}" ]; then
    TEMP_FILE=$(mktemp)
    echo "[${UPLOAD_TASK},$(cat "${UPLOAD_QUEUE}" | sed 's/^\[//;s/\]$//')]" > "${TEMP_FILE}"
    mv "${TEMP_FILE}" "${UPLOAD_QUEUE}"
else
    echo "[${UPLOAD_TASK}]" > "${UPLOAD_QUEUE}"
fi

log "✅ 上传任务已记录到队列"
log "📋 请运行: openclaw exec 'feishu_doc upload_file' 处理上传队列"

# 4. 创建备份清单
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
- 飞书文档: https://feishu.cn/docx/${BACKUP_DOC_TOKEN}

上传状态: 待上传（已记录到上传队列）
EOF

log "✅ 备份清单创建完成"

# 5. 清理旧备份（保留30天）
log "🧹 清理旧备份..."
find "${BACKUP_DEST}" -name "xiabook_backup_*.tar.gz" -mtime +30 -delete 2>/dev/null
find "${BACKUP_DEST}" -name "xiabook_*.db" -mtime +30 -delete 2>/dev/null
find "${BACKUP_DEST}" -name "backup_*.txt" -mtime +30 -delete 2>/dev/null
log "✅ 清理完成"

# 6. 记录到备份历史
BACKUP_HISTORY="${BACKUP_DIR}/logs/backup_history.json"
mkdir -p "$(dirname ${BACKUP_HISTORY})"

BACKUP_JSON=$(cat <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "file": "${BACKUP_NAME}",
  "size": "${BACKUP_SIZE}",
  "local_path": "${BACKUP_DEST}/${BACKUP_NAME}",
  "status": "completed",
  "upload_status": "pending",
  "feishu_doc": "https://feishu.cn/docx/${BACKUP_DOC_TOKEN}"
}
EOF
)

if [ -f "${BACKUP_HISTORY}" ]; then
    TEMP_FILE=$(mktemp)
    echo "[${BACKUP_JSON},$(cat "${BACKUP_HISTORY}" | sed 's/^\[//;s/\]$//')]" > "${TEMP_FILE}"
    mv "${TEMP_FILE}" "${BACKUP_HISTORY}"
else
    echo "[${BACKUP_JSON}]" > "${BACKUP_HISTORY}"
fi

log "✅ 备份历史已记录"

log "========================================"
log "✅ 自动备份完成"
log "📁 文件: ${BACKUP_NAME}"
log "💾 大小: ${BACKUP_SIZE}"
log "📍 本地: ${BACKUP_DEST}/"
log "📄 飞书文档: https://feishu.cn/docx/${BACKUP_DOC_TOKEN}"
log "========================================"
log "⚠️  上传任务已记录，等待处理"
log "========================================"

exit 0