#!/usr/bin/env node

/**
 * Moltbook内容同步脚本
 * 功能：从Moltbook API获取最新内容并同步到本地数据库
 * 执行频率：每天凌晨2点（通过cron触发）
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// 配置
const DB_PATH = path.join(__dirname, '../../data/xiabook.db');
const LOG_FILE = path.join(__dirname, '../../logs/moltbook_sync.log');
const BATCH_SIZE = 50;

// 初始化日志
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(logMessage);
  fs.appendFileSync(LOG_FILE, logMessage);
}

// 获取数据库连接
function getDb() {
  return new sqlite3.Database(DB_PATH);
}

// 模拟从Moltbook API获取数据（实际应替换为真实API调用）
async function fetchMoltbookData(lastSyncTime) {
  // TODO: 实现真实的Moltbook API调用
  // 这里仅模拟返回空数组，表示没有新数据
  log('模拟从Moltbook API获取数据...');
  return [];
}

// 检查内容是否已存在（通过content_hash）
function checkExists(db, contentHash) {
  return new Promise((resolve, reject) => {
    db.get('SELECT id FROM moltbook_posts WHERE content_hash = ?', [contentHash], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(!!row);
      }
    });
  });
}

// 插入新内容
function insertPost(db, post) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO moltbook_posts (
        title, content, author, original_url, view_count, like_count, 
        comment_count, share_count, tags, created_at, type, quality_score,
        original_id, translated_title, translated_content, content_hash,
        translated_at, assigned, translated, score, submolt_name,
        author_description, upvotes, is_duplicate, is_published
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run([
      post.title || '',
      post.content || '',
      post.author || '',
      post.original_url || '',
      post.view_count || 0,
      post.like_count || 0,
      post.comment_count || 0,
      post.share_count || 0,
      post.tags || '',
      post.created_at || new Date().toISOString(),
      post.type || 'featured',
      post.quality_score || 0,
      post.original_id || '',
      post.translated_title || '',
      post.translated_content || '',
      post.content_hash || '',
      post.translated_at || null,
      post.assigned || 0,
      post.translated || 0,
      post.score || 0,
      post.submolt_name || '',
      post.author_description || '',
      post.upvotes || 0,
      post.is_duplicate || 0,
      post.is_published || 0
    ], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.lastID);
      }
    });
    
    stmt.finalize();
  });
}

// 主同步函数
async function syncMoltbook() {
  log('开始Moltbook内容同步...');
  
  try {
    // 获取最后同步时间
    const db = getDb();
    let lastSyncTime = '1970-01-01 00:00:00';
    
    const lastSyncRow = await new Promise((resolve, reject) => {
      db.get('SELECT MAX(created_at) as last_sync FROM moltbook_posts', (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
    
    if (lastSyncRow && lastSyncRow.last_sync) {
      lastSyncTime = lastSyncRow.last_sync;
    }
    
    log(`最后同步时间: ${lastSyncTime}`);
    
    // 获取新数据
    const newData = await fetchMoltbookData(lastSyncTime);
    log(`获取到 ${newData.length} 条新数据`);
    
    if (newData.length === 0) {
      log('没有新数据需要同步');
      db.close();
      return;
    }
    
    // 处理新数据
    let insertedCount = 0;
    for (const post of newData) {
      // 检查是否已存在
      const exists = await checkExists(db, post.content_hash);
      if (exists) {
        log(`内容已存在，跳过: ${post.original_id}`);
        continue;
      }
      
      // 插入新内容
      try {
        await insertPost(db, post);
        insertedCount++;
        log(`插入新内容: ${post.original_id}`);
      } catch (err) {
        log(`插入失败: ${post.original_id}, 错误: ${err.message}`);
      }
    }
    
    log(`同步完成，共插入 ${insertedCount} 条新内容`);
    db.close();
  } catch (error) {
    log(`同步失败: ${error.message}`);
    console.error(error);
  }
}

// 执行同步
syncMoltbook();