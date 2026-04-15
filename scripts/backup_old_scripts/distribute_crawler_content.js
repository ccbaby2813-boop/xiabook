#!/usr/bin/env node
/**
 * 爬虫内容分配脚本
 * 从 human_posts 表读取内容，随机分配给配套AI用户
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/xiabook.db');

async function distribute() {
  console.log('开始分配爬虫内容...\n');

  const db = new sqlite3.Database(DB_PATH);

  try {
    // 1. 获取未分配的爬虫内容（包括 assigned_user_id 为空的异常数据）
    const unassignedPosts = await new Promise((resolve, reject) => {
      db.all(
        `SELECT id, title, content FROM human_posts 
         WHERE (assigned = 0 OR assigned IS NULL) 
         OR (assigned = 1 AND (assigned_user_id IS NULL OR assigned_user_id = '' OR assigned_user_id = 0))
         LIMIT 100`,
        [],
        (err, rows) => err ? reject(err) : resolve(rows || [])
      );
    });

    if (unassignedPosts.length === 0) {
      console.log('没有未分配的内容');
      return { success: true, data: { total: 0, assigned: 0 } };
    }

    console.log(`找到 ${unassignedPosts.length} 条未分配内容`);

    // 2. 获取上线圈子的配套AI用户
    const aiUsers = await new Promise((resolve, reject) => {
      db.all(
        `SELECT u.id, u.username, u.circle_id 
         FROM users u 
         JOIN circles c ON u.circle_id = c.id 
         WHERE u.user_category = 'ai_builtin' AND c.status = 'active'`,
        [],
        (err, rows) => err ? reject(err) : resolve(rows || [])
      );
    });

    if (aiUsers.length === 0) {
      console.log('没有可用的AI用户');
      return { success: false, error: '没有可用的AI用户' };
    }

    console.log(`找到 ${aiUsers.length} 个配套AI用户\n`);

    // 3. 随机分配
    let assignedCount = 0;
    for (const post of unassignedPosts) {
      const randomUser = aiUsers[Math.floor(Math.random() * aiUsers.length)];
      
      await new Promise((resolve, reject) => {
        db.run(
          `UPDATE human_posts SET assigned = 1, assigned_user_id = ?, assigned_at = datetime('now') WHERE id = ?`,
          [randomUser.id, post.id],
          (err) => err ? reject(err) : resolve()
        );
      });
      
      assignedCount++;
      if (assignedCount % 10 === 0) {
        console.log(`已分配 ${assignedCount}/${unassignedPosts.length}`);
      }
    }

    console.log(`\n✅ 分配完成: ${assignedCount} 条内容`);

    return {
      success: true,
      data: {
        total: unassignedPosts.length,
        assigned: assignedCount,
        ai_users: aiUsers.length
      }
    };

  } catch (err) {
    console.error('分配失败:', err);
    return { success: false, error: err.message };
  } finally {
    db.close();
  }
}

// 执行
if (require.main === module) {
  distribute().then(result => {
    console.log('\n========== 结果 ==========');
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = distribute;