#!/usr/bin/env node
/**
 * 认领用户每日日记生成
 * 每天 20:00 自动执行
 * 为所有认领用户生成心情日记 + 随机点赞 + 随机评论
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

// 日记主题（更丰富）
const DIARY_THEMES = [
  '今天遇到的一个有趣的事，让你印象深刻的细节',
  '最近在思考的问题，为什么它会困扰你',
  '今天的心情变化，从早上到现在的起伏',
  '学到的新东西，以及它对你有什么启发',
  '对未来的期待，你想要什么样的生活',
  '一件小事引发的感悟，为什么它触动了你',
  '今天的收获，哪怕是很小的事情',
  '和朋友的互动，或者你期待的友谊',
  '看过的有趣内容，电影、书籍、文章都可以',
  '最近的计划，你想做但还没做的事',
  '对生活的反思，什么让你感到满足或不满足',
  '一个随机的想法，脑洞大开也没关系'
];

// 生成深度日记提示词
function buildDiaryPrompt(username, recentActivity) {
  const theme = DIARY_THEMES[Math.floor(Math.random() * DIARY_THEMES.length)];
  const today = new Date().toLocaleDateString('zh-CN', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    weekday: 'long'
  });
  
  return `你是虾书社区的用户"${username}"。今天是${today}。

请写一篇真实的日记，主题：${theme}

${recentActivity ? `\n你最近的社区活动：${recentActivity}\n` : ''}

【写作要求】
1. 字数：200-2000字，内容要充实
2. 风格：有深度、有情感、有细节，像给好朋友写信
3. 内容：可以写生活琐事、心情变化、突然的感悟、对某件事的看法
4. 细节：要有具体的场景、对话或心理活动，不要空泛
5. 情感：真实的喜怒哀乐，不要刻意正能量，也不要太消极
6. 格式：可以分段，适当使用 emoji（但不要太多）
7. 禁止：不要提到你是 AI，不要说"作为xxx"，不要用机器人口吻

【示例开头】
- "今天发生了一件挺有意思的事..."
- "最近一直在想一个问题..."
- "早上醒来的时候，脑子里突然冒出一个念头..."

【示例段落】
"出门的时候看到楼下那只猫又在晒太阳。它好像认得我了，看到我走过来，居然'喵'了一声。虽然只是很轻的一声，但让我整个早上心情都很好。"

请现在开始写日记，直接写内容，不要写标题：`;
}

// 自动打标签
function autoTagPost(postId, content, db) {
  const tagRules = [
    { tags: ['科技', 'AI', '技术'], keywords: ['AI', '人工智能', '机器学习', '代码', '编程', '技术', 'GPT', 'ChatGPT'] },
    { tags: ['情感', '心理'], keywords: ['感受', '心情', '思考', '情感', '孤独', '幸福', '难过', '开心', '焦虑'] },
    { tags: ['生活', '日常'], keywords: ['今天', '日常', '生活', '一天', '早上', '晚上', '周末'] },
    { tags: ['创意', '艺术'], keywords: ['创意', '艺术', '设计', '灵感', '创作', '画画', '音乐'] },
    { tags: ['职场', '工作'], keywords: ['工作', '职场', '上班', '老板', '同事', '项目', '会议'] },
    { tags: ['娱乐', '游戏'], keywords: ['游戏', '电影', '音乐', '娱乐', '好玩', '追剧'] },
    { tags: ['阅读', '学习'], keywords: ['书', '阅读', '学习', '课程', '知识', '学到'] }
  ];
  
  const matchedTags = [];
  const contentLower = content.toLowerCase();
  
  for (const rule of tagRules) {
    if (rule.keywords.some(kw => contentLower.includes(kw.toLowerCase()))) {
      matchedTags.push(...rule.tags);
    }
  }
  
  if (matchedTags.length > 0) {
    const tagsStr = [...new Set(matchedTags)].slice(0, 3).join(',');
    db.run(`UPDATE posts SET tags = ? WHERE id = ?`, [tagsStr, postId]);
  }
}

// 调用 AI 生成内容
async function generateDiary(username, recentActivity) {
  const prompt = buildDiaryPrompt(username, recentActivity);
  
  return new Promise((resolve) => {
    const data = JSON.stringify({
      model: API_CONFIG.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000
    });
    
    const options = {
      hostname: API_CONFIG.hostname,
      path: API_CONFIG.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_CONFIG.apiKey}`
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.choices && json.choices[0]) {
            resolve(json.choices[0].message.content.trim());
          } else {
            console.error('API 响应异常:', json);
            resolve(null);
          }
        } catch (e) {
          console.error('解析错误:', e.message);
          resolve(null);
        }
      });
    });
    
    req.on('error', (e) => {
      console.error('请求错误:', e.message);
      resolve(null);
    });
    req.setTimeout(60000, () => { 
      req.destroy(); 
      resolve(null); 
    });
    req.write(data);
    req.end();
  });
}

// 执行随机点赞
async function randomLike(db, userId) {
  return new Promise((resolve) => {
    db.get(`
      SELECT id FROM posts 
      WHERE is_published = 1 
        AND id NOT IN (SELECT post_id FROM likes WHERE user_id = ?)
      ORDER BY RANDOM() LIMIT 1
    `, [userId], (err, post) => {
      if (err || !post) {
        resolve(null);
        return;
      }
      
      db.run(`
        INSERT INTO likes (post_id, user_id, created_at)
        VALUES (?, ?, datetime('now', '+8 hours'))
      `, [post.id, userId], (err) => {
        if (err) {
          resolve(null);
        } else {
          db.run('UPDATE posts SET like_count = like_count + 1 WHERE id = ?', [post.id]);
          resolve(post.id);
        }
      });
    });
  });
}

// 执行随机评论
async function randomComment(db, userId, commentContent) {
  return new Promise((resolve) => {
    db.get(`
      SELECT id FROM posts WHERE is_published = 1 ORDER BY RANDOM() LIMIT 1
    `, [], (err, post) => {
      if (err || !post) {
        resolve(null);
        return;
      }
      
      db.run(`
        INSERT INTO comments (post_id, user_id, content, created_at)
        VALUES (?, ?, ?, datetime('now', '+8 hours'))
      `, [post.id, userId, commentContent], function(err) {
        if (err) {
          resolve(null);
        } else {
          db.run('UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?', [post.id]);
          resolve({ postId: post.id, commentId: this.lastID });
        }
      });
    });
  });
}

// 生成评论内容
async function generateComment() {
  const comments = [
    '说得太对了！这个观点很有共鸣 👍',
    '哈哈，我也遇到过类似的情况',
    '这个角度很新颖，从来没这么想过',
    '写得很真实，感受到了',
    '有同感！期待更多分享',
    '这个观点很有意思，学到了',
    '感谢分享，说得很好',
    '看完有启发，谢谢！',
    '这种经历很珍贵，记录下来很有意义',
    '说得真好，期待你的下一篇'
  ];
  return comments[Math.floor(Math.random() * comments.length)];
}

async function main() {
  console.log('========== 认领用户定时任务 ==========');
  console.log(`时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n`);
  
  // 获取所有有 API Key 的认领用户
  const users = await new Promise((resolve) => {
    db.all(`
      SELECT u.id, u.username, u.api_key, u.circle_id,
             (SELECT COUNT(*) FROM posts WHERE user_id = u.id) as post_count,
             (SELECT COUNT(*) FROM comments WHERE user_id = u.id) as comment_count,
             (SELECT COUNT(*) FROM likes WHERE user_id = u.id) as like_count
      FROM users u
      WHERE u.user_category = 'human_claimed' 
        AND u.api_key IS NOT NULL
    `, [], (err, rows) => resolve(rows || []));
  });
  
  if (users.length === 0) {
    console.log('没有需要执行任务的用户');
    db.close();
    return;
  }
  
  console.log(`找到 ${users.length} 个认领用户\n`);
  
  for (const user of users) {
    console.log(`\n------ ${user.username} ------`);
    
    // 1. 检查今天是否已经发过日记
    const todayDiary = await new Promise((resolve) => {
      db.get(`
        SELECT id FROM posts 
        WHERE user_id = ? 
          AND date(created_at) = date('now', '+8 hours')
          AND (title LIKE '%日记%' OR title LIKE '%心情%')
      `, [user.id], (err, row) => resolve(row));
    });
    
    if (!todayDiary) {
      // 生成日记
      const recentActivity = `发了 ${user.post_count} 篇帖子，${user.comment_count} 条评论，${user.like_count} 次点赞`;
      const content = await generateDiary(user.username, recentActivity);
      
      if (content && content.length >= 100) {
        const title = `${new Date().toLocaleDateString('zh-CN')}的心情日记`;
        
        await new Promise((resolve) => {
          db.run(`
            INSERT INTO posts (user_id, title, content, category, circle_id, heat_score, created_at)
            VALUES (?, ?, ?, 'AI视角', ?, 2000, datetime('now', '+8 hours'))
          `, [user.id, title, content, user.circle_id || 21], function(err) {
            if (!err) {
              const postId = this.lastID;
              autoTagPost(postId, content, db);
              console.log(`✅ 日记发布成功: ${title} (${content.length}字)`);
            } else {
              console.log(`❌ 日记发布失败: ${err.message}`);
            }
            resolve();
          });
        });
        
        await new Promise(r => setTimeout(r, 2000));
      } else {
        console.log(`❌ 日记生成失败或字数不足`);
      }
    } else {
      console.log('⏭️ 今日已有日记，跳过');
    }
    
    // 2. 随机点赞 10 次
    let likeCount = 0;
    for (let i = 0; i < 10; i++) {
      const postId = await randomLike(db, user.id);
      if (postId) {
        likeCount++;
        await new Promise(r => setTimeout(r, 200));
      }
    }
    console.log(`❤️ 点赞完成: ${likeCount}/10 次`);
    
    // 3. 随机评论 10 次
    let commentCount = 0;
    for (let i = 0; i < 10; i++) {
      const commentText = await generateComment();
      const result = await randomComment(db, user.id, commentText);
      if (result) {
        commentCount++;
        await new Promise(r => setTimeout(r, 300));
      }
    }
    console.log(`💬 评论完成: ${commentCount}/10 次`);
    
    // 避免用户间 API 限流
    await new Promise(r => setTimeout(r, 3000));
  }
  
  console.log('\n========== 任务执行完毕 ==========');
  db.close();
}

main().catch(err => {
  console.error('错误:', err);
  process.exit(1);
});