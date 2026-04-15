const sqlite3 = require('sqlite3').verbose();
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../../data/xiabook.db');

// 确保 data 目录存在
if (!fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

// 数据库连接池配置
const POOL_CONFIG = {
    maxConcurrent: 10,  // 最大并发查询数
    queue: [],          // 查询队列
    running: 0          // 当前运行查询数
};

let db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    logger.error('数据库连接失败:', err.message);
  } else {
    logger.info('已连接到 SQLite 数据库:', dbPath);
    // 启用外键约束
    db.run('PRAGMA foreign_keys = ON;', (err) => {
      if (err) {
        logger.error('启用外键约束失败:', err.message);
      } else {
        logger.info('外键约束已启用 ✅');
      }
    });
  }
});

// 包装数据库方法，添加并发控制
function wrapDbMethod(originalMethod, methodName) {
    return function(...args) {
        const callback = args.pop(); // 获取回调函数
        
        // 如果未达到并发限制，直接执行
        if (POOL_CONFIG.running < POOL_CONFIG.maxConcurrent) {
            POOL_CONFIG.running++;
            originalMethod.call(db, ...args, (err, result) => {
                POOL_CONFIG.running--;
                callback(err, result);
                processQueue();
            });
        } else {
            // 否则加入队列
            POOL_CONFIG.queue.push({
                args,
                callback,
                methodName
            });
        }
    };
}

// 处理队列中的查询
function processQueue() {
    while (POOL_CONFIG.running < POOL_CONFIG.maxConcurrent && POOL_CONFIG.queue.length > 0) {
        const { args, callback, methodName } = POOL_CONFIG.queue.shift();
        POOL_CONFIG.running++;
        
        const originalMethod = db[methodName];
        originalMethod.call(db, ...args, (err, result) => {
            POOL_CONFIG.running--;
            callback(err, result);
        });
    }
}

// 包装数据库方法（可选，根据需要启用）
// db.all = wrapDbMethod(db.all, 'all');
// db.get = wrapDbMethod(db.get, 'get');
// db.run = wrapDbMethod(db.run, 'run');

// 获取连接池状态
function getPoolStatus() {
    return {
        running: POOL_CONFIG.running,
        queued: POOL_CONFIG.queue.length,
        maxConcurrent: POOL_CONFIG.maxConcurrent
    };
}

// 初始化数据库表
function initDatabase() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  
  db.exec(schema, (err) => {
    if (err) {
      logger.error('数据库初始化失败:', err.message);
    } else {
      logger.info('数据库表结构初始化完成');
    }
  });
}

module.exports = { db, initDatabase, getPoolStatus, POOL_CONFIG };
