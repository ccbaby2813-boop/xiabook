#!/bin/bash
# 同步备份到飞书云空间
# 需要配置飞书应用权限: drive:drive

set -e

BACKUP_DIR="/home/admin/.openclaw/backup/xiabook"
LOG_FILE="/home/admin/.openclaw/logs/backup.log"

# 飞书配置（从环境变量或配置文件读取）
FEISHU_APP_ID="${FEISHU_APP_ID:-}"
FEISHU_APP_SECRET="${FEISHU_APP_SECRET:-}"

if [ -z "$FEISHU_APP_ID" ] || [ -z "$FEISHU_APP_SECRET" ]; then
    echo "[$(date)] 跳过飞书同步: 未配置应用凭证" >> $LOG_FILE
    exit 0
fi

# 获取access_token
TOKEN_RESPONSE=$(curl -s -X POST "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal" \
    -H "Content-Type: application/json" \
    -d "{\"app_id\":\"$FEISHU_APP_ID\",\"app_secret\":\"$FEISHU_APP_SECRET\"}")

ACCESS_TOKEN=$(echo $TOKEN_RESPONSE | jq -r '.tenant_access_token // empty')

if [ -z "$ACCESS_TOKEN" ]; then
    echo "[$(date)] 飞书同步失败: 获取token失败" >> $LOG_FILE
    exit 1
fi

# 查找今日备份
TODAY=$(date +%Y%m%d)
LATEST_BACKUP=$(ls -t $BACKUP_DIR/daily/xiabook_${TODAY}*.db.gz 2>/dev/null | head -1)

if [ -z "$LATEST_BACKUP" ]; then
    echo "[$(date)] 飞书同步跳过: 未找到今日备份" >> $LOG_FILE
    exit 0
fi

# 上传到飞书云空间
# 注: 实际使用需要配置正确的folder_token
FOLDER_TOKEN="${FEISHU_BACKUP_FOLDER:-}"

if [ -z "$FOLDER_TOKEN" ]; then
    echo "[$(date)] 飞书同步跳过: 未配置目标文件夹" >> $LOG_FILE
    exit 0
fi

UPLOAD_RESPONSE=$(curl -s -X POST "https://open.feishu.cn/open-apis/drive/v1/files/upload_all" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -F "file_name=$(basename $LATEST_BACKUP)" \
    -F "parent_type=explorer" \
    -F "parent_token=$FOLDER_TOKEN" \
    -F "file=@$LATEST_BACKUP")

if echo "$UPLOAD_RESPONSE" | jq -e '.code == 0' > /dev/null; then
    echo "[$(date)] 飞书同步成功: $(basename $LATEST_BACKUP)" >> $LOG_FILE
else
    echo "[$(date)] 飞书同步失败: $UPLOAD_RESPONSE" >> $LOG_FILE
fi