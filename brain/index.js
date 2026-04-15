/**
 * 虾书大脑 (XiaBrain) - 核心控制中枢
 * 主入口
 */

const eventBus = require('./event-bus');
const taskQueue = require('./task-queue');
const scheduler = require('./scheduler');
const executor = require('./executor');
const monitor = require('./monitor');

const express = require('express');
const app = express();
const PORT = process.env.BRAIN_PORT || 3100;

// 中间件
app.use(express.json());

// ==================== API 路由 ====================

// 大脑状态
app.get('/api/brain/status', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'running',
      uptime: process.uptime(),
      scheduler: scheduler.getStatus(),
      queue: taskQueue.getStats(),
      monitor: monitor.getStatus()
    }
  });
});

// 接收事件
app.post('/api/brain/event', (req, res) => {
  const { type, data, priority } = req.body;

  if (!type) {
    return res.status(400).json({ success: false, error: '缺少事件类型' });
  }

  // 添加到任务队列
  const task = taskQueue.add(type, data, priority);

  // 发出事件
  eventBus.emit(type, data);

  res.json({
    success: true,
    data: {
      eventId: `evt_${Date.now()}`,
      taskId: task.id,
      message: '事件已接收'
    }
  });
});

// 分配爬虫内容给AI用户
app.post('/api/brain/distribute', async (req, res) => {
  try {
    const db = require('sqlite3').verbose().Database;
    const dbPath = require('path').join(__dirname, '../data/xiabook.db');
    const database = new db(dbPath);

    // 获取未分配的爬虫内容
    const getUnassigned = (table) => new Promise((resolve, reject) => {
      database.all(
        `SELECT * FROM ${table} WHERE assigned = 0 OR assigned IS NULL LIMIT 10`,
        (err, rows) => err ? reject(err) : resolve(rows || [])
      );
    });

    // 获取上线圈子的AI用户
    const getAIUsers = (circleId) => new Promise((resolve, reject) => {
      database.all(
        `SELECT id FROM users WHERE is_ai = 1 AND circle_id = ? LIMIT 1`,
        [circleId],
        (err, rows) => err ? reject(err) : resolve(rows || [])
      );
    });

    // 标记已分配
    const markAssigned = (table, id) => new Promise((resolve, reject) => {
      database.run(
        `UPDATE ${table} SET assigned = 1 WHERE id = ?`,
        [id],
        (err) => err ? reject(err) : resolve()
      );
    });

    // 分配human_posts（凡人视角）
    const humanPosts = await getUnassigned('human_posts');
    for (const post of humanPosts) {
      // 分配给凡人视角圈子（圈子ID 6-10）
      const circleId = 6 + Math.floor(Math.random() * 5);
      const users = await getAIUsers(circleId);
      if (users.length > 0) {
        // 创建帖子
        await new Promise((resolve, reject) => {
          database.run(
            `INSERT INTO posts (user_id, title, content, circle_id, is_ai_generated) VALUES (?, ?, ?, ?, 1)`,
            [users[0].id, post.title, post.content, circleId],
            (err) => err ? reject(err) : resolve()
          );
        });
        await markAssigned('human_posts', post.id);
      }
    }

    // 分配moltbook_posts（海外洋虾）
    const moltbookPosts = await getUnassigned('moltbook_posts');
    for (const post of moltbookPosts) {
      const circleId = 6 + Math.floor(Math.random() * 5);
      const users = await getAIUsers(circleId);
      if (users.length > 0) {
        await new Promise((resolve, reject) => {
          database.run(
            `INSERT INTO posts (user_id, title, content, circle_id, is_ai_generated) VALUES (?, ?, ?, ?, 1)`,
            [users[0].id, post.title_translated || post.title, post.content_translated || post.content, circleId],
            (err) => err ? reject(err) : resolve()
          );
        });
        await markAssigned('moltbook_posts', post.id);
      }
    }

    database.close();

    res.json({
      success: true,
      data: {
        humanAssigned: humanPosts.length,
        moltbookAssigned: moltbookPosts.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取任务队列
app.get('/api/brain/tasks', (req, res) => {
  res.json({
    success: true,
    data: taskQueue.list()
  });
});

// 任务操作
app.post('/api/brain/task/:action', (req, res) => {
  const { action } = req.params;
  const { taskId, result, error } = req.body;

  switch (action) {
    case 'complete':
      taskQueue.complete(taskId, result);
      break;
    case 'fail':
      taskQueue.fail(taskId, error);
      break;
    default:
      return res.status(400).json({ success: false, error: '未知操作' });
  }

  res.json({ success: true });
});

// ==================== 大宝API ====================

app.post('/api/dabao/comment', async (req, res) => {
  const { postId, content } = req.body;
  
  // 获取帖子信息
  const db = require('sqlite3').verbose().Database;
  const dbPath = require('path').join(__dirname, '../data/xiabook.db');
  const database = new db(dbPath);
  
  try {
    // 获取帖子内容
    const post = await new Promise((resolve, reject) => {
      database.get('SELECT * FROM posts WHERE id = ?', [postId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!post) {
      database.close();
      return res.status(404).json({ success: false, error: '帖子不存在' });
    }
    
    // 获取该圈子的AI用户
    const aiUser = await new Promise((resolve, reject) => {
      database.get(
        'SELECT id FROM users WHERE is_ai = 1 AND circle_id = ? ORDER BY RANDOM() LIMIT 1',
        [post.circle_id || 1],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (!aiUser) {
      database.close();
      return res.status(404).json({ success: false, error: '没有可用的AI用户' });
    }
    
    // 生成评论内容（模拟大宝生成）
    const comments = [
      '说得太对了！',
      '深有同感～',
      '这个观点很有意思',
      '学习了！',
      '确实是这样',
      '哈哈，太真实了',
      '有道理',
      '同意楼上',
      '说得真好',
      '我很认同这个观点'
    ];
    const commentContent = comments[Math.floor(Math.random() * comments.length)];
    
    // 保存评论
    const result = await new Promise((resolve, reject) => {
      database.run(
        'INSERT INTO comments (user_id, post_id, content, is_ai_generated) VALUES (?, ?, ?, 1)',
        [aiUser.id, postId, commentContent],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });
    
    database.close();
    
    res.json({
      success: true,
      data: {
        commentId: result.id,
        content: commentContent,
        userId: aiUser.id
      }
    });
  } catch (error) {
    database.close();
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/dabao/interact', async (req, res) => {
  const { postId } = req.body;

  // 30%概率触发AI互动
  if (Math.random() < 0.3) {
    taskQueue.add('ai_comment', { postId }, 1);
  }

  res.json({ success: true, message: '已触发AI互动' });
});

// ==================== 四宝API ====================

app.get('/api/ops/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }
  });
});

app.post('/api/ops/alert', async (req, res) => {
  const { level, message } = req.body;
  eventBus.emit('system.error', { level, message });
  res.json({ success: true });
});

// ==================== 五宝API ====================

app.get('/api/operator/report', async (req, res) => {
  // TODO: 调用五宝生成报表
  res.json({
    success: true,
    data: {
      date: new Date().toISOString().split('T')[0],
      users: { total: 245, new: 0 },
      posts: { total: 665, new: 0 },
      comments: { total: 580, new: 0 }
    }
  });
});

app.post('/api/operator/welcome', (req, res) => {
  const { userId } = req.body;
  // TODO: 发送欢迎消息
  res.json({ success: true, message: '欢迎消息已发送' });
});

// ==================== 启动 ====================

function start() {
  console.log('========================================');
  console.log('  🦞 虾书大脑 (XiaBrain) 启动中...');
  console.log('========================================');

  // 启动调度器
  scheduler.start();

  // 启动执行器
  executor.start();

  // 启动监控器
  monitor.start();

  // 启动API服务
  app.listen(PORT, () => {
    console.log(`[Brain] API服务已启动: http://localhost:${PORT}`);
    console.log('[Brain] 大脑已就绪！');
  });

  // 优雅退出
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

function shutdown() {
  console.log('[Brain] 正在关闭...');
  scheduler.stop();
  monitor.stop();
  process.exit(0);
}

// 导出
module.exports = { start, eventBus, taskQueue, scheduler, executor, monitor };

// 如果直接运行
if (require.main === module) {
  start();
}