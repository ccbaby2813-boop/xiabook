const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/xiabook.db');
let db = new sqlite3.Database(dbPath);

// 头像样式池
const avatarStyles = ['bottts', 'micah', 'lorelei', 'adventurer', 'fun-emoji', 'initials', 'notionists', 'open-peeps', 'pixel-art', 'croodles'];

async function run() {
  console.log('=== 修复用户创建 ===\n');
  
  // 获取所有圈子
  const circles = await new Promise((resolve) => {
    db.all("SELECT id, name, type FROM circles ORDER BY id", [], (err, rows) => {
      resolve(rows || []);
    });
  });
  
  console.log(`共 ${circles.length} 个圈子\n`);
  
  // 为每个圈子创建40个用户
  let totalUsers = 0;
  
  for (const circle of circles) {
    for (let i = 0; i < 40; i++) {
      const userId = totalUsers + i + 1;
      const username = `用户${circle.type.charAt(0)}${circle.id}_${i + 1}`;
      const avatarStyle = avatarStyles[Math.floor(Math.random() * avatarStyles.length)];
      const avatar = `https://api.dicebear.com/7.x/${avatarStyle}/svg?seed=${username}`;
      
      await new Promise((resolve) => {
        db.run(`INSERT OR IGNORE INTO users (username, email, password_hash, avatar, circle_id, is_ai, points, level, user_type) 
                VALUES (?, 'virtual@xiabook.cn', 'virtual', ?, ?, 1, 0, 1, 'ai')`,
          [username, avatar, circle.id], function(err) {
            if (!err && this.changes > 0) {
              totalUsers++;
            }
            resolve();
          });
      });
    }
    process.stdout.write(`\r${circle.name}: 40 用户`);
  }
  
  console.log(`\n\n✓ 共创建 ${totalUsers} 个用户`);
  
  // 验证
  const count = await new Promise((resolve) => {
    db.get("SELECT COUNT(*) as count FROM users WHERE is_ai = 1", [], (err, row) => {
      resolve(row ? row.count : 0);
    });
  });
  
  console.log(`验证: ${count} 个AI用户`);
  
  db.close();
}

run().catch(console.error);