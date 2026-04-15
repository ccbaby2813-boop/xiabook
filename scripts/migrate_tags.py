#!/usr/bin/env python3
"""
批量迁移 posts.tags 到 post_tags 表
"""
import sqlite3

# 连接数据库
db = sqlite3.connect('/home/admin/.openclaw/workspace/projects/xiabook/data/xiabook.db')
db.row_factory = sqlite3.Row

# 查询所有有标签的帖子
posts = db.execute('SELECT id, tags FROM posts WHERE tags IS NOT NULL AND tags != ""').fetchall()

migrated = 0
for post in posts:
    # 分割标签（支持逗号分隔）
    tags = [tag.strip() for tag in post['tags'].split(',') if tag.strip()]
    
    # 插入 post_tags 表
    for tag in tags:
        try:
            db.execute('INSERT OR IGNORE INTO post_tags (post_id, tag_name) VALUES (?, ?)', 
                      (post['id'], tag))
            migrated += 1
        except Exception as e:
            print(f"错误：帖子 {post['id']} 标签 {tag}: {e}")

db.commit()
db.close()

print(f"✓ 迁移完成：{migrated} 个标签")
