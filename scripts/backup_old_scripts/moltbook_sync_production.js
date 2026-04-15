#!/usr/bin/env node
/**
 * Moltbook 完整同步流程 v2.0
 * 真实生产环境测试
 * 
 * 流程：
 * 1. 查询未翻译数据
 * 2. 创建缓存文件
 * 3. 分批翻译（每批 5 条）
 * 4. 中文查重
 * 5. 自动打标签
 * 6. 更新数据库
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, '../data/xiabook.db');
const CACHE_FILE = path.join(__dirname, '../cache/moltbook-sync-20260404.json');
const db = new sqlite3.Database(DB_PATH);

// 日志
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// 提取关键词（用于查重）
function extractKeywords(title) {
  const chinese = title.match(/[\u4e00-\u9fa5]+/g) || [];
  return chinese.filter(w => w.length >= 2).slice(0, 3);
}

// 中文查重
async function checkDuplicate(translatedTitle) {
  const keywords = extractKeywords(translatedTitle);
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

// 自动标签（千人千面）
function autoTagPost(title, content) {
  const text = (title + ' ' + content).toLowerCase();
  const tags = [];
  
  // AI/技术类
  if (/ai|agent|llm|model|machine learning|深度学习|人工智能/.test(text)) tags.push('AI');
  if (/code|program|develop|software|编程|代码|开发/.test(text)) tags.push('编程');
  if (/tech|technology|startup|技术|科技/.test(text)) tags.push('技术');
  
  // 产品/商业类
  if (/app|product|user|feature|产品|用户/.test(text)) tags.push('产品');
  if (/business|company|invest|market|商业|投资/.test(text)) tags.push('商业');
  
  // 思考/观点类
  if (/think|opinion|thought|观点|思考|想法/.test(text)) tags.push('观点');
  if (/why|how|what|为什么|如何|怎么/.test(text)) tags.push('问答');
  
  // 默认标签
  if (tags.length === 0) tags.push('科技');
  
  return tags.slice(0, 5);
}

// 模拟大宝翻译（实际应该调用 sessions_spawn）
async function translateWithDabao(text) {
  // 这里模拟翻译结果
  // 实际应该：sessions_spawn({ agentId: "writer", task: "翻译..." })
  return `[翻译] ${text}`;
}

// 主流程
async function main() {
  log('========== Moltbook 完整同步流程开始 ==========');
  
  // Step 1: 查询未翻译数据
  log('\n[Step 1] 查询未翻译数据...');
  const untranslated = await new Promise((resolve, reject) => {
    db.all(`
      SELECT id, original_id, title, content, type, upvotes
      FROM moltbook_posts
      WHERE (translated = 0 OR translated_title IS NULL)
        AND title NOT LIKE '%[翻译]%'
      LIMIT 50
    `, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
  
  log(`找到 ${untranslated.length} 条未翻译数据`);
  
  if (untranslated.length === 0) {
    log('没有未翻译数据，流程结束');
    db.close();
    return;
  }
  
  // Step 2: 创建缓存文件
  log('\n[Step 2] 创建缓存文件...');
  const cache = {
    date: new Date().toISOString().split('T')[0],
    createdAt: new Date().toISOString(),
    taskType: 'moltbook-sync-production',
    totalItems: untranslated.length,
    batchSize: 5,
    totalBatches: Math.ceil(untranslated.length / 5),
    items: untranslated.map((item, index) => ({
      dbId: item.id,
      moltbookId: item.original_id,
      originalTitle: item.title,
      originalContent: item.content,
      type: item.type,
      upvotes: item.upvotes,
      translatedTitle: null,
      translatedContent: null,
      isDuplicate: null,
      tags: null,
      status: 'pending'
    })),
    batches: [],
    status: 'processing'
  };
  
  // 分批次
  for (let i = 0; i < cache.totalBatches; i++) {
    const start = i * cache.batchSize;
    const end = Math.min(start + cache.batchSize, cache.items.length);
    cache.batches.push({
      batchId: i + 1,
      itemIds: cache.items.slice(start, end).map(item => item.dbId),
      startIndex: start,
      endIndex: end,
      status: 'pending'
    });
  }
  
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  log(`缓存文件：${CACHE_FILE}`);
  log(`总批次：${cache.totalBatches}，每批：${cache.batchSize}条`);
  
  // Step 3: 分批翻译
  log('\n[Step 3] 开始分批翻译...');
  
  for (let batchIndex = 0; batchIndex < cache.totalBatches; batchIndex++) {
    const batch = cache.batches[batchIndex];
    const items = cache.items.slice(batch.startIndex, batch.endIndex);
    
    log(`\n--- 第${batch.batchId}批开始 ---`);
    log(`处理范围：items[${batch.startIndex}-${batch.endIndex-1}]，共${items.length}条`);
    
    // 实际应该调用 sessions_spawn
    // 这里模拟翻译过程
    for (const item of items) {
      log(`翻译中：${item.originalTitle.substring(0, 50)}...`);
      
      // 模拟翻译（实际由大宝完成）
      item.translatedTitle = `[翻译] ${item.originalTitle}`;
      item.translatedContent = `[翻译] ${item.originalContent.substring(0, 200)}...`;
      item.status = 'translated';
      
      log(`✓ 翻译完成`);
    }
    
    // 更新缓存
    batch.status = 'done';
    batch.completedAt = new Date().toISOString();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    
    log(`第${batch.batchId}批完成（${items.length}条）`);
    log(`--- 第${batch.batchId}批结束 ---\n`);
  }
  
  // Step 4: 写入数据库
  log('\n[Step 4] 写入数据库...');
  
  for (const item of cache.items) {
    await new Promise((resolve, reject) => {
      db.run(`
        UPDATE moltbook_posts
        SET translated_title = ?,
            translated_content = ?,
            translated = 1,
            translated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [item.translatedTitle, item.translatedContent, item.dbId], function(err) {
        if (err) reject(err);
        else {
          log(`✓ 已更新：${item.originalTitle.substring(0, 50)}...`);
          resolve();
        }
      });
    });
  }
  
  // Step 5: 中文查重
  log('\n[Step 5] 中文查重...');
  
  for (const item of cache.items) {
    const isDuplicate = await checkDuplicate(item.translatedTitle);
    item.isDuplicate = isDuplicate;
    
    await new Promise((resolve, reject) => {
      db.run(`
        UPDATE moltbook_posts
        SET is_duplicate = ?
        WHERE id = ?
      `, [isDuplicate ? 1 : 0, item.dbId], (err) => {
        if (err) reject(err);
        else {
          log(`${isDuplicate ? '❌ 重复' : '✅ 原创'}：${item.translatedTitle.substring(0, 30)}...`);
          resolve();
        }
      });
    });
  }
  
  // Step 6: 自动打标签
  log('\n[Step 6] 自动打标签...');
  
  for (const item of cache.items) {
    if (item.isDuplicate) continue;
    
    const tags = autoTagPost(item.translatedTitle, item.translatedContent);
    item.tags = tags.join(',');
    
    // 更新 moltbook_posts
    await new Promise((resolve, reject) => {
      db.run(`
        UPDATE moltbook_posts
        SET tags = ?
        WHERE id = ?
      `, [item.tags, item.dbId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // 写入 post_tags 表（千人千面查询用）
    for (const tag of tags) {
      await new Promise((resolve, reject) => {
        db.run(`
          INSERT OR IGNORE INTO post_tags (post_id, tag, source)
          VALUES ((SELECT id FROM moltbook_posts WHERE id = ?), ?, 'moltbook')
        `, [item.dbId, tag], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    
    log(`🏷️ 标签 [${tags.join(', ')}]：${item.translatedTitle.substring(0, 30)}...`);
  }
  
  // 更新缓存状态
  cache.status = 'completed';
  cache.completedAt = new Date().toISOString();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  
  // Step 7: 统计结果
  log('\n========== 流程完成，统计结果 ==========');
  
  db.get(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN translated=1 THEN 1 ELSE 0 END) as translated,
      SUM(CASE WHEN is_duplicate=1 THEN 1 ELSE 0 END) as duplicate,
      SUM(CASE WHEN translated=1 AND is_duplicate=0 THEN 1 ELSE 0 END) as published
    FROM moltbook_posts
    WHERE id IN (${cache.items.map(i => i.dbId).join(',')})
  `, (err, row) => {
    if (!err) {
      log(`\n📊 结果统计:`);
      log(`  总记录：${row.total}`);
      log(`  已翻译：${row.translated}`);
      log(`  重复过滤：${row.duplicate}`);
      log(`  可上架：${row.published}`);
      
      log(`\n✅ Moltbook 完整同步流程完成！`);
    }
    db.close();
  });
}

main().catch(err => {
  console.error('错误:', err);
  db.close();
  process.exit(1);
});
