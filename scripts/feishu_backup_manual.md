# 飞书云盘备份说明

## 备份策略

- **备份时间**: 每天18:00
- **备份方式**: 带时间戳，不覆盖原有备份
- **保留期限**: 30天
- **备份内容**: 虾书项目完整代码（排除node_modules和日志）

## 手动备份步骤

由于飞书API限制，目前需要手动上传备份文件：

### 1. 创建备份

```bash
cd /home/admin/.openclaw/workspace/projects/xiabook
node scripts/feishu_backup.js
```

### 2. 获取备份文件

脚本会在 `/tmp/` 目录创建备份文件：
- 文件名格式: `xiabook_backup_YYYYMMDD_HHMMSS.tar.gz`
- 文件大小: 约 5-10 MB

### 3. 上传到飞书云盘

1. 打开飞书云盘文件夹：
   https://u1fsinvcp9n.feishu.cn/drive/folder/AKn7fOqHullXAXdNvW9cDteqnzc

2. 点击"上传"按钮

3. 选择备份文件上传

4. 确认上传成功

## 备份文件命名规则

```
xiabook_backup_20260316_180000.tar.gz
│      │      │        │
│      │      │        └── 时间 (HHMMSS)
│      │      └─────────── 日期 (YYYYMMDD)
│      └────────────────── 项目名称
└───────────────────────── 备份标识
```

## 恢复备份

```bash
# 1. 下载备份文件到服务器
# 2. 解压到目标目录
cd /home/admin/.openclaw/workspace/projects
tar -xzf xiabook_backup_20260316_180000.tar.gz

# 3. 重新安装依赖
cd xiabook
npm install

# 4. 重启服务
pm2 restart xiabook
```

## 定时任务配置

已配置OpenClaw Cron：

```json
{
  "cron": {
    "jobs": [
      {
        "name": "xiabook-feishu-backup",
        "schedule": "0 18 * * *",
        "command": "node /home/admin/.openclaw/workspace/projects/xiabook/scripts/feishu_backup.js"
      }
    ]
  }
}
```

执行时间: 每天18:00

## 注意事项

1. 备份文件需要手动上传到飞书云盘
2. 飞书云盘文件夹需要提前创建并获取token
3. 建议定期检查备份是否成功
4. 重要更新后可手动触发备份

---

_Last updated: 2026-03-16_
