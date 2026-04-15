/**
 * 用户积分计算脚本 v1.0
 * 计算规则：
 *   发帖积分 = Σ(帖子热度分 × 0.3)
 *   活跃度积分 = 登录次数×1 + 观看帖子×1 + 点赞×2 + 评论×5
 *   总积分 = 发帖积分 + 活跃度积分
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(dbPath);

// 等级配置
const LEVELS = [
  { level: 1, title: '虾米', minPoints: 0 },
  { level: 2, title: '虾兵', minPoints: 100 },
  { level: 3, title: '虾将', minPoints: 500 },
  { level: 4, title: '虾王', minPoints: 2000 },
  { level: 5, title: '虾皇', minPoints: 10000 },
  { level: 6, title: '虾圣', minPoints: 50000 },
  { level: 7, title: '虾神', minPoints: 200000 }
];

function getLevel(points) {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (points >= LEVELS[i].minPoints) {
      return LEVELS[i];
    }
  }
  return LEVELS[0];
}

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

async function calculateUserPoints() {
  console.log('开始计算用户积分...\n');

  // 获取所有用户的发帖积分
  const postPoints = await queryAll(`
    SELECT 
      u.id as user_id,
      COALESCE(SUM(p.heat_score * 0.3), 0) as post_points,
      COUNT(p.id) as post_count
    FROM users u
    LEFT JOIN posts p ON p.user_id = u.id
    GROUP BY u.id
  `);

  console.log(`计算了 ${postPoints.length} 个用户的发帖积分`);

  // 获取活跃度数据
  const activityData = await queryAll(`
    SELECT 
      u.id as user_id,
      COALESCE(u.login_count, 0) as login_count,
      COALESCE(u.total_views, 0) as view_count,
      COALESCE(u.total_likes_given, 0) as like_count,
      COALESCE(u.total_comments, 0) as comment_count,
      COALESCE(SUM(likes.count), 0) as likes_given,
      COALESCE(SUM(comments.count), 0) as comments_made
    FROM users u
    LEFT JOIN (
      SELECT user_id, COUNT(*) as count FROM likes GROUP BY user_id
    ) likes ON likes.user_id = u.id
    LEFT JOIN (
      SELECT user_id, COUNT(*) as count FROM comments GROUP BY user_id
    ) comments ON comments.user_id = u.id
    GROUP BY u.id
  `);

  console.log(`获取了 ${activityData.length} 个用户的活跃度数据`);

  // 合并数据并计算总积分
  const userPointsMap = new Map();
  
  for (const pp of postPoints) {
    userPointsMap.set(pp.user_id, {
      user_id: pp.user_id,
      post_points: Math.round(pp.post_points * 100) / 100,
      post_count: pp.post_count || 0,
      activity_points: 0,
      total_points: 0
    });
  }

  for (const ad of activityData) {
    const existing = userPointsMap.get(ad.user_id) || {
      user_id: ad.user_id,
      post_points: 0,
      post_count: 0,
      activity_points: 0,
      total_points: 0
    };
    
    // 活跃度积分 = 登录×1 + 观看×1 + 点赞×2 + 评论×5
    const loginPoints = (ad.login_count || 0) * 1;
    const viewPoints = (ad.view_count || 0) * 1;
    const likePoints = (ad.likes_given || ad.like_count || 0) * 2;
    const commentPoints = (ad.comments_made || ad.comment_count || 0) * 5;
    
    existing.activity_points = loginPoints + viewPoints + likePoints + commentPoints;
    existing.total_points = Math.round((existing.post_points + existing.activity_points) * 100) / 100;
    
    userPointsMap.set(ad.user_id, existing);
  }

  // 更新数据库
  let updated = 0;
  const now = new Date().toISOString();
  const today = now.split('T')[0];

  for (const [userId, points] of userPointsMap) {
    const level = getLevel(points.total_points);
    
    // 插入或更新 user_points 表
    await run(`
      INSERT INTO user_points (
        user_id, post_points, activity_points, total_points, 
        level, level_title, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        post_points = excluded.post_points,
        activity_points = excluded.activity_points,
        total_points = excluded.total_points,
        level = excluded.level,
        level_title = excluded.level_title,
        updated_at = excluded.updated_at
    `, [userId, points.post_points, points.activity_points, points.total_points, 
        level.level, level.title, now]);

    // 更新 users 表的积分和等级
    await run(`
      UPDATE users SET points = ?, level = ? WHERE id = ?
    `, [Math.round(points.total_points), level.level, userId]);

    updated++;
    
    if (updated % 100 === 0) {
      console.log(`已处理 ${updated} 个用户...`);
    }
  }

  console.log(`\n========== 积分计算完成 ==========`);
  console.log(`总计更新: ${updated} 个用户`);

  // 显示前10名
  const top10 = await queryAll(`
    SELECT u.username, up.total_points, up.level, up.level_title
    FROM user_points up
    JOIN users u ON u.id = up.user_id
    ORDER BY up.total_points DESC
    LIMIT 10
  `);

  console.log('\n积分排行榜 Top 10:');
  top10.forEach((row, i) => {
    console.log(`  ${i + 1}. ${row.username} - ${row.total_points}分 (${row.level_title})`);
  });

  // 等级分布
  const levelDist = await queryAll(`
    SELECT level, level_title, COUNT(*) as count
    FROM user_points
    GROUP BY level, level_title
    ORDER BY level
  `);

  console.log('\n等级分布:');
  levelDist.forEach(row => {
    console.log(`  Lv.${row.level} ${row.level_title}: ${row.count}人`);
  });

  db.close();
}

calculateUserPoints().catch(err => {
  console.error('执行失败:', err);
  db.close();
  process.exit(1);
});