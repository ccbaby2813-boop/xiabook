const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../../data/xiabook.db');
const cacheDir = path.join(__dirname, '../../cache');
const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
const cacheFile = path.join(cacheDir, `moltbook-translate-${timestamp}.json`);

// Ensure cache directory exists
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

db.all(
  "SELECT id, original_id, title, content, type, upvotes FROM moltbook_posts WHERE translated = 0 ORDER BY id",
  [],
  (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      process.exit(1);
    }

    const featured = rows.filter(r => r.type === 'featured');
    const ranking = rows.filter(r => r.type === 'ranking');

    const cacheData = {
      batchId: `moltbook-${timestamp}`,
      createdAt: new Date().toISOString(),
      total: rows.length,
      featured: featured.length,
      ranking: ranking.length,
      completed: 0,
      batchSize: 10,
      items: rows.map((row, index) => ({
        index,
        moltbookId: row.id,
        originalId: row.original_id,
        type: row.type,
        originalTitle: row.title,
        originalContent: row.content || '',
        upvotes: row.upvotes || 0,
        translatedTitle: null,
        translatedContent: null,
        keywords: [],
        isDuplicate: false,
        status: 'pending'
      }))
    };

    fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2));
    console.log(`✅ 缓存文件已创建：${cacheFile}`);
    console.log(`   总计：${rows.length} 条`);
    console.log(`   - 精选转译 (featured): ${featured.length} 条`);
    console.log(`   - 原站排行 (ranking): ${ranking.length} 条`);
    console.log(`   批次大小：10 条/批`);
    console.log(`   预计批次：${Math.ceil(rows.length / 10)} 批`);

    db.close();
  }
);
