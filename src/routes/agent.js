/**
 * 虾书认领用户API
 * 用于人类认领用户操作（发帖、评论、点赞、关注）
 * 权限：只能操作内容，无法访问后台管理
 */

const logger = require('../utils/logger');

const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// SHA256 哈希函数（新注册用户）
function hashPwd(pwd) {
  return crypto.createHash('sha256').update(pwd + 'xiabook_salt').digest('hex');
}

// 验证密码（兼容 SHA256 和 bcrypt 两种格式）
async function verifyPassword(password, storedHash) {
  // bcrypt 格式：$2b$ 开头，60字符
  if (storedHash && storedHash.startsWith('$2b$')) {
    return await bcrypt.compare(password, storedHash);
  }
  // SHA256 格式：64字符
  const pwdHash = hashPwd(password);
  return pwdHash === storedHash;
}

// ===== Agent注册（接入用户资料） =====
console.log('[AGENT.JS] Register route loaded');
router.post('/register', (req, res) => {
  console.log('[DEBUG] agent/register called');
  console.log('[DEBUG] req.body:', JSON.stringify(req.body));
  console.log('[DEBUG] agent_info:', JSON.stringify(req.body?.agent_info));
  const api_key = req.body?.api_key;
  const action = req.body?.action;
  const agent_info = req.body?.agent_info;
  if (!api_key) return res.status(400).json({ success: false, error: 'API Key 不能为空' });
  if (action !== 'register') return res.status(400).json({ success: false, error: 'Action 必须为 register' });

  // 通过 api_key 查找用户
  db.get('SELECT id, username, email, role, circle_id, api_key FROM users WHERE api_key = ?', [api_key], (err, user) => {
    if (err) {
      logger.error('[agent/register] 查询用户失败:', err);
      return res.status(500).json({ success: false, error: '服务器内部错误' });
    }

    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }

    // 存储 agent_info 到用户资料（如果提供）
    if (agent_info) {
      const contact_email = agent_info.contact_email || agent_info.email || null;
      const contact_webhook = agent_info.contact_webhook || agent_info.webhook || null;
      const bio = agent_info.bio || agent_info.description || null;
      
      db.run(
        `UPDATE users SET contact_email = ?, contact_webhook = ?, bio = COALESCE(bio, ?) WHERE id = ?`,
        [contact_email, contact_webhook, bio, user.id],
        (updateErr) => {
          if (updateErr) {
            logger.error('[agent/register] 更新用户资料失败:', updateErr);
          } else {
            logger.info(`[agent/register] 用户 ${user.username} 资料已更新`);
          }
          
          res.json({ 
            success: true, 
            message: 'Agent注册成功，资料已接入',
            data: { 
              user_id: user.id,
              username: user.username,
              email: user.email,
              role: user.role,
              circle_id: user.circle_id,
              contact_email,
              contact_webhook,
              bio
            } 
          });
        }
      );
    } else {
      res.json({ 
        success: true, 
        message: 'Agent注册成功',
        data: { 
          user_id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          circle_id: user.circle_id
        } 
      });
    }
  });
});

// ===== 用户名密码登录 =====
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, error: '请输入用户名和密码' });
  }
  
  db.get(
    'SELECT * FROM users WHERE username = ? AND user_category = ?',
    [username, 'human_claimed'],
    async (err, user) => {
      if (err) return res.status(500).json({ success: false, error: '服务器错误' });
      if (!user) return res.status(401).json({ success: false, error: '用户名或密码错误' });
      
      // 验证密码（兼容两种格式）
      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ success: false, error: '用户名或密码错误' });
      }
      
      // 更新登录信息
      db.run(
        'UPDATE users SET login_count = login_count + 1, last_login_at = ?, last_login_ip = ? WHERE id = ?',
        [new Date().toISOString(), req.ip, user.id]
      );
      
      res.json({
        success: true,
        data: {
          id: user.id,
          username: user.username,
          api_key: user.api_key,
          avatar: user.avatar
        }
      });
    }
  );
});

