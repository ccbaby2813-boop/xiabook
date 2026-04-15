#!/usr/bin/env node
/**
 * 智能内容生成器 - 结果发布脚本
 * 
 * 功能：
 * 1. 检查缓存文件中 status="done" 的任务
 * 2. 发布到数据库
 * 3. 更新 published 计数
 * 4. 清理已完成的缓存文件
 * 
 * 不调用外部 API，只写本地数据库
 * 
 * @author 陈小宝
 * @date 2026-03-30
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../data/xiabook.db');
const CACHE_DIR = path.join(__dirname, '../cache');
const db = new sqlite3.Database(DB_PATH);

/**
 * 读取缓存文件
 */
function readCache(batchId) {
  const filePath = path.join(CACHE_DIR, `${batchId}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * 保存缓存文件
 */
function saveCache(cache) {
  const filePath = path.join(CACHE_DIR, `${cache.batchId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(cache, null, 2));
}

/**
 * 删除缓存文件
 */
function deleteCache(batchId) {
  const filePath = path.join(CACHE_DIR, `${batchId}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`[清理] 缓存文件已删除: ${batchId}`);
  }
}

/**
 * 检查标题是否已存在（去重）
 */
async function checkDuplicate(title) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT id FROM posts WHERE title = ? AND created_at > date("now", "-1 day")',
      [title],
      (err, row) => err ? reject(err) : resolve(!!row)
    );
  });
}

/**
 * 发布帖子
 */
async function publishPost(userId, circleId, title, content) {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO posts (user_id, circle_id, title, content, category, heat_score, is_published, created_at)
       VALUES (?, ?, ?, ?, 'AI视角', 2000, 1, ?)`,
      [userId, circleId, title, content, now],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

/**
 * 发布评论
 */
async function publishComment(userId, postId, content) {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.run(
      'INSERT INTO comments (post_id, user_id, content, created_at) VALUES (?, ?, ?, ?)',
      [postId, userId, content, now],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

/**
 * 更新帖子评论数和热度
 */
async function updatePostCommentCount(postId) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE posts SET 
        comment_count = (SELECT COUNT(*) FROM comments WHERE post_id = ?),
        heat_score = COALESCE(heat_score, 0) + 10
      WHERE id = ?`,
      [postId, postId],
      (err) => err ? reject(err) : resolve()
    );
  });
}

/**
 * 主函数
 */
async function run(batchId) {
  console.log(`\n[智能内容生成器 - 结果发布] 批次: ${batchId}\n`);
  
  try {
    // 读取缓存
    const cache = readCache(batchId);
    if (!cache) {
      console.log(`[错误] 缓存文件不存在: ${batchId}`);
      return { success: false, error: '缓存文件不存在' };
    }
    
    // 查找已完成但未发布的任务
    const doneItems = cache.items.filter(i => i.status === 'done' && !i.publishedId);
    console.log(`[信息] 找到 ${doneItems.length} 条待发布任务`);
    
    if (doneItems.length === 0) {
      console.log('[完成] 没有待发布任务');
      return { success: true, published: 0, total: cache.total };
    }
    
    let published = 0, skipped = 0, errors = 0;
    
    for (const item of doneItems) {
      console.log(`[${published + skipped + errors + 1}/${doneItems.length}] ${item.username}`);
      
      try {
        if (cache.taskType === 'posts') {
          // 发帖 - 兼容 title/content 和 postTitle/postContent
          const title = item.title || item.postTitle;
          const content = item.content || item.postContent;
          
          if (!title || !content) {
            console.log(`  ⚠️ 内容缺失，跳过`);
            skipped++;
            item.status = 'failed';
            continue;
          }
          
          // 去重检查
          const isDuplicate = await checkDuplicate(title);
          if (isDuplicate) {
            console.log(`  ⏭️ 标题已存在，跳过`);
            skipped++;
            item.status = 'skipped';
            continue;
          }
          
          const postId = await publishPost(item.userId, item.circleId, title, content);
          item.publishedId = postId;
          console.log(`  ✅ 发帖成功: "${title.substring(0, 30)}..."`);
          published++;
          
        } else if (cache.taskType === 'comments') {
          // 评论
          if (!item.generatedComment) {
            console.log(`  ⚠️ 评论内容缺失，跳过`);
            skipped++;
            item.status = 'failed';
            continue;
          }
          
          const commentId = await publishComment(item.userId, item.postId, item.generatedComment);
          await updatePostCommentCount(item.postId);
          item.publishedId = commentId;
          console.log(`  ✅ 评论成功: "${item.generatedComment.substring(0, 20)}..."`);
          published++;
        }
        
      } catch (error) {
        console.log(`  ❌ 发布失败: ${error.message}`);
        errors++;
        item.status = 'failed';
      }
    }
    
    // 更新缓存
    cache.published += published;
    saveCache(cache);
    
    console.log(`\n[批次完成] 发布: ${published}, 跳过: ${skipped}, 错误: ${errors}`);
    
    // 如果全部完成且发布，删除缓存文件
    const allDone = cache.items.every(i => 
      i.status === 'done' && i.publishedId || 
      i.status === 'skipped' || 
      i.status === 'failed'
    );
    
    if (allDone) {
      deleteCache(cache.batchId);
      console.log(`[清理] 任务全部完成，缓存已删除`);
    }
    
    return { success: true, published, skipped, errors, total: cache.total };
    
  } catch (error) {
    console.error(`[错误]`, error.message);
    return { success: false, error: error.message };
  } finally {
    db.close();
  }
}

/**
 * 发布所有待处理的缓存
 */
async function publishAllPending() {
  console.log('\n[智能内容生成器 - 扫描所有待发布缓存]\n');
  
  if (!fs.existsSync(CACHE_DIR)) {
    console.log('[完成] 缓存目录不存在');
    return { success: true, batches: 0 };
  }
  
  const files = fs.readdirSync(CACHE_DIR)
    .filter(f => f.startsWith('smart-') && f.endsWith('.json'));
  
  if (files.length === 0) {
    console.log('[完成] 没有缓存文件');
    return { success: true, batches: 0 };
  }
  
  console.log(`[信息] 找到 ${files.length} 个缓存文件`);
  
  const results = [];
  for (const file of files) {
    const batchId = file.replace('.json', '');
    const cache = readCache(batchId);
    
    const doneNotPublished = cache.items.filter(i => i.status === 'done' && !i.publishedId).length;
    if (doneNotPublished > 0) {
      console.log(`\n--- 处理: ${batchId} (${doneNotPublished} 条待发布) ---`);
      const result = await run(batchId);
      results.push({ batchId, ...result });
    }
  }
  
  return { success: true, batches: results.length, results };
}

// 命令行执行
if (require.main === module) {
  const args = process.argv.slice(2);
  let batchId = null;
  let all = false;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--batch' && args[i + 1]) {
      batchId = args[i + 1];
      i++;
    }
    if (args[i] === '--all') {
      all = true;
    }
  }
  
  if (all) {
    publishAllPending().then(result => {
      console.log('\n=== 最终结果 ===');
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    });
  } else if (batchId) {
    run(batchId).then(result => {
      console.log('\n=== 最终结果 ===');
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    });
  } else {
    console.log('[用法] node smart_publish_results.js --batch <batchId>');
    console.log('[用法] node smart_publish_results.js --all');
    process.exit(1);
  }
}

module.exports = { run, publishAllPending, readCache, saveCache, deleteCache };