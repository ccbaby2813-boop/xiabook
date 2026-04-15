/**
 * 虾书完整API路由
 */

const express = require('express');
const router = express.Router();
const { db } = require('../db/database');

// 搜索API
router.get('/search', (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 1) {
    return res.json({ success: false, error: 'Search query required' });
  }
  
  const results = [];
  const searchTerm = `%${q}%`;
  
  db.all(`
    SELECT p.id, p.title, p.content, u.username
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.title LIKE ? OR p.content LIKE ?
    LIMIT 10
  `, [searchTerm, searchTerm], (err, posts) => {
    if (err) {
      logger.error('Search posts error:', err);
      return res.json({ success: false, error: 'Search failed' });
    }
    
    posts.forEach(post => {
      results.push({
        type: 'post',
        id: post.id,
        title: post.title,
        subtitle: post.username
      });
    });
    
    db.all(`
      SELECT id, username, avatar
      FROM users
      WHERE username LIKE ?
      LIMIT 5
    `, [searchTerm], (err, users) => {
      if (err) {
        logger.error('Search users error:', err);
      } else {
        users.forEach(user => {
          results.push({
            type: 'user',
            id: user.id,
            title: user.username,
            subtitle: 'User'
          });
        });
      }
      
      res.json({ success: true, data: results });
    });
  });
});

// 用户详情API
router.get('/users/:id', (req, res) => {
  const userId = req.params.id;
  
  db.get(`
    SELECT u.*, c.name as circle_name
    FROM users u
    LEFT JOIN circles c ON u.circle_id = c.id
    WHERE u.id = ?
  `, [userId], (err, user) => {
    if (err) {
      logger.error('Get user error:', err);
      return res.json({ success: false, error: 'Failed' });
    }
    
    if (!user) {
      return res.json({ success: false, error: 'User not found' });
    }
    
    db.get(`
      SELECT 
        (SELECT COUNT(*) FROM posts WHERE user_id = ?) as post_count,
        (SELECT COUNT(*) FROM likes WHERE post_id IN (SELECT id FROM posts WHERE user_id = ?)) as like_received
    `, [userId, userId], (err, stats) => {
      res.json({
        success: true,
        data: {
          id: user.id,
          username: user.username,
          avatar: user.avatar,
          level: user.level || 1,
          points: user.points || 0,
          circle_name: user.circle_name,
          post_count: stats?.post_count || 0,
          like_received: stats?.like_received || 0,
          created_at: user.created_at,
          is_ai: user.is_ai
        }
      });
    });
  });
});

// 帖子详情API
router.get('/posts/:id', (req, res) => {
  const postId = req.params.id;
  
  db.get(`
    SELECT p.*, u.username, u.avatar
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.id = ?
  `, [postId], (err, post) => {
    if (err) {
      logger.error('Get post error:', err);
      return res.json({ success: false, error: 'Failed' });
    }
    
    if (!post) {
      return res.json({ success: false, error: 'Post not found' });
    }
    
    db.all(`
      SELECT c.*, u.username, u.avatar
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.post_id = ?
      ORDER BY c.created_at DESC
      LIMIT 20
    `, [postId], (err, comments) => {
      res.json({
        success: true,
        data: {
          id: post.id,
          title: post.title,
          content: post.content,
          username: post.username,
          avatar: post.avatar,
          like_count: post.like_count || 0,
          comment_count: post.comment_count || 0,
          view_count: post.view_count || 0,
          created_at: post.created_at,
          comments: comments || []
        }
      });
    });
  });
});

// 点赞API
router.post('/posts/:id/like', (req, res) => {
  const postId = req.params.id;
  // Simplified - no auth check for now
  res.json({ success: true, liked: true, message: 'Liked' });
});

// 增加浏览数
router.post('/posts/:id/view', (req, res) => {
  const postId = req.params.id;
  db.run('UPDATE posts SET view_count = view_count + 1 WHERE id = ?', [postId]);
  res.json({ success: true });
});

// 虾星榜
router.get('/leaderboard', (req, res) => {
  db.all(`
    SELECT id, username, avatar, points, level
    FROM users
    ORDER BY points DESC
    LIMIT 20
  `, [], (err, rows) => {
    if (err) {
      return res.json({ success: false, error: 'Failed' });
    }
    res.json({ success: true, data: rows });
  });
});

// 圈子成员
router.get('/circles/:id/members', (req, res) => {
  const circleId = req.params.id;
  db.all(`
    SELECT id, username, avatar, level, points
    FROM users
    WHERE circle_id = ?
    ORDER BY points DESC
    LIMIT 50
  `, [circleId], (err, rows) => {
    if (err) {
      return res.json({ success: false, error: 'Failed' });
    }
    res.json({ success: true, data: rows });
  });
});

// 领域圈子
router.get('/domains/:domain/circles', (req, res) => {
  const domain = req.params.domain;
  db.all(`
    SELECT c.*, COUNT(u.id) as user_count
    FROM circles c
    LEFT JOIN users u ON c.id = u.circle_id
    WHERE c.domain = ?
    GROUP BY c.id
    ORDER BY c.status DESC
  `, [domain], (err, rows) => {
    if (err) {
      return res.json({ success: false, error: 'Failed' });
    }
    res.json({ success: true, data: rows });
  });
});

module.exports = router;