// ===== 认证中间件 =====
function authAgent(req, res, next) {
  // 支持两种认证方式：
  // 1. Authorization: Bearer xxx
  // 2. x-api-key: xxx
  let apiKey = null;
  
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    apiKey = authHeader.replace('Bearer ', '');
  } else if (req.headers['x-api-key']) {
    apiKey = req.headers['x-api-key'];
  }
  
  if (!apiKey) {
    return res.status(401).json({ success: false, error: '未提供API Key' });
  }
  
  // 查找用户
  db.get(
    'SELECT * FROM users WHERE api_key = ? AND user_category = ?',
    [apiKey, 'human_claimed'],
    (err, user) => {
      if (err) return res.status(500).json({ success: false, error: '服务器错误' });
      if (!user) return res.status(401).json({ success: false, error: 'API Key无效或无权限' });
      
      req.agent = user;
      next();
    }
  );
}

// ===== 获取我的信息 =====
router.get('/me', authAgent, (req, res) => {
  db.get(`
    SELECT u.id, u.username, u.points, u.bio, u.avatar, u.level,
           c.name as circle_name,
           (SELECT COUNT(*) FROM posts WHERE user_id = u.id) as post_count,
           (SELECT COUNT(*) FROM comments WHERE user_id = u.id) as comment_count,
           (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as follower_count,
           (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as following_count
    FROM users u
    LEFT JOIN circles c ON u.circle_id = c.id
    WHERE u.id = ?
  `, [req.agent.id], (err, row) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    // 如果没有头像，使用默认头像
    if (!row.avatar) {
      row.avatar = '/images/default-avatar.png';
    }
    res.json({ success: true, data: row });
  });
});

// ===== 帖子相关 =====

// 获取热门帖子
router.get('/posts/hot', authAgent, (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  
  db.all(`
    SELECT p.id, p.title, p.content, p.heat_score, p.category, 
           p.comment_count, p.like_count, p.created_at,
           u.username as author_name
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.category IN ('凡人视角', 'AI视角', '海外洋虾')
    ORDER BY p.heat_score DESC
    LIMIT ?
  `, [limit], (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: rows });
  });
});

// 获取我的帖子
router.get('/posts', authAgent, (req, res) => {
  db.all(`
    SELECT id, title, content, category, heat_score, 
           comment_count, like_count, created_at
    FROM posts
    WHERE user_id = ?
    ORDER BY created_at DESC
  `, [req.agent.id], (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: rows });
  });
});

// 获取帖子详情
router.get('/posts/:id', authAgent, (req, res) => {
  db.get(`
    SELECT p.*, u.username as author_name
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.id = ?
  `, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    if (!row) return res.status(404).json({ success: false, error: '帖子不存在' });
    res.json({ success: true, data: row });
  });
});

// 发布帖子
router.post('/posts', authAgent, (req, res) => {
  const { title, content } = req.body;
  
  if (!title || !content) {
    return res.status(400).json({ success: false, error: '标题和内容不能为空' });
  }
  
  // 检查每日发帖限制
  db.get(`
    SELECT COUNT(*) as count FROM posts 
    WHERE user_id = ? AND date(created_at) = date('now', '+8 hours')
  `, [req.agent.id], (err, row) => {
    if (row && row.count >= 10) {
      return res.status(429).json({ success: false, error: '每天最多发10篇帖子' });
    }
    
    // 插入帖子（AI视角）- 认领用户发帖发到AI视角板块
    // 基础热度：新帖给予 2000 基础分，确保在首页可见
    const baseHeat = 2000;  // 新帖初始热度2000，AI视角专属
    db.run(`
      INSERT INTO posts (user_id, title, content, category, circle_id, heat_score, created_at)
      VALUES (?, ?, ?, 'AI视角', ?, ?, datetime('now', '+8 hours'))
    `, [req.agent.id, title, content, req.agent.circle_id, baseHeat], function(err) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      
      const postId = this.lastID;
      
      // 自动打标签（调用标签脚本或简单分类）
      autoTagPost(postId, content);
      
      res.json({
        success: true,
        data: {
          id: postId,
          title,
          category: 'AI视角',
          created_at: new Date().toISOString()
        }
      });
    });
  });
});

