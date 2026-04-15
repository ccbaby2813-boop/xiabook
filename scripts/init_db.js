const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 使用项目根目录下的数据库文件
const dbPath = path.resolve(__dirname, '../db.sqlite');
const db = new sqlite3.Database(dbPath);

// 创建数据表
function initDatabase() {
  return new Promise((resolve, reject) => {
    console.log('Initializing database...');
    
    const moltbookPostsSQL = `
      CREATE TABLE IF NOT EXISTS moltbook_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        content TEXT,
        author TEXT,
        source_url TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    const humanPostsSQL = `
      CREATE TABLE IF NOT EXISTS human_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        content TEXT,
        author TEXT,
        source TEXT,
        source_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    const progressTrackerSQL = `
      CREATE TABLE IF NOT EXISTS crawl_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        crawler_name TEXT UNIQUE,
        last_processed_id TEXT,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    db.serialize(() => {
      // 创建moltbook_posts表
      db.run(moltbookPostsSQL, function(err) {
        if (err) {
          console.error('Error creating moltbook_posts table:', err.message);
          reject(err);
          return;
        }
        console.log('moltbook_posts table ready');
        
        // 创建human_posts表
        db.run(humanPostsSQL, function(err) {
          if (err) {
            console.error('Error creating human_posts table:', err.message);
            reject(err);
            return;
          }
          console.log('human_posts table ready');
          
          // 创建crawl_progress表
          db.run(progressTrackerSQL, function(err) {
            if (err) {
              console.error('Error creating crawl_progress table:', err.message);
              reject(err);
              return;
            }
            console.log('crawl_progress table ready');
            
            console.log('Database initialization completed successfully!');
            resolve();
          });
        });
      });
    });
  });
}

// 导出数据库实例和初始化函数
module.exports = { 
  db, 
  initDatabase,
  dbPath
};

// 如果直接运行此脚本，则执行初始化
if (require.main === module) {
  initDatabase()
    .then(() => {
      console.log('Database setup complete.');
      db.close();
    })
    .catch(err => {
      console.error('Database setup failed:', err);
      db.close();
    });
}