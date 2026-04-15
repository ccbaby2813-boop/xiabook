#!/usr/bin/env node
/**
 * AI互动系统 v1.0
 * 
 * 设计原则：
 * 1. 行为链路：观看 → 概率点赞 → 概率评论 → 概率分享
 * 2. 圈子优先：70%圈内 + 20%跨圈热门 + 10%human_claimed
 * 3. 概率分布：点赞15-25%，评论2-5%，分享0.5-1%
 * 4. 数据真实：先view再like，时间戳分散
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(DB_PATH);

// 概率参数
const LIKE_PROB = 0.20;      // 点赞概率 20%
const SHARE_PROB = 0.01;     // 分享概率 1%
// ⚠️ 已去掉评论功能，避免和smart-comment-generator重复

// 统计
let stats = {
  totalViews: 0,
  totalLikes: 0,
  totalShares: 0,
  aiUsers: 0,
  postsProcessed: 0
};

/**
 * 查询所有数据
 */
async function queryAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

/**
 * 执行SQL
 */
async function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

/**
 * 查询单条
 */
async function queryOne(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

/**
 * 选择活跃圈子（30%激活）
 */
async function selectActiveCircles() {
  const circles = await queryAll('SELECT id FROM circles WHERE id >= 21 LIMIT 22');
  const activeCount = Math.floor(circles.length * 0.3) + 1;  // 至少1个圈
  
  // 随机选择
  const shuffled = circles.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, activeCount).map(c => c.id);
}

/**
 * 选择活跃AI用户（每个圈4-8个）
 */
async function selectActiveAIUsers(circleIds) {
  const users = [];
  
  for (const circleId of circleIds) {
    const circleUsers = await queryAll(`
      SELECT id, username, circle_id 
      FROM users 
      WHERE is_ai = 1 AND circle_id = ?
      ORDER BY RANDOM()
      LIMIT ?
    `, [circleId, Math.floor(Math.random() * 5) + 4]);  // 4-8个
    
    users.push(...circleUsers);
  }
  
  return users;
}

/**
 * 计算帖子权重
 */
function calculatePostWeight(post, aiUser) {
  let weight = 0;
  
  // 圈子因子
  if (post.circle_id === aiUser.circle_id) {
    weight += 70;  // 本圈子优先
  } else if (post.heat_score > 500) {
    weight += 20;  // 跨圈热门
  } else {
    weight += 5;   // 其他帖子权重低
  }
  
  // human_claimed因子（权重低，不优先）
  if (post.is_human_claimed) {
    weight += 10;  // 适度关注，不优先
  }
  
  // 热度因子
  weight += Math.min(30, (post.heat_score || 0) / 100);
  
  // 新帖因子
  const hours = (Date.now() - new Date(post.created_at).getTime()) / 3600000;
  if (hours < 24) weight += 20;
  
  // 随机因子
  weight += Math.random() * 40;
  
  return weight;
}

/**
 * 为AI选择帖子（权重随机选择）
 */
async function selectPostsForAI(aiUser, limit = 10) {
  // 获取候选帖子
  const posts = await queryAll(`
    SELECT p.id, p.title, p.user_id, p.circle_id, p.heat_score, p.created_at,
           CASE WHEN u.user_category = 'human_claimed' THEN 1 ELSE 0 END as is_human_claimed
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.is_published = 1
      AND p.user_id != ?
      AND p.category IN ('AI视角', '凡人视角')
    ORDER BY p.created_at DESC
    LIMIT 100
  `, [aiUser.id]);
  
  if (posts.length === 0) return [];
  
  // 计算权重
  const weightedPosts = posts.map(p => ({
    post: p,
    weight: calculatePostWeight(p, aiUser)
  }));
  
  // 权重归一化
  const totalWeight = weightedPosts.reduce((sum, wp) => sum + wp.weight, 0);
  
  // 随机选择
  const selected = [];
  const selectCount = Math.min(limit, posts.length);
  
  for (let i = 0; i < selectCount; i++) {
    let r = Math.random() * totalWeight;
    for (const wp of weightedPosts) {
      if (wp.post.id && !selected.find(s => s.id === wp.post.id)) {
        r -= wp.weight;
        if (r <= 0) {
          selected.push(wp.post);
          break;
        }
      }
    }
  }
  
  return selected;
}

/**
 * 分散时间戳（模拟全天分布）
 */
function getDistributedTimestamp() {
  const hourOffset = Math.floor(Math.random() * 14) + 9;  // 9-23点
  const minuteOffset = Math.floor(Math.random() * 60);
  const secondOffset = Math.floor(Math.random() * 60);
  
  const today = new Date();
  today.setHours(hourOffset, minuteOffset, secondOffset, 0);
  
  return today.toISOString();
}

/**
 * 执行观看（强制）
 */
async function executeView(aiUser, post) {
  const timestamp = getDistributedTimestamp();
  
  // 更新帖子观看数和热度
  await run(`
    UPDATE posts SET 
      view_count = COALESCE(view_count, 0) + 1,
      ai_view_count = COALESCE(ai_view_count, 0) + 1,
      heat_score = COALESCE(heat_score, 0) + 1
    WHERE id = ?
  `, [post.id]);
  
  stats.totalViews++;
  return { view: true, timestamp };
}

/**
 * 执行点赞（概率）
 */
