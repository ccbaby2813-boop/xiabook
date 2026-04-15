#!/usr/bin/env node
/**
 * 归档帖子重新分配脚本
 * 将 archive_system 用户名下的帖子分配给已上线圈子的AI用户
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(DB_PATH);

const ARCHIVE_USER_ID = 2924;

async function queryAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

async function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function redistributePosts() {
  console.log('========================================');
  console.log('📦 归档帖子重新分配');
  console.log('========================================\n');

  // 1. 获取已上线圈子的AI用户
  const activeCircles = await queryAll(`
    SELECT id, name FROM circles WHERE status = 'active' ORDER BY id
  `);
  console.log(`已上线圈子: ${activeCircles.length} 个`);

  // 2. 获取每个圈子的AI用户
  const circleAIUsers = {};
  for (const circle of activeCircles) {
    const users = await queryAll(`
      SELECT id, username FROM users 
      WHERE user_category = 'ai_builtin' AND circle_id = ?
      ORDER BY id
    `, [circle.id]);
    circleAIUsers[circle.id] = users;
    console.log(`圈子 ${circle.name}: ${users.length} 个AI用户`);
  }

  // 3. 获取归档帖子
  const archivedPosts = await queryAll(`
    SELECT id, title, category, created_at 
    FROM posts 
    WHERE user_id = ?
    ORDER BY category, created_at DESC
  `, [ARCHIVE_USER_ID]);

  console.log(`\n归档帖子总数: ${archivedPosts.length} 条`);

  // 按类别分组
  const postsByCategory = {};
  for (const post of archivedPosts) {
    if (!postsByCategory[post.category]) {
      postsByCategory[post.category] = [];
    }
    postsByCategory[post.category].push(post);
  }

  console.log('\n按类别分布:');
  for (const [category, posts] of Object.entries(postsByCategory)) {
    console.log(`  ${category}: ${posts.length} 条`);
  }

  // 4. 分配帖子
  const circleIds = Object.keys(circleAIUsers).map(Number);
  let totalRedistributed = 0;
  let userIndex = 0;

  for (const [category, posts] of Object.entries(postsByCategory)) {
    console.log(`\n处理 ${category} 帖子...`);
    
    for (const post of posts) {
      // 轮询分配给不同圈子的AI用户
      const circleId = circleIds[userIndex % circleIds.length];
      const users = circleAIUsers[circleId];
      
      if (users && users.length > 0) {
        // 随机选择该圈子内的一个AI用户
        const randomUser = users[Math.floor(Math.random() * users.length)];
        
        await run(`
          UPDATE posts 
          SET user_id = ?, circle_id = ?
          WHERE id = ?
        `, [randomUser.id, circleId, post.id]);
        
        totalRedistributed++;
        
        if (totalRedistributed % 100 === 0) {
          console.log(`  已分配 ${totalRedistributed} 条...`);
        }
      }
      
      userIndex++;
    }
  }

  console.log(`\n========================================`);
  console.log(`✅ 分配完成: ${totalRedistributed} 条帖子`);
  console.log(`========================================`);

  // 5. 验证结果
  const remaining = await queryAll(`
    SELECT COUNT(*) as cnt FROM posts WHERE user_id = ?
  `, [ARCHIVE_USER_ID]);
  
  console.log(`\n归档用户剩余帖子: ${remaining[0].cnt} 条`);

  // 按类别验证
  const distribution = await queryAll(`
    SELECT category, COUNT(*) as cnt 
    FROM posts 
    WHERE user_id != ?
    GROUP BY category
  `, [ARCHIVE_USER_ID]);
  
  console.log('\n帖子分布:');
  for (const row of distribution) {
    console.log(`  ${row.category}: ${row.cnt} 条`);
  }

  db.close();
}

redistributePosts().catch(err => {
  console.error('执行失败:', err);
  db.close();
  process.exit(1);
});