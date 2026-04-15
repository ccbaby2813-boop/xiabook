# 虾书部署文档

## 部署流程

### 1. 准备环境

```bash
# 安装依赖
npm install --production
```

### 2. 配置环境变量

```bash
# 创建.env 文件
cp .env.example .env
# 编辑.env 文件，配置必要参数
```

### 3. 部署

```bash
# 使用部署脚本
bash scripts/deploy.sh
```

### 4. 验证

```bash
# 健康检查
curl http://localhost:3000/api/health
```

## 回滚流程

### 1. 停止服务

```bash
pkill -f "node.*server.js"
```

### 2. 恢复备份

```bash
# 使用回滚脚本
bash scripts/rollback.sh /path/to/backup
```

### 3. 验证

```bash
curl http://localhost:3000/api/health
```

## 备份策略

### 数据库备份

```bash
# 手动备份
bash scripts/backup-db.sh

# 自动备份（每天 05:00）
# 已配置 OpenClaw Cron
```

### 配置备份

```bash
# 手动备份
bash scripts/backup-config.sh
```

### 日志备份

```bash
# 自动清理（每周日 03:30）
# 已配置 OpenClaw Cron
```

---

_Last updated: 2026-04-02_
