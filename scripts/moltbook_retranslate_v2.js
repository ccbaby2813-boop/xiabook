/**
 * Moltbook帖子重新翻译脚本 v2.0
 * 用于修复混合翻译和未翻译的帖子
 */

const fs = require('fs');
const path = require('path');

// 数据库路径
const DB_PATH = path.join(__dirname, '../data/xiabook.db');

// 加载 sqlite3
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(DB_PATH);

// Promise化数据库操作
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});
const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) { err ? reject(err) : resolve(this); });
});

// 获取需要重翻的帖子（翻译后标题含英文）
async function getPostsToRetranslate(limit = 50) {
  const sql = `
    SELECT id, title, translated_title, content, translated_content
    FROM moltbook_posts 
    WHERE translated_title GLOB '*[a-z]*'
    ORDER BY id
    LIMIT ?
  `;
  return dbAll(sql, [limit]);
}

// 统计翻译状态
async function getStats() {
  const total = (await dbGet('SELECT COUNT(*) as cnt FROM moltbook_posts')).cnt;
  const hasEnglish = (await dbGet("SELECT COUNT(*) as cnt FROM moltbook_posts WHERE translated_title GLOB '*[a-z]*'")).cnt;
  const pureChinese = total - hasEnglish;
  return { total, hasEnglish, pureChinese };
}

// 更新翻译
async function updateTranslation(id, translatedTitle, translatedContent) {
  const sql = `
    UPDATE moltbook_posts 
    SET translated_title = ?, translated_content = ?, translated = 1, translated_at = datetime('now')
    WHERE id = ?
  `;
  return dbRun(sql, [translatedTitle, translatedContent, id]);
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const action = args[0] || 'stats';

  if (action === 'stats') {
    const stats = await getStats();
    console.log('\n📊 Moltbook翻译统计');
    console.log('===================');
    console.log(`总帖子数: ${stats.total}`);
    console.log(`需要重翻: ${stats.hasEnglish}`);
    console.log(`已翻译OK: ${stats.pureChinese}`);
    console.log(`完成率: ${((stats.pureChinese / stats.total) * 100).toFixed(1)}%`);
    
    // 显示示例
    const samples = await getPostsToRetranslate(5);
    if (samples.length > 0) {
      console.log('\n📝 待重翻示例:');
      samples.forEach(p => {
        console.log(`  [${p.id}] ${p.translated_title.substring(0, 50)}...`);
      });
    }
  }
  
  if (action === 'list') {
    const limit = parseInt(args[1]) || 20;
    const posts = await getPostsToRetranslate(limit);
    console.log(`\n📋 待重翻帖子列表 (前${limit}条):`);
    console.log('===================');
    posts.forEach(p => {
      console.log(`\n[${p.id}]`);
      console.log(`原文: ${p.title.substring(0, 80)}`);
      console.log(`现译: ${p.translated_title.substring(0, 80)}`);
    });
  }
  
  if (action === 'export') {
    const limit = parseInt(args[1]) || 50;
    const posts = await getPostsToRetranslate(limit);
    const outputPath = args[2] || '/tmp/moltbook_to_translate.json';
    fs.writeFileSync(outputPath, JSON.stringify(posts, null, 2));
    console.log(`✅ 已导出${posts.length}条待翻译帖子到: ${outputPath}`);
  }

  if (action === 'update') {
    const id = parseInt(args[1]);
    const title = args[2];
    const content = args[3] || '';
    if (!id || !title) {
      console.log('用法: node moltbook_retranslate_v2.js update <id> <title> [content]');
      process.exit(1);
    }
    await updateTranslation(id, title, content);
    console.log(`✅ 已更新帖子 ${id}`);
  }

  db.close();
}

main().catch(console.error);