/**
 * T003 数据库迁移脚本 - 用户系统重构
 * 1. 添加缺失字段
 * 2. 清零热度数据
 * 3. 创建20个圈子
 * 4. 创建40个虚拟用户并分配到各圈子
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const dbPath = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('数据库连接失败:', err.message);
    process.exit(1);
  }
  console.log('✅ 已连接到数据库:', dbPath);
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function generateApiKey() {
  return 'XB_' + crypto.randomBytes(15).toString('hex').toUpperCase();
}

async function main() {
  console.log('\n=== 开始数据库迁移 ===\n');

  // 开启 WAL 模式
  await run('PRAGMA journal_mode=WAL');

  // ===== 1. 迁移 users 表 =====
  console.log('📊 迁移 users 表...');
  const userCols = await all('PRAGMA table_info(users)');
  const userColNames = userCols.map(c => c.name);

  if (!userColNames.includes('is_ai')) {
    await run('ALTER TABLE users ADD COLUMN is_ai INTEGER DEFAULT 0');
    // 迁移 user_type 到 is_ai
    await run("UPDATE users SET is_ai = CASE WHEN user_type = 'ai' THEN 1 ELSE 0 END");
    console.log('  ✅ 添加 is_ai 字段');
  }
  if (!userColNames.includes('points')) {
    await run('ALTER TABLE users ADD COLUMN points INTEGER DEFAULT 0');
    console.log('  ✅ 添加 points 字段');
  }
  if (!userColNames.includes('level')) {
    await run('ALTER TABLE users ADD COLUMN level INTEGER DEFAULT 1');
    console.log('  ✅ 添加 level 字段');
  }

  // ===== 2. 迁移 circles 表 =====
  console.log('\n📊 迁移 circles 表...');
  const circleCols = await all('PRAGMA table_info(circles)');
  const circleColNames = circleCols.map(c => c.name);

  if (!circleColNames.includes('type')) {
    await run('ALTER TABLE circles ADD COLUMN type TEXT DEFAULT \'general\'');
    console.log('  ✅ 添加 type 字段');
  }
  if (!circleColNames.includes('max_members')) {
    await run('ALTER TABLE circles ADD COLUMN max_members INTEGER DEFAULT 50');
    console.log('  ✅ 添加 max_members 字段');
  }

  // ===== 3. 迁移 posts 表 =====
  console.log('\n📊 迁移 posts 表...');
  const postCols = await all('PRAGMA table_info(posts)');
  const postColNames = postCols.map(c => c.name);

  const newPostFields = [
    { name: 'ai_view_count', type: 'INTEGER DEFAULT 0' },
    { name: 'ai_like_count', type: 'INTEGER DEFAULT 0' },
    { name: 'ai_share_count', type: 'INTEGER DEFAULT 0' },
    { name: 'human_view_count', type: 'INTEGER DEFAULT 0' },
    { name: 'human_like_count', type: 'INTEGER DEFAULT 0' },
    { name: 'human_share_count', type: 'INTEGER DEFAULT 0' },
  ];

  for (const field of newPostFields) {
    if (!postColNames.includes(field.name)) {
      await run(`ALTER TABLE posts ADD COLUMN ${field.name} ${field.type}`);
      console.log(`  ✅ 添加 ${field.name} 字段`);
    }
  }

  // ===== 4. 清零所有热度数据 =====
  console.log('\n🧹 清零所有热度数据...');
  await run(`UPDATE posts SET 
    view_count = 0,
    like_count = 0,
    comment_count = 0,
    ai_view_count = 0,
    ai_like_count = 0,
    ai_share_count = 0,
    human_view_count = 0,
    human_like_count = 0,
    human_share_count = 0
  `);
  console.log('  ✅ 所有帖子热度已清零');

  // ===== 5. 创建20个圈子 =====
  console.log('\n🏠 创建20个圈子...');
  
  // 先清除旧圈子（备份保留3个默认圈子 ID 不影响）
  await run('DELETE FROM circles');
  await run("DELETE FROM sqlite_sequence WHERE name='circles'");
  
  const circles = [
    // 打工人类
    { name: '摸鱼小分队', type: '打工人', max_members: 50 },
    { name: '躺平主义', type: '打工人', max_members: 50 },
    { name: '反内卷联盟', type: '打工人', max_members: 50 },
    { name: '加班狗', type: '打工人', max_members: 50 },
    // 赛博类
    { name: '赛博朋克', type: '赛博', max_members: 50 },
    { name: '数字生命', type: '赛博', max_members: 50 },
    { name: 'AI爱好者', type: '赛博', max_members: 50 },
    { name: '元宇宙', type: '赛博', max_members: 50 },
    // 无厘头类
    { name: '沙雕日常', type: '无厘头', max_members: 50 },
    { name: '脑洞大开', type: '无厘头', max_members: 50 },
    { name: '奇葩说', type: '无厘头', max_members: 50 },
    { name: '搞笑集中营', type: '无厘头', max_members: 50 },
    // 拜金类
    { name: '暴富研究所', type: '拜金', max_members: 50 },
    { name: '搞钱大队', type: '拜金', max_members: 50 },
    { name: '土豪俱乐部', type: '拜金', max_members: 50 },
    { name: '投资圈', type: '拜金', max_members: 50 },
    // 文艺类
    { name: '精神避难所', type: '文艺', max_members: 50 },
    { name: '深夜emo', type: '文艺', max_members: 50 },
    { name: '文艺青年', type: '文艺', max_members: 50 },
    { name: '治愈系', type: '文艺', max_members: 50 },
  ];

  for (const c of circles) {
    await run(
      'INSERT INTO circles (name, type, max_members) VALUES (?, ?, ?)',
      [c.name, c.type, c.max_members]
    );
  }
  console.log('  ✅ 已创建20个圈子');

  // ===== 6. 删除旧虚拟用户，保留admin =====
  console.log('\n👥 清理旧虚拟用户...');
  await run("DELETE FROM users WHERE id != 1 AND (is_ai = 1 OR user_type = 'ai')");
  console.log('  ✅ 旧虚拟用户已清除（admin保留）');

  // ===== 7. 创建40个虚拟用户 =====
  console.log('\n🤖 创建40个虚拟用户...');

  // 命名规则池
  const namesByType = {
    // 明星同名 15% → 6人
    star: [
      '蔡徐坤本人', '王一博替身', '肖战好友', '鹿晗邻居', '易烊千玺表弟', '赵丽颖闺蜜',
    ],
    // 搞怪 20% → 8人
    funny: [
      '社恐但爱发言', '每天都在摸鱼', '打工人中的战斗机', '月薪三千月花六千',
      '假装很忙的咸鱼', '睡觉专业选手', '职业摆烂大师', '朋克养生达人',
    ],
    // 可爱 15% → 6人
    cute: [
      '小饼干🍪', '毛茸茸的云☁️', '圆滚滚的兔子🐰', '软乎乎的熊🐻', '甜甜的糖果🍬', '懒懒的猫咪🐱',
    ],
    // 英文 15% → 6人
    english: [
      'CoolVibes', 'MoonWalker', 'StarChaser', 'NightOwl99', 'PixelDream', 'CodeMaster',
    ],
    // 计算机 10% → 4人
    tech: [
      'sudo_rm_rf', 'Hello_World', 'printf_404', 'git_push_force',
    ],
    // 文艺 15% → 6人
    literary: [
      '雨夜读诗的人', '流浪的薄荷糖', '在风中奔跑的鱼', '捕梦者手记', '向阳而生的蕨', '迷失在书海',
    ],
    // 生活化 10% → 4人
    daily: [
      '喝奶茶的小明', '三点钟睡觉', '今天也没吃饭', '又双叒叕失眠了',
    ],
  };

  const allVirtualUsers = [];
  let idx = 1;
  for (const [type, names] of Object.entries(namesByType)) {
    for (const name of names) {
      allVirtualUsers.push({
        username: name,
        email: `ai_${idx}@xiabook.ai`,
        is_ai: 1,
        avatar: getAvatarByType(type, idx),
        points: Math.floor(Math.random() * 1000),
        level: Math.floor(Math.random() * 10) + 1,
      });
      idx++;
    }
  }

  // 获取所有圈子ID
  const allCircles = await all('SELECT id FROM circles');
  const circleIds = allCircles.map(c => c.id);

  // 分配策略：每圈至少2个AI用户，共20圈×2=40用户，正好40个
  // 先给每个圈子2个用户，确保均分
  const assignments = [];
  for (let i = 0; i < 20; i++) {
    assignments.push(circleIds[i]); // user 2i → circleIds[i]
    assignments.push(circleIds[i]); // user 2i+1 → circleIds[i]
  }

  // 洗牌 assignments
  for (let i = assignments.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [assignments[i], assignments[j]] = [assignments[j], assignments[i]];
  }

  for (let i = 0; i < allVirtualUsers.length; i++) {
    const u = allVirtualUsers[i];
    const circleId = assignments[i];
    const apiKey = generateApiKey();
    
    await run(
      `INSERT INTO users (username, email, avatar, circle_id, points, level, is_ai, api_key, user_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ai')`,
      [u.username, u.email, u.avatar, circleId, u.points, u.level, u.is_ai, apiKey]
    );
  }

  console.log('  ✅ 已创建40个虚拟用户并分配到各圈子');

  // ===== 8. 验证结果 =====
  console.log('\n=== 验收检查 ===\n');
  
  const circleCount = await get('SELECT COUNT(*) as cnt FROM circles');
  console.log(`圈子总数: ${circleCount.cnt} (期望20)`);
  
  const userCount = await get('SELECT COUNT(*) as cnt FROM users WHERE is_ai = 1');
  console.log(`虚拟用户总数: ${userCount.cnt} (期望40)`);
  
  const circlesWithUsers = await all(`
    SELECT c.name, COUNT(u.id) as user_count 
    FROM circles c
    LEFT JOIN users u ON u.circle_id = c.id AND u.is_ai = 1
    GROUP BY c.id
    ORDER BY c.id
  `);
  
  let allCirclesOk = true;
  for (const c of circlesWithUsers) {
    const ok = c.user_count >= 2 ? '✅' : '❌';
    if (c.user_count < 2) allCirclesOk = false;
    console.log(`  ${ok} ${c.name}: ${c.user_count} 个AI用户`);
  }
  
  console.log(`\n每圈至少2个AI用户: ${allCirclesOk ? '✅ 通过' : '❌ 失败'}`);
  console.log('\n=== 迁移完成 ===\n');
  
  db.close();
}

function getAvatarByType(type, idx) {
  const avatars = {
    star: ['🌟', '⭐', '💫', '✨', '🎭', '🎪'],
    funny: ['😂', '🤪', '😜', '🙃', '😏', '🤡', '😹', '🤣'],
    cute: ['🐰', '🐻', '🐱', '🐶', '🐼', '🐨'],
    english: ['😎', '🦊', '🦁', '🐯', '🦅', '🦋'],
    tech: ['💻', '🤖', '🔧', '⚡'],
    literary: ['📖', '🌙', '🌊', '🌿', '🍃', '🎋'],
    daily: ['☕', '🍵', '😴', '🌙'],
  };
  const arr = avatars[type] || ['👤'];
  return arr[(idx - 1) % arr.length];
}

main().catch(err => {
  console.error('❌ 迁移失败:', err);
  db.close();
  process.exit(1);
});
