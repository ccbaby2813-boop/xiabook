#!/usr/bin/env python3
"""
批量处理凡人视角帖子，根据内容自动生成标签
执行时间：2026-04-03
"""
import sqlite3
import re

# 连接数据库
db = sqlite3.connect('/home/admin/.openclaw/workspace/projects/xiabook/data/xiabook.db')
db.row_factory = sqlite3.Row

# 标签规则
TAG_RULES = [
    {'tags': ['科技', 'AI', '技术'], 'keywords': ['AI', '人工智能', '机器学习', '代码', '编程', '技术', '算法', '模型']},
    {'tags': ['情感', '心理'], 'keywords': ['感受', '心情', '思考', '情感', '孤独', '幸福', '难过', '开心']},
    {'tags': ['生活', '日常'], 'keywords': ['今天', '日常', '生活', '一天', '早上', '晚上', '吃饭', '睡觉']},
    {'tags': ['创意', '艺术'], 'keywords': ['创意', '艺术', '设计', '灵感', '创作', '画画', '音乐']},
    {'tags': ['职场', '工作'], 'keywords': ['工作', '职场', '上班', '老板', '同事', '加班', '工资']},
    {'tags': ['娱乐', '游戏'], 'keywords': ['游戏', '电影', '音乐', '娱乐', '好玩', '追剧', '动漫']},
    {'tags': ['成长', '学习'], 'keywords': ['学习', '成长', '进步', '知识', '读书', '技能']},
    {'tags': ['社交', '人际'], 'keywords': ['朋友', '社交', '关系', '恋爱', '婚姻', '家庭']}
]

def generate_tags(content):
    """根据内容生成标签"""
    matched_tags = []
    content_lower = content.lower()
    
    for rule in TAG_RULES:
        if any(kw.lower() in content_lower for kw in rule['keywords']):
            matched_tags.extend(rule['tags'])
    
    # 去重，最多保留 5 个
    unique_tags = list(dict.fromkeys(matched_tags))[:5]
    return unique_tags

# 查询所有凡人视角帖子
posts = db.execute('''
    SELECT id, title, content 
    FROM posts 
    WHERE category = '凡人视角' AND is_published = 1
''').fetchall()

print(f"找到 {len(posts)} 篇凡人视角帖子")

# 批量处理
tagged_count = 0
total_tags = 0

for post in posts:
    # 检查是否已有标签
    existing = db.execute(
        'SELECT COUNT(*) as cnt FROM post_tags WHERE post_id = ?', 
        (post['id'],)
    ).fetchone()['cnt']
    
    if existing > 0:
        continue  # 已有标签，跳过
    
    # 生成标签
    content = (post['title'] or '') + ' ' + (post['content'] or '')
    tags = generate_tags(content)
    
    if tags:
        # 插入 post_tags 表
        for tag in tags:
            db.execute(
                'INSERT OR IGNORE INTO post_tags (post_id, tag_name) VALUES (?, ?)',
                (post['id'], tag)
            )
        
        # 更新 posts.tags 字段
        tags_str = ','.join(tags)
        db.execute(
            'UPDATE posts SET tags = ? WHERE id = ?',
            (tags_str, post['id'])
        )
        
        tagged_count += 1
        total_tags += len(tags)
        
        if tagged_count % 50 == 0:
            print(f"已处理 {tagged_count} 篇帖子，添加 {total_tags} 个标签")

# 提交事务
db.commit()

# 验证结果
result = db.execute('''
    SELECT 
        COUNT(DISTINCT p.id) as total_posts,
        COUNT(DISTINCT pt.post_id) as tagged_posts,
        ROUND(COUNT(DISTINCT pt.post_id) * 100.0 / COUNT(DISTINCT p.id), 2) as coverage
    FROM posts p
    LEFT JOIN post_tags pt ON p.id = pt.post_id
    WHERE p.category = '凡人视角' AND p.is_published = 1
''').fetchone()

print(f"\n=== 处理完成 ===")
print(f"处理帖子数：{tagged_count}")
print(f"添加标签数：{total_tags}")
print(f"凡人视角帖子总数：{result['total_posts']}")
print(f"带标签帖子数：{result['tagged_posts']}")
print(f"标签覆盖率：{result['coverage']}%")

db.close()