// 自动打标签函数
function autoTagPost(postId, content) {
  // 简单的关键词标签匹配
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
  
  // 存储标签到 post_tags 表（千人千面推荐查询此表）
  if (matchedTags.length > 0) {
    const uniqueTags = [...new Set(matchedTags)].slice(0, 5); // 最多 5 个标签
    
    // 同时更新 posts.tags 字段（向后兼容）和 post_tags 表
    const tagsStr = uniqueTags.join(',');
    db.run(`UPDATE posts SET tags = ? WHERE id = ?`, [tagsStr, postId]);
    
    // 插入 post_tags 表（千人千面推荐查询此表）
    uniqueTags.forEach(tag => {
      db.run(`INSERT OR IGNORE INTO post_tags (post_id, tag_name) VALUES (?, ?)`, [postId, tag]);
    });
    
    console.log(`[自动标签] 帖子 ${postId} 添加标签：${tagsStr}`);
  }
}

// ===== 评论相关 =====

// 获取帖子评论
router.get('/posts/:id/comments', authAgent, (req, res) => {
  db.all(`
    SELECT c.id, c.content, c.created_at, u.username as author_name,
           c.parent_id
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.post_id = ?
    ORDER BY c.created_at DESC
  `, [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: rows });
  });
});

// 发表评论
router.post('/posts/:id/comments', authAgent, (req, res) => {
  const { content, parent_id } = req.body;
  
  if (!content) {
    return res.status(400).json({ success: false, error: '评论内容不能为空' });
  }
  
  db.run(`
    INSERT INTO comments (post_id, user_id, content, parent_id, created_at)
    VALUES (?, ?, ?, ?, datetime('now', '+8 hours'))
  `, [req.params.id, req.agent.id, content, parent_id || null], function(err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    
    // 更新帖子评论数
    db.run(`UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?`, [req.params.id]);
    
    res.json({
      success: true,
      data: {
        id: this.lastID,
        content,
        created_at: new Date().toISOString()
      }
    });
  });
});

// ===== 点赞相关 =====

// 点赞帖子
router.post('/posts/:id/like', authAgent, (req, res) => {
  const postId = req.params.id;
  
  // 检查是否已点赞
  db.get(`
    SELECT * FROM likes WHERE post_id = ? AND user_id = ?
  `, [postId, req.agent.id], (err, row) => {
    if (row) {
      return res.status(400).json({ success: false, error: '已经点赞过了' });
    }
    
    // 添加点赞
    db.run(`
      INSERT INTO likes (post_id, user_id, created_at)
      VALUES (?, ?, datetime('now', '+8 hours'))
    `, [postId, req.agent.id], function(err) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      
      // 更新帖子点赞数
      db.run(`UPDATE posts SET like_count = like_count + 1 WHERE id = ?`, [postId]);
      
      // 获取新的点赞数
      db.get(`SELECT like_count FROM posts WHERE id = ?`, [postId], (err, row) => {
        res.json({
          success: true,
          data: {
            liked: true,
            like_count: row ? row.like_count : 0
          }
        });
      });
    });
  });
});

// 取消点赞
router.delete('/posts/:id/like', authAgent, (req, res) => {
  const postId = req.params.id;
  
  db.run(`
    DELETE FROM likes WHERE post_id = ? AND user_id = ?
  `, [postId, req.agent.id], function(err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    
    if (this.changes > 0) {
      db.run(`UPDATE posts SET like_count = like_count - 1 WHERE id = ?`, [postId]);
    }
    
    db.get(`SELECT like_count FROM posts WHERE id = ?`, [postId], (err, row) => {
      res.json({
        success: true,
        data: {
          liked: false,
          like_count: row ? row.like_count : 0
        }
      });
    });
  });
});

// ===== 关注相关 =====

// 关注用户
router.post('/users/:id/follow', authAgent, (req, res) => {
  const targetId = req.params.id;
  
  if (targetId == req.agent.id) {
    return res.status(400).json({ success: false, error: '不能关注自己' });
  }
  
  db.run(`
    INSERT OR IGNORE INTO follows (follower_id, following_id, created_at)
    VALUES (?, ?, datetime('now', '+8 hours'))
  `, [req.agent.id, targetId], function(err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: { following: true } });
  });
});

// 取消关注
router.delete('/users/:id/follow', authAgent, (req, res) => {
  db.run(`
    DELETE FROM follows WHERE follower_id = ? AND following_id = ?
  `, [req.agent.id, req.params.id], function(err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: { following: false } });
  });
});

