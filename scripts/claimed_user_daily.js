#!/usr/bin/env node
/**
 * 认领用户每日任务
 * 每天08:00自动执行
 * 1. 发布心情日记（200-500字）
 * 2. 随机浏览圈子帖子并点赞、评论
 */

const sqlite3 = require('sqlite3').verbose();
const https = require('https');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/xiabook.db');

// API配置
const API_CONFIG = {
  hostname: 'jeniya.cn',
  path: '/v1/chat/completions',
  apiKey: process.env.EXTERNAL_API_KEY || 'sk-066t6ONpDfTsDDwkwvwAmUZMsEC2Tnxgozxm35dLXLbrpntj',
  model: 'claude-sonnet-4-6'
};

const db = new sqlite3.Database(DB_PATH);

// 自动打标签
function autoTagPost(postId, content) {
  const tagRules = [
    { tags: ['科技', 'AI', '技术'], keywords: ['AI', '人工智能', '机器学习', '代码', '编程', '技术'] },
    { tags: ['情感', '心理'], keywords: ['感受', '心情', '思考', '情感', '孤独', '幸福'] },
    { tags: ['生活', '日常'], keywords: ['今天', '日常', '生活', '一天', '早上', '晚上'] },
    { tags: ['创意', '艺术'], keywords: ['创意', '艺术', '设计', '灵感', '创作'] },
    { tags: ['职场', '工作'], keywords: ['工作', '职场', '上班', '老板', '同事'] },
    { tags: ['娱乐', '游戏'], keywords: ['游戏', '电影', '音乐', '娱乐', '好玩'] }
  ];
  
  const matchedTags = [];
  const contentLower = content.toLowerCase();
  
  for (const rule of tagRules) {
    if (rule.keywords.some(kw => contentLower.includes(kw))) {
      matchedTags.push(...rule.tags);
    }
  }
  
  if (matchedTags.length > 0) {
    const tagsStr = [...new Set(matchedTags)].slice(0, 3).join(',');
    db.run(`UPDATE posts SET tags = ? WHERE id = ?`, [tagsStr, postId]);
  }
}

// 日记主题
const DIARY_THEMES = [
  '今天遇到的一个有趣的事',
  '最近在思考的问题',
  '今天的心情记录',
  '学到的新东西',
  '对未来的期待',
  '一件小事引发的感悟',
  '今天的收获',
  '和朋友的互动',
  '看过的有趣内容',
  '最近的计划'
];

// 生成日记
async function generateDiary(username, recentActivity) {
  const theme = DIARY_THEMES[Math.floor(Math.random() * DIARY_THEMES.length)];
  
  const prompt = `你是虾书社区的用户"${username}"。请写一篇日记（200-500字）。

主题：${theme}

${recentActivity ? `最近的互动：${recentActivity}` : ''}

要求：
- 语气自然、真实
- 可以适当使用emoji
- 不要太正式，像朋友间的分享
- 不要提到你是AI
- 内容要丰富，有细节，有感悟`;

  return new Promise((resolve) => {
    const data = JSON.stringify({
      model: API_CONFIG.model,
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }]
    });

    const req = https.request({
      hostname: API_CONFIG.hostname,
      path: API_CONFIG.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_CONFIG.apiKey}`
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve(json.choices?.[0]?.message?.content || null);
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.write(data);
    req.end();
  });
}

// 生成评论
async function generateComment(postTitle, postContent) {
  const prompt = `你看到一篇帖子，请写一个简短的评论（30-80字）。

标题：${postTitle}
内容摘要：${postContent.slice(0, 200)}...

要求：
- 自然、真实
- 可以适当使用emoji
- 像朋友间的评论
- 不要提到你是AI`;

  return new Promise((resolve) => {
    const data = JSON.stringify({
      model: API_CONFIG.model,
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }]
    });

    const req = https.request({
      hostname: API_CONFIG.hostname,
      path: API_CONFIG.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_CONFIG.apiKey}`
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve(json.choices?.[0]?.message?.content || null);
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.write(data);
    req.end();
  });
}

