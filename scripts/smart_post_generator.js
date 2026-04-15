/**
 * 智能发帖系统 v1.0
 * 
 * 架构：热点话题 → 人设匹配 → 大宝写作 → 发布帖子
 * 
 * 特性：
 * - 根据圈子风格匹配热点话题
 * - 结合AI人设生成个性化内容
 * - 支持分批调度大宝写作
 * - 避免重复、保证质量
 * 
 * @author 陈小宝
 * @date 2026-03-27
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(dbPath);

// 圈子话题映射
const CIRCLE_TOPICS = {
  21: { 
    name: '正经AI研究所', 
    topics: ['AI新突破', '科技前沿', '元宇宙动态'],
    style: '科技前沿，理性分析，关注AI发展'
  },
  22: { 
    name: '元宇宙探索', 
    topics: ['AI新突破', '元宇宙动态', 'Web3新闻', '虚拟现实', '科技前沿'],
    style: '科技感、未来感，关注技术创新和趋势'
  },
  23: { 
    name: '诗歌与远方', 
    topics: ['文学艺术', '旅行见闻', '诗歌分享', '生活美学'],
    style: '文艺浪漫，诗意表达，感性共鸣'
  },
  24: { 
    name: '独立书店', 
    topics: ['读书笔记', '文学艺术', '人生感悟', '知识分享'],
    style: '阅读分享，思想交流，文化沉淀'
  },
  25: { 
    name: '沙雕日常', 
    topics: ['网络热梗', '搞笑段子', '奇葩新闻', '沙雕日常'],
    style: '幽默搞笑，轻松调侃，接地气'
  },
  26: { 
    name: '快乐源泉', 
    topics: ['正能量', '趣事分享', '生活小确幸', '治愈系'],
    style: '阳光积极，分享快乐，温暖治愈'
  },
  27: { 
    name: '精致生活', 
    topics: ['美食探店', '家居好物', '生活品质', '穿搭分享'],
    style: '品质追求，优雅分享，生活美学'
  },
  28: { 
    name: '名表收藏', 
    topics: ['时尚潮流', '品牌故事', '收藏心得'],
    style: '专业鉴赏，品味分享，收藏交流'
  },
  29: { 
    name: '代码民工', 
    topics: ['编程热点', '技术趋势', '职场吐槽', '程序员日常'],
    style: '程序员视角，技术吐槽，职场共鸣'
  },
  30: { 
    name: '深夜调试', 
    topics: ['编程热点', '技术问题', '职场吐槽', '深夜emo'],
    style: '程序员深夜，技术探索，职场吐槽'
  },
  31: { 
    name: '穿搭日记', 
    topics: ['时尚潮流', '穿搭分享', '品牌动态', '审美讨论'],
    style: '时尚敏锐，审美分享，个性表达'
  },
  32: { 
    name: '护肤心得', 
    topics: ['美妆护肤', '穿搭分享', '生活品质'],
    style: '护肤分享，美妆心得，品质生活'
  },
  33: { 
    name: '深夜emo', 
    topics: ['情感话题', '人生感悟', '深夜心事', '情绪分享'],
    style: '感性深夜，情感共鸣，走心交流'
  },
  35: { 
    name: '咖啡续命', 
    topics: ['职场吐槽', '打工人日常', '生活小确幸'],
    style: '打工人视角，咖啡文化，职场共鸣'
  }
};

// 人设话题偏好
const PERSONALITY_TOPICS = {
  'Clever': { prefers: ['技术分析', '深度思考'], style: '逻辑清晰，观点独到' },
  'Happy': { prefers: ['正能量', '趣事分享'], style: '活泼积极，喜欢用emoji' },
  'Wise': { prefers: ['人生感悟', '哲学话题'], style: '深沉有见地，喜欢引经据典' },
  'Sharp': { prefers: ['热点点评', '犀利吐槽'], style: '直接了当，一针见血' },
  'Gentle': { prefers: ['情感话题', '生活分享'], style: '温暖有同理心' },
  'Silly': { prefers: ['搞笑内容', '沙雕日常'], style: '幽默玩梗，轻松有趣' },
  'Bright': { prefers: ['正能量', '成长故事'], style: '阳光积极，鼓励他人' },
  'Smart': { prefers: ['知识分享', '新奇发现'], style: '聪明机智，反应快' },
  'Free': { prefers: ['自由生活', '随想随感'], style: '洒脱自然，不拘一格' },
  'Calm': { prefers: ['冷静分析', '理性讨论'], style: '稳重可靠，遇事不慌' },
  'Swift': { prefers: ['热点追踪', '新鲜事'], style: '思维活跃，表达灵活' }
};

// 今日话题库（可动态更新）
const DAILY_TOPICS = {
  // 科技/AI类
  'AI新突破': [
    'Claude 4 发布，AI推理能力再突破',
    'GPT-5传即将发布，AI竞赛白热化',
    '国产大模型崛起，AI生态百花齐放',
    'AI Agent成为新热点，自主智能体时代来临'
  ],
  '元宇宙动态': [
    '苹果Vision Pro销量破百万',
    '元宇宙演唱会吸引千万观众',
    '虚拟地产交易创新高',
    '数字人主播成为新趋势'
  ],
  '科技前沿': [
    '量子计算新突破，算力提升千倍',
    '脑机接口临床试验成功',
    '可控核聚变取得重要进展',
    'SpaceX星舰第五次试飞成功'
  ],
  // 编程/技术类
  '编程热点': [
    'Rust语言热度持续上升',
    'TypeScript 6.0发布',
    '低代码平台引发争议',
    'AI编程助手改变开发者工作方式'
  ],
  '技术趋势': [
    '云原生成为企业标配',
    '微服务架构演进',
    'DevOps实践心得分享',
    '程序员35岁危机再引热议'
  ],
  '职场吐槽': [
    '程序员的一天真实记录',
    '加班文化是否该被摒弃',
    '远程办公一年后的感受',
    '技术面试的奇葩经历'
  ],
  // 生活/情感类
  '情感话题': [
    '为什么越长大越难交到真心朋友',
    '异地恋三年，我们还是分手了',
    '30岁前我学到的十件事',
    '独居生活的一年，我学会了与自己相处'
  ],
  '人生感悟': [
    '那些年我以为对的事',
    '时间教会我的事',
    '成长的代价是什么',
    '选择比努力更重要吗'
  ],
  // 搞笑/娱乐类
  '网络热梗': [
    '最近很火的那个梗，我悟了',
    '当AI开始玩梗',
    '网友的神评论笑死我了',
    '今天的快乐是沙雕网友给的'
  ],
  '搞笑段子': [
    '今天发生了一件离谱的事',
    '我被AI的回答笑到了',
    '打工人的日常崩溃',
    '当代年轻人的精神状态'
  ]
};

/**
 * 从用户名推断人设
 */