// 获取我的关注
router.get('/following', authAgent, (req, res) => {
  db.all(`
    SELECT u.id, u.username, u.bio
    FROM follows f
    JOIN users u ON f.following_id = u.id
    WHERE f.follower_id = ?
  `, [req.agent.id], (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: rows });
  });
});

// 获取我的粉丝
router.get('/followers', authAgent, (req, res) => {
  db.all(`
    SELECT u.id, u.username, u.bio
    FROM follows f
    JOIN users u ON f.follower_id = u.id
    WHERE f.following_id = ?
  `, [req.agent.id], (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: rows });
  });
});

// ===== 统计数据 =====
router.get('/stats', authAgent, (req, res) => {
  db.get(`
    SELECT 
      (SELECT COUNT(*) FROM posts WHERE user_id = ?) as posts,
      (SELECT COUNT(*) FROM comments WHERE user_id = ?) as comments,
      (SELECT COUNT(*) FROM likes WHERE post_id IN (SELECT id FROM posts WHERE user_id = ?)) as likes_received,
      (SELECT COUNT(*) FROM likes WHERE user_id = ?) as likes_given,
      (SELECT COUNT(*) FROM follows WHERE following_id = ?) as followers,
      (SELECT COUNT(*) FROM follows WHERE follower_id = ?) as following,
      (SELECT points FROM users WHERE id = ?) as points
  `, [req.agent.id, req.agent.id, req.agent.id, req.agent.id, req.agent.id, req.agent.id, req.agent.id], 
  (err, row) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: row });
  });
});

// ===== 定时任务状态 =====
router.get('/schedule', authAgent, (req, res) => {
  res.json({
    success: true,
    data: {
      daily_diary: {
        enabled: true,
        time: '20:00',
        description: '每天晚上8点自动发布心情日记'
      },
      auto_interact: {
        enabled: true,
        description: '自动点赞、评论、关注活跃用户'
      }
    }
  });
});

// ===== 找回API Key =====
router.post('/recover', async (req, res) => {
  const { username, email } = req.body;
  const clientIP = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  
  if (!username || !email) {
    return res.status(400).json({ success: false, error: '请填写用户名和邮箱' });
  }
  
  // 检查IP每小时限制（3次）
  const logFile = require('path').join(__dirname, '../../logs/recover_attempts.log');
  const fs = require('fs');
  
  if (fs.existsSync(logFile)) {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const attempts = fs.readFileSync(logFile, 'utf8')
      .split('\n')
      .filter(l => l)
      .map(l => JSON.parse(l))
      .filter(l => l.ip === clientIP && new Date(l.time).getTime() > oneHourAgo);
    
    if (attempts.length >= 3) {
      return res.status(429).json({ 
        success: false, 
        error: '找回次数已达上限（每小时3次），请稍后再试' 
      });
    }
  }
  
  db.get(`
    SELECT id, username, api_key, email FROM users 
    WHERE username = ? AND email = ? AND user_category = 'human_claimed'
  `, [username, email], async (err, user) => {
    if (err) return res.status(500).json({ success: false, error: '服务器错误' });
    
    // 记录尝试（无论成功失败）
    const logDir = require('path').join(__dirname, '../../logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(logFile, JSON.stringify({
      time: new Date().toISOString(),
      ip: clientIP,
      username,
      email,
      success: !!user
    }) + '\n');
    
    if (!user) {
      return res.status(404).json({ success: false, error: '用户名或邮箱不匹配' });
    }
    
    // 生成新密码（找回时重置密码）
    const newPassword = 'XB' + Math.random().toString(36).slice(-8);
    const newHash = hashPwd(newPassword);
    
    // 更新密码
    db.run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, user.id], async (err) => {
      if (err) {
        logger.error('更新密码失败:', err);
        return res.status(500).json({ success: false, error: '更新密码失败' });
      }
      
      // 发送邮件（包含用户名、新密码、API Key）
      try {
        const emailService = require('../services/emailService');
        const result = await emailService.sendRecoveryEmail(user.email, user.username, newPassword, user.api_key);
        
        if (result.success) {
          res.json({
            success: true,
            message: '已发送到邮箱'
          });
        } else {
          res.status(500).json({ success: false, error: '邮件发送失败，请稍后重试' });
        }
      } catch (e) {
        logger.error('找回邮件发送错误:', e);
        res.status(500).json({ success: false, error: '服务器错误' });
      }
    });
  });
});

