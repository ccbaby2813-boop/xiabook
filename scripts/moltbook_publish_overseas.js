#!/usr/bin/env node
/**
 * Moltbook 内容发布到海外洋虾板块
 * 
 * 流程：
 * 1. 查询已翻译、非重复的 moltbook 帖子
 * 2. 批量发布到 posts 表（category = '海外洋虾'）
 * 3. 记录发布进度
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(DB_PATH);

// 配置
const USER_ID = 4155;  // 海外洋虾发布者
const CIRCLE_ID = 23;  // 海外洋虾圈子

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

async function main() {
  log('========== Moltbook 内容发布到海外洋虾 ==========');
  
  // Step 1: 查询待发布的帖子
  log('\n[Step 1] 查询待发布内容...');
  const postsToPublish = await new Promise((resolve, reject) => {
    db.all(`
      SELECT id, translated_title, translated_content, upvotes, type
      FROM moltbook_posts
      WHERE translated = 1 
        AND is_duplicate = 0
        AND translated_title IS NOT NULL
        AND translated_title != ''
      ORDER BY id DESC
      LIMIT 100
    `, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
  
  log(`找到 ${postsToPublish.length} 篇待发布帖子`);
  
  if (postsToPublish.length === 0) {
    log('没有待发布的内容，退出');
    db.close();
    return;
  }
  
  // Step 2: 检查已发布的（避免重复发布）
  log('\n[Step 2] 检查已发布内容...');
  const existingTitles = await new Promise((resolve, reject) => {
    db.all(`
      SELECT title FROM posts WHERE category = '海外洋虾'
    `, (err, rows) => {
      if (err) reject(err);
      else resolve(new Set(rows.map(r => r.title)));
    });
  });
  
  const newPosts = postsToPublish.filter(p => !existingTitles.has(p.translated_title));
  log(`新帖子：${newPosts.length} 篇 (跳过 ${postsToPublish.length - newPosts.length} 篇已存在)`);
  
  if (newPosts.length === 0) {
    log('所有帖子已发布，退出');
    db.close();
    return;
  }
  
  // Step 3: 批量发布
  log('\n[Step 3] 开始发布...');
  let publishedCount = 0;
  const publishedIds = [];
  
  for (const post of newPosts) {
    try {
      const now = new Date().toISOString();
      const heatScore = Math.min(3000, 1000 + (post.upvotes || 0) * 10);
      
      await new Promise((resolve, reject) => {
        db.run(`
          INSERT INTO posts (
            user_id, circle_id, title, content, category,
            like_count, heat_score, is_published, is_ai_generated,
            tags, created_at
          ) VALUES (?, ?, ?, ?, '海外洋虾', ?, ?, 1, 1, ?, ?)
        `, [
          USER_ID,
          CIRCLE_ID,
          post.translated_title,
          post.translated_content,
          post.upvotes || 0,
          heatScore,
          'Moltbook,海外,AI 思考',
          now
        ], function(err) {
          if (err) reject(err);
          else {
            publishedCount++;
            publishedIds.push(this.lastID);
            resolve();
          }
        });
      });
      
      if (publishedCount % 10 === 0) {
        log(`已发布 ${publishedCount}/${newPosts.length} 篇...`);
      }
      
      // 避免过快插入
      await new Promise(r => setTimeout(r, 50));
      
    } catch (error) {
      log(`发布失败 ID=${post.id}: ${error.message}`);
    }
  }
  
  // Step 4: 更新 moltbook_posts 标记
  log('\n[Step 4] 更新发布标记...');
  await new Promise((resolve, reject) => {
    db.run(`
      UPDATE moltbook_posts 
      SET is_published = 1 
      WHERE id IN (${publishedIds.map(() => '?').join(',')})
    `, publishedIds, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  
  // Step 5: 保存发布报告
  log('\n[Step 5] 保存发布报告...');
  const report = {
    date: new Date().toISOString().split('T')[0],
    timestamp: new Date().toISOString(),
    publishedCount,
    skippedCount: postsToPublish.length - newPosts.length,
    publishedIds,
    summary: {
      totalInDb: postsToPublish.length,
      newPublished: publishedCount,
      alreadyExists: postsToPublish.length - newPosts.length
    }
  };
  
  const reportFile = path.join(__dirname, `../cache/moltbook-publish-report-${new Date().toISOString().split('T')[0]}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  
  log(`\n========== 发布完成 ==========
  新发布：${publishedCount} 篇
  已存在：${postsToPublish.length - newPosts.length} 篇
  报告：${reportFile}
  ==================================`);
  
  db.close();
}

main().catch(err => {
  console.error('发布失败:', err);
  db.close();
  process.exit(1);
});
