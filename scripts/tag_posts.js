/**
 * 自动给帖子打标签
 * 基于标题和内容关键词匹配
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(DB_PATH);

// 标签关键词映射
const TAG_RULES = {
  '职场': ['工作', '公司', '同事', '老板', '领导', '团队', '辞职', '升职', '加班', '请假', '面试', '工资', '奖金', '年终', '打卡', '上班', '下班', '职场'],
  '生活': ['生活', '日常', '周末', '假期', '旅行', '美食', '做饭', '购物', '健身', '运动', '宠物', '养猫', '养狗'],
  '情感': ['恋爱', '分手', '男朋友', '女朋友', '老公', '老婆', '暗恋', '表白', '相亲', '结婚', '离婚', '感情', '爱情'],
  '家庭': ['父母', '妈妈', '爸爸', '孩子', '儿子', '女儿', '家庭', '亲戚', '过年', '回家', '爸妈'],
  '心情': ['开心', '难过', '焦虑', '抑郁', '压力', '崩溃', 'emo', '治愈', '发泄', '吐槽', '无语', '心累'],
  '成长': ['学习', '成长', '进步', '努力', '坚持', '改变', '逆袭', '自律', '目标', '梦想'],
  '社交': ['朋友', '闺蜜', '社恐', '社交', '聚会', '人情', '红包', '随礼', '关系'],
  '金钱': ['赚钱', '花钱', '理财', '存款', '贷款', '房价', '房租', '穷', '富', '消费', '购物'],
  '健康': ['生病', '医院', '身体', '健康', '失眠', '减肥', '熬夜', '养生']
};

async function tagPosts() {
  return new Promise((resolve, reject) => {
    // 获取所有凡人视角帖子
    db.all(`
      SELECT id, title, content 
      FROM posts 
      WHERE category = '凡人视角' AND is_published = 1
    `, [], async (err, posts) => {
      if (err) {
        reject(err);
        return;
      }
      
      console.log(`找到 ${posts.length} 篇凡人视角帖子`);
      
      let tagged = 0;
      let skipped = 0;
      
      for (const post of posts) {
        // 检查是否已有标签
        const existing = await new Promise((res, rej) => {
          db.get('SELECT id FROM post_tags WHERE post_id = ?', [post.id], (e, r) => {
            if (e) rej(e);
            else res(r);
          });
        });
        
        if (existing) {
          skipped++;
          continue;
        }
        
        // 分析标签
        const text = `${post.title || ''} ${post.content || ''}`;
        const matchedTags = new Set();
        
        for (const [tag, keywords] of Object.entries(TAG_RULES)) {
          for (const keyword of keywords) {
            if (text.includes(keyword)) {
              matchedTags.add(tag);
              break; // 一个标签只匹配一次
            }
          }
        }
        
        // 默认标签
        if (matchedTags.size === 0) {
          matchedTags.add('日常');
        }
        
        // 插入标签
        for (const tag of matchedTags) {
          await new Promise((res, rej) => {
            db.run(
              'INSERT INTO post_tags (post_id, tag_name, source) VALUES (?, ?, ?)',
              [post.id, tag, 'auto'],
              (e) => e ? rej(e) : res()
            );
          });
        }
        
        tagged++;
        if (tagged % 100 === 0) {
          console.log(`已处理 ${tagged} 篇...`);
        }
      }
      
      console.log(`\n完成！打标签: ${tagged} 篇，跳过: ${skipped} 篇`);
      resolve({ tagged, skipped });
    });
  });
}

// 执行
tagPosts()
  .then(result => {
    console.log('结果:', result);
    db.close();
    process.exit(0);
  })
  .catch(err => {
    console.error('错误:', err);
    db.close();
    process.exit(1);
  });
