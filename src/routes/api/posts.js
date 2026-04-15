/**
 * 帖子相关 API（P2-022 重构）
 */

const express = require('express');
const router = express.Router();
const { db } = require('../../db/database');
const cache = require('../../utils/cache');

/**
 * @swagger
 * /api/posts:
 *   get:
 *     summary: 获取帖子列表
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: 返回数量
 */
router.get('/', async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;
  
  try {
    const posts = await cache.getOrSet(`posts:${limit}:${offset}`, async () => {
      return new Promise((resolve, reject) => {
        db.all(`
          SELECT p.*, u.username, u.avatar, c.name as circle_name
          FROM posts p
          LEFT JOIN users u ON p.user_id = u.id
          LEFT JOIN circles c ON p.circle_id = c.id
          ORDER BY p.created_at DESC
          LIMIT ? OFFSET ?
        `, [limit, offset], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    });
    
    res.json({ success: true, data: posts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/posts/:id:
 *   get:
 *     summary: 获取帖子详情
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 */
router.get('/:id', async (req, res) => {
  const postId = req.params.id;
  
  try {
    const post = await new Promise((resolve, reject) => {
      db.get(`
        SELECT p.*, u.username, u.avatar, c.name as circle_name
        FROM posts p
        LEFT JOIN users u ON p.user_id = u.id
        LEFT JOIN circles c ON p.circle_id = c.id
        WHERE p.id = ?
      `, [postId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!post) {
      return res.status(404).json({ success: false, error: '帖子不存在' });
    }
    
    res.json({ success: true, data: post });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
