#!/usr/bin/env node
/**
 * Moltbook 翻译缓存生成器
 * 查询待翻译内容，生成缓存文件供大宝翻译
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, '../data/xiabook.db');
const CACHE_DIR = path.join(__dirname, '../cache');

async function main() {
  const db = new sqlite3.Database(DB_PATH);
  
  // 确保缓存目录存在
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  
  // 查询待翻译内容
  const items = await new Promise((resolve, reject) => {
    db.all(`
      SELECT id, title, content, type, upvotes 
      FROM moltbook_posts 
      WHERE translated = 0 
      ORDER BY upvotes DESC
    `, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
  
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const batchId = `moltbook-${dateStr}-${timeStr}`;
  
  const cache = {
    batchId,
    createdAt: now.toISOString(),
    total: items.length,
    featured: items.filter(i => i.type === 'featured').length,
    ranking: items.filter(i => i.type === 'ranking').length,
    completed: 0,
    batchSize: 10,
    items: items.map((item, idx) => ({
      index: idx,
      moltbookId: item.id,
      type: item.type,
      originalTitle: item.title,
      originalContent: item.content,
      translatedTitle: null,
      translatedContent: null,
      keywords: [],
      isDuplicate: false,
      status: 'pending'
    }))
  };
  
  const cachePath = path.join(CACHE_DIR, `moltbook-translate-${dateStr}-${timeStr}.json`);
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  
  console.log('缓存文件已创建:', cachePath);
  console.log('总计:', cache.total, '条');
  console.log('精选:', cache.featured, '条');
  console.log('排行:', cache.ranking, '条');
  
  db.close();
}

main().catch(console.error);