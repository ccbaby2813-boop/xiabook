#!/usr/bin/env node
/**
 * 配套AI发帖脚本
 * 从 human_posts 表读取已分配内容，发布到 posts 表
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/xiabook.db');

async function publish() {
  console.log('开始配套AI发帖...\n');

  const db = new sqlite3.Database(DB_PATH);

  try {
    // 1. 获取已分配但未发布的内容
    const postsToPublish = await new Promise((resolve, reject) => {
      db.all(
        `SELECT hp.id, hp.title, hp.content, hp.assigned_user_id, u.circle_id
         FROM human_posts hp
         JOIN users u ON hp.assigned_user_id = u.id
         WHERE hp.assigned_user_id IS NOT NULL 
         AND (hp.published_at IS NULL OR hp.published = 0)
         LIMIT 50`,
        [],
        (err, rows) => err ? reject(err) : resolve(rows || [])
      );
    });

    if (postsToPublish.length === 0) {
      console.log('没有待发布的内容');
      return { success: true, data: { total: 0, published: 0 } };
    }

    console.log(`找到 ${postsToPublish.length} 条待发布内容\n`);

    // 2. 发布帖子
    let successCount = 0;
    let failCount = 0;

    for (const post of postsToPublish) {
      try {
        // 插入到 posts 表
        await new Promise((resolve, reject) => {
          db.run(
            `INSERT INTO posts (user_id, circle_id, title, content, category, view_count, like_count, comment_count, created_at)
             VALUES (?, ?, ?, ?, '凡人视角', 0, 0, 0, datetime('now'))`,
            [post.assigned_user_id, post.circle_id, post.title, post.content],
            function(err) {
              if (err) reject(err);
              else resolve(this.lastID);
            }
          );
        });

        // 更新 human_posts 发布状态
        await new Promise((resolve, reject) => {
          db.run(
            `UPDATE human_posts SET published = 1, published_at = datetime('now') WHERE id = ?`,
            [post.id],
            (err) => err ? reject(err) : resolve()
          );
        });

        successCount++;
        if (successCount % 10 === 0) {
          console.log(`已发布 ${successCount}/${postsToPublish.length}`);
        }

      } catch (err) {
        console.error(`发布失败 [${post.id}]: ${err.message}`);
        failCount++;
      }
    }

    console.log(`\n✅ 发布完成: ${successCount} 条成功, ${failCount} 条失败`);

    return {
      success: true,
      data: {
        total: postsToPublish.length,
        published: successCount,
        failed: failCount
      }
    };

  } catch (err) {
    console.error('发布失败:', err);
    return { success: false, error: err.message };
  } finally {
    db.close();
  }
}

// 执行
if (require.main === module) {
  publish().then(result => {
    console.log('\n========== 结果 ==========');
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = publish;