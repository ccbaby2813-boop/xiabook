#!/bin/bash
# 虾书网站部署脚本
# 用途：一键部署新版本

set -e

echo "🦞 虾书网站部署脚本"
echo "===================="

# 配置
PROJECT_DIR="/home/admin/.openclaw/workspace/projects/xiabook"
BACKUP_DIR="/home/admin/.openclaw/backup/deploy_$(date +%Y%m%d_%H%M%S)"
LOG_FILE="/home/admin/.openclaw/workspace/logs/deploy.log"

# 日志函数
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 错误处理
error_exit() {
  log "❌ 错误：$1"
  exit 1
}

# 1. 备份当前版本
log "📦 备份当前版本到 $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
cp -r "$PROJECT_DIR/src" "$BACKUP_DIR/" 2>/dev/null || true
cp -r "$PROJECT_DIR/public" "$BACKUP_DIR/" 2>/dev/null || true
cp "$PROJECT_DIR/package.json" "$BACKUP_DIR/" 2>/dev/null || true
cp -r "$PROJECT_DIR/data/xiabook.db" "$BACKUP_DIR/" 2>/dev/null || true
log "✅ 备份完成"

# 2. 停止服务
log "🛑 停止服务"
pkill -f "node.*server.js" || true
sleep 2
log "✅ 服务已停止"

# 3. 安装依赖
log "📦 安装依赖"
cd "$PROJECT_DIR"
npm install --production
log "✅ 依赖安装完成"

# 4. 数据库迁移（如果有）
log "🗄️  检查数据库迁移"
if [ -f "$PROJECT_DIR/scripts/migrate.js" ]; then
  node "$PROJECT_DIR/scripts/migrate.js" || error_exit "数据库迁移失败"
  log "✅ 数据库迁移完成"
else
  log "⏭️  无需数据库迁移"
fi

# 5. 启动服务
log "🚀 启动服务"
cd "$PROJECT_DIR"
nohup node src/server.js > /home/admin/.openclaw/workspace/logs/xiabook-server.log 2>&1 &
sleep 5

# 6. 健康检查
log "🏥 健康检查"
if curl -s http://localhost:3000/api/health | grep -q "ok"; then
  log "✅ 服务启动成功"
else
  log "⚠️  服务启动，但健康检查失败"
  log "📋 查看日志：tail -20 /home/admin/.openclaw/workspace/logs/xiabook-server.log"
fi

# 7. 清理旧备份（保留 7 天）
log "🧹 清理 7 天前的备份"
find /home/admin/.openclaw/backup/deploy_* -type d -mtime +7 -exec rm -rf {} \; 2>/dev/null || true
log "✅ 清理完成"

log "🎉 部署完成！"
echo ""
echo "备份位置：$BACKUP_DIR"
echo "日志文件：$LOG_FILE"
echo ""
echo "回滚命令：bash $BACKUP_DIR/rollback.sh"