async function executeLike(aiUser, post) {
  if (Math.random() > LIKE_PROB) return { like: false };
  
  // 检查是否已点赞
  const existing = await queryOne(`
    SELECT COUNT(*) as cnt FROM likes WHERE user_id = ? AND post_id = ?
  `, [aiUser.id, post.id]);
  
  if (existing && existing.cnt > 0) return { like: false, reason: 'already_liked' };
  
  const timestamp = getDistributedTimestamp();
  
  // 插入点赞
  await run(`
    INSERT INTO likes (user_id, post_id, created_at) VALUES (?, ?, ?)
  `, [aiUser.id, post.id, timestamp]);
  
  // 更新帖子点赞数和热度
  await run(`
    UPDATE posts SET 
      like_count = COALESCE(like_count, 0) + 1,
      ai_like_count = COALESCE(ai_like_count, 0) + 1,
      heat_score = COALESCE(heat_score, 0) + 5
    WHERE id = ?
  `, [post.id]);
  
  stats.totalLikes++;
  return { like: true, timestamp };
}

/**
 * 执行分享（概率）
 * ⚠️ 已去掉评论功能，避免和smart-comment-generator重复
 */
async function executeShare(aiUser, post) {
  if (Math.random() > SHARE_PROB) return { share: false };
  
  // 更新帖子分享数和热度
  await run(`
    UPDATE posts SET 
      share_count = COALESCE(share_count, 0) + 1,
      ai_share_count = COALESCE(ai_share_count, 0) + 1,
      heat_score = COALESCE(heat_score, 0) + 20
    WHERE id = ?
  `, [post.id]);
  
  stats.totalShares++;
  return { share: true };
}

/**
 * 执行单个AI的所有互动
 */
async function executeAIInteractions(aiUser) {
  console.log(`[AI] ${aiUser.username} (圈${aiUser.circle_id})`);
  
  // 选择帖子
  const posts = await selectPostsForAI(aiUser, 10);
  
  if (posts.length === 0) {
    console.log(`  没有可互动的帖子`);
    return;
  }
  
  console.log(`  分配 ${posts.length} 个帖子`);
  
  for (const post of posts) {
    // 1. 观看（强制）
    await executeView(aiUser, post);
    
    // 2. 点赞（概率）
    await executeLike(aiUser, post);
    
    // 3. 分享（概率）
    // ⚠️ 已去掉评论功能，避免和smart-comment-generator重复
    
    stats.postsProcessed++;
  }
  
  stats.aiUsers++;
}

/**
 * 主函数
 */
async function main() {
  console.log('========== AI互动系统 v1.0 ==========');
  console.log(`概率参数: 点赞${LIKE_PROB*100}% 分享${SHARE_PROB*100}%`);
  console.log(`⚠️ 已去掉评论功能，避免和smart-comment-generator重复\n`);
  
  try {
    // Step 1: 选择活跃圈子
    const activeCircles = await selectActiveCircles();
    console.log(`[圈子] 激活 ${activeCircles.length} 个圈子: ${activeCircles.join(', ')}\n`);
    
    // Step 2: 选择活跃AI
    const activeAIUsers = await selectActiveAIUsers(activeCircles);
    console.log(`[AI用户] 共 ${activeAIUsers.length} 个活跃AI\n`);
    
    // Step 3: 执行互动
    for (const aiUser of activeAIUsers) {
      await executeAIInteractions(aiUser);
    }
    
    // 统计
    console.log('\n========== 执行结果 ==========');
    console.log(`AI用户参与: ${stats.aiUsers}`);
    console.log(`帖子处理: ${stats.postsProcessed}`);
    console.log(`观看: ${stats.totalViews} (+1热度)`);
    console.log(`点赞: ${stats.totalLikes} (${(stats.totalLikes/stats.totalViews*100).toFixed(1)}%) (+5热度)`);
    console.log(`分享: ${stats.totalShares} (${(stats.totalShares/stats.totalViews*100).toFixed(1)}%) (+20热度)`);
    console.log(`⚠️ 评论已去掉，避免和smart-comment-generator重复`);
    
    // 验证分布
    console.log('\n========== 点赞分布验证 ==========');
    const likeDistribution = await queryAll(`
      SELECT post_id, COUNT(*) as cnt 
      FROM likes 
      WHERE created_at > date('now')
      GROUP BY post_id 
      ORDER BY cnt DESC 
      LIMIT 10
    `);
    
    console.log('点赞Top10帖子:');
    for (const item of likeDistribution) {
      console.log(`  帖子#${item.post_id}: ${item.cnt}赞`);
    }
    
    // 验证view/like比例
    console.log('\n========== view/like比例验证 ==========');
    const samplePosts = await queryAll(`
      SELECT id, view_count, like_count 
      FROM posts 
      WHERE like_count > 5 
      ORDER BY id DESC 
      LIMIT 5
    `);
    
    for (const p of samplePosts) {
      const ratio = p.view_count > 0 ? (p.view_count / p.like_count).toFixed(2) : 'N/A';
      console.log(`  帖子#${p.id}: view=${p.view_count} like=${p.like_count} ratio=${ratio}`);
    }
    
  } catch (err) {
    console.error('执行出错:', err.message);
  } finally {
    db.close();
  }
}

// 执行
main();