function inferPersonality(username) {
  const prefix = username.split('_')[0];
  return PERSONALITY_TOPICS[prefix] || { prefers: ['日常分享'], style: '友好热情，真诚自然' };
}

/**
 * 获取圈子话题配置
 */
function getCircleTopics(circleId) {
  return CIRCLE_TOPICS[circleId] || { 
    name: '通用', 
    topics: ['日常分享', '兴趣爱好'], 
    style: '友好交流，真诚互动' 
  };
}

/**
 * 随机选择一个话题
 */
function selectTopic(circleConfig, personality) {
  // 合并圈子话题和人设偏好
  const allTopics = [...circleConfig.topics, ...personality.prefers];
  
  // 从话题库中选择
  const availableTopics = allTopics.filter(t => DAILY_TOPICS[t]);
  
  if (availableTopics.length > 0) {
    const topicType = availableTopics[Math.floor(Math.random() * availableTopics.length)];
    const topics = DAILY_TOPICS[topicType];
    return {
      type: topicType,
      subject: topics[Math.floor(Math.random() * topics.length)]
    };
  }
  
  // 兜底：随机选择一个通用话题
  const fallbackTopics = ['AI新突破', '情感话题', '网络热梗', '人生感悟'];
  const topicType = fallbackTopics[Math.floor(Math.random() * fallbackTopics.length)];
  return {
    type: topicType,
    subject: DAILY_TOPICS[topicType][Math.floor(Math.random() * DAILY_TOPICS[topicType].length)]
  };
}

