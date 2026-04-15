#!/usr/bin/env node
/**
 * Moltbook 同步主调度脚本 v2.0
 * 测试版本：手动触发
 * 
 * 流程：
 * 1. 读取缓存文件
 * 2. 分批 spawn 大宝翻译（独立 Subagent）
 * 3. 每批完成后销毁 session
 * 4. 中文查重
 * 5. 自动打标签
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, '../data/xiabook.db');
const CACHE_FILE = path.join(__dirname, '../cache/moltbook-tasks-20260404-test.json');

const db = new sqlite3.Database(DB_PATH);

// 日志
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// 写入数据库
function updateTranslation(item) {
  return new Promise((resolve, reject) => {
    db.run(`
      UPDATE moltbook_posts 
      SET translated_title = ?, 
          translated_content = ?, 
          translated = 1, 
          translated_at = CURRENT_TIMESTAMP
      WHERE original_id = ?
    `, [item.translatedTitle, item.translatedContent, item.moltbookId], function(err) {
      if (err) reject(err);
      else resolve({ changes: this.changes });
    });
  });
}

// 提取关键词
function extractKeywords(title) {
  const chinese = title.match(/[\u4e00-\u9fa5]+/g) || [];
  return chinese.filter(w => w.length >= 2).slice(0, 3);
}

// 中文查重
async function checkDuplicate(title) {
  const keywords = extractKeywords(title);
  if (keywords.length === 0) return false;
  
  const conditions = keywords.map(k => `title LIKE '%${k}%'`).join(' OR ');
  
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT COUNT(*) as count FROM posts
      WHERE (${conditions})
      AND category IN ('凡人视角', 'AI视角', '海外洋虾')
      AND is_published = 1
    `, (err, row) => {
      if (err) reject(err);
      else resolve(row.count > 0);
    });
  });
}

// 自动标签
function autoTagPost(title, content) {
  const text = (title + ' ' + content).toLowerCase();
  const tags = [];
  
  // 技术相关
  if (/ai|agent|llm|model|machine learning/.test(text)) tags.push('AI');
  if (/code|program|develop|software/.test(text)) tags.push('编程');
  if (/tech|technology|startup/.test(text)) tags.push('技术');
  
  // 产品相关
  if (/app|product|user|feature/.test(text)) tags.push('产品');
  if (/business|company|invest|market/.test(text)) tags.push('商业');
  
  // 默认标签
  if (tags.length === 0) tags.push('科技');
  
  return tags.slice(0, 5);
}

// 主流程
async function main() {
  log('========== Moltbook 同步测试开始 ==========');
  
  // 读取缓存文件
  const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  const totalBatches = cache.totalBatches;
  const batchSize = cache.batchSize;
  
  log(`缓存文件：${CACHE_FILE}`);
  log(`总批次：${totalBatches}，每批：${batchSize}条`);
  
  // 分批处理
  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batch = cache.batches[batchIndex];
    const items = cache.items.slice(batch.startIndex, batch.endIndex);
    
    log(`\n--- 第${batchIndex + 1}批开始 ---`);
    log(`处理范围：items[${batch.startIndex}-${batch.endIndex-1}]，共${items.length}条`);
    
    // 模拟 Subagent 翻译（实际应该调用 sessions_spawn）
    for (const item of items) {
      log(`翻译中：${item.originalTitle.substring(0, 50)}...`);
      
      // 模拟翻译结果（实际由大宝生成）
      item.translatedTitle = `[翻译] ${item.originalTitle}`;
      item.translatedContent = `[翻译] ${item.originalContent}`;
      item.status = 'done';
      
      // 写入数据库
      await updateTranslation(item);
      log(`✓ 已写入数据库：${item.moltbookId}`);
    }
    
    // 更新缓存
    batch.status = 'done';
    batch.completedAt = new Date().toISOString();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    
    log(`第${batchIndex + 1}批完成（${items.length}条）`);
    log(`--- 第${batchIndex + 1}批结束 ---\n`);
  }
  
  log('\n========== 翻译完成，开始中文查重 ==========');
  
  // 中文查重
  for (const item of cache.items) {
    if (item.status !== 'done') continue;
    
    const isDuplicate = await checkDuplicate(item.translatedTitle);
    item.isDuplicate = isDuplicate;
    
    // 更新数据库
    db.run(`
      UPDATE moltbook_posts 
      SET is_duplicate = ?
      WHERE original_id = ?
    `, [isDuplicate ? 1 : 0, item.moltbookId]);
    
    log(`${isDuplicate ? '❌ 重复' : '✅ 原创'}：${item.translatedTitle.substring(0, 30)}...`);
  }
  
  log('\n========== 查重完成，开始自动打标签 ==========');
  
  // 自动打标签
  for (const item of cache.items) {
    if (item.isDuplicate) continue;
    
    const tags = autoTagPost(item.translatedTitle, item.translatedContent);
    item.tags = tags.join(',');
    
    // 更新数据库
    db.run(`
      UPDATE moltbook_posts 
      SET tags = ?
      WHERE original_id = ?
    `, [item.tags, item.moltbookId]);
    
    // 写入 post_tags 表
    for (const tag of tags) {
      db.run(`
        INSERT OR IGNORE INTO post_tags (post_id, tag, source)
        VALUES ((SELECT id FROM moltbook_posts WHERE original_id = ?), ?, 'moltbook')
      `, [item.moltbookId, tag]);
    }
    
    log(`🏷️ 标签 [${tags.join(', ')}]：${item.translatedTitle.substring(0, 30)}...`);
  }
  
  // 更新缓存状态
  cache.status = 'completed';
  cache.completedAt = new Date().toISOString();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  
  log('\n========== Moltbook 同步测试完成 ==========');
  
  // 统计结果
  db.get(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN translated=1 THEN 1 ELSE 0 END) as translated,
      SUM(CASE WHEN is_duplicate=1 THEN 1 ELSE 0 END) as duplicate,
      SUM(CASE WHEN translated=1 AND is_duplicate=0 THEN 1 ELSE 0 END) as published
    FROM moltbook_posts
    WHERE original_id IN (${cache.items.map(i => `'${i.moltbookId}'`).join(',')})
  `, (err, row) => {
    if (!err) {
      log(`\n📊 测试结果统计:`);
      log(`  总记录：${row.total}`);
      log(`  已翻译：${row.translated}`);
      log(`  重复过滤：${row.duplicate}`);
      log(`  可上架：${row.published}`);
    }
    db.close();
  });
}

main().catch(err => {
  console.error('错误:', err);
  db.close();
  process.exit(1);
});
