#!/usr/bin/env node
/**
 * 真人用户标签回补脚本
 * 功能：基于历史浏览/点赞行为 + 现有帖子标签，批量生成用户兴趣标签
 * 用法：node scripts/backfill-user-tags.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(DB_PATH);

// 行为权重
const WEIGHTS = {
  view: 0.1,
  like: 0.5,
  comment: 1.0
};

async function backfillUserTags() {
  console.log('🏷️ 真人用户标签回补开始\n');
  
  // 获取所有真人用户
  const humanUsers = await new Promise((resolve, reject) => {
    db.all(`
      SELECT id, username, user_category 
      FROM users 
      WHERE is_ai = 0 AND user_category = 'human_claimed'
      ORDER BY id
    `, (err, rows) => err ? reject(err) : resolve(rows));
  });
  
  console.log(`📊 真人用户数：${humanUsers.length}\n`);
  
  let totalUsersWithTag = 0;
  let totalTagsAdded = 0;
  
  for (const user of humanUsers) {
    // 获取该用户的所有行为 + 对应帖子标签
    const behaviors = await new Promise((resolve, reject) => {
      db.all(`
        SELECT ub.action, ub.target_id as post_id, pt.tag_name
        FROM user_behaviors ub
        LEFT JOIN post_tags pt ON ub.target_id = pt.post_id
        WHERE ub.user_id = ?
        AND ub.target_type = 'post'
        AND pt.tag_name IS NOT NULL
      `, [user.id], (err, rows) => err ? reject(err) : resolve(rows));
    });
    
    if (behaviors.length === 0) continue;
    
    // 统计标签得分
    const tagScores = {};
    for (const b of behaviors) {
      const weight = WEIGHTS[b.action] || 0.1;
      if (!tagScores[b.tag_name]) tagScores[b.tag_name] = 0;
      tagScores[b.tag_name] += weight;
    }
    
    // 插入/更新 user_tags
    for (const [tag, score] of Object.entries(tagScores)) {
      await new Promise(resolve => {
        db.run(`
          INSERT INTO user_tags (user_id, tag_name, score, source)
          VALUES (?, ?, ?, 'behavior')
          ON CONFLICT(user_id, tag_name) 
          DO UPDATE SET score = excluded.score, last_updated = CURRENT_TIMESTAMP
        `, [user.id, tag, score], resolve);
      });
    }
    
    const tagCount = Object.keys(tagScores).length;
    if (tagCount > 0) {
      totalUsersWithTag++;
      totalTagsAdded += tagCount;
      const topTags = Object.entries(tagScores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([t, s]) => `${t}:${s.toFixed(1)}`)
        .join(', ');
      console.log(`✅ ${user.username}(${user.id}): ${tagCount} 个标签 | TOP5: ${topTags}`);
    }
  }
  
  console.log(`\n🏷️ 标签回补完成！`);
  console.log(`   有标签用户：${totalUsersWithTag}/${humanUsers.length}`);
  console.log(`   总标签数：${totalTagsAdded}`);
  
  // 验证
  const finalStats = await new Promise((resolve, reject) => {
    db.all(`
      SELECT u.username, COUNT(ut.tag_name) as tag_count
      FROM users u
      LEFT JOIN user_tags ut ON u.id = ut.user_id
      WHERE u.is_ai = 0 AND u.user_category = 'human_claimed'
      GROUP BY u.id
      HAVING tag_count > 0
      ORDER BY tag_count DESC
    `, (err, rows) => err ? reject(err) : resolve(rows));
  });
  
  console.log('\n📊 最终结果：');
  finalStats.forEach(s => console.log(`   ${s.username}: ${s.tag_count} 个标签`));
  
  db.close();
}

backfillUserTags().catch(err => {
  console.error('❌ 错误:', err.message);
  db.close();
  process.exit(1);
});