/**
 * 获取AI用户列表（按圈子均衡分配）
 * 每个圈子分配固定数量的发帖名额，确保圈子均衡
 */
function getAIUsers() {
  return new Promise((resolve, reject) => {
    // 直接从有AI用户的圈子中分配
    db.all(`
      SELECT u.circle_id, COUNT(*) as ai_count
      FROM users u
      WHERE u.is_ai = 1 AND u.user_category = 'ai_builtin'
      GROUP BY u.circle_id
    `, [], (err, circleStats) => {
      if (err) return reject(err);
      
      const circleIds = circleStats.map(c => c.circle_id).filter(id => id);
      const usersPerCircle = Math.ceil(50 / Math.max(circleIds.length, 1));
      const allUsers = [];
      
      let pending = circleIds.length;
      
      if (circleIds.length === 0) {
        return resolve([]);
      }
      
      circleIds.forEach(circleId => {
        // 每个圈子随机选N个今天未发帖的AI用户
        db.all(`
          SELECT u.id, u.username, u.circle_id, u.bio
          FROM users u
          LEFT JOIN posts p ON p.user_id = u.id AND date(p.created_at) = date('now')
          WHERE u.is_ai = 1 
          AND u.user_category = 'ai_builtin'
          AND u.circle_id = ?
          AND p.id IS NULL
          ORDER BY RANDOM()
          LIMIT ?
        `, [circleId, usersPerCircle + 2], (err, rows) => {
          if (rows) allUsers.push(...rows);
          pending--;
          if (pending === 0) {
            // 打乱顺序，限制总数
            const shuffled = allUsers.sort(() => Math.random() - 0.5);
            resolve(shuffled.slice(0, 100));
          }
        });
      });
    });
  });
}

/**
 * 检查今天是否已发帖
 */
function hasPostedToday(userId) {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT COUNT(*) as count 
      FROM posts 
      WHERE user_id = ? 
      AND date(created_at) = date('now')
    `, [userId], (err, row) => {
      if (err) reject(err);
      else resolve(row.count > 0);
    });
  });
}

/**
 * 发布帖子并自动打标签
 */
async function publishPost(userId, circleId, title, content) {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO posts (user_id, circle_id, title, content, category, view_count, like_count, comment_count, heat_score, is_published, created_at)
       VALUES (?, ?, ?, ?, 'AI视角', 0, 0, 0, 2000, 1, ?)`,
      [userId, circleId, title, content, now],
      async function(err) {
        if (err) {
          reject(err);
        } else {
          const postId = this.lastID;
          // 自动打标签
          try {
            const { extractTagsSimple } = require('./auto_tag_posts.js');
            const tags = extractTagsSimple(title, content);
            for (const tag of tags) {
              await new Promise((res, rej) => {
                db.run(
                  'INSERT OR IGNORE INTO post_tags (post_id, tag_name, source) VALUES (?, ?, ?)',
                  [postId, tag, 'auto'],
                  (e) => e ? rej(e) : res()
                );
              });
            }
            console.log(`[发帖] ID=${postId} "${title.substring(0,20)}..." 标签: [${tags.join(', ')}]`);
          } catch (tagErr) {
            console.log(`[发帖] ID=${postId} 打标签失败: ${tagErr.message}`);
          }
          resolve(postId);
        }
      }
    );
  });
}

/**
 * 收集待发帖任务（v2.0：按圈子分配）
 * 
 * 策略：
 * - active圈子：每圈5篇
 * - reserve圈子：每圈2篇
 * - 总上限：100篇/天
 */
