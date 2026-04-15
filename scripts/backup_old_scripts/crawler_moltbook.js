const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 数据库初始化
const dbPath = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('无法连接到数据库:', err.message);
  } else {
    console.log('成功连接到 SQLite 数据库');
    
    // 创建 moltbook_posts 表
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS moltbook_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        content TEXT,
        author TEXT,
        source_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    db.run(createTableSQL, (err) => {
      if (err) {
        console.error('创建表失败:', err.message);
      } else {
        console.log('moltbook_posts 表已准备就绪');
      }
    });
  }
});

// 模拟 Moltbook API 调用（实际实现中替换为真实 API）
async function fetchMoltbookContent() {
  console.log('开始从 Moltbook 获取内容...');
  
  // 这里应该是真实的 API 调用
  // 示例数据
  const mockData = [
    {
      title: "海外见闻分享",
      content: "分享一些在海外的有趣经历和观察...",
      author: "海外达人",
      source_url: "https://moltbook.example.com/post/1"
    },
    {
      title: "异国文化体验",
      content: "深度体验不同国家的文化特色...",
      author: "旅行家",
      source_url: "https://moltbook.example.com/post/2"
    }
  ];
  
  return mockData;
}

// 检查是否已存在相同 URL 的内容
function checkDuplicate(source_url) {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT COUNT(*) as count FROM moltbook_posts WHERE source_url = ?';
    db.get(sql, [source_url], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row.count > 0);
      }
    });
  });
}

// 保存内容到数据库
function saveToDatabase(item) {
  return new Promise((resolve, reject) => {
    const { title, content, author, source_url } = item;
    
    // 检查重复
    checkDuplicate(source_url)
      .then(isDuplicate => {
        if (isDuplicate) {
          console.log(`跳过重复内容: ${title}`);
          resolve(false);
        } else {
          const sql = 'INSERT INTO moltbook_posts (title, content, author, source_url) VALUES (?, ?, ?, ?)';
          db.run(sql, [title, content, author, source_url], function(err) {
            if (err) {
              console.error('保存数据失败:', err.message);
              reject(err);
            } else {
              console.log(`已保存: ${title} (ID: ${this.lastID})`);
              resolve(true);
            }
          });
        }
      })
      .catch(reject);
  });
}

// 主爬虫函数
async function crawlMoltbook() {
  console.log('开始 Moltbook 爬虫任务...');
  
  try {
    // 获取内容
    const contentList = await fetchMoltbookContent();
    console.log(`获取到 ${contentList.length} 条内容`);
    
    let savedCount = 0;
    for (const item of contentList) {
      try {
        const saved = await saveToDatabase(item);
        if (saved) savedCount++;
        
        // 添加延时以避免过于频繁的请求
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error('保存单条数据失败:', error.message);
      }
    }
    
    console.log(`爬虫任务完成! 总计获取: ${contentList.length}, 实际保存: ${savedCount}`);
  } catch (error) {
    console.error('爬虫执行出错:', error.message);
  }
}

// 如果直接运行此脚本，则执行爬虫
if (require.main === module) {
  crawlMoltbook()
    .then(() => {
      console.log('Moltbook 爬虫执行完毕');
      // 关闭数据库连接
      setTimeout(() => {
        db.close((err) => {
          if (err) {
            console.error('关闭数据库失败:', err.message);
          } else {
            console.log('数据库连接已关闭');
          }
        });
      }, 1000);
    })
    .catch(error => {
      console.error('Moltbook 爬虫执行失败:', error);
      db.close((err) => {
        if (err) {
          console.error('关闭数据库失败:', err.message);
        }
      });
    });
}

module.exports = { crawlMoltbook };