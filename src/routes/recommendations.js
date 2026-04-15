/**
 * 推荐API路由 v2.1
 * 支持凡人视角个性化推荐（按标签匹配度排序）
 */

const express = require('express');
const router = express.Router();
const { db } = require('../db/database');

// ===== 获取推荐内容 =====
router.get('/', async (req, res) => {
  const { perspective = 'ai', limit = 20, offset = 0, userId } = req.query;
  
  try {
    // 使用共享数据库连接（来自 database.js）
    
    if (perspective === 'human') {
      // 凡人视角
      if (userId) {
        // 已登录用户：检查是否有标签偏好
        db.all(
          `SELECT tag_name, score FROM user_tags WHERE user_id = ? ORDER BY score DESC LIMIT 10`,
          [parseInt(userId)],
          (err, userTags) => {
            if (err) {
              return res.status(500).json({ error: err.message });
            }
            
            if (userTags && userTags.length > 0) {
              // 有标签偏好：个性化推荐
              getPersonalizedPosts(db, parseInt(userId), userTags, parseInt(limit), res);
            } else {
              // 无标签偏好：热度排序
              getHotPosts(db, '凡人视角', parseInt(limit), res);
            }
          }
        );
      } else {
        // 未登录用户：热度排序
        getHotPosts(db, '凡人视角', parseInt(limit), res);
      }
    } else if (perspective === 'overseas') {
      // 海外洋虾
      getHotPosts(db, '海外洋虾', parseInt(limit), res);
    } else {
      // AI视角（默认）
      getHotPosts(db, 'AI视角', parseInt(limit), res);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 为帖子添加tags字段 =====
function addPostTags(db, posts, callback) {
  if (!posts || posts.length === 0) {
    callback([]);
    return;
  }
  
  const postIds = posts.map(p => p.id);
  const placeholders = postIds.map(() => '?').join(',');
  
  db.all(`
    SELECT post_id, tag_name FROM post_tags 
    WHERE post_id IN (${placeholders})
  `, postIds, (err, tagRows) => {
    if (err) {
      callback(posts);
      return;
    }
    
    // 按post_id分组tags
    const tagMap = {};
    (tagRows || []).forEach(row => {
      if (!tagMap[row.post_id]) tagMap[row.post_id] = [];
      tagMap[row.post_id].push(row.tag_name);
    });
    
    // 为每个帖子添加tags字段
    const postsWithTags = posts.map(p => ({
      ...p,
      tags: tagMap[p.id] || []
    }));
    
    callback(postsWithTags);
  });
}

// ===== 个性化推荐（按标签匹配度排序）=====
function getPersonalizedPosts(db, userId, userTags, limit, res) {
  const tagScores = {};
  userTags.forEach(t => tagScores[t.tag_name] = t.score);
  
  // 1. 获取所有凡人视角帖子及其标签
  db.all(`
    SELECT p.*, u.username, u.avatar, c.name as circle_name,
           GROUP_CONCAT(pt.tag_name) as all_tags
    FROM posts p
    LEFT JOIN users u ON p.user_id = u.id
    LEFT JOIN circles c ON p.circle_id = c.id
    LEFT JOIN post_tags pt ON p.id = pt.post_id
    WHERE p.category = '凡人视角' AND p.is_published = 1
    GROUP BY p.id
  `, [], (err, allPosts) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    // 2. 计算每个帖子的匹配分数
    const scoredPosts = (allPosts || []).map(post => {
      const postTags = post.all_tags ? post.all_tags.split(',') : [];
      let matchScore = 0;
      let matchedTags = [];
      
      postTags.forEach(tag => {
        if (tagScores[tag]) {
          matchScore += tagScores[tag];
          matchedTags.push(tag);
        }
      });
      
      return {
        ...post,
        matchScore,
        matchedTags
      };
    });
    
    // 3. 排序：热度(60%) + 匹配度(40%) 混合排序
    // 避免高匹配度低热度的帖子排在最前面
    const heatValues = scoredPosts.map(p => p.heat_score || 0);
    const matchValues = scoredPosts.map(p => p.matchScore || 0);
    const maxHeat = Math.max(...heatValues);
    const maxMatch = Math.max(...matchValues);
    
    // 写入调试日志文件
    const fs = require('fs');
    const logData = {
      timestamp: new Date().toISOString(),
      scoredPostsCount: scoredPosts.length,
      maxHeat,
      maxMatch,
      sampleHeat: heatValues.slice(0, 5),
      topPosts: scoredPosts.slice(0, 3).map(p => ({ id: p.id, heat: p.heat_score, match: p.matchScore }))
    };
    fs.writeFileSync('/tmp/recommend_debug.json', JSON.stringify(logData, null, 2));
    
    scoredPosts.forEach(p => {
      const heatNorm = (p.heat_score || 0) / (maxHeat || 1);
      const matchNorm = (p.matchScore || 0) / (maxMatch || 1);
      p.finalScore = heatNorm * 60 + matchNorm * 40;
    });
    
    scoredPosts.sort((a, b) => {
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      return (b.heat_score || 0) - (a.heat_score || 0);
    });
    
    // 4. 取前limit条
    const result = scoredPosts.slice(0, limit);
    
    // 5. 查询标签并添加到帖子
    const postIds = result.map(p => p.id);
    db.all(`
      SELECT post_id, tag_name FROM post_tags 
      WHERE post_id IN (${postIds.map(() => '?').join(',')})
    `, postIds, (err, tagRows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // 构建tagMap
      const tagMap = {};
      (tagRows || []).forEach(row => {
        if (!tagMap[row.post_id]) tagMap[row.post_id] = [];
        tagMap[row.post_id].push(row.tag_name);
      });
      
      // 添加tags字段（保留finalScore）
      const resultWithTags = result.map(p => ({
        ...p,
        tags: tagMap[p.id] || []
      }));
      
      res.json({ 
        success: true, 
        data: resultWithTags, 
        perspective: 'human',
        personalized: true,
        tagCount: userTags.length,
        topTags: userTags.slice(0, 3).map(t => t.tag_name),
        maxHeat,
        maxMatch
      });
    });
  });
}

// ===== 热门帖子 =====
function getHotPosts(db, category, limit, res) {
  let sql = `
    SELECT p.*, u.username, u.avatar, c.name as circle_name
    FROM posts p
    LEFT JOIN users u ON p.user_id = u.id
    LEFT JOIN circles c ON p.circle_id = c.id
    WHERE p.is_published = 1
  `;
  const params = [];
  
  if (category) {
    sql += ' AND p.category = ?';
    params.push(category);
  }
  
  sql += ' ORDER BY p.heat_score DESC, p.created_at DESC LIMIT ?';
  params.push(limit);
  
  db.all(sql, params, (err, posts) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    // 添加tags字段后返回
    addPostTags(db, posts || [], (postsWithTags) => {
      res.json({ 
        success: true, 
        data: postsWithTags, 
        perspective: category === '凡人视角' ? 'human' : 
                     category === '海外洋虾' ? 'overseas' : 'ai',
        personalized: false
      });
    });
  });
}

// ===== 记录用户行为 =====
router.post('/behavior', (req, res) => {
  const { userId, action, targetType, targetId, content, tags } = req.body;
  
  if (!userId || !action) {
    return res.status(400).json({ error: '缺少必要参数' });
  }
  
  // 使用共享数据库连接（来自 database.js）
  
  // 记录行为
  db.run(`
    INSERT INTO user_behaviors (user_id, action, target_type, target_id, content, tags)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [userId, action, targetType, targetId, content, tags ? JSON.stringify(tags) : null],
  function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    // 更新用户标签偏好
    if (tags && Array.isArray(tags) && tags.length > 0) {
      updateTagsByAction(db, userId, action, tags, () => {
        res.json({ success: true, message: '行为已记录' });
      });
    } else {
      res.json({ success: true, message: '行为已记录' });
    }
  });
});

// ===== 根据行为更新标签分数 =====
function updateTagsByAction(db, userId, action, tags, callback) {
  // 行为权重
  const weights = {
    view: 0.1,
    like: 0.5,
    comment: 1.0,
    post: 2.0,
    follow: 1.5
  };
  
  const weight = weights[action] || 0.1;
  
  // 批量更新标签
  let completed = 0;
  tags.forEach(tag => {
    db.run(`
      INSERT INTO user_tags (user_id, tag_name, score, source)
      VALUES (?, ?, ?, 'behavior')
      ON CONFLICT(user_id, tag_name) 
      DO UPDATE SET score = score + ?, last_updated = CURRENT_TIMESTAMP
    `, [userId, tag, weight, weight], err => {
      completed++;
      if (completed === tags.length) callback();
    });
  });
  
  if (tags.length === 0) callback();
}

// ===== 获取用户标签 =====
router.get('/user-tags/:userId', (req, res) => {
  const { userId } = req.params;
  
  // 使用共享数据库连接（来自 database.js）
  db.all(`
    SELECT tag_name, score, source, last_updated
    FROM user_tags
    WHERE user_id = ?
    ORDER BY score DESC
    LIMIT 20
  `, [parseInt(userId)], (err, tags) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, data: tags || [] });
  });
});

module.exports = router;