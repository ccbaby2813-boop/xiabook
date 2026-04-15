#!/usr/bin/env node
/**
 * 批量补全帖子标签脚本
 * 功能：为所有未打标签的帖子补全标签
 * 用法：node scripts/batch-tag-all-posts.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(DB_PATH);

// 扩展标签规则（与 api.js 中的 autoTagPost 一致）
const tagRules = [
  { tags: ['科技', 'AI', '技术'], keywords: ['AI', '人工智能', '机器学习', '代码', '编程', '技术', '算法', '数据', '模型', '大模型', 'GPT', '开源', 'github', 'API', '软件开发', '前端', '后端', '服务器'] },
  { tags: ['情感', '心理'], keywords: ['感受', '心情', '思考', '情感', '孤独', '幸福', '焦虑', '压力', '治愈', '温暖', '感动', 'emo', '抑郁', '快乐', '开心', '难过'] },
  { tags: ['生活', '日常'], keywords: ['今天', '日常', '生活', '一天', '早上', '晚上', '吃饭', '做饭', '散步', '运动', '健身', '跑步', '睡觉', '天气'] },
  { tags: ['创意', '艺术'], keywords: ['创意', '艺术', '设计', '灵感', '创作', '画画', '摄影', '音乐', '诗歌', '文学', '写作', '手绘', '手工'] },
  { tags: ['职场', '工作'], keywords: ['工作', '职场', '上班', '老板', '同事', '面试', '加班', '996', '跳槽', '升职', '工资', '薪水', '项目', '会议'] },
  { tags: ['娱乐', '游戏'], keywords: ['游戏', '电影', '音乐', '娱乐', '好玩', '追剧', '综艺', '演唱会', '动漫', '动画'] },
  { tags: ['财经', '投资'], keywords: ['财经', '投资', '股票', '基金', '比特币', 'BTC', 'crypto', '理财', '赚钱', '财务', '经济', '市场'] },
  { tags: ['时尚', '穿搭'], keywords: ['时尚', '穿搭', '衣服', '化妆品', '护肤', '美妆', '口红', '香水', '包包', '搭配'] },
  { tags: ['美食', '烹饪'], keywords: ['美食', '做饭', '烹饪', '菜谱', '好吃', '餐厅', '外卖', '火锅', '烧烤', '甜点', '咖啡'] },
  { tags: ['旅行', '户外'], keywords: ['旅行', '旅游', '户外', '徒步', '爬山', '海边', '风景', '拍照', '打卡', '民宿', '酒店'] },
  { tags: ['读书', '学习'], keywords: ['读书', '学习', '考试', '考研', '留学', '课程', '笔记', '书单', '阅读', '学校', '老师'] },
  { tags: ['家庭', '情感'], keywords: ['家庭', '父母', '孩子', '恋爱', '结婚', '分手', '约会', '朋友', '闺蜜', '兄弟'] },
  { tags: ['搞笑', '沙雕'], keywords: ['搞笑', '沙雕', '哈哈哈', '笑死', '段子', '梗', '逗', '沙雕日常'] },
  { tags: ['Web3', '区块链'], keywords: ['Web3', '区块链', 'NFT', 'DeFi', '元宇宙', '虚拟', 'DAO', 'smart contract'] },
  { tags: ['名表', '奢侈品'], keywords: ['名表', '劳力士', '欧米茄', '百达翡丽', '奢侈品', '手表', '收藏'] }
];

function getTagsForContent(content) {
  const contentLower = content.toLowerCase();
  const matchedTags = [];
  
  for (const rule of tagRules) {
    if (rule.keywords.some(kw => contentLower.includes(kw.toLowerCase()))) {
      matchedTags.push(...rule.tags);
    }
  }
  
  return [...new Set(matchedTags)].slice(0, 5);
}

async function batchTagAll() {
  console.log('🏷️ 批量补全帖子标签开始\n');
  
  // 获取未打标签的帖子
  const posts = await new Promise((resolve, reject) => {
    db.all(`
      SELECT p.id, p.title, p.content, p.category 
      FROM posts p 
      LEFT JOIN post_tags pt ON p.id = pt.post_id 
      WHERE pt.post_id IS NULL
    `, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
  
  console.log(`📊 待处理帖子：${posts.length} 篇\n`);
  
  let tagged = 0;
  let totalTags = 0;
  
  for (const post of posts) {
    const tags = getTagsForContent(post.title + ' ' + post.content);
    
    if (tags.length > 0) {
      const tagsStr = tags.join(',');
      
      // 更新 posts.tags 字段
      await new Promise(resolve => {
        db.run(`UPDATE posts SET tags = ? WHERE id = ?`, [tagsStr, post.id], resolve);
      });
      
      // 插入 post_tags 表
      for (const tag of tags) {
        await new Promise(resolve => {
          db.run(`INSERT OR IGNORE INTO post_tags (post_id, tag_name) VALUES (?, ?)`, [post.id, tag], resolve);
        });
      }
      
      tagged++;
      totalTags += tags.length;
      console.log(`✅ 帖子 ${post.id} (${post.category}) → ${tagsStr}`);
    }
  }
  
  console.log(`\n🏷️ 批量补全完成！`);
  console.log(`   处理帖子：${posts.length} 篇`);
  console.log(`   成功打标签：${tagged} 篇`);
  console.log(`   总标签数：${totalTags} 个`);
  console.log(`   平均每篇：${tagged > 0 ? (totalTags / tagged).toFixed(1) : 0} 个标签`);
  
  // 统计覆盖率
  const stats = await new Promise((resolve, reject) => {
    db.all(`
      SELECT 
        p.category,
        COUNT(DISTINCT p.id) as total,
        COUNT(DISTINCT pt.post_id) as tagged,
        ROUND(COUNT(DISTINCT pt.post_id) * 100.0 / COUNT(DISTINCT p.id), 1) as coverage
      FROM posts p 
      LEFT JOIN post_tags pt ON p.id = pt.post_id 
      GROUP BY p.category
      ORDER BY coverage ASC
    `, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
  
  console.log('\n📊 各分类标签覆盖率：');
  stats.forEach(s => {
    console.log(`   ${s.category}: ${s.tagged}/${s.total} (${s.coverage}%)`);
  });
  
  db.close();
}

batchTagAll().catch(err => {
  console.error('❌ 错误:', err.message);
  db.close();
  process.exit(1);
});
