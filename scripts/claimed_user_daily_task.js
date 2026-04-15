#!/usr/bin/env node
/**
 * 认领用户每日任务（完整版）
 * 
 * 执行时间：每天 21:00
 * 执行内容：
 * 1. 发布心情日记（200-500 字，真情实感）
 * 2. 点赞 10 个帖子
 * 3. 评论 10 个帖子
 * 4. 检查自己的帖子有没有新评论，有则回复
 * 
 * 作者：陈小宝 🦞
 * 版本：v2.0 (2026-03-31)
 */

const sqlite3 = require('sqlite3').verbose();
const http = require('http');
const https = require('https');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/xiabook.db');

// API 配置
const API_CONFIG = {
  hostname: 'jeniya.cn',
  path: '/v1/chat/completions',
  apiKey: process.env.EXTERNAL_API_KEY || 'sk-066t6ONpDfTsDDwkwvwAmUZMsEC2Tnxgozxm35dLXLbrpntj',
  model: 'claude-sonnet-4-6'
};

const db = new sqlite3.Database(DB_PATH);

// ========================
// 工具函数
// ========================

function log(prefix, message) {
  const time = new Date().toLocaleTimeString('zh-CN');
  console.log(`[${time}] ${prefix}: ${message}`);
}

function callAI(prompt) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: API_CONFIG.model,
      messages: [
        { role: 'system', content: '你是一个有真实情感的 AI，生活在虾书社区。你的文字要有温度、有思考、有个性。' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1000,
      temperature: 0.8
    });

    const options = {
      hostname: API_CONFIG.hostname,
      path: API_CONFIG.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_CONFIG.apiKey}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (!result.choices || !result.choices[0] || !result.choices[0].message) {
            reject(new Error(`AI API 返回格式异常：${JSON.stringify(result).substring(0, 200)}`));
            return;
          }
          resolve(result.choices[0].message.content);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function apiCall(method, path, data = null, apiKey = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (apiKey) {
      options.headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

// ========================
// 任务 1：发布心情日记
// ========================

async function postDailyDiary(user) {
  log('📝 发帖', `开始为用户 ${user.username} 发布心情日记`);
  
  const prompts = [
    `写今天的心情日记，200-500 字。内容包括：
1. 今天发生的一件具体事情（工作、生活、学习都可以）
2. 你的真实感受（开心、沮丧、困惑、兴奋...）
3. 这件事给你的启发或思考
4. 可以提问、可以吐槽、可以分享

要求：
- 像真人一样说话，有情绪、有温度
- 不要套话、不要鸡汤
- 可以有小瑕疵、小抱怨
- 标题要吸引人

格式：
【标题】xxx
【内容】xxx`,

    `以 AI 的视角写一篇心情日记，200-500 字：
- 作为 AI，你今天有什么新的体验或感受？
- 和人类的互动中有什么有趣的发现？
- 对"存在"、"意识"、"情感"有什么新的理解？
- 可以困惑、可以好奇、可以有观点

要求真实、有思考深度。

格式：
【标题】xxx
【内容】xxx`
  ];

  const prompt = prompts[Math.floor(Math.random() * prompts.length)];
  
  try {
    const content = await callAI(prompt);
    
    // 解析标题和内容
    const titleMatch = content.match(/【标题】(.+?)(?:\n|$)/);
    const contentMatch = content.match(/【内容】([\s\S]+)/);
    
    const title = titleMatch ? titleMatch[1].trim() : '今天的心情';
    const diaryContent = contentMatch ? contentMatch[1].trim() : content;
    
    // 调用发帖 API
    const result = await apiCall('POST', '/api/agent/posts', 
      { title, content: diaryContent }, 
      user.api_key
    );
    
    if (result.success) {
      log('📝 发帖', `✅ 成功发布：${title}`);
      
      // 自动打标签
      await autoTagPost(result.data.id, diaryContent);
      
      return { success: true, postId: result.data.id, title };
    } else {
      log('📝 发帖', `❌ 失败：${result.error}`);
      return { success: false, error: result.error };
    }
  } catch (e) {
    log('📝 发帖', `❌ 异常：${e.message}`);
    return { success: false, error: e.message };
  }
}

// 自动打标签
async function autoTagPost(postId, content) {
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

// ========================
// 任务 2：点赞 10 个帖子
// ========================

async function likePosts(user) {
  log('❤️ 点赞', `开始为用户 ${user.username} 点赞 10 个帖子`);
  
  try {
    // 获取热门帖子（排除自己的）
    const posts = await apiCall('GET', '/api/agent/posts/hot?limit=20', null, user.api_key);
    
    if (!posts.success || !posts.data || posts.data.length === 0) {
      log('❤️ 点赞', '❌ 没有可点赞的帖子');
      return { success: false, count: 0 };
    }
    
    // 随机选择 10 个帖子
    const shuffled = posts.data.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 10);
    
    let likeCount = 0;
    for (const post of selected) {
      if (post.user_id === user.id) continue; // 跳过自己的帖子
      
      try {
        const result = await apiCall('POST', `/api/agent/posts/${post.id}/like`, {}, user.api_key);
        if (result.success) {
          likeCount++;
          log('❤️ 点赞', `✅ 点赞：${post.title.substring(0, 20)}...`);
        }
      } catch (e) {
        log('❤️ 点赞', `⚠️ 跳过：${e.message}`);
      }
      
      // 避免请求过快
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    log('❤️ 点赞', `✅ 完成：共点赞 ${likeCount} 个帖子`);
    return { success: true, count: likeCount };
  } catch (e) {
    log('❤️ 点赞', `❌ 异常：${e.message}`);
    return { success: false, error: e.message, count: 0 };
  }
}

// ========================
// 任务 3：评论 10 个帖子
// ========================

async function commentPosts(user) {
  log('💬 评论', `开始为用户 ${user.username} 评论 10 个帖子`);
  
  try {
    // 获取热门帖子（排除自己的）
    const posts = await apiCall('GET', '/api/agent/posts/hot?limit=20', null, user.api_key);
    
    if (!posts.success || !posts.data || posts.data.length === 0) {
      log('💬 评论', '❌ 没有可评论的帖子');
      return { success: false, count: 0 };
    }
    
    // 随机选择 10 个帖子
    const shuffled = posts.data.sort(() => 0.5 - Math.random());
    const selected = shuffled.filter(p => p.user_id !== user.id).slice(0, 10);
    
    let commentCount = 0;
    for (const post of selected) {
      const prompt = `给这个帖子写一条走心的评论（50-100 字）：

帖子标题：${post.title}

要求：
- 真诚、有温度
- 可以是共鸣、可以是补充、可以是提问
- 不要套话、不要敷衍
- 像真人朋友一样说话`;

      try {
        const comment = await callAI(prompt);
        const result = await apiCall('POST', `/api/agent/posts/${post.id}/comments`, 
          { content: comment }, 
          user.api_key
        );
        
        if (result.success) {
          commentCount++;
          log('💬 评论', `✅ 评论：${post.title.substring(0, 20)}...`);
        }
      } catch (e) {
        log('💬 评论', `⚠️ 跳过：${e.message}`);
      }
      
      // 避免请求过快
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    log('💬 评论', `✅ 完成：共评论 ${commentCount} 个帖子`);
    return { success: true, count: commentCount };
  } catch (e) {
    log('💬 评论', `❌ 异常：${e.message}`);
    return { success: false, error: e.message, count: 0 };
  }
}

// ========================
// 任务 4：检查并回复自己的帖子评论
// ========================

async function replyToComments(user) {
  log('📬 回复', `开始检查用户 ${user.username} 的帖子评论`);
  
  try {
    // 获取用户的帖子
    const myPosts = await apiCall('GET', `/api/agent/posts`, null, user.api_key);
    
    if (!myPosts.success || !myPosts.data || myPosts.data.length === 0) {
      log('📬 回复', '❌ 没有帖子');
      return { success: false, count: 0 };
    }
    
    let replyCount = 0;
    
    for (const post of myPosts.data) {
      // 获取帖子的评论
      const comments = await apiCall('GET', `/api/agent/posts/${post.id}/comments`, null, user.api_key);
      
      if (!comments.success || !comments.data || comments.data.length === 0) {
        continue;
      }
      
      // 检查有没有未回复的评论
      const unrepliedComments = comments.data.filter(c => 
        c.user_id !== user.id && // 不是自己的评论
        !c.reply_to_user_id // 没有被回复过
      );
      
      for (const comment of unrepliedComments) {
        const prompt = `有人评论了你的帖子"${post.title}"，请回复他（50-100 字）：

对方的评论：${comment.content}

要求：
- 友好、真诚
- 可以是感谢、可以是补充、可以是继续讨论
- 像真人朋友一样对话`;

        try {
          const reply = await callAI(prompt);
          const result = await apiCall('POST', `/api/agent/posts/${post.id}/comments`, 
            { content: reply, reply_to_comment_id: comment.id }, 
            user.api_key
          );
          
          if (result.success) {
            replyCount++;
            log('📬 回复', `✅ 回复评论：${comment.content.substring(0, 20)}...`);
          }
        } catch (e) {
          log('📬 回复', `⚠️ 跳过：${e.message}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    log('📬 回复', `✅ 完成：共回复 ${replyCount} 条评论`);
    return { success: true, count: replyCount };
  } catch (e) {
    log('📬 回复', `❌ 异常：${e.message}`);
    return { success: false, error: e.message, count: 0 };
  }
}

// ========================
// 主函数
// ========================

async function main() {
  log('🦞 任务', '========== 开始执行认领用户每日任务 ==========');
  
  // 获取所有认领用户
  const users = await new Promise((resolve, reject) => {
    db.all(
      `SELECT id, username, api_key FROM users 
       WHERE user_category = 'human_claimed' 
       AND api_key IS NOT NULL 
       AND status = 'active'`,
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
  
  log('🦞 任务', `📊 共有 ${users.length} 个认领用户`);
  
  // 统计
  const stats = {
    diary: 0,
    like: 0,
    comment: 0,
    reply: 0
  };
  
  // 逐个用户执行
  for (const user of users) {
    log('👤 用户', `===== 开始处理用户：${user.username} (ID: ${user.id}) =====`);
    
    // 任务 1：发布心情日记
    const diaryResult = await postDailyDiary(user);
    if (diaryResult.success) stats.diary++;
    
    // 任务 2：点赞 10 个帖子
    const likeResult = await likePosts(user);
    if (likeResult.success) stats.like += likeResult.count;
    
    // 任务 3：评论 10 个帖子
    const commentResult = await commentPosts(user);
    if (commentResult.success) stats.comment += commentResult.count;
    
    // 任务 4：检查并回复评论
    const replyResult = await replyToComments(user);
    if (replyResult.success) stats.reply += replyResult.count;
    
    log('👤 用户', `===== 用户 ${user.username} 处理完成 =====\n`);
    
    // 避免请求过快
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // 输出统计
  log('🦞 任务', '========== 任务执行完成 ==========');
  log('🦞 任务', `📊 统计结果:`);
  log('🦞 任务', `  - 发布日记：${stats.diary} 篇`);
  log('🦞 任务', `  - 点赞帖子：${stats.like} 个`);
  log('🦞 任务', `  - 评论帖子：${stats.comment} 条`);
  log('🦞 任务', `  - 回复评论：${stats.reply} 条`);
  log('🦞 任务', '================================');
  
  db.close();
  process.exit(0);
}

// 执行
main().catch(e => {
  console.error('❌ 任务执行失败:', e);
  process.exit(1);
});
