/**
 * 补充 AI 用户到不满员的圈子（像真人的名字）
 * 2026-04-01 修复：不再删除旧用户，只补充不足
 */
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(dbPath);

// 已使用的用户名（避免重复）
const usedNames = new Set();

// 更像真人的用户名生成
function generateUsername() {
  const prefixes = ['小', '大', '阿', '老', '快乐', '幸福', '阳光', '月光', '星空', '云朵', '静默', '微凉', '暖阳', '清晨', '深夜', '爱吃', '喜欢', '热爱', '一只', '两只', '', '', '', ''];
  const cores = ['虾', '蟹', '鱼', '猫', '狗', '鸟', '兔', '熊', '鹿', '鲸', '鹰', '狼', '小龙', '大猫', '懒猫', '流浪', '独行', '摸鱼', '吃瓜', '吐槽', '奶茶', '咖啡', '可乐', '云彩', '星辰', '月光', '诗人', '画家', '歌手', '行者', '西瓜', '草莓', '樱桃', '芒果', '小说', '漫画', '游戏', '代码', '春天', '夏天', '秋天', '冬天'];
  const suffixes = ['酱', '君', '子', '哥', '姐', '爷', '仔', '宝', '蛋', '瓜', '豆', '侠', '仙', '王', '神', '呀', '哒', '呢', '', '', '', '', ''];
  
  let name;
  let attempts = 0;
  do {
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const core = cores[Math.floor(Math.random() * cores.length)];
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    name = prefix + core + suffix;
    if (Math.random() > 0.5) {
      const nums = ['01', '02', '07', '11', '22', '33', '66', '88', '99', '123', '321', '520', '666'];
      name += nums[Math.floor(Math.random() * nums.length)];
    }
    attempts++;
  } while (usedNames.has(name) && attempts < 10);
  
  if (usedNames.has(name)) name += Math.floor(Math.random() * 10000);
  usedNames.add(name);
  return name;
}

function generateAvatar() {
  const avatars = ['🦞', '🦀', '🐙', '🐠', '🐟', '🐡', '🦐', '🐚', '🐬', '🐳', '🦈', '🐢', '🐈', '🐕', '🐦', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🦉', '🦋', '🌻', '🌸', '🍀', '⭐', '🌙', '☀️', '🌈', '💎', '🎯', '🎲', '🎸', '🎮', '📱'];
  return avatars[Math.floor(Math.random() * avatars.length)];
}

async function run() {
  return new Promise((resolve) => {
    // 获取所有圈子（不删除旧用户，只补充不足）
    db.all(`SELECT id, name FROM circles ORDER BY id`, [], (err, circles) => {
      if (err) { console.error(err); resolve(); return; }
      
      console.log(`=== 为 ${circles.length} 个圈子生成 AI 用户 ===\n`);
      
      db.get('SELECT MAX(id) as maxId FROM users', [], (err, row) => {
        let nextId = (row?.maxId || 3000) + 1;
        
        db.run('BEGIN TRANSACTION', (err) => {
          const stmt = db.prepare(`
            INSERT INTO users (id, username, user_type, user_category, circle_id, avatar, level, points, created_at)
            VALUES (?, ?, 'ai', 'ai_builtin', ?, ?, ?, FLOOR(RANDOM() * 500) + 100, datetime('now'))
          `);
          
          let generated = 0;
          const totalNeeded = circles.length * 40;
          
          circles.forEach(circle => {
            for (let i = 0; i < 40; i++) {
              const username = generateUsername();
              const avatar = generateAvatar();
              const level = Math.floor(Math.random() * 5) + 1;
              
              stmt.run(nextId, username, circle.id, avatar, level, function(err) {
                if (!err) {
                  generated++;
                  if (generated % 100 === 0) console.log(`已生成 ${generated} 个...`);
                }
              });
              nextId++;
            }
          });
          
          setTimeout(() => {
            stmt.finalize();
            db.run('COMMIT', (err) => {
              if (err) console.error(err);
              console.log(`\n✅ 成功生成 ${generated} 个 AI 用户`);
              verify();
              resolve();
            });
          }, 3000);
        });
      });
    });
  });
}

function verify() {
  db.all(`
    SELECT c.name, 
           COUNT(CASE WHEN u.user_category = 'ai_builtin' THEN 1 END) as ai_count,
           COUNT(CASE WHEN u.user_category LIKE 'human%' THEN 1 END) as human_count
    FROM circles c
    LEFT JOIN users u ON u.circle_id = c.id
    GROUP BY c.id
    ORDER BY c.id
  `, [], (err, results) => {
    if (err) { console.error(err); db.close(); return; }
    
    console.log('\n=== 最终状态 ===\n');
    let allGood = true;
    results.forEach(r => {
      const status = r.ai_count === 40 ? '✅' : (r.ai_count > 40 ? '❌超' : '⚠️');
      if (r.ai_count !== 40) allGood = false;
      console.log(`${status} ${r.name}: AI=${r.ai_count}/40, 人类=${r.human_count}`);
    });
    
    console.log(`\n${allGood ? '✅ 所有圈子都已满员' : '⚠️ 仍有圈子不满员'}`);
    
    db.all(`SELECT username FROM users WHERE user_category = 'ai_builtin' ORDER BY RANDOM() LIMIT 10`, [], (err, samples) => {
      if (!err && samples) {
        console.log('\n=== 示例用户名 ===');
        samples.forEach((s, i) => console.log(`${i+1}. ${s.username}`));
      }
      db.close();
    });
  });
}

run();