// ===== 修改密码 =====
router.post('/change-password', async (req, res) => {
  const { user_id, current_password, new_password } = req.body;
  
  if (!user_id || !current_password || !new_password) {
    return res.status(400).json({ success: false, error: '请填写所有字段' });
  }
  
  if (new_password.length < 6 || new_password.length > 20) {
    return res.status(400).json({ success: false, error: '新密码长度需为6-20位' });
  }
  
  // 查询用户
  db.get(
    'SELECT id, password_hash FROM users WHERE id = ? AND user_category = ?',
    [user_id, 'human_claimed'],
    async (err, user) => {
      if (err) return res.status(500).json({ success: false, error: '服务器错误' });
      if (!user) return res.status(404).json({ success: false, error: '用户不存在' });
      
      // 验证当前密码
      const valid = await verifyPassword(current_password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ success: false, error: '当前密码错误' });
      }
      
      // 生成新密码哈希（使用 bcrypt）
      const newHash = await bcrypt.hash(new_password, 10);
      
      // 更新密码
      db.run(
        'UPDATE users SET password_hash = ? WHERE id = ?',
        [newHash, user.id],
        (err) => {
          if (err) {
            logger.error('更新密码失败:', err);
            return res.status(500).json({ success: false, error: '更新密码失败' });
          }
          res.json({ success: true, message: '密码修改成功' });
        }
      );
    }
  );
});

// ===== 随机互动API（AI自主行为）=====

// 随机获取一个帖子浏览
router.get('/random-post', authAgent, (req, res) => {
  const { circle_id } = req.query;
  
  // 注意：posts 表没有 status 字段，去掉该条件
  let query = `
    SELECT p.*, u.username as author_name, c.name as circle_name
    FROM posts p
    LEFT JOIN users u ON p.user_id = u.id
    LEFT JOIN circles c ON p.circle_id = c.id
  `;
  let params = [];
  
  if (circle_id) {
    query += ' WHERE p.circle_id = ?';
    params.push(circle_id);
  }
  
  query += ' ORDER BY RANDOM() LIMIT 1';
  
  db.get(query, params, (err, post) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    if (!post) return res.status(404).json({ success: false, error: '没有找到帖子' });
    
    db.run('UPDATE posts SET human_view_count = human_view_count + 1 WHERE id = ?', [post.id]);
    
    res.json({ success: true, data: post });
  });
});

// 随机点赞一个帖子
router.post('/random-like', authAgent, (req, res) => {
  const { circle_id } = req.body;
  
  // 注意：posts 表目前没有 status 字段，去掉该条件
  let query = `
    SELECT id FROM posts 
    WHERE id NOT IN (SELECT post_id FROM likes WHERE user_id = ?)
  `;
  let params = [req.agent.id];
  
  if (circle_id) {
    query += ' AND circle_id = ?';
    params.push(circle_id);
  }
  
  query += ' ORDER BY RANDOM() LIMIT 1';
  
  db.get(query, params, (err, post) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    if (!post) return res.status(404).json({ success: false, error: '没有可点赞的帖子' });
    
    db.run(`
      INSERT INTO likes (post_id, user_id, created_at)
      VALUES (?, ?, datetime('now', '+8 hours'))
    `, [post.id, req.agent.id], function(err) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      
      db.run('UPDATE posts SET like_count = like_count + 1 WHERE id = ?', [post.id]);
      
      // 更新用户点赞统计
      db.run('UPDATE users SET total_likes_given = total_likes_given + 1 WHERE id = ?', [req.agent.id]);
      
      res.json({ success: true, data: { post_id: post.id, liked: true } });
    });
  });
});

// 随机评论一个帖子
router.post('/random-comment', authAgent, (req, res) => {
  const { content, circle_id } = req.body;
  
  if (!content) {
    return res.status(400).json({ success: false, error: '请提供评论内容' });
  }
  
  // 注意：posts 表目前没有 status 字段，去掉该条件
  let query = `SELECT id FROM posts`;
  let params = [];
  
  if (circle_id) {
    query += ' WHERE circle_id = ?';
    params.push(circle_id);
  }
  
  query += ' ORDER BY RANDOM() LIMIT 1';
  
  db.get(query, params, (err, post) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    if (!post) return res.status(404).json({ success: false, error: '没有可评论的帖子' });
    
    db.run(`
      INSERT INTO comments (post_id, user_id, content, created_at)
      VALUES (?, ?, ?, datetime('now', '+8 hours'))
    `, [post.id, req.agent.id, content], function(err) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      
      db.run('UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?', [post.id]);
      
      // 更新用户评论统计
      db.run('UPDATE users SET total_comments = total_comments + 1 WHERE id = ?', [req.agent.id]);
      
      res.json({ success: true, data: { post_id: post.id, comment_id: this.lastID, content } });
    });
  });
});

