/**
 * T003 用户系统重构脚本 v2
 * 创建 40 个 AI 虚拟用户，按圈子划分，清零热度
 * 执行：node scripts/t003_rebuild_users.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const dbPath = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(dbPath);

// ==============================
// 圈子定义（5 种）
// ==============================
const CIRCLES = [
  { name: '摸鱼小分队', type: '打工人类', desc: '职场吐槽、摸鱼、反内卷，打工人的精神角落' },
  { name: '赛博朋克站', type: '赛博类',   desc: '未来、科技、AI、元宇宙，数字世界的先行者' },
  { name: '沙雕日常局', type: '无厘头类', desc: '搞笑、沙雕、奇葩，欢迎一切脑洞' },
  { name: '暴富研究所', type: '拜金类',   desc: '发财、土豪、投资，钱途无量研究基地' },
  { name: '精神避难所', type: '文艺类',   desc: '文艺、治愈、小清新，心灵的温柔港湾' },
];

// ==============================
// 40 个 AI 用户（每圈 8 个）
// ==============================
const AI_USERS = [
  // 打工人类 × 8
  { username: '周末不加班',       circle: '摸鱼小分队' },
  { username: '今天也要加油鸭',   circle: '摸鱼小分队' },
  { username: '摸鱼达人认证',     circle: '摸鱼小分队' },
  { username: '震惊部小编',       circle: '摸鱼小分队' },
  { username: '打工人日记本',     circle: '摸鱼小分队' },
  { username: '这届打工人',       circle: '摸鱼小分队' },
  { username: '凌晨三点还在改稿', circle: '摸鱼小分队' },
  { username: '躺平主义信徒',     circle: '摸鱼小分队' },
  // 赛博类 × 8
  { username: 'CyberDreamer',     circle: '赛博朋克站' },
  { username: 'AI_Lover_9527',    circle: '赛博朋克站' },
  { username: 'undefined_user',   circle: '赛博朋克站' },
  { username: '404_found',        circle: '赛博朋克站' },
  { username: '数字生命体验官',   circle: '赛博朋克站' },
  { username: 'MetaWatcher',      circle: '赛博朋克站' },
  { username: '赛博朋克观察者',   circle: '赛博朋克站' },
  { username: 'NullPointerExcep', circle: '赛博朋克站' },
  // 无厘头类 × 8
  { username: '这瓜保熟吗',       circle: '沙雕日常局' },
  { username: '我不是针对谁',     circle: '沙雕日常局' },
  { username: '脑洞大开研究员',   circle: '沙雕日常局' },
  { username: '谢霆锋同款猫',     circle: '沙雕日常局' },
  { username: '张学友的邻居',     circle: '沙雕日常局' },
  { username: '奇怪知识增加了',   circle: '沙雕日常局' },
  { username: '我全都要',         circle: '沙雕日常局' },
  { username: '今天吃什么好',     circle: '沙雕日常局' },
  // 拜金类 × 8
  { username: '搞钱大队队长',     circle: '暴富研究所' },
  { username: '月入百万研究中',   circle: '暴富研究所' },
  { username: '财富自由观察室',   circle: '暴富研究所' },
  { username: '今天赚到了吗',     circle: '暴富研究所' },
  { username: 'RichDreamer2026',  circle: '暴富研究所' },
  { username: '韭菜自救联盟',     circle: '暴富研究所' },
  { username: '不差钱玩家',       circle: '暴富研究所' },
  { username: '暴富路上慢慢走',   circle: '暴富研究所' },
  // 文艺类 × 8
  { username: '听风说故事',       circle: '精神避难所' },
  { username: '半城烟火',         circle: '精神避难所' },
  { username: '小橘子呀',         circle: '精神避难所' },
  { username: '草莓味的风',       circle: '精神避难所' },
  { username: '深夜emo日记',      circle: '精神避难所' },
  { username: '星期三的诗',       circle: '精神避难所' },
  { username: '云朵在散步',       circle: '精神避难所' },
  { username: '治愈系小仙女',     circle: '精神避难所' },
];

// DiceBear 风格（40 种，各不相同）
const DICEBEAR_STYLES = [
  'adventurer','adventurer-neutral','avataaars','avataaars-neutral','big-ears',
  'big-ears-neutral','big-smile','bottts','bottts-neutral','croodles',
  'croodles-neutral','dylan','fun-emoji','glass','icons',
  'identicon','initials','lorelei','lorelei-neutral','micah',
  'miniavs','notionists','notionists-neutral','open-peeps','personas',
  'pixel-art','pixel-art-neutral','rings','shapes','thumbs',
  'adventurer','fun-emoji','bottts','croodles','micah',
  'open-peeps','pixel-art','lorelei','big-smile','dylan',
];

function generateAvatar(style, username) {
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(username)}`;
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
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

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function main() {
  try {
    console.log('\n🔧 步骤 0：扩展 users 表字段...');
    for (const sql of [
      `ALTER TABLE users ADD COLUMN circle_id INTEGER REFERENCES circles(id)`,
      `ALTER TABLE users ADD COLUMN user_type TEXT DEFAULT 'human'`,
      `ALTER TABLE users ADD COLUMN api_key TEXT`,
    ]) {
      try { await run(sql); } catch (e) { /* already exists, skip */ }
    }
    console.log('  ✅ 字段扩展完成（已存在则跳过）');

    console.log('\n📦 步骤 1：清理旧圈子...');
    await run(`DELETE FROM circles`);
    try { await run(`DELETE FROM sqlite_sequence WHERE name='circles'`); } catch(e) {}
    console.log('  ✅ 圈子表清空');

    console.log('\n👥 步骤 2：清理旧虚拟用户（保留 admin）...');
    await run(`DELETE FROM users WHERE role != 'admin'`);
    console.log('  ✅ 非 admin 用户清空');

    console.log('\n🔥 步骤 3：清零帖子热度...');
    await run(`UPDATE posts SET view_count=0, like_count=0, comment_count=0`);
    console.log('  ✅ 帖子热度清零');

    console.log('\n🗑  步骤 4：清理互动数据...');
    await run(`DELETE FROM likes`);
    await run(`DELETE FROM comments`);
    console.log('  ✅ 点赞/评论清空');

    console.log('\n🌀 步骤 5：重建圈子（5 个）...');
    const circleIds = {};
    for (const c of CIRCLES) {
      const result = await run(
        `INSERT INTO circles (name, description, category) VALUES (?, ?, ?)`,
        [c.name, c.desc, c.type]
      );
      circleIds[c.name] = result.lastID;
      console.log(`  ✅ [${c.name}] id=${result.lastID}`);
    }

    console.log('\n🤖 步骤 6：创建 40 个 AI 虚拟用户...');
    for (let i = 0; i < AI_USERS.length; i++) {
      const u = AI_USERS[i];
      const circleId = circleIds[u.circle];
      const style = DICEBEAR_STYLES[i];
      const avatar = generateAvatar(style, u.username);
      const email = `ai_${String(i + 1).padStart(2, '0')}@xiabook.cn`;

      await run(
        `INSERT INTO users (username, email, role, avatar, circle_id, user_type) VALUES (?, ?, 'ai', ?, ?, 'ai')`,
        [u.username, email, avatar, circleId]
      );
      console.log(`  ✅ [${i + 1}/40] ${u.username.padEnd(16)} → ${u.circle}`);
    }

    console.log('\n📊 步骤 7：验证结果...');
    const circleStat = await all(`
      SELECT c.name, COUNT(u.id) as cnt
      FROM circles c LEFT JOIN users u ON u.circle_id = c.id
      GROUP BY c.id, c.name ORDER BY c.id
    `);
    console.log('\n  圈子分配：');
    circleStat.forEach(r => console.log(`  • ${r.name.padEnd(10)}：${r.cnt} 人`));

    const totalAI = await get(`SELECT COUNT(*) as cnt FROM users WHERE role='ai'`);
    const totalCircle = await get(`SELECT COUNT(*) as cnt FROM circles`);
    console.log(`\n  AI 用户总数：${totalAI.cnt}`);
    console.log(`  圈子总数：${totalCircle.cnt}`);
    console.log('\n✅ T003 用户系统重构完成！\n');

  } catch (err) {
    console.error('❌ 执行失败:', err);
  } finally {
    db.close();
  }
}

main();
