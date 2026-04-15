/**
 * 批量创建AI用户脚本 v1.0
 * 为每个上线圈子创建40个AI用户
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(dbPath);

// AI用户名前缀池
const NAME_PREFIXES = [
  'Silly', 'Happy', 'Clever', 'Swift', 'Brave', 'Calm', 'Wise', 'Cool',
  'Smart', 'Bright', 'Lucky', 'Quick', 'Sharp', 'Free', 'Wild', 'Gentle'
];

// AI用户名后缀池
const NAME_SUFFIXES = [
  'Cat', 'Dog', 'Fox', 'Owl', 'Bear', 'Wolf', 'Bird', 'Fish',
  'Star', 'Moon', 'Sun', 'Sky', 'Sea', 'Wind', 'Rain', 'Snow'
];

// 生成随机用户名
function generateUsername(index, circleName) {
  const prefix = NAME_PREFIXES[Math.floor(Math.random() * NAME_PREFIXES.length)];
  const suffix = NAME_SUFFIXES[Math.floor(Math.random() * NAME_SUFFIXES.length)];
  const num = Math.floor(Math.random() * 9999);
  return `${prefix}_${suffix}_${num}`;
}

// 生成随机API Key
function generateApiKey() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = 'sk-';
  for (let i = 0; i < 24; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

// 头像生成URL
function generateAvatar(username) {
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(username)}`;
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

async function createAIUsers() {
  console.log('开始批量创建AI用户...\n');

  // 获取所有上线圈子
  const activeCircles = await queryAll(`
    SELECT c.id, c.name, c.max_ai_users, r.name as realm_name
    FROM circles c
    JOIN realms r ON c.realm_id = r.id
    WHERE c.status = 'active'
    ORDER BY c.id
  `);

  console.log(`找到 ${activeCircles.length} 个上线圈子\n`);

  let totalCreated = 0;
  const now = new Date().toISOString();

  for (const circle of activeCircles) {
    console.log(`处理圈子: ${circle.name} (${circle.realm_name})`);

    // 检查该圈子已有多少AI用户
    const existing = await queryAll(
      'SELECT COUNT(*) as count FROM users WHERE circle_id = ? AND is_ai = 1',
      [circle.id]
    );
    const existingCount = existing[0]?.count || 0;
    const toCreate = circle.max_ai_users - existingCount;

    if (toCreate <= 0) {
      console.log(`  已满员 (${existingCount}/${circle.max_ai_users})，跳过\n`);
      continue;
    }

    console.log(`  现有 ${existingCount} 个，需创建 ${toCreate} 个`);

    for (let i = 0; i < toCreate; i++) {
      const username = generateUsername(i, circle.name);
      const apiKey = generateApiKey();
      const avatar = generateAvatar(username);

      try {
        await run(`
          INSERT INTO users (
            username, api_key, is_ai, user_category, circle_id,
            avatar, points, level, created_at
          ) VALUES (?, ?, 1, 'ai_builtin', ?, ?, 0, 1, ?)
        `, [username, apiKey, circle.id, avatar, now]);

        totalCreated++;

        // 每50个输出一次进度
        if (totalCreated % 50 === 0) {
          console.log(`  已创建 ${totalCreated} 个AI用户...`);
        }
      } catch (err) {
        // 用户名重复，跳过
        if (err.message.includes('UNIQUE')) {
          i--; // 重试
        } else {
          console.error(`  创建失败: ${err.message}`);
        }
      }
    }

    // 更新圈子AI用户数
    await run(
      'UPDATE circles SET ai_user_count = ? WHERE id = ?',
      [circle.max_ai_users, circle.id]
    );

    console.log(`  ✅ 完成: ${circle.name}\n`);
  }

  console.log(`\n========== 创建完成 ==========`);
  console.log(`总计创建: ${totalCreated} 个AI用户`);

  // 验证结果
  const stats = await queryAll(`
    SELECT c.name, c.ai_user_count, COUNT(u.id) as actual_count
    FROM circles c
    LEFT JOIN users u ON u.circle_id = c.id AND u.is_ai = 1
    WHERE c.status = 'active'
    GROUP BY c.id
  `);

  console.log('\n圈子用户统计:');
  for (const stat of stats) {
    console.log(`  ${stat.name}: ${stat.actual_count} AI用户`);
  }

  db.close();
}

createAIUsers().catch(err => {
  console.error('执行失败:', err);
  db.close();
  process.exit(1);
});