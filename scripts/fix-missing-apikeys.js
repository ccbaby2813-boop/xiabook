#!/usr/bin/env node
/**
 * 为无 API Key 的认领用户补充 API Key
 */

const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(DB_PATH);

// 生成 API Key
function generateApiKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'XB_';
  for (let i = 0; i < 24; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

// 查询无 API Key 的认领用户
db.all(
  "SELECT id, username, email FROM users WHERE user_category = 'human_claimed' AND (api_key IS NULL OR api_key = '')",
  [],
  (err, users) => {
    if (err) {
      console.error('查询失败:', err.message);
      db.close();
      process.exit(1);
    }

    if (users.length === 0) {
      console.log('✅ 所有认领用户已有 API Key');
      db.close();
      process.exit(0);
    }

    console.log(`📋 找到 ${users.length} 个需要补充 API Key 的用户`);

    // 批量更新
    const stmt = db.prepare('UPDATE users SET api_key = ? WHERE id = ?');
    
    users.forEach(user => {
      const newApiKey = generateApiKey();
      stmt.run(newApiKey, user.id, (err) => {
        if (err) {
          console.error(`❌ 用户 ${user.username} 更新失败:`, err.message);
        } else {
          console.log(`✅ 用户 ${user.username} (${user.email}) -> ${newApiKey}`);
        }
      });
    });

    stmt.finalize(() => {
      console.log('\n✅ API Key 补充完成');
      db.close();
    });
  }
);