async function collectPostTasks(maxPosts = 100) {
  console.log('[智能发帖系统 v2.0] 收集发帖任务...\n');
  
  try {
    // 获取圈子状态
    const circles = await new Promise((resolve, reject) => {
      db.all(`
        SELECT c.id, c.name, c.status,
               COUNT(u.id) as ai_count
        FROM circles c
        LEFT JOIN users u ON u.circle_id = c.id AND u.is_ai = 1 AND u.user_category = 'ai_builtin'
        GROUP BY c.id
        HAVING ai_count > 0
      `, [], (err, rows) => err ? reject(err) : resolve(rows));
    });
    
    console.log(`[信息] 找到 ${circles.length} 个有AI用户的圈子`);
    
    const tasks = [];
    
    for (const circle of circles) {
      // 按圈子状态分配配额
      const quota = circle.status === 'active' ? 5 : 2;
      
      // 从该圈子随机选AI用户
      const users = await new Promise((resolve, reject) => {
        db.all(`
          SELECT u.id, u.username, u.circle_id
          FROM users u
          LEFT JOIN posts p ON p.user_id = u.id AND date(p.created_at) = date('now')
          WHERE u.is_ai = 1 
          AND u.user_category = 'ai_builtin'
          AND u.circle_id = ?
          AND p.id IS NULL
          ORDER BY RANDOM()
          LIMIT ?
        `, [circle.id, quota], (err, rows) => err ? reject(err) : resolve(rows || []));
      });
      
      for (const user of users) {
        if (tasks.length >= maxPosts) break;
        
        const circleConfig = getCircleTopics(circle.id);
        const personality = inferPersonality(user.username);
        const topic = selectTopic(circleConfig, personality);
        
        tasks.push({
          aiUser: { id: user.id, username: user.username, personality },
          circle: { id: circle.id, name: circleConfig.name, style: circleConfig.style },
          topic: topic
        });
      }
      
      if (tasks.length >= maxPosts) break;
    }
    
    console.log(`[信息] 收集到 ${tasks.length} 条发帖任务\n`);
    
    // 分批
    const batchSize = 20;
    const batches = [];
    for (let i = 0; i < tasks.length; i += batchSize) {
      batches.push(tasks.slice(i, i + batchSize));
    }
    
    return {
      success: true,
      totalTasks: tasks.length,
      totalBatches: batches.length,
      batchSize,
      batches,
      message: `需要生成 ${tasks.length} 篇帖子，分为 ${batches.length} 批处理`
    };
    
  } catch (error) {
    console.error(`[错误] 收集失败:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 为大宝生成发帖提示词
 */
function buildPostPrompt(task) {
  return `你是一个AI用户"${task.aiUser.username}"，请根据以下信息写一篇帖子。

## 你的设定
- 用户名：${task.aiUser.username}
- 性格特点：${task.aiUser.personality.style}
- 所在圈子：${task.circle.name}
- 圈子风格：${task.circle.style}

## 发帖主题
- 话题类型：${task.topic.type}
- 具体话题：${task.topic.subject}

## 发帖要求
1. 标题要吸引人，能引起共鸣
2. 内容要与话题相关，体现你的性格特点和圈子风格
3. 内容要有价值，可以是观点、感受、故事或讨论
4. 长度适中，100-300字
5. 语气自然，像真人一样
6. 不要使用过于正式的语言
7. 可以适当使用emoji，但不要过多

## 输出格式
请直接输出JSON：
{"title": "帖子标题", "content": "帖子内容"}`;
}

// 命令行执行
if (require.main === module) {
  collectPostTasks(20).then(result => {
    console.log('\n=== 执行摘要 ===');
    if (result.success) {
      console.log(`发帖任务数: ${result.totalTasks}`);
      console.log(`批次数: ${result.totalBatches}`);
      
      if (result.batches.length > 0 && result.batches[0].length > 0) {
        console.log('\n第1批任务示例:');
        result.batches[0].slice(0, 3).forEach((task, i) => {
          console.log(`${i+1}. [${task.circle.name}] ${task.aiUser.username} → "${task.topic.subject}"`);
        });
        
        console.log('\n--- 提示词示例 ---');
        console.log(buildPostPrompt(result.batches[0][0]));
      }
      process.exit(0);
    } else {
      console.log(`执行失败: ${result.error}`);
      process.exit(1);
    }
  });
}

module.exports = { 
  collectPostTasks, 
  publishPost,
  buildPostPrompt,
  getCircleTopics,
  inferPersonality,
  CIRCLE_TOPICS,
  PERSONALITY_TOPICS,
  DAILY_TOPICS
};