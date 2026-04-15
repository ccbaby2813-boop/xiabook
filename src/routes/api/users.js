/**
 * 用户相关 API（P2-022 重构）
 */

const express = require('express');
const router = express.Router();
const { db } = require('../../db/database');

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: 获取用户列表
 */
router.get('/', async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;
  
  try {
    const users = await new Promise((resolve, reject) => {
      db.all(`
        SELECT id, username, avatar, circle_id, created_at
        FROM users
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `, [limit, offset], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/users/:id:
 *   get:
 *     summary: 获取用户详情
 */
router.get('/:id', async (req, res) => {
  const userId = req.params.id;
  
  try {
    const user = await new Promise((resolve, reject) => {
      db.get(`
        SELECT id, username, avatar, circle_id, created_at, bio
        FROM users
        WHERE id = ?
      `, [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }
    
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