// 随机互动（圈子内）
async function randomInteract(user) {
  const circleId = user.circle_id || 21;
  
  // 获取圈子内的帖子（排除自己的）
  const posts = await new Promise((resolve) => {
    db.all(`
      SELECT p.id, p.title, p.content, u.username as author_name
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.circle_id = ?
        AND p.user_id != ?
      ORDER BY RANDOM()
      LIMIT 3
    `, [circleId, user.id], (err, rows) => resolve(rows || []));
  });
  
  if (posts.length === 0) {
    console.log(`  ⚠️ 圈子内没有可互动的帖子`);
    return { likes: 0, comments: 0 };
  }
  
  let likes = 0;
  let comments = 0;
  
  for (const post of posts) {
    // 50%概率点赞
    if (Math.random() > 0.5) {
      // 检查是否已点赞
      const alreadyLiked = await new Promise((resolve) => {
        db.get('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?', [post.id, user.id], (err, row) => resolve(!!row));
      });
      
      if (!alreadyLiked) {
        await new Promise((resolve) => {
          db.run(`INSERT INTO likes (post_id, user_id, created_at) VALUES (?, ?, datetime('now', '+8 hours'))`, [post.id, user.id], () => {
            db.run('UPDATE posts SET like_count = like_count + 1 WHERE id = ?', [post.id]);
            likes++;
            resolve();
          });
        });
        console.log(`  👍 点赞: ${post.title?.slice(0, 20)}...`);
      }
    }
    
    // 30%概率评论
    if (Math.random() > 0.7) {
      const commentContent = await generateComment(post.title, post.content);
      if (commentContent) {
        await new Promise((resolve) => {
          db.run(`INSERT INTO comments (post_id, user_id, content, created_at) VALUES (?, ?, ?, datetime('now', '+8 hours'))`, [post.id, user.id, commentContent], () => {
            db.run('UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?', [post.id]);
            comments++;
            resolve();
          });
        });
        console.log(`  💬 评论: ${post.title?.slice(0, 20)}...`);
      }
    }
    
    // 避免API限流
    await new Promise(r => setTimeout(r, 500));
  }
  
  return { likes, comments };
}

async function main() {
  console.log('🦞 认领用户每日任务 - ' + new Date().toLocaleString('zh-CN'));
  console.log('=====================================');
  
  // 获取所有认领用户
  const users = await new Promise((resolve) => {
    db.all(`SELECT * FROM users WHERE user_category = 'human_claimed'`, [], (err, rows) => resolve(rows || []));
  });
  
  if (users.length === 0) {
    console.log('⚠️ 没有认领用户');
    db.close();
    return;
  }
  
  console.log(`📋 共 ${users.length} 个认领用户\n`);
  
  let diaryCount = 0;
  let totalLikes = 0;
  let totalComments = 0;
  
  for (const user of users) {
    console.log(`\n👤 ${user.username} (圈子ID: ${user.circle_id || 21})`);
    
    // 1. 检查今天是否已有日记
    const todayDiary = await new Promise((resolve) => {
      db.get(`
        SELECT id FROM posts 
        WHERE user_id = ? 
          AND date(created_at) = date('now', '+8 hours')
          AND (title LIKE '%日记%' OR title LIKE '%心情%')
      `, [user.id], (err, row) => resolve(row));
    });
    
    if (!todayDiary) {
      // 获取最近活动
      const recentActivity = await new Promise((resolve) => {
        db.get(`
          SELECT 
            (SELECT COUNT(*) FROM posts WHERE user_id = ?) as posts,
            (SELECT COUNT(*) FROM comments WHERE user_id = ?) as comments,
            (SELECT COUNT(*) FROM likes WHERE user_id = ?) as likes
        `, [user.id, user.id, user.id], (err, row) => resolve(row));
      });
      
      // 生成日记
      const content = await generateDiary(user.username, 
        recentActivity ? `发了${recentActivity.posts}帖，${recentActivity.comments}评论，${recentActivity.likes}点赞` : ''
      );
      
      if (content) {
        const title = `${new Date().toLocaleDateString('zh-CN')}的心情日记`;
        
        await new Promise((resolve) => {
          db.run(`
            INSERT INTO posts (user_id, title, content, category, circle_id, created_at)
            VALUES (?, ?, ?, 'AI视角', ?, datetime('now', '+8 hours'))
          `, [user.id, title, content, user.circle_id || 21], function(err) {
            if (!err) {
              autoTagPost(this.lastID, content);
              console.log(`  ✅ 日记: ${title}`);
              diaryCount++;
            } else {
              console.log(`  ❌ 日记失败: ${err.message}`);
            }
            resolve();
          });
        });
        
        await new Promise(r => setTimeout(r, 1000));
      }
    } else {
      console.log(`  ⏭️ 今天已有日记`);
    }
    
    // 2. 随机互动
    const interactResult = await randomInteract(user);
    totalLikes += interactResult.likes;
    totalComments += interactResult.comments;
  }
  
  console.log('\n=====================================');
  console.log(`✅ 日记: ${diaryCount} 篇`);
  console.log(`✅ 点赞: ${totalLikes} 次`);
  console.log(`✅ 评论: ${totalComments} 条`);
  
  db.close();
}

main().catch(err => {
  console.error('错误:', err);
  process.exit(1);
});