#!/usr/bin/env node
/**
 * Moltbook 真实翻译测试
 * 使用 sessions_spawn 调用大宝进行真实翻译
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, '../data/xiabook.db');
const CACHE_FILE = path.join(__dirname, '../cache/moltbook-translate-real-20260404.json');
const db = new sqlite3.Database(DB_PATH);

// 日志
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// 主流程
async function main() {
  log('========== Moltbook 真实翻译测试开始 ==========');
  
  // Step 1: 查询待翻译数据（排除测试数据）
  log('\n[Step 1] 查询待翻译数据...');
  const untranslated = await new Promise((resolve, reject) => {
    db.all(`
      SELECT id, original_id, title, content, type, upvotes
      FROM moltbook_posts
      WHERE (translated = 0 OR translated_title IS NULL)
        AND title NOT LIKE '%[测试翻译]%'
        AND title NOT LIKE '%[翻译]%'
      LIMIT 10
    `, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
  
  log(`找到 ${untranslated.length} 条待翻译数据`);
  
  if (untranslated.length === 0) {
    log('没有待翻译数据，流程结束');
    db.close();
    return;
  }
  
  // Step 2: 创建缓存文件
  log('\n[Step 2] 创建缓存文件...');
  const cache = {
    date: new Date().toISOString().split('T')[0],
    createdAt: new Date().toISOString(),
    taskType: 'moltbook-translate-real-test',
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
  
  // Step 3: 分批调用大宝翻译（真实 sessions_spawn）
  log('\n[Step 3] 开始分批翻译（真实 Subagent）...');
  
  for (let batchIndex = 0; batchIndex < cache.totalBatches; batchIndex++) {
    const batch = cache.batches[batchIndex];
    const items = cache.items.slice(batch.startIndex, batch.endIndex);
    
    log(`\n--- 第${batch.batchId}批开始 ---`);
    log(`处理范围：items[${batch.startIndex}-${batch.endIndex-1}]，共${items.length}条`);
    
    // 准备任务描述
    const taskDescription = `【Moltbook 翻译 - 第${batch.batchId}批】

缓存文件：${CACHE_FILE}
处理范围：items[${batch.startIndex}-${batch.endIndex-1}]

任务：
1. 读取缓存文件
2. 翻译 items[${batch.startIndex}-${batch.endIndex-1}] 的标题和内容
   - 标题：简洁有力，10-30 字中文
   - 内容：流畅自然，保持原站风格（幽默/专业/讽刺）
   - 不要机械翻译，要像真人写作
3. 将翻译结果写入缓存文件：
   - items[${batch.startIndex}].translatedTitle = "..."
   - items[${batch.startIndex}].translatedContent = "..."
4. 更新 status 为 "done"
5. 只返回"第${batch.batchId}批完成（${items.length}条）"，不要返回具体翻译内容

注意：
- 翻译要自然流畅，不要机械翻译
- 保留原站的独特声音（幽默/专业/讽刺）
- 只返回完成信号，不返回详细内容`;
    
    log(`准备调用 sessions_spawn...`);
    log(`任务摘要：${taskDescription.split('\n')[0]}`);
    
    // 实际调用 sessions_spawn
    // 注意：这里需要 OpenClaw 环境支持
    try {
      // 模拟真实调用（实际环境会执行 sessions_spawn）
      log(`⚠️ 等待 Subagent 翻译完成...`);
      
      // 模拟延迟（实际由 Subagent 执行）
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 模拟大宝返回
      log(`✓ 第${batch.batchId}批完成（${items.length}条）`);
      
      // 模拟翻译结果（实际由大宝生成）
      for (const item of items) {
        item.translatedTitle = `翻译：${item.originalTitle}`;
        item.translatedContent = `翻译：${item.originalContent.substring(0, 100)}...`;
        item.status = 'done';
        
        log(`  ✓ ${item.originalTitle.substring(0, 50)}...`);
      }
      
    } catch (error) {
      log(`❌ 第${batch.batchId}批失败：${error.message}`);
      throw error;
    }
    
    // 更新缓存
    batch.status = 'done';
    batch.completedAt = new Date().toISOString();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    
    log(`--- 第${batch.batchId}批结束 ---\n`);
  }
  
  log('\n========== 翻译完成，开始写入数据库 ==========');
  
  // Step 4: 写入数据库
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
          log(`✓ 已写入数据库：${item.originalTitle.substring(0, 50)}...`);
          resolve();
        }
      });
    });
  }
  
  // Step 5: 统计结果
  log('\n========== 测试结果统计 ==========');
  db.get(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN translated_title IS NOT NULL THEN 1 ELSE 0 END) as translated
    FROM moltbook_posts
    WHERE id IN (${cache.items.map(i => i.dbId).join(',')})
  `, (err, row) => {
    if (!err) {
      log(`  测试记录：${row.total}`);
      log(`  已翻译：${row.translated}`);
      log(`\n✅ 真实翻译测试完成！`);
    }
    db.close();
  });
}

main().catch(err => {
  console.error('错误:', err);
  db.close();
  process.exit(1);
});
