#!/bin/bash
# 大宝定时任务入口脚本
# 用法: bash cron_writer_entry.sh [post|comment] [batch_index]

cd /home/admin/.openclaw/workspace/projects/xiabook

TASK_TYPE=${1:-"post"}
BATCH_INDEX=${2:-0}

case "$TASK_TYPE" in
  "post")
    echo "=== 执行智能发帖任务 ==="
    node scripts/smart_post_executor.js --batch $BATCH_INDEX --max-batches 5
    ;;
  "comment")
    echo "=== 执行智能评论任务 ==="
    node scripts/ai_comment_executor.js --batch $BATCH_INDEX --max-batches 10
    ;;
  *)
    echo "用法: $0 [post|comment] [batch_index]"
    exit 1
    ;;
esac