const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { db } = require('../db/database');

// 创建反馈表（如果不存在）
function ensureFeedbackTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      contact TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_read INTEGER DEFAULT 0
    )
  `;
  db.run(sql, (err) => {
    if (err) {
      logger.error('创建feedback表失败:', err);
    } else {
      logger.info('Feedback表已准备就绪');
    }
  });
}

// 初始化反馈表
ensureFeedbackTable();

// 提交反馈
router.post('/', (req, res) => {
  const { content, contact } = req.body;
  
  if (!content || content.trim().length === 0) {
    return res.status(400).json({ success: false, error: '反馈内容不能为空' });
  }
  
  if (content.length > 1000) {
    return res.status(400).json({ success: false, error: '反馈内容不能超过1000字符' });
  }
  
  if (contact && contact.length > 100) {
    return res.status(400).json({ success: false, error: '联系方式不能超过100字符' });
  }
  
  // 插入反馈
  db.run(
    'INSERT INTO feedback (content, contact) VALUES (?, ?)',
    [content.trim(), contact ? contact.trim() : null],
    function(err) {
      if (err) {
        logger.error('插入反馈失败:', err);
        return res.status(500).json({ success: false, error: '提交失败' });
      }
      
      res.json({ 
        success: true, 
        message: '反馈已提交，感谢您的宝贵意见！',
        data: { id: this.lastID }
      });
    }
  );
});

// 获取反馈列表（仅限管理员）
router.get('/', (req, res) => {
  const { page = 1, limit = 20, status = 'all' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  
  let whereClause = '';
  let params = [];
  
  if (status === 'unread') {
    whereClause = 'WHERE is_read = 0';
  } else if (status === 'read') {
    whereClause = 'WHERE is_read = 1';
  }
  
  // 获取总数
  db.get(
    `SELECT COUNT(*) as total FROM feedback ${whereClause}`,
    params,
    (err, countRow) => {
      if (err) {
        logger.error('查询反馈总数失败:', err);
        return res.status(500).json({ success: false, error: '查询失败' });
      }
      
      // 获取反馈列表
      db.all(
        `SELECT id, content, contact, created_at, is_read 
         FROM feedback 
         ${whereClause}
         ORDER BY created_at DESC 
         LIMIT ? OFFSET ?`,
        [...params, parseInt(limit), offset],
        (err, rows) => {
          if (err) {
            logger.error('查询反馈列表失败:', err);
            return res.status(500).json({ success: false, error: '查询失败' });
          }
          
          res.json({
            success: true,
            data: {
              items: rows,
              pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countRow.total,
                totalPages: Math.ceil(countRow.total / parseInt(limit))
              }
            }
          });
        }
      );
    }
  );
});

// 标记反馈为已读
router.patch('/:id/read', (req, res) => {
  const id = req.params.id;
  
  db.run(
    'UPDATE feedback SET is_read = 1 WHERE id = ?',
    [id],
    function(err) {
      if (err) {
        logger.error('更新反馈状态失败:', err);
        return res.status(500).json({ success: false, error: '更新失败' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ success: false, error: '反馈不存在' });
      }
      
      res.json({ success: true, message: '已标记为已读' });
    }
  );
});

// 删除反馈
router.delete('/:id', (req, res) => {
  const id = req.params.id;
  
  db.run(
    'DELETE FROM feedback WHERE id = ?',
    [id],
    function(err) {
      if (err) {
        logger.error('删除反馈失败:', err);
        return res.status(500).json({ success: false, error: '删除失败' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ success: false, error: '反馈不存在' });
      }
      
      res.json({ success: true, message: '删除成功' });
    }
  );
});

module.exports = router;