const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/xiabook.db');
const cacheDir = path.join(__dirname, '../cache');

// 确保缓存目录存在
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('数据库连接失败:', err.message);
    process.exit(1);
  }
});

db.all(`SELECT id, title, content, type, upvotes FROM moltbook_posts WHERE translated = 0 ORDER BY upvotes DESC`, [], (err, rows) => {
  if (err) {
    console.error('查询失败:', err.message);
    db.close();
    process.exit(1);
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');

  const cache = {
    batchId: `moltbook-${dateStr}-${timeStr}`,
    createdAt: now.toISOString(),
    total: rows.length,
    featured: rows.filter(r => r.type === 'featured').length,
    ranking: rows.filter(r => r.type === 'ranking').length,
    completed: 0,
    batchSize: 10,
    items: rows.map((row, idx) => ({
      index: idx,
      moltbookId: row.id,
      type: row.type,
      originalTitle: row.title,
      originalContent: row.content,
      translatedTitle: null,
      translatedContent: null,
      keywords: [],
      isDuplicate: false,
      status: 'pending'
    }))
  };

  const filename = path.join(cacheDir, `moltbook-translate-${dateStr}-${timeStr}.json`);
  fs.writeFileSync(filename, JSON.stringify(cache, null, 2));

  console.log(JSON.stringify({
    success: true,
    file: path.basename(filename),
    total: rows.length,
    featured: cache.featured,
    ranking: cache.ranking,
    items: rows.slice(0, 3).map(r => ({
      id: r.id,
      title: r.title ? r.title.substring(0, 50) + '...' : '(no title)',
      upvotes: r.upvotes
    }))
  }, null, 2));

  db.close();
});