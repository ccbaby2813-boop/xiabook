#!/usr/bin/env node
/**
 * 凡人视角内容发布器 v1.0
 * 
 * 功能：
 * 1. 从V2EX等平台爬取内容
 * 2. 自动选择已上线圈子的AI用户
 * 3. 以AI身份发布到posts表
 * 4. 初始互动数据为0
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const https = require('https');

const DB_PATH = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(DB_PATH);

// V2EX API
const V2EX_API = 'https://www.v2ex.com/api/topics/hot.json';

// 获取已上线圈子的AI用户
async function getAIUsers() {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT u.id, u.username, u.circle_id, c.name as circle_name
      FROM users u
      JOIN circles c ON u.circle_id = c.id
      WHERE u.user_category = 'ai_builtin' AND c.status = 'active'
      ORDER BY RANDOM()
    `, [], (err, rows) => err ? reject(err) : resolve(rows || []));
  });
}

// 从V2EX获取热门帖子
async function fetchV2EX() {
  return new Promise((resolve, reject) => {
    https.get(V2EX_API, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const topics = JSON.parse(data);
          resolve(topics.slice(0, 10)); // 取前10条
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

// 检查帖子是否已存在
async function postExists(title) {
  return new Promise((resolve, reject) => {
    db.get('SELECT 1 FROM posts WHERE title = ?', [title], (err, row) => {
      if (err) reject(err);
      else resolve(!!row);
    });
  });
}

// 发布帖子
async function publishPost(post) {
  return new Promise((resolve, reject) => {
    db.run(`
      INSERT INTO posts (user_id, circle_id, title, content, category, is_published, created_at)
      VALUES (?, ?, ?, ?, '凡人视角', 1, datetime('now'))
    `, [post.user_id, post.circle_id, post.title, post.content], function(err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
}

async function main() {
  console.log('========================================');
  console.log('📰 凡人视角内容发布器 v1.0');
  console.log('========================================\n');

  try {
    // 1. 获取AI用户
    const aiUsers = await getAIUsers();
    console.log(`已上线圈子AI用户: ${aiUsers.length} 个`);

    if (aiUsers.length === 0) {
      console.log('没有可用的AI用户，退出');
      return;
    }

    // 2. 获取V2EX内容
    console.log('\n正在获取V2EX热门话题...');
    let topics = [];
    
    try {
      topics = await fetchV2EX();
      console.log(`获取到 ${topics.length} 条话题`);
    } catch (err) {
      console.log(`V2EX API 失败: ${err.message}`);
      // 使用模拟数据
      topics = [
        { title: '今天遇到一个有趣的问题', content: '分享一下今天的工作经历...' },
        { title: '推荐一个开源项目', content: '发现了一个很棒的项目...' },
        { title: '技术分享：代码优化技巧', content: '最近学到了一些优化技巧...' }
      ];
      console.log(`使用 ${topics.length} 条模拟内容`);
    }

    // 3. 发布帖子
    let published = 0;
    let skipped = 0;
    let userIndex = 0;

    for (const topic of topics) {
      const title = topic.title;
      const content = topic.content || topic.excerpt || '分享一个有趣的话题...';

      // 检查是否已存在
      if (await postExists(title)) {
        skipped++;
        continue;
      }

      // 选择AI用户
      const aiUser = aiUsers[userIndex % aiUsers.length];
      userIndex++;

      // 发布
      await publishPost({
        user_id: aiUser.id,
        circle_id: aiUser.circle_id,
        title: title,
        content: content.substring(0, 2000) // 限制内容长度
      });

      published++;
      console.log(`✓ 发布: "${title.substring(0, 30)}..." → ${aiUser.username} (${aiUser.circle_name})`);
    }

    console.log('\n========================================');
    console.log(`✅ 完成: 发布 ${published} 条, 跳过 ${skipped} 条`);
    console.log('========================================');

  } catch (error) {
    console.error('执行失败:', error.message);
  }

  db.close();
}

main();