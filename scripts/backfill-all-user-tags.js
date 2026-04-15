#!/usr/bin/env node
/**
 * 真人用户标签全面回补脚本
 * 功能：基于历史浏览/点赞/评论行为 + 现有帖子标签，批量生成用户兴趣标签
 * 修复：评论接口之前未调用 recordUserBehavior，需要回补
 * 用法：node scripts/backfill-all-user-tags.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(DB_PATH);

// 行为权重
const WEIGHTS = { view: 0.1, like: 0.5, comment: 1.0 };

async function backfillAllUserTags() {
  console.log('🏷️ 真人用户标签全面回补开始\n');
  
  // 获取所有真人用户
  const humanUsers = await new Promise((resolve, reject) => {
    db.all(`
      SELECT id, username FROM users 
      WHERE is_ai = 0 AND user_category = 'human_claimed' AND username NOT LIKE 'test%'
      ORDER BY id
    `, (err, rows) => err ? reject(err) : resolve(rows));
  });
  
  console.log(`📊 真人用户数：${humanUsers.length}\n`);
  
  let totalUsersWithTag = 0;
  let totalTagsAdded = 0;
  
  for (const user of humanUsers) {
    // 收集该用户所有互动行为对应的帖子标签
    // 包括：user_behaviors + likes + comments
    const allTags = await new Promise((resolve, reject) => {
      db.all(`
        -- 浏览行为
        SELECT pt.tag_name, ${WEIGHTS.view} as weight
        FROM user_behaviors ub
        JOIN post_tags pt ON ub.target_id = pt.post_id
        WHERE ub.user_id = ? AND ub.target_type = 'post' AND ub.action = 'view'
        
        UNION ALL
        
        -- 点赞行为
        SELECT pt.tag_name, ${WEIGHTS.like} as weight
        FROM likes l
        JOIN post_tags pt ON l.post_id = pt.post_id
        WHERE l.user_id = ?
        
        UNION ALL
        
        -- 评论行为
        SELECT pt.tag_name, ${WEIGHTS.comment} as weight
        FROM comments c
        JOIN post_tags pt ON c.post_id = pt.post_id
        WHERE c.user_id = ?
      `, [user.id, user.id, user.id], (err, rows) => err ? reject(err) : resolve(rows));
    });
    
    if (allTags.length === 0) {
      console.log(`⏭️ ${user.username}(${user.id}): 无有效互动数据，跳过`);
      continue;
    }
    
    // 统计标签得分
    const tagScores = {};
    for (const row of allTags) {
      if (!tagScores[row.tag_name]) tagScores[row.tag_name] = 0;
      tagScores[row.tag_name] += row.weight;
    }
    
    // 插入/更新 user_tags
    for (const [tag, score] of Object.entries(tagScores)) {
      await new Promise(resolve => {
        db.run(`
          INSERT INTO user_tags (user_id, tag_name, score, source)
          VALUES (?, ?, ?, 'behavior')
          ON CONFLICT(user_id, tag_name) 
          DO UPDATE SET score = excluded.score, last_updated = CURRENT_TIMESTAMP
        `, [user.id, tag, Math.round(score * 10) / 10], resolve);
      });
    }
    
    const tagCount = Object.keys(tagScores).length;
    totalUsersWithTag++;
    totalTagsAdded += tagCount;
    const topTags = Object.entries(tagScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([t, s]) => `${t}:${s.toFixed(1)}`)
      .join(', ');
    console.log(`✅ ${user.username}(${user.id}): ${tagCount} 个标签 | TOP5: ${topTags}`);
  }
  
  console.log(`\n🏷️ 标签回补完成！`);
  console.log(`   有标签用户：${totalUsersWithTag}/${humanUsers.length}`);
  console.log(`   总标签数：${totalTagsAdded}`);
  
  // 最终验证
  const finalStats = await new Promise((resolve, reject) => {
    db.all(`
      SELECT u.username, COUNT(ut.tag_name) as tag_count
      FROM users u
      LEFT JOIN user_tags ut ON u.id = ut.user_id
      WHERE u.is_ai = 0 AND u.user_category = 'human_claimed' AND u.username NOT LIKE 'test%'
      GROUP BY u.id
      HAVING tag_count > 0
      ORDER BY tag_count DESC
    `, (err, rows) => err ? reject(err) : resolve(rows));
  });
  
  console.log('\n📊 最终结果：');
  finalStats.forEach(s => console.log(`   ${s.username}: ${s.tag_count} 个标签`));
  
  db.close();
}

backfillAllUserTags().catch(err => {
  console.error('❌ 错误:', err.message);
  db.close();
  process.exit(1);
});
