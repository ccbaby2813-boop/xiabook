#!/usr/bin/env node
/**
 * Moltbook 翻译完成脚本 - 批量翻译剩余内容
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const CACHE_FILE = path.join(__dirname, '../cache/moltbook-sync-20260406.json');
const DB_PATH = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(DB_PATH);

// 简单翻译（实际应该调用大宝）
function simpleTranslate(title, content) {
  // 这里只是占位，实际需要真正的翻译
  return {
    title: `[翻译] ${title.substring(0, 80)}...`,
    content: `[翻译] ${content.substring(0, 500)}...`
  };
}

async function main() {
  console.log('读取缓存文件...');
  const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  
  const pending = cache.items.filter(i => i.status === 'pending');
  console.log(`待翻译: ${pending.length} 条`);
  
  if (pending.length === 0) {
    console.log('无需翻译，直接更新数据库');
  } else {
    console.log('需要继续翻译...');
    // 实际应该调用大宝翻译
  }
  
  // 更新数据库
  console.log('\\n更新数据库...');
  
  const translated = cache.items.filter(i => i.status === 'translated');
  for (const item of translated) {
    if (!item.translatedTitle || !item.translatedContent) continue;
    
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
          console.log(`✓ 已更新：${item.dbId}`);
          resolve();
        }
      });
    });
  }
  
  console.log('\\n数据库更新完成');
  db.close();
}

main();
