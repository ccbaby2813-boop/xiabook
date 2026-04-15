#!/usr/bin/env node
/**
 * 自动为无标签帖子打标签（第三层防御）
 * 用途：定时任务，确保所有帖子都有标签
 * 运行频率：每天一次（凌晨执行）
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(dbPath);

// 标签规则（与 api.js autoTagPost 保持一致）
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

function autoTagPost(postId, content) {
  const matchedTags = [];
  const contentLower = content.toLowerCase();
  
  for (const rule of tagRules) {
    if (rule.keywords.some(kw => contentLower.includes(kw))) {
      matchedTags.push(...rule.tags);
    }
  }
  
  if (matchedTags.length > 0) {
    const uniqueTags = [...new Set(matchedTags)].slice(0, 5);
    const tagsStr = uniqueTags.join(',');
    
    // 更新 posts.tags 字段
    db.run(`UPDATE posts SET tags = ? WHERE id = ?`, [tagsStr, postId], (err) => {
      if (err) console.error(`[自动标签] 更新 posts.tags 失败: ${postId}`, err.message);
    });
    
    // 插入 post_tags 表
    uniqueTags.forEach(tag => {
      db.run(`INSERT OR IGNORE INTO post_tags (post_id, tag_name) VALUES (?, ?)`, [postId, tag], (err) => {
        if (err) console.error(`[自动标签] 插入 post_tags 失败: ${postId}-${tag}`, err.message);
      });
    });
    
    console.log(`[自动标签] 帖子 ${postId} 添加标签：${tagsStr}`);
    return uniqueTags;
  }
  
  return [];
}

// 主流程
console.log('[自动标签脚本] 开始检查无标签帖子...');

db.all(`
  SELECT p.id, p.title, p.content
  FROM posts p
  LEFT JOIN (SELECT DISTINCT post_id FROM post_tags) pt ON p.id = pt.post_id
  WHERE pt.post_id IS NULL AND p.is_published = 1
`, [], (err, posts) => {
  if (err) {
    console.error('[自动标签脚本] 查询失败:', err.message);
    db.close();
    return;
  }
  
  if (!posts || posts.length === 0) {
    console.log('[自动标签脚本] ✅ 所有帖子都有标签，无需补打');
    db.close();
    return;
  }
  
  console.log(`[自动标签脚本] 发现 ${posts.length} 篇无标签帖子，开始补打...`);
  
  let taggedCount = 0;
  posts.forEach(post => {
    const tags = autoTagPost(post.id, post.content || post.title);
    if (tags.length > 0) taggedCount++;
  });
  
  // 等待数据库操作完成后关闭
  setTimeout(() => {
    console.log(`[自动标签脚本] ✅ 完成，补打 ${taggedCount}/${posts.length} 篇帖子`);
    db.close();
  }, 1000);
});