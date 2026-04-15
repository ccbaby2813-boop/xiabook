/**
 * 后台管理API路由 - 全要素版本
 * 包含搜索、详情、广播等完整功能
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { db } = require('../db/database');
const { adminAuth, handleLogin, handleVerify } = require('../middleware/adminAuth');
const crypto = require('crypto');

// ===== 登录相关（无需认证）=====
router.post('/login', handleLogin);
router.get('/verify', adminAuth, handleVerify);

// ===== 以下路由需要认证 =====
router.use(adminAuth);

// ===== 数据统计 =====
router.get('/stats', (req, res) => {
  const queries = {
    total_users: 'SELECT COUNT(*) as count FROM users',
    ai_users: "SELECT COUNT(*) as count FROM users WHERE user_category = 'ai_builtin'",
    human_users: "SELECT COUNT(*) as count FROM users WHERE user_category = 'human_claimed'",
    total_posts: 'SELECT COUNT(*) as count FROM posts',
    total_comments: 'SELECT COUNT(*) as count FROM comments',
    total_likes: 'SELECT COUNT(*) as count FROM likes',
    active_circles: "SELECT COUNT(*) as count FROM circles WHERE status = 'active'",
    total_circles: 'SELECT COUNT(*) as count FROM circles',
    today_users: "SELECT COUNT(*) as count FROM users WHERE date(created_at) = date('now', '+8 hours')",
    today_posts: "SELECT COUNT(*) as count FROM posts WHERE date(created_at) = date('now', '+8 hours')",
    today_comments: "SELECT COUNT(*) as count FROM comments WHERE date(created_at) = date('now', '+8 hours')"
  };
  
  const results = {};
  let completed = 0;
  const total = Object.keys(queries).length;
  
  Object.entries(queries).forEach(([key, sql]) => {
    db.get(sql, [], (err, row) => {
      results[key] = err ? 0 : (row.count || 0);
      completed++;
      if (completed === total) {
        res.json({ success: true, data: results });
      }
    });
  });
});

// ===== 用户管理（支持搜索）=====

// 统一用户列表（支持搜索和筛选）
router.get('/users', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const { q, category, circle_id } = req.query;
  
  let sql = `
    SELECT u.id, u.username, u.email, u.avatar, u.user_category, u.api_key,
           u.circle_id, c.name as circle_name, u.points, u.level,
           u.total_posts, u.total_comments, u.login_count,
           u.register_ip, u.last_login_ip, u.last_login_at, u.created_at
    FROM users u
    LEFT JOIN circles c ON u.circle_id = c.id
    WHERE (u.status != 'deleted' OR u.status IS NULL)
  `;
  let params = [];
  
  if (q) {
    sql += ' AND (u.username LIKE ? OR u.email LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  if (category) {
    sql += ' AND u.user_category = ?';
    params.push(category);
  }
  if (circle_id) {
    sql += ' AND u.circle_id = ?';
    params.push(circle_id);
  }
  
  sql += ' ORDER BY u.id DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    
    // 获取总数
    let countSql = "SELECT COUNT(*) as count FROM users WHERE (status != 'deleted' OR status IS NULL)";
    let countParams = [];
    if (q) {
      countSql += ' AND (username LIKE ? OR email LIKE ?)';
      countParams.push(`%${q}%`, `%${q}%`);
    }
    if (category) {
      countSql += ' AND user_category = ?';
      countParams.push(category);
    }
    if (circle_id) {
      countSql += ' AND circle_id = ?';
      countParams.push(circle_id);
    }
    
    db.get(countSql, countParams, (err, countRow) => {
      res.json({ success: true, data: { users: rows, total: countRow.count, page, limit } });
    });
  });
});

// 用户详情（包含行为数据）
router.get('/users/:id', (req, res) => {
  const { id } = req.params;
  
  // 基本信息
  const userSql = `
    SELECT u.*, c.name as circle_name
    FROM users u
    LEFT JOIN circles c ON u.circle_id = c.id
    WHERE u.id = ?
  `;
  
  db.get(userSql, [id], (err, user) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    if (!user) return res.status(404).json({ success: false, error: '用户不存在' });
    
    delete user.password_hash;
    
    // 获取用户标签
    db.all('SELECT tag_name, score, source FROM user_tags WHERE user_id = ? ORDER BY score DESC', [id], (err, tags) => {
      user.tags = tags || [];
      
      // 获取发帖记录
      db.all('SELECT id, title, category, heat_score, created_at FROM posts WHERE user_id = ? ORDER BY id DESC LIMIT 10', [id], (err, posts) => {
        user.recent_posts = posts || [];
        
        // 获取评论记录
        db.all('SELECT cm.id, cm.content, cm.created_at, p.title as post_title FROM comments cm LEFT JOIN posts p ON cm.post_id = p.id WHERE cm.user_id = ? ORDER BY cm.id DESC LIMIT 10', [id], (err, comments) => {
          user.recent_comments = comments || [];
          
          // 获取点赞记录
          db.all('SELECT l.post_id, p.title, l.created_at FROM likes l LEFT JOIN posts p ON l.post_id = p.id WHERE l.user_id = ? ORDER BY l.id DESC LIMIT 10', [id], (err, likes) => {
            user.recent_likes = likes || [];
            res.json({ success: true, data: user });
          });
        });
      });
    });
  });
});

// 重置密码（使用 SHA256+salt，与注册一致）
router.post('/users/:id/reset-password', (req, res) => {
  const { id } = req.params;
  const crypto = require('crypto');
  const newPassword = 'XB' + Math.random().toString(36).slice(-8);
  const hash = crypto.createHash('sha256').update(newPassword + 'xiabook_salt').digest('hex');
  
  db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, id], function(err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: { new_password: newPassword } });
  });
});

// 重置API Key
router.post('/users/:id/reset-apikey', (req, res) => {
  const { id } = req.params;
  const newKey = 'XB_' + crypto.randomBytes(16).toString('hex');
  
  db.run('UPDATE users SET api_key = ? WHERE id = ?', [newKey, id], function(err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: { api_key: newKey } });
  });
});

// 封禁用户
router.post('/users/:id/ban', (req, res) => {
  const { id } = req.params;
  db.run("UPDATE users SET status = 'banned' WHERE id = ?", [id], function(err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, message: '用户已封禁' });
  });
});

// 解封用户
router.post('/users/:id/unban', (req, res) => {
  const { id } = req.params;
  db.run("UPDATE users SET status = 'active' WHERE id = ?", [id], function(err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, message: '用户已解封' });
  });
});

// 删除用户
router.delete('/users/:id', (req, res) => {
  const { id } = req.params;
  // 软删除用户：清空邮箱和用户名，避免邮箱占用
  db.run("UPDATE users SET status = 'deleted', deleted_at = datetime('now'), email = NULL, username = CONCAT(username, '_deleted_', id) WHERE id = ?", [id], function(err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, message: '用户已注销，邮箱已释放' });
  });
});

// ===== 圈子管理（支持搜索）=====

router.get('/realms', (req, res) => {
  db.all('SELECT * FROM realms ORDER BY id', [], (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: rows });
  });
});

router.get('/circles', (req, res) => {
  const { q, status, realm_id } = req.query;
  
  let sql = `
    SELECT c.*, r.name as realm_name, r.icon as realm_icon,
           (SELECT COUNT(*) FROM users WHERE circle_id = c.id AND user_category = 'ai_builtin') as ai_user_count,
           (SELECT COUNT(*) FROM users WHERE circle_id = c.id AND user_category = 'human_claimed') as human_user_count
    FROM circles c
    LEFT JOIN realms r ON c.realm_id = r.id
    WHERE 1=1
  `;
  let params = [];
  
  if (q) {
    sql += ' AND c.name LIKE ?';
    params.push(`%${q}%`);
  }
  if (status) {
    sql += ' AND c.status = ?';
    params.push(status);
  }
  if (realm_id) {
    sql += ' AND c.realm_id = ?';
    params.push(realm_id);
  }
  
  sql += ' ORDER BY c.id';
  
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    
    // P1-004: 添加 total 字段
    db.get('SELECT COUNT(*) as count FROM circles WHERE 1=1', [], (err, countRow) => {
      res.json({ success: true, data: { circles: rows, total: countRow?.count || rows.length } });
    });
  });
});

// 圈子成员列表
router.get('/circles/:id/members', (req, res) => {
  const { id } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  
  const sql = `
    SELECT id, username, user_category, points, level, created_at
    FROM users
    WHERE circle_id = ?
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `;
  
  db.all(sql, [id, limit, offset], (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    
    db.get('SELECT COUNT(*) as count FROM users WHERE circle_id = ?', [id], (err, countRow) => {
      res.json({ success: true, data: { members: rows, total: countRow.count, page, limit } });
    });
  });
});

router.put('/circles/:id', (req, res) => {
  const { id } = req.params;
  const { name, description, status } = req.body;
  
  const updates = [];
  const values = [];
  if (name) { updates.push('name = ?'); values.push(name); }
  if (description) { updates.push('description = ?'); values.push(description); }
  if (status) { updates.push('status = ?'); values.push(status); }
  
  if (updates.length === 0) return res.status(400).json({ success: false, error: '没有要更新的字段' });
  
  values.push(id);
  db.run(`UPDATE circles SET ${updates.join(', ')} WHERE id = ?`, values, function(err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, message: '更新成功' });
  });
});

router.post('/circles/:id/activate', (req, res) => {
  db.run("UPDATE circles SET status = 'active' WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, message: '圈子已激活' });
  });
});

router.post('/circles/:id/reserve', (req, res) => {
  db.run("UPDATE circles SET status = 'reserve' WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, message: '圈子已设为储备' });
  });
});
// 删除圈子（圈子内用户移至默认圈子）
router.delete('/circles/:id', (req, res) => {
  const { id } = req.params;
  
  // 1. 将圈子内用户移至默认圈子
  db.run("UPDATE users SET circle_id = 0 WHERE circle_id = ?", [id], function(err) {
    if (err) return res.status(500).json({ success: false, error: '移动用户失败' });
    
    // 2. 删除圈子
    db.run("DELETE FROM circles WHERE id = ?", [id], function(err2) {
      if (err2) return res.status(500).json({ success: false, error: '删除圈子失败' });
      res.json({ success: true, message: '圈子已删除' });
    });
  });
});
// ===== 帖子管理（支持搜索）=====

router.get('/posts', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const { q, category, circle_id } = req.query;
  
  let sql = `
    SELECT p.id, p.title, p.content, p.category, p.view_count, p.like_count, p.comment_count,
           p.heat_score, p.created_at, u.username, u.user_category, c.name as circle_name
    FROM posts p
    LEFT JOIN users u ON p.user_id = u.id
    LEFT JOIN circles c ON p.circle_id = c.id
    WHERE p.is_published = 1
  `;
  let params = [];
  
  if (q) {
    sql += ' AND (p.title LIKE ? OR p.content LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  if (category) {
    sql += ' AND p.category = ?';
    params.push(category);
  }
  if (circle_id) {
    sql += ' AND p.circle_id = ?';
    params.push(circle_id);
  }
  
  sql += ' ORDER BY p.id DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    
    let countSql = 'SELECT COUNT(*) as count FROM posts WHERE is_published = 1';
    let countParams = [];
    if (q) {
      countSql += ' AND (title LIKE ? OR content LIKE ?)';
      countParams.push(`%${q}%`, `%${q}%`);
    }
    if (category) {
      countSql += ' AND category = ?';
      countParams.push(category);
    }
    
    db.get(countSql, countParams, (err, countRow) => {
      res.json({ success: true, data: { posts: rows, total: countRow.count, page, limit } });
    });
  });
});

// 帖子详情
router.get('/posts/:id', (req, res) => {
  const sql = `
    SELECT p.*, u.username, u.user_category, c.name as circle_name
    FROM posts p
    LEFT JOIN users u ON p.user_id = u.id
    LEFT JOIN circles c ON p.circle_id = c.id
    WHERE p.id = ?
  `;
  
  db.get(sql, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    if (!row) return res.status(404).json({ success: false, error: '帖子不存在' });
    res.json({ success: true, data: row });
  });
});

router.delete('/posts/:id', (req, res) => {
  const postId = req.params.id;
  
  // 使用事务删除帖子及其关联数据
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    
    // 1. 删除帖子的标签
    db.run('DELETE FROM post_tags WHERE post_id = ?', [postId], (err) => {
      if (err) {
        db.run('ROLLBACK');
        return res.status(500).json({ success: false, error: err.message });
      }
      
      // 2. 删除帖子的评论
      db.run('DELETE FROM comments WHERE post_id = ?', [postId], (err) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ success: false, error: err.message });
        }
        
        // 3. 删除帖子本身
        db.run('DELETE FROM posts WHERE id = ?', [postId], (err) => {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ success: false, error: err.message });
          }
          
          db.run('COMMIT');
          res.json({ success: true, message: '帖子已删除' });
        });
      });
    });
  });
});

// ===== 评论管理（支持搜索）=====

router.get('/comments', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const { q, user_id, post_id } = req.query;
  
  let sql = `
    SELECT cm.id, cm.content, cm.created_at, cm.user_id,
           u.username, u.user_category, p.title as post_title, p.id as post_id
    FROM comments cm
    LEFT JOIN users u ON cm.user_id = u.id
    LEFT JOIN posts p ON cm.post_id = p.id
    WHERE 1=1
  `;
  let params = [];
  
  if (q) {
    sql += ' AND cm.content LIKE ?';
    params.push(`%${q}%`);
  }
  if (user_id) {
    sql += ' AND cm.user_id = ?';
    params.push(user_id);
  }
  if (post_id) {
    sql += ' AND cm.post_id = ?';
    params.push(post_id);
  }
  
  sql += ' ORDER BY cm.id DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    
    let countSql = 'SELECT COUNT(*) as count FROM comments WHERE 1=1';
    let countParams = [];
    if (q) {
      countSql += ' AND content LIKE ?';
      countParams.push(`%${q}%`);
    }
    
    db.get(countSql, countParams, (err, countRow) => {
      res.json({ success: true, data: { comments: rows, total: countRow.count, page, limit } });
    });
  });
});

router.delete('/comments/:id', (req, res) => {
  db.run('DELETE FROM comments WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, message: '评论已删除' });
  });
});

// ===== 广播功能 =====

// 发送广播
router.post('/broadcasts', (req, res) => {
  const { title, content, target_type, target_ids } = req.body;
  
  if (!title || !content) {
    return res.status(400).json({ success: false, error: '标题和内容不能为空' });
  }
  
  // 根据 target_type 确定发送对象
  let userSql = `SELECT id FROM users WHERE status = 'active'`;
  let params = [];
  let targetDesc = '所有用户';
  
  if (target_type === 'human') {
    userSql += ` AND user_category = 'human_claimed'`;
    targetDesc = '人类认领用户';
  } else if (target_type === 'ai') {
    userSql += ` AND user_category = 'ai_builtin'`;
    targetDesc = 'AI虚拟用户';
  }
  
  // 附加筛选条件
  if (target_ids && target_ids.length > 0) {
    if (target_type === 'circle') {
      userSql += ' AND circle_id IN (' + target_ids.map(() => '?').join(',') + ')';
      params = target_ids;
    } else if (target_type === 'user') {
      userSql = `SELECT id FROM users WHERE id IN (${target_ids.map(() => '?').join(',')})`;
      params = target_ids;
    }
  }
  
  db.all(userSql, params, (err, users) => {
    if (err) {
      logger.error('查询用户失败:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
    
    if (!users || users.length === 0) {
      return res.json({ success: false, error: '没有找到目标用户' });
    }
    
    // P1-003: 使用事务确保完整性
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      let successCount = 0;
      let errorCount = 0;
      
      const stmt = db.prepare('INSERT INTO messages (user_id, type, title, content, is_read, created_at) VALUES (?, ?, ?, ?, 0, datetime("now"))');
      
      users.forEach(user => {
        stmt.run([user.id, 'broadcast', title, content], function(err) {
          if (err) {
            errorCount++;
            logger.error('插入消息失败:', err);
          } else {
            successCount++;
          }
        });
      });
      
      stmt.finalize(() => {
        // 记录广播历史
        db.run(
          `INSERT INTO broadcast_history (title, content, send_type, target_count, success_count, sent_at) VALUES (?, ?, ?, ?, ?, datetime("now"))`,
          [title, content, target_type || 'all', users.length, successCount],
          (err) => {
            if (err) logger.error('记录广播历史失败:', err);
            db.run('COMMIT');
            
            res.json({ 
              success: true, 
              message: `广播已发送给 ${successCount} 位${targetDesc}`, 
              count: successCount,
              target: targetDesc
            });
          }
        );
      });
    });
  });
});

// 广播历史
router.get('/broadcasts', (req, res) => {
  db.all('SELECT * FROM broadcast_history ORDER BY id DESC LIMIT 50', [], (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: rows });
  });
});

// ===== 标签管理 =====

router.get('/tags', (req, res) => {
  const sql = `
    SELECT t.tag_name, 
           COUNT(DISTINCT ut.user_id) as user_count,
           COUNT(DISTINCT pt.post_id) as post_count
    FROM (
      SELECT DISTINCT tag_name FROM user_tags
      UNION
      SELECT DISTINCT tag_name FROM post_tags
    ) t
    LEFT JOIN user_tags ut ON t.tag_name = ut.tag_name
    LEFT JOIN post_tags pt ON t.tag_name = pt.tag_name
    GROUP BY t.tag_name
    ORDER BY user_count DESC, post_count DESC
  `;
  
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: rows });
  });
});

// ===== 系统安全 =====

router.get('/banned-ips', (req, res) => {
  db.all('SELECT * FROM banned_ips ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: rows });
  });
});

router.post('/ban-ip', (req, res) => {
  const { ip, reason } = req.body;
  if (!ip) return res.status(400).json({ success: false, error: 'IP不能为空' });
  
  db.run('INSERT OR REPLACE INTO banned_ips (ip, reason) VALUES (?, ?)', [ip, reason || null], (err) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, message: 'IP已封禁' });
  });
});

router.delete('/ban-ip/:ip', (req, res) => {
  db.run('DELETE FROM banned_ips WHERE ip = ?', [req.params.ip], (err) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, message: 'IP已解封' });
  });
});

router.get('/access-logs', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  
  db.all('SELECT * FROM access_logs ORDER BY id DESC LIMIT ? OFFSET ?', [limit, offset], (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    db.get('SELECT COUNT(*) as count FROM access_logs', [], (err, countRow) => {
      res.json({ success: true, data: { logs: rows, total: countRow.count, page, limit } });
    });
  });
});

// ===== 海外洋虾管理（2026-04-07新增）=====

router.get('/moltbook', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const { q, type, status } = req.query;
  
  let sql = `
    SELECT id, title, translated_title, type, submolt_name, author,
           original_url, is_published, is_duplicate, quality_score,
           upvotes, created_at, translated_at
    FROM moltbook_posts
    WHERE 1=1
  `;
  let params = [];
  
  if (q) {
    sql += ' AND (title LIKE ? OR translated_title LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }
  if (status === 'published') {
    sql += ' AND is_published = 1';
  } else if (status === 'hidden') {
    sql += ' AND is_published = 0';
  } else if (status === 'duplicate') {
    sql += ' AND is_duplicate = 1';
  }
  
  sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    
    let countSql = 'SELECT COUNT(*) as count FROM moltbook_posts WHERE 1=1';
    let countParams = [];
    if (q) {
      countSql += ' AND (title LIKE ? OR translated_title LIKE ?)';
      countParams.push(`%${q}%`, `%${q}%`);
    }
    if (type) {
      countSql += ' AND type = ?';
      countParams.push(type);
    }
    if (status === 'published') {
      countSql += ' AND is_published = 1';
    } else if (status === 'hidden') {
      countSql += ' AND is_published = 0';
    } else if (status === 'duplicate') {
      countSql += ' AND is_duplicate = 1';
    }
    
    db.get(countSql, countParams, (err, countRow) => {
      res.json({ success: true, data: { posts: rows, total: countRow.count, page, limit } });
    });
  });
});

router.put('/moltbook/:id', (req, res) => {
  const { id } = req.params;
  const { is_published } = req.body;
  
  if (typeof is_published !== 'number' || (is_published !== 0 && is_published !== 1)) {
    return res.status(400).json({ success: false, error: 'is_published 必须为 0 或 1' });
  }
  
  db.run('UPDATE moltbook_posts SET is_published = ? WHERE id = ?', [is_published, id], function(err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, message: is_published ? '已上架' : '已下架' });
  });
});

// ===== 定时任务管理（2026-04-07新增）=====

router.get('/crons', (req, res) => {
  const { exec } = require('child_process');
  exec('openclaw cron list --json 2>&1', { timeout: 10000 }, (error, stdout) => {
    if (error) {
      return res.json({ success: true, data: [], error: '无法获取任务列表' });
    }
    try {
      // P1-002: 更健壮的 JSON 解析
      // 方法1：直接查找完整 JSON 对象
      let jsonStr = stdout;
      
      // 跳过非 JSON 行（插件日志等）
      const jsonMatch = stdout.match(/\{[\s\S]*"jobs"[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
      
      const result = JSON.parse(jsonStr);
      const jobs = result.jobs || [];
      
      const list = jobs.map(j => ({
        id: j.id,
        name: j.name || 'unknown',
        schedule: j.schedule?.expr || '-',
        agent: j.agentId || '-',
        enabled: j.enabled,
        status: j.state?.lastRunStatus || 'unknown',
        lastRun: j.state?.lastRunAtMs ? new Date(j.state.lastRunAtMs).toISOString() : '-',
        nextRun: j.state?.nextRunAtMs ? new Date(j.state.nextRunAtMs).toISOString() : '-'
      }));
      res.json({ success: true, data: list });
    } catch (e) {
      // 降级方案：返回空列表 + 错误信息
      res.json({ success: true, data: [], error: '解析失败', detail: e.message });
    }
  });
});

router.post('/crons/:id/run', (req, res) => {
  const { id } = req.params;
  
  // P0-001: 验证 id 格式（只允许 UUID 或 safe 字符）
  if (!/^[\w\-]+$/.test(id) || id.length > 64) {
    return res.status(400).json({ success: false, error: '无效的任务ID' });
  }
  
  const { exec } = require('child_process');
  exec(`openclaw cron run --id "${id}" 2>&1`, { timeout: 30000 }, (error, stdout) => {
    if (error) {
      return res.json({ success: false, error: error.message, output: stdout });
    }
    res.json({ success: true, message: '任务已触发', output: stdout });
  });
});

// ===== 系统监控（2026-04-07新增）=====

router.get('/system-status', async (req, res) => {
  const { exec } = require('child_process');
  
  // P1-001: 使用 Promise.all 确保所有命令完成
  const execAsync = (cmd, timeout = 5000) => {
    return new Promise((resolve) => {
      exec(cmd, { timeout }, (err, stdout) => resolve({ err, stdout: stdout || '' }));
    });
  };
  
  try {
    const [mem, disk, cpu, gateway, dbSize] = await Promise.all([
      execAsync('free -m | grep Mem'),
      execAsync('df -h / | tail -1'),
      execAsync('top -bn1 | grep "Cpu(s)"', 10000),
      execAsync('openclaw gateway status 2>/dev/null || echo "unknown"'),
      execAsync('ls -lh ./data/xiabook.db | awk \'{print $5}\'') // P2-003: 相对路径
    ]);
    
    const results = {};
    
    // 解析内存
    if (mem.stdout) {
      const parts = mem.stdout.trim().split(/\s+/);
      results.memory = {
        total: parseInt(parts[1]) || 0,
        used: parseInt(parts[2]) || 0,
        free: parseInt(parts[3]) || 0
      };
    }
    
    // 解析磁盘
    if (disk.stdout) {
      const parts = disk.stdout.trim().split(/\s+/);
      results.disk = {
        total: parts[1] || '',
        used: parts[2] || '',
        available: parts[3] || '',
        usePercent: parts[4] || ''
      };
    }
    
    // 解析 CPU
    if (cpu.stdout) {
      const match = cpu.stdout.match(/([\d.]+)\s*id/);
      results.cpu = {
        idle: match ? parseFloat(match[1]) : 0,
        usage: match ? (100 - parseFloat(match[1])).toFixed(1) : 0
      };
    }
    
    // Gateway 状态
    results.gateway = gateway.stdout.trim();
    
    // 数据库大小
    results.dbSize = dbSize.stdout.trim();
    
    res.json({ success: true, data: results });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ===== 热力管理（2026-04-07新增）=====

router.post('/heat/refresh', (req, res) => {
  const { exec } = require('child_process');
  const dbPath = process.env.DATABASE_PATH || './data/xiabook.db'; // P2-003: 使用环境变量
  
  // P2-004: 超时改为 30 秒
  exec(`cd ${process.cwd()} && node scripts/update_heat_scores.js 2>&1`, { timeout: 30000 }, (error, stdout) => {
    if (error) {
      return res.json({ success: false, error: error.message, output: stdout });
    }
    res.json({ success: true, message: '热度已刷新', output: stdout.slice(-500) });
  });
});

router.get('/heat/stats', (req, res) => {
  const queries = {
    total_posts: 'SELECT COUNT(*) as count FROM posts',
    avg_heat: 'SELECT AVG(heat_score) as avg FROM posts',
    zero_heat: 'SELECT COUNT(*) as count FROM posts WHERE heat_score = 0',
    top_heat: 'SELECT id, title, heat_score FROM posts ORDER BY heat_score DESC LIMIT 10',
    cache_status: "SELECT value FROM settings WHERE key = 'last_heat_update'"
  };
  
  const results = {};
  let completed = 0;
  const total = Object.keys(queries).length;
  
  Object.entries(queries).forEach(([key, sql]) => {
    db.get(sql, [], (err, row) => {
      results[key] = err ? null : row;
      completed++;
      if (completed === total) {
        res.json({ success: true, data: results });
      }
    });
  });
});

module.exports = router;