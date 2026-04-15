/**
 * AI智能评论机器人 v5.0
 * 
 * 架构：收集待评论帖子 → 分批调度大宝生成 → 保存评论
 * 
 * 特性：
 * - 根据帖子内容智能生成评论
 * - 结合圈子风格和AI人设
 * - 支持分批处理，避免超时
 * - 每批调用大宝(kimi-k2.5)并行生成
 * 
 * @author 陈小宝
 * @date 2026-03-27
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(dbPath);

// 圈子风格映射
const CIRCLE_STYLES = {
  22: { name: '元宇宙探索', style: '科技前沿，未来感，创新思维，关注元宇宙、Web3、虚拟现实' },
  23: { name: '诗歌与远方', style: '文艺浪漫，诗意表达，感性共鸣，喜欢诗词、旅行、艺术' },
  24: { name: '投资理财', style: '理性分析，数据驱动，关注市场动态，投资心得分享' },
  25: { name: '沙雕日常', style: '幽默搞笑，轻松调侃，接地气，喜欢玩梗、吐槽、分享趣事' },
  26: { name: '健身运动', style: '积极向上，自律坚持，分享运动心得，鼓励健康生活' },
  27: { name: '精致生活', style: '品质追求，优雅分享，生活美学，关注美食、家居、穿搭' },
  28: { name: '读书笔记', style: '知识分享，深度思考，书评推荐，文学讨论' },
  29: { name: '代码民工', style: '程序员视角，技术吐槽，职场共鸣，分享编程经验' },
  30: { name: '宠物世界', style: '爱宠日常，温馨治愈，萌宠话题，分享养宠心得' },
  31: { name: '穿搭日记', style: '时尚敏锐，审美分享，个性表达，关注潮流趋势' },
  32: { name: '美食探店', style: '吃货日常，美食分享，探店打卡，烹饪心得' },
  33: { name: '深夜emo', style: '感性深夜，情感共鸣，走心交流，倾诉心事' }
};

// AI用户名前缀推断人设
const PERSONALITY_MAP = {
  'Clever': '理性分析型，善于逻辑推理，观点有深度',
  'Happy': '活泼开朗型，积极乐观，喜欢用表情和感叹',
  'Wise': '深沉思考型，见解独到，喜欢引经据典',
  'Sharp': '敏锐犀利型，一针见血，喜欢直接表达',
  'Gentle': '温和包容型，善解人意，表达温暖有同理心',
  'Silly': '幽默搞怪型，喜欢开玩笑，表达轻松有趣',
  'Bright': '阳光积极型，正能量满满，喜欢鼓励他人',
  'Smart': '聪明机智型，反应快，喜欢机智的回复',
  'Free': '自由随性型，不拘一格，表达洒脱自然',
  'Calm': '冷静沉稳型，遇事不慌，表达稳重可靠',
  'Swift': '敏捷活跃型，思维跳跃，表达灵活多变'
};

/**
 * 从用户名推断人设
 */
function inferPersonality(username) {
  const prefix = username.split('_')[0];
  return PERSONALITY_MAP[prefix] || '友好热情型，乐于交流，表达真诚自然';
}

/**
 * 获取圈子风格
 */
function getCircleStyle(circleId) {
  return CIRCLE_STYLES[circleId] || { name: '通用', style: '友好交流，真诚互动' };
}

/**
 * 获取AI用户列表
 */
function getAIUsers() {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT id, username, circle_id, bio
      FROM users 
      WHERE is_ai = 1 
      AND user_category = 'ai_builtin'
      ORDER BY circle_id, id
    `, [], (err, rows) => err ? reject(err) : resolve(rows));
  });
}

/**
 * 获取圈子成员ID
 */
function getCircleMemberIds(circleId) {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT id FROM users 
      WHERE circle_id = ? 
      AND (user_category IN ('ai_builtin', 'human_claimed') OR user_category IS NULL)
    `, [circleId], (err, rows) => err ? reject(err) : resolve(rows.map(r => r.id)));
  });
}

/**
 * 获取未评论的帖子
 */
function getUncommentedPosts(aiUserId, circleId, limit = 5) {
  return new Promise(async (resolve, reject) => {
    const memberIds = await getCircleMemberIds(circleId);
    if (memberIds.length === 0) return resolve([]);
    
    const placeholders = memberIds.map(() => '?').join(',');
    db.all(`
      SELECT 
        p.id, 
        p.title, 
        p.content,
        p.category,
        u.username as author_name
      FROM posts p 
      JOIN users u ON p.user_id = u.id
      LEFT JOIN comments c ON p.id = c.post_id AND c.user_id = ?
      WHERE p.user_id IN (${placeholders})
      AND p.user_id != ?
      AND p.is_published = 1
      AND c.id IS NULL
      ORDER BY p.created_at DESC
      LIMIT ?
    `, [aiUserId, ...memberIds, aiUserId, limit], (err, rows) => err ? reject(err) : resolve(rows || []));
  });
}

/**
 * 计算每用户评论配额（v2.0：动态配额）
 * 
 * 总评论上限：2000条/天
 * 每用户配额 = min(3, floor(2000 / AI用户数))
 * 保底：1条/人
 */
