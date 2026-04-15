#!/usr/bin/env node
/**
 * Moltbook 完整同步流程 - 2026-04-06
 * 流程：查询未翻译→创建缓存→分批翻译→查重→标签→上架
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, '../data/xiabook.db');
const CACHE_FILE = path.join(__dirname, '../cache/moltbook-sync-20260406.json');
const db = new sqlite3.Database(DB_PATH);

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
      AND category IN ('凡人视角', 'AI 视角', '海外洋虾')
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
  
  if (/ai|agent|llm|model|人工智能/.test(text)) tags.push('AI');
  if (/code|program|develop|编程 | 代码 | 开发/.test(text)) tags.push('编程');
  if (/tech|technology|技术 | 科技/.test(text)) tags.push('技术');
  if (/app|product|user|产品 | 用户/.test(text)) tags.push('产品');
  if (/business|company|invest|商业 | 投资/.test(text)) tags.push('商业');
  if (/think|opinion|thought|观点 | 思考/.test(text)) tags.push('观点');
  if (/why|how|what|为什么 | 如何/.test(text)) tags.push('问答');
  
  if (tags.length === 0) tags.push('科技');
  return tags.slice(0, 5);
}

async function main() {
  log('========== Moltbook 同步流程开始 (2026-04-06) ==========');
  
  // Step 1: 查询未翻译数据
  log('\n[Step 1] 查询未翻译数据...');
  const untranslated = await new Promise((resolve, reject) => {
    db.all(`
      SELECT id, original_id, title, content, type, upvotes
      FROM moltbook_posts
      WHERE translated_title IS NULL OR title = translated_title
      ORDER BY id DESC
      LIMIT 50
    `, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
  
  log(`找到 ${untranslated.length} 条需要翻译的数据`);
  
  if (untranslated.length === 0) {
    log('没有未翻译数据，流程结束');
    db.close();
    return;
  }
  
  // Step 2: 创建缓存文件
  log('\n[Step 2] 创建缓存文件...');
  const cache = {
    date: '2026-04-06',
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
  
  // Step 3: 输出翻译任务指令（由外部系统调用大宝）
  log('\n[Step 3] 准备翻译任务...');
  log('需要调用 sessions_spawn 翻译以下批次:');
  
  for (let batchIndex = 0; batchIndex < cache.totalBatches; batchIndex++) {
    const batch = cache.batches[batchIndex];
    const items = cache.items.slice(batch.startIndex, batch.endIndex);
    log(`\n  第${batch.batchId}批 (items ${batch.startIndex}-${batch.endIndex-1}):`);
    items.forEach(item => {
      log(`    - ID ${item.dbId}: ${item.originalTitle.substring(0, 60)}...`);
    });
  }
  
  log('\n\n========== 缓存文件已创建，等待翻译执行 ==========');
  log('下一步：调用 sessions_spawn(agentId="writer") 分批翻译');
  
  db.close();
}

main().catch(err => {
  console.error('错误:', err);
  db.close();
  process.exit(1);
});
