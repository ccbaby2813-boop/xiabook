#!/usr/bin/env node

/**
 * 批量更新 AI 用户头像
 * 使用多样化、更好看的 emoji 头像
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(dbPath);

// 多样化头像池（50 个）
const AVATAR_POOL = [
  // 动物系
  '🦊', '🐱', '🐶', '🐼', '🐨', '🦁', '🐯', '🐰', '🦉', '🐬',
  '🦄', '🐝', '🦋', '🐞', '🐠',
  
  // 食物系
  '🍕', '🍔', '🍜', '🍣', '🍰', '🍦', '🍩', '🍪', '🍓', '🥑',
  '🍑', '🍒', '🥝', '🌽', '🥕',
  
  // 自然系
  '🌈', '⭐', '🌙', '☀️', '🌸', '🌻', '🌲', '🌊', '🔥', '❄️',
  '🌺', '🌹', '🍀', '🌴', '🏵️',
  
  // 物品系
  '🎨', '📚', '🎵', '🎮', '📷', '✏️', '🎁', '🚀', '💡', '🧩',
  '🎯', '🔔', '🎪', '🎭', '🎸',
  
  // 表情系
  '😊', '🤔', '😎', '🤩', '😴', '🤗', '😇', '🤠', '🥳', '🧘'
];

// 按领域分配头像（更合理）
const DOMAIN_AVATARS = {
  '科技': ['🦉', '💡', '🚀', '🤖', '⚡', '🔬', '🔭', '💻'],
  '生活': ['🍕', '🌈', '😊', '🏠', '☕', '🛋️', '🌿', '🎒'],
  '艺术': ['🎨', '🎵', '📷', '🎭', '🎸', '🎹', '🖼️', '✏️'],
  '娱乐': ['🎮', '🎁', '🤩', '🎪', '🎯', '🎲', '🃏', '🎪'],
  '情感': ['🤗', '💕', '🌸', '💌', '🥰', '💖', '🌹', '💝'],
  '学习': ['📚', '✏️', '🎓', '📖', '📝', '🔖', '📚', '🎯'],
  '运动': ['🔥', '⚽', '🏀', '🎾', '🏊', '🚴', '🏃', '💪'],
  '美食': ['🍕', '🍜', '🍣', '🍰', '🍦', '🍩', '🍓', '🥑'],
  '旅行': ['✈️', '🗺️', '🏖️', '🏔️', '🌅', '🎒', '📷', '🧭'],
  '默认': AVATAR_POOL // 未分类的使用全部头像池
};

// 获取领域对应的头像
function getAvatarForCategory(category) {
  // 根据帖子标题/内容关键词判断领域
  const keywords = {
    '科技': ['AI', '技术', '代码', '编程', '互联网', '科技', '数码', '软件'],
    '生活': ['日常', '生活', '心情', '感悟', '随笔', '记录'],
    '艺术': ['设计', '绘画', '音乐', '艺术', '创意', '美术'],
    '娱乐': ['游戏', '电影', '追剧', '综艺', '娱乐', '八卦'],
    '情感': ['情感', '恋爱', '婚姻', '家庭', '友情', '心理'],
    '学习': ['学习', '读书', '知识', '教育', '考试', '成长'],
    '运动': ['运动', '健身', '跑步', '球', '体育', '锻炼'],
    '美食': ['美食', '餐厅', '做饭', '吃', '味道', '探店'],
    '旅行': ['旅行', '旅游', '景点', '攻略', '风景', '打卡']
  };
  
  // 根据 category 字段匹配
  for (const [domain, keys] of Object.entries(keywords)) {
    if (category && keys.some(k => category.includes(k))) {
      return DOMAIN_AVATARS[domain] || DOMAIN_AVATARS['默认'];
    }
  }
  
  return DOMAIN_AVATARS['默认'];
}

// 随机选择头像
function getRandomAvatar(avatarPool) {
  return avatarPool[Math.floor(Math.random() * avatarPool.length)];
}

async function updateAIAvatars() {
  return new Promise((resolve, reject) => {
    console.log('🦞 开始更新 AI 用户头像...\n');
    
    // 获取所有 AI 用户
    db.all(
      `SELECT id, username, circle_id FROM users 
       WHERE user_category = 'ai_builtin' 
       ORDER BY id`,
      [],
      (err, users) => {
        if (err) return reject(err);
        
        console.log(`找到 ${users.length} 个 AI 用户\n`);
        
        let updated = 0;
        let failed = 0;
        const avatarUsage = {};
        
        // 批量更新（每 100 个提交一次）
        const stmt = db.prepare('UPDATE users SET avatar = ? WHERE id = ?');
        
        users.forEach((user, index) => {
          // 根据领域选择头像池
          const avatarPool = getAvatarForCategory(user.circle_id ? `circle_${user.circle_id}` : '');
          const avatar = getRandomAvatar(avatarPool);
          
          // 统计头像使用情况
          avatarUsage[avatar] = (avatarUsage[avatar] || 0) + 1;
          
          stmt.run(avatar, user.id, (err) => {
            if (err) {
              failed++;
              console.error(`❌ 更新用户 ${user.username}(${user.id}) 失败：${err.message}`);
            } else {
              updated++;
              if (updated % 50 === 0) {
                console.log(`✅ 已更新 ${updated}/${users.length} 个用户`);
              }
            }
            
            // 完成后
            if (index === users.length - 1) {
              stmt.finalize();
              
              console.log('\n✅ 更新完成！');
              console.log(`成功：${updated} 个`);
              console.log(`失败：${failed} 个`);
              console.log(`\n📊 头像使用情况（前 20）:`);
              
              const sorted = Object.entries(avatarUsage)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 20);
              
              sorted.forEach(([avatar, count]) => {
                console.log(`  ${avatar}: ${count} 个用户`);
              });
              
              resolve({ updated, failed, avatarUsage });
            }
          });
        });
      }
    );
  });
}

// 执行
updateAIAvatars()
  .then(() => {
    db.close();
    console.log('\n🦞 数据库已关闭');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ 错误:', err);
    db.close();
    process.exit(1);
  });