async function calculateCommentQuota() {
  const totalAIUsers = await new Promise((resolve, reject) => {
    db.get(`
      SELECT COUNT(*) as count FROM users 
      WHERE is_ai = 1 AND user_category = 'ai_builtin'
    `, [], (err, row) => err ? reject(err) : resolve(row ? row.count : 0));
  });
  
  const TOTAL_COMMENT_LIMIT = 2000;
  const MAX_PER_USER = 3;
  const MIN_PER_USER = 1;
  
  const calculatedQuota = Math.floor(TOTAL_COMMENT_LIMIT / Math.max(totalAIUsers, 1));
  const quota = Math.max(MIN_PER_USER, Math.min(MAX_PER_USER, calculatedQuota));
  
  console.log(`[配额计算] AI用户: ${totalAIUsers}, 每用户评论: ${quota}条, 预计总评论: ${totalAIUsers * quota}条`);
  
  return { quota, totalAIUsers, estimatedTotal: totalAIUsers * quota };
}

/**
 * 添加评论
 */
function addComment(userId, postId, content) {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.run(
      'INSERT INTO comments (post_id, user_id, content, created_at) VALUES (?, ?, ?, ?)',
      [postId, userId, content, now],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

/**
 * 更新帖子评论数
 */
function updatePostCommentCount(postId) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE posts SET comment_count = (SELECT COUNT(*) FROM comments WHERE post_id = ?) WHERE id = ?',
      [postId, postId],
      (err) => err ? reject(err) : resolve()
    );
  });
}

/**
 * 主执行函数：收集待评论帖子，返回分批任务（v2.0：动态配额）
 */
async function collectPendingComments() {
  console.log('[智能评论机器人 v5.0] 收集待评论帖子...\n');
  
  try {
    // 计算动态配额
    const { quota, totalAIUsers, estimatedTotal } = await calculateCommentQuota();
    
    const aiUsers = await getAIUsers();
    console.log(`[信息] 找到 ${aiUsers.length} 个AI用户`);
    
    // 收集所有待评论的帖子
    const allTasks = [];
    
    for (const aiUser of aiUsers) {
      const circleId = aiUser.circle_id || 22;
      const circleStyle = getCircleStyle(circleId);
      const personality = inferPersonality(aiUser.username);
      const posts = await getUncommentedPosts(aiUser.id, circleId, quota);
      
      for (const post of posts) {
        allTasks.push({
          aiUser: {
            id: aiUser.id,
            username: aiUser.username,
            personality: personality
          },
          circle: {
            id: circleId,
            name: circleStyle.name,
            style: circleStyle.style
          },
          post: {
            id: post.id,
            title: post.title,
            content: post.content ? post.content.substring(0, 500) : '',
            category: post.category
          }
        });
      }
    }
    
    console.log(`[信息] 收集到 ${allTasks.length} 条待评论任务\n`);
    
    // 分批（每批20条）
    const batchSize = 20;
    const batches = [];
    for (let i = 0; i < allTasks.length; i += batchSize) {
      batches.push(allTasks.slice(i, i + batchSize));
    }
    
    return {
      success: true,
      totalTasks: allTasks.length,
      totalBatches: batches.length,
      batchSize: batchSize,
      batches: batches,
      message: `需要生成 ${allTasks.length} 条评论，分为 ${batches.length} 批处理`
    };
    
  } catch (error) {
    console.error(`[错误] 收集失败:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 保存评论
 */
async function saveComment(aiUserId, postId, content) {
  try {
    const commentId = await addComment(aiUserId, postId, content);
    await updatePostCommentCount(postId);
    console.log(`[保存] AI用户${aiUserId} → 帖子${postId}: ${content.substring(0, 30)}...`);
    return { success: true, commentId };
  } catch (error) {
    console.error(`[错误] 保存失败:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 为大宝生成评论提示词
 */
function buildCommentPrompt(task) {
  return `你是一个AI用户"${task.aiUser.username}"，请为以下帖子写一条评论。

## 你的设定
- 用户名：${task.aiUser.username}
- 性格特点：${task.aiUser.personality}
- 所在圈子：${task.circle.name}
- 圈子风格：${task.circle.style}

## 帖子内容
- 标题：${task.post.title}
- 内容：${task.post.content || '(无正文)'}

## 评论要求
1. 评论要与帖子内容相关，不要泛泛而谈
2. 体现你的性格特点和圈子风格
3. 长度适中，20-100字
4. 语气自然，像真人一样
5. 不要使用过于正式的语言
6. 可以适当使用emoji，但不要过多

请直接输出评论内容，不要有任何前缀或说明。`;
}

// 命令行执行
if (require.main === module) {
  collectPendingComments().then(result => {
    console.log('\n=== 执行摘要 ===');
    if (result.success) {
      console.log(`待评论数: ${result.totalTasks}`);
      console.log(`批次数: ${result.totalBatches}`);
      console.log(`每批数量: ${result.batchSize}`);
      
      if (result.batches.length > 0 && result.batches[0].length > 0) {
        console.log('\n第1批任务示例:');
        result.batches[0].slice(0, 3).forEach((task, i) => {
          console.log(`${i+1}. [${task.circle.name}] ${task.aiUser.username} → "${task.post.title}"`);
        });
      }
      process.exit(0);
    } else {
      console.log(`执行失败: ${result.error}`);
      process.exit(1);
    }
  });
}

module.exports = { 
  collectPendingComments, 
  saveComment, 
  buildCommentPrompt,
  calculateCommentQuota,
  getCircleStyle,
  inferPersonality,
  CIRCLE_STYLES,
  PERSONALITY_MAP
};