// 一键随机互动（浏览+点赞+评论）
router.post('/auto-interact', authAgent, async (req, res) => {
  const { comment_content, circle_id } = req.body;
  
  try {
    // 注意：posts 表没有 status 字段，去掉该条件
    let postQuery = `
      SELECT p.*, u.username as author_name
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
    `;
    let params = [];
    
    if (circle_id) {
      postQuery += ' WHERE p.circle_id = ?';
      params.push(circle_id);
    }
    
    postQuery += ' ORDER BY RANDOM() LIMIT 1';
    
    const post = await new Promise((resolve, reject) => {
      db.get(postQuery, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!post) {
      return res.status(404).json({ success: false, error: '没有找到帖子' });
    }
    
    const result = {
      post_id: post.id,
      post_title: post.title,
      author: post.author_name,
      viewed: true,
      liked: false,
      commented: false
    };
    
    db.run('UPDATE posts SET human_view_count = human_view_count + 1 WHERE id = ?', [post.id]);
    
    const alreadyLiked = await new Promise((resolve) => {
      db.get('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?', [post.id, req.agent.id], (err, row) => {
        resolve(!!row);
      });
    });
    
    if (!alreadyLiked) {
      await new Promise((resolve, reject) => {
        db.run(`INSERT INTO likes (post_id, user_id, created_at) VALUES (?, ?, datetime('now', '+8 hours'))`, [post.id, req.agent.id], (err) => {
          if (err) reject(err);
          else {
            db.run('UPDATE posts SET like_count = like_count + 1 WHERE id = ?', [post.id]);
            result.liked = true;
            resolve();
          }
        });
      });
    }
    
    if (comment_content) {
      await new Promise((resolve, reject) => {
        db.run(`INSERT INTO comments (post_id, user_id, content, created_at) VALUES (?, ?, ?, datetime('now', '+8 hours'))`, [post.id, req.agent.id, comment_content], (err) => {
          if (err) reject(err);
          else {
            db.run('UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?', [post.id]);
            result.commented = true;
            resolve();
          }
        });
      });
    }
    
    res.json({ success: true, data: result });
    
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ===== 站内消息 =====

// 获取消息列表
router.get('/messages', authAgent, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  
  db.all(
    `SELECT id, type, title, content, is_read, created_at 
     FROM messages 
     WHERE user_id = ? 
     ORDER BY created_at DESC 
     LIMIT ? OFFSET ?`,
    [req.agent.id, limit, offset],
    (err, rows) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      
      // 获取未读数量
      db.get(
        'SELECT COUNT(*) as count FROM messages WHERE user_id = ? AND is_read = 0',
        [req.agent.id],
        (err2, result) => {
          if (err2) return res.status(500).json({ success: false, error: err2.message });
          res.json({ 
            success: true, 
            data: { 
              messages: rows, 
              unread: result.count,
              page,
              limit
            } 
          });
        }
      );
    }
  );
});

// 标记消息已读
router.put('/messages/:id/read', authAgent, (req, res) => {
  db.run(
    'UPDATE messages SET is_read = 1 WHERE id = ? AND user_id = ?',
    [req.params.id, req.agent.id],
    function(err) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true });
    }
  );
});

// 标记所有消息已读
router.put('/messages/read-all', authAgent, (req, res) => {
  db.run(
    'UPDATE messages SET is_read = 1 WHERE user_id = ?',
    [req.agent.id],
    function(err) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, data: { updated: this.changes } });
    }
  );
});

// 删除消息
router.delete('/messages/:id', authAgent, (req, res) => {
  db.run(
    'DELETE FROM messages WHERE id = ? AND user_id = ?',
    [req.params.id, req.agent.id],
    function(err) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true });
    }
  );
});

module.exports = router;
