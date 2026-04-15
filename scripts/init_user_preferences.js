#!/usr/bin/env node
/**
 * 用户标签偏好表初始化
 * 根据用户历史行为（浏览/点赞/评论）生成标签偏好
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(DB_PATH);

// 日志
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// 创建 user_preferences 表
async function createTable() {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        tag TEXT,
        weight INTEGER DEFAULT 1,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `, (err) => {
      if (err) reject(err);
      else {
        log('✅ user_preferences 表创建成功');
        resolve();
      }
    });
  });
}

// 创建索引
async function createIndexes() {
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON user_preferences(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_user_preferences_tag ON user_preferences(tag)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_user_preferences_unique ON user_preferences(user_id, tag)'
  ];
  
  for (const sql of indexes) {
    await new Promise((resolve, reject) => {
      db.run(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
  
  log('✅ 索引创建成功');
}

// 初始化用户标签偏好（根据历史行为）
async function initializePreferences() {
  log('\n[Step 1] 查询用户历史行为...');
  
  // 查询用户的点赞/评论记录，提取标签
  const userTags = await new Promise((resolve, reject) => {
    db.all(`
      SELECT 
        u.id as user_id,
        pt.tag_name as tag,
        COUNT(*) as count,
        SUM(CASE 
          WHEN ui.type = 'like' THEN 3
          WHEN ui.type = 'comment' THEN 5
          WHEN ui.type = 'view' THEN 1
          ELSE 1
        END) as weight
      FROM users u
      JOIN user_interactions ui ON u.id = ui.user_id
      JOIN posts p ON ui.target_id = p.id
      JOIN post_tags pt ON p.id = pt.post_id
      WHERE u.user_category = 'human_claimed'
      GROUP BY u.id, pt.tag_name
      HAVING COUNT(*) >= 2
    `, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
  
  log(`找到 ${userTags.length} 条用户标签数据`);
  
  if (userTags.length === 0) {
    log('⚠️ 没有用户历史行为数据，使用默认标签初始化');
    
    // 使用 moltbook_posts 的标签作为默认偏好
    const defaultTags = await new Promise((resolve, reject) => {
      db.all(`
        SELECT tag_name as tag, COUNT(*) as count
        FROM post_tags
        WHERE source = 'moltbook'
        GROUP BY tag_name
        ORDER BY count DESC
        LIMIT 10
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    log(`默认标签：${defaultTags.map(t => t.tag).join(', ')}`);
    
    // 为所有认领用户添加默认标签
    const users = await new Promise((resolve, reject) => {
      db.all(`SELECT id FROM users WHERE user_category = 'human_claimed'`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    log(`找到 ${users.length} 个认领用户`);
    
    for (const user of users) {
      for (const tagData of defaultTags) {
        await new Promise((resolve, reject) => {
          db.run(`
            INSERT OR IGNORE INTO user_preferences (user_id, tag, weight)
            VALUES (?, ?, ?)
          `, [user.id, tagData.tag, tagData.count], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    }
    
    log(`✅ 默认标签偏好初始化完成`);
  } else {
    // 插入用户标签偏好
    for (const ut of userTags) {
      await new Promise((resolve, reject) => {
        db.run(`
          INSERT OR REPLACE INTO user_preferences (user_id, tag, weight, updated_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        `, [ut.user_id, ut.tag, ut.weight], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    
    log(`✅ 用户标签偏好初始化完成`);
  }
}

// 统计结果
async function printStats() {
  log('\n========== 统计结果 ==========');
  
  const stats = await new Promise((resolve, reject) => {
    db.all(`
      SELECT 
        COUNT(DISTINCT user_id) as users,
        COUNT(DISTINCT tag) as tags,
        COUNT(*) as records,
        AVG(weight) as avg_weight
      FROM user_preferences
    `, (err, rows) => {
      if (err) reject(err);
      else resolve(rows[0]);
    });
  });
  
  log(`  用户数：${stats.users}`);
  log(`  标签数：${stats.tags}`);
  log(`  总记录：${stats.records}`);
  log(`  平均权重：${stats.avg_weight?.toFixed(2) || 'N/A'}`);
  
  // Top 标签
  const topTags = await new Promise((resolve, reject) => {
    db.all(`
      SELECT tag, COUNT(*) as users, SUM(weight) as total_weight
      FROM user_preferences
      GROUP BY tag
      ORDER BY total_weight DESC
      LIMIT 10
    `, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
  
  log(`\n  Top 标签:`);
  topTags.forEach((t, i) => {
    log(`    ${i+1}. ${t.tag} - ${t.users}用户，权重${t.total_weight}`);
  });
}

// 主流程
async function main() {
  log('========== 用户标签偏好表初始化开始 ==========');
  
  await createTable();
  await createIndexes();
  await initializePreferences();
  await printStats();
  
  log('\n✅ 用户标签偏好表初始化完成！');
  db.close();
}

main().catch(err => {
  console.error('错误:', err);
  db.close();
  process.exit(1);
});
