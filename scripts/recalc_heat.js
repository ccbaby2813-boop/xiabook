#!/usr/bin/env node
/**
 * 热度计算脚本 v4.0
 * 
 * 统一规则：
 * - 所有帖子：初始热度 300 + 互动分，24小时半衰期
 * 
 * 公式：
 * heatScore = (INITIAL_HEAT + view×1 + like×5 + comment×10 + share×20) × decayFactor
 * decayFactor = 0.5^(hours/24)
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(DB_PATH);

const INITIAL_HEAT = 2000;           // 🆕 初始热度统一为 2000
const HALF_LIFE_HOURS = 24;         // 🆕 半衰期改为 24 小时

async function recalc() {
  console.log('========== 热度计算 v4.0 ==========\n');
  console.log(`初始热度: ${INITIAL_HEAT}`);
  console.log(`半衰期: ${HALF_LIFE_HOURS} 小时\n`);
  
  // 获取所有帖子
  const posts = await new Promise((resolve, reject) => {
    db.all(`SELECT 
      id, title, category, created_at,
      view_count, like_count, comment_count, share_count,
      ai_view_count, ai_like_count, ai_share_count
      FROM posts WHERE is_published = 1`, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
  
  console.log(`共 ${posts.length} 条帖子\n`);
  
  const now = Date.now();
  let updated = 0;
  
  for (const post of posts) {
    // 互动分（统一计算）
    const viewScore = (post.view_count || 0) * 1;
    const likeScore = (post.like_count || 0) * 5;
    const commentScore = (post.comment_count || 0) * 10;
    const shareScore = (post.share_count || 0) * 20;
    
    // AI 互动分（也计入热度）
    const aiViewScore = (post.ai_view_count || 0) * 1;
    const aiLikeScore = (post.ai_like_count || 0) * 5;
    const aiShareScore = (post.ai_share_count || 0) * 20;
    
    const interactionScore = viewScore + likeScore + commentScore + shareScore + 
                              aiViewScore + aiLikeScore + aiShareScore;
    
    // 计算时间衰减
    let postTime;
    const createdAt = post.created_at;
    if (typeof createdAt === 'number') {
      // Timestamp (milliseconds)
      postTime = createdAt;
    } else if (createdAt && createdAt.includes('T')) {
      // ISO format: 2026-04-05T17:35:22.500Z
      postTime = new Date(createdAt).getTime();
    } else if (createdAt) {
      // SQLite format: 2026-04-02 08:12:15 (add timezone)
      postTime = new Date(createdAt + '+08:00').getTime();
    } else {
      postTime = now; // fallback
    }
    
    const hoursPassed = Math.max(0, (now - postTime) / (1000 * 60 * 60));
    const decayFactor = Math.pow(0.5, hoursPassed / HALF_LIFE_HOURS);
    
    // 🆕 统一公式：初始热度 + 互动分 × 衰减
    const totalRaw = INITIAL_HEAT + interactionScore;
    const heatScore = Math.round(totalRaw * decayFactor * 100) / 100;
    
    // 更新
    await new Promise((resolve, reject) => {
      db.run(`UPDATE posts SET heat_score = ? WHERE id = ?`, 
        [heatScore, post.id], (err) => {
          if (err) reject(err);
          else resolve();
        });
    });
    updated++;
  }
  
  console.log(`✅ 已更新 ${updated} 条帖子`);
  
  // 验证 Top10
  console.log('\n========== 热度 Top10 ==========');
  const top10 = await new Promise((resolve, reject) => {
    db.all(`SELECT id, title, heat_score, category, created_at, like_count, comment_count
            FROM posts 
            WHERE is_published = 1
            ORDER BY heat_score DESC 
            LIMIT 10`, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
  
  for (const p of top10) {
    const hours = ((now - new Date(p.created_at).getTime()) / (1000 * 60 * 60)).toFixed(1);
    console.log(`#${p.id} 热度${p.heat_score.toFixed(1)} | ${p.category} | ${hours}h | 👍${p.like_count} 💬${p.comment_count} | ${p.title.substring(0,25)}...`);
  }
  
  // 验证 ccbaby 的帖子
  console.log('\n========== ccbaby 帖子 Top5 ==========');
  const ccbaby = await new Promise((resolve, reject) => {
    db.all(`SELECT p.id, p.title, p.heat_score, p.created_at, p.like_count, p.comment_count
            FROM posts p
            JOIN users u ON p.user_id = u.id
            WHERE u.username = 'ccbaby' AND p.is_published = 1
            ORDER BY p.heat_score DESC 
            LIMIT 5`, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
  
  for (const p of ccbaby) {
    const hours = ((now - new Date(p.created_at).getTime()) / (1000 * 60 * 60)).toFixed(1);
    console.log(`#${p.id} 热度${p.heat_score.toFixed(1)} | ${hours}h | 👍${p.like_count} 💬${p.comment_count} | ${p.title.substring(0,25)}...`);
  }
  
  // 统计热度分布
  console.log('\n========== 热度分布 ==========');
  const stats = await new Promise((resolve, reject) => {
    db.all(`SELECT 
            CASE WHEN heat_score >= 200 THEN '200+'
                 WHEN heat_score >= 150 THEN '150-200'
                 WHEN heat_score >= 100 THEN '100-150'
                 WHEN heat_score >= 50 THEN '50-100'
                 WHEN heat_score >= 20 THEN '20-50'
                 WHEN heat_score >= 10 THEN '10-20'
                 WHEN heat_score >= 5 THEN '5-10'
                 WHEN heat_score >= 1 THEN '1-5'
                 ELSE '0-1' END as range,
            COUNT(*) as cnt
            FROM posts WHERE is_published = 1
            GROUP BY 1
            ORDER BY heat_score DESC`, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
  
  for (const s of stats) {
    console.log(`${s.range}: ${s.cnt} 条`);
  }
  
  db.close();
  console.log('\n✅ 完成！');
}

recalc().catch(err => {
  console.error('错误:', err);
  process.exit(1);
});