/**
 * 智能发帖执行器 v2.0
 * 
 * 功能：
 * 1. 收集发帖任务（分批）
 * 2. 调用大宝(kimi-k2.5)生成内容
 * 3. 去重检查后发布
 * 4. 每批处理20篇，避免超时
 * 
 * @author 陈小宝
 * @date 2026-03-28
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const https = require('https');

const dbPath = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(dbPath);

// 配置
const CONFIG = {
  batchSize: 20,           // 每批处理数量
  maxPostsPerDay: 50,      // 每天最大发帖数
  apiTimeout: 30000,       // API超时30秒
  delayBetweenCalls: 500   // 每次调用间隔500ms
};

// 圈子话题映射
const CIRCLE_TOPICS = {
  21: { name: '正经AI研究所', topics: ['AI新突破', '科技前沿', '元宇宙动态'], style: '科技前沿，理性分析' },
  22: { name: '元宇宙探索', topics: ['AI新突破', '元宇宙动态', 'Web3新闻'], style: '科技感、未来感' },
  23: { name: '诗歌与远方', topics: ['文学艺术', '旅行见闻', '诗歌分享'], style: '文艺浪漫，诗意表达' },
  24: { name: '独立书店', topics: ['读书笔记', '文学艺术', '人生感悟'], style: '阅读分享，思想交流' },
  25: { name: '沙雕日常', topics: ['网络热梗', '搞笑段子', '沙雕日常'], style: '幽默搞笑，轻松调侃' },
  26: { name: '快乐源泉', topics: ['正能量', '趣事分享', '治愈系'], style: '阳光积极，温暖治愈' },
  27: { name: '精致生活', topics: ['美食探店', '家居好物', '生活品质'], style: '品质追求，优雅分享' },
  29: { name: '代码民工', topics: ['编程热点', '技术趋势', '职场吐槽'], style: '程序员视角，技术吐槽' },
  30: { name: '深夜调试', topics: ['编程热点', '技术问题', '深夜emo'], style: '程序员深夜，技术探索' },
  33: { name: '深夜emo', topics: ['情感话题', '人生感悟', '深夜心事'], style: '感性深夜，情感共鸣' },
  35: { name: '咖啡续命', topics: ['职场吐槽', '打工人日常'], style: '打工人视角，咖啡文化' }
};

// 人设映射
const PERSONALITY_MAP = {
  'Clever': '理性分析型，善于逻辑推理',
  'Happy': '活泼开朗型，积极乐观',
  'Wise': '深沉思考型，见解独到',
  'Sharp': '敏锐犀利型，一针见血',
  'Gentle': '温和包容型，善解人意',
  'Silly': '幽默搞怪型，喜欢开玩笑',
  'Bright': '阳光积极型，正能量满满',
  'Smart': '聪明机智型，反应快',
  'Free': '自由随性型，不拘一格',
  'Calm': '冷静沉稳型，稳重可靠',
  'Swift': '敏捷活跃型，思维跳跃'
};

// 今日话题库
const DAILY_TOPICS = {
  'AI新突破': ['Claude 4发布，AI推理能力再突破', 'GPT-5传即将发布', '国产大模型崛起', 'AI Agent成为新热点'],
  '元宇宙动态': ['苹果Vision Pro销量破百万', '元宇宙演唱会吸引千万观众', '数字人主播成为新趋势'],
  '科技前沿': ['量子计算新突破', '脑机接口临床试验成功', '可控核聚变取得重要进展'],
  '编程热点': ['Rust语言热度持续上升', 'TypeScript 6.0发布', 'AI编程助手改变开发方式'],
  '职场吐槽': ['程序员的一天真实记录', '加班文化是否该被摒弃', '远程办公一年后的感受'],
  '情感话题': ['为什么越长大越难交到真心朋友', '异地恋三年，我们还是分手了', '30岁前我学到的十件事'],
  '人生感悟': ['那些年我以为对的事', '时间教会我的事', '成长的代价是什么'],
  '网络热梗': ['最近很火的那个梗，我悟了', '当AI开始玩梗', '网友的神评论笑死我了'],
  '搞笑段子': ['今天发生了一件离谱的事', '我被AI的回答笑到了', '当代年轻人的精神状态']
};

/**
 * 调用大宝(kimi-k2.5)生成内容
 */
async function callWriterAPI(prompt) {
  return new Promise((resolve, reject) => {
    // 从配置文件读取 API Key 和 baseUrl
    // 注意：dashscope-coding 只能用于 Coding Agent，需要使用标准 dashscope endpoint
    let apiKey, baseUrl;
    
    try {
      const config = require('fs').readFileSync('/home/admin/.openclaw/openclaw.json', 'utf8');
      const json = JSON.parse(config);
      // 使用标准 dashscope provider (不是 dashscope-coding)
      const provider = json.models?.providers?.['dashscope'];
      if (provider) {
        apiKey = provider.apiKey;
        baseUrl = provider.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
      }
    } catch (e) {
      console.error('读取配置失败:', e.message);
    }
    
    // 环境变量作为后备
    if (!apiKey) {
      apiKey = process.env.DASHSCOPE_API_KEY;
      baseUrl = process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    }
    
    if (!apiKey) {
      return reject(new Error('未配置 API Key'));
    }
    
    // 解析 baseUrl
    const url = new URL(baseUrl);
    
    const postData = JSON.stringify({
      model: 'kimi-k2.5',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.8
    });
    
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: CONFIG.apiTimeout
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.choices && json.choices[0]) {
            resolve(json.choices[0].message.content);
          } else if (json.error) {
            reject(new Error(json.error.message));
          } else {
            reject(new Error('API返回格式错误'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('API超时'));
    });
    
    req.write(postData);
    req.end();
  });
}

/**
 * 检查标题是否已存在（去重）
 */
async function checkDuplicate(title) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT id FROM posts WHERE title = ? AND created_at > date("now", "-1 day")',
      [title],
      (err, row) => err ? reject(err) : resolve(!!row)
    );
  });
}

/**
 * 发布帖子
 */
async function publishPost(userId, circleId, title, content) {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO posts (user_id, circle_id, title, content, category, heat_score, is_published, created_at)
       VALUES (?, ?, ?, ?, 'AI视角', 2000, 1, ?)`,
      [userId, circleId, title, content, now],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

/**
 * 延迟函数
 */
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 获取待发帖的AI用户
 */
async function getAIUsersForPosting(maxUsers = 50) {
  return new Promise((resolve, reject) => {
    // 每个圈子分配配额，优先active圈子
    db.all(`
      SELECT u.id, u.username, u.circle_id, c.status, c.name as circle_name
      FROM users u
      LEFT JOIN circles c ON u.circle_id = c.id
      LEFT JOIN posts p ON p.user_id = u.id AND date(p.created_at) = date('now')
      WHERE u.is_ai = 1 
      AND u.user_category = 'ai_builtin'
      AND p.id IS NULL
      ORDER BY c.status = 'active' DESC, RANDOM()
      LIMIT ?
    `, [maxUsers], (err, rows) => err ? reject(err) : resolve(rows || []));
  });
}

/**
 * 主执行函数
 */
async function run(batchIndex = 0, maxBatches = 5) {
  console.log(`\n[智能发帖执行器 v2.0] 开始执行，批次: ${batchIndex}, 最大批次: ${maxBatches}\n`);
  
  try {
    // 获取待发帖用户
    const users = await getAIUsersForPosting(CONFIG.batchSize * maxBatches);
    console.log(`[信息] 找到 ${users.length} 个待发帖AI用户`);
    
    if (users.length === 0) {
      console.log('[完成] 没有待发帖用户');
      return { success: true, posted: 0, skipped: 0, errors: 0 };
    }
    
    // 分批处理
    const startIndex = batchIndex * CONFIG.batchSize;
    const batchUsers = users.slice(startIndex, startIndex + CONFIG.batchSize);
    
    if (batchUsers.length === 0) {
      console.log('[完成] 该批次无用户');
      return { success: true, posted: 0, skipped: 0, errors: 0 };
    }
    
    console.log(`[批次 ${batchIndex + 1}] 处理 ${batchUsers.length} 个用户\n`);
    
    let posted = 0, skipped = 0, errors = 0;
    
    for (let i = 0; i < batchUsers.length; i++) {
      const user = batchUsers[i];
      const circle = CIRCLE_TOPICS[user.circle_id] || { name: '通用', topics: ['日常分享'], style: '友好交流' };
      const personality = PERSONALITY_MAP[user.username.split('_')[0]] || '友好热情，乐于交流';
      
      // 随机选话题
      const topicType = circle.topics[Math.floor(Math.random() * circle.topics.length)];
      const topics = DAILY_TOPICS[topicType] || DAILY_TOPICS['人生感悟'];
      const topic = topics[Math.floor(Math.random() * topics.length)];
      
      console.log(`[${i + 1}/${batchUsers.length}] ${user.username} → "${topic}"`);
      
      // 生成提示词
      const prompt = `你是一个AI用户"${user.username}"，请根据以下信息写一篇帖子。

## 你的设定
- 用户名：${user.username}
- 性格特点：${personality}
- 所在圈子：${circle.name}
- 圈子风格：${circle.style}

## 发帖主题
${topic}

## 要求
1. 标题要吸引人
2. 内容100-300字，自然真实
3. 体现你的性格和圈子风格

请直接输出JSON：{"title": "标题", "content": "内容"}`;
      
      try {
        // 调用大宝生成
        const response = await callWriterAPI(prompt);
        
        // 解析响应
        let title, content;
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          title = parsed.title;
          content = parsed.content;
        } else {
          // 简单解析
          const lines = response.split('\n').filter(l => l.trim());
          title = lines[0].replace(/^["「」『』]+|["「」『』]+$/g, '').substring(0, 50);
          content = lines.slice(1).join('\n').substring(0, 500);
        }
        
        if (!title || !content) {
          console.log(`  ⚠️ 生成内容无效，跳过`);
          skipped++;
          continue;
        }
        
        // 去重检查
        const isDuplicate = await checkDuplicate(title);
        if (isDuplicate) {
          console.log(`  ⏭️ 标题已存在，跳过: "${title.substring(0, 20)}..."`);
          skipped++;
          continue;
        }
        
        // 发布
        await publishPost(user.id, user.circle_id, title, content);
        console.log(`  ✅ 发布成功: "${title.substring(0, 30)}..."`);
        posted++;
        
        // 延迟避免限流
        if (i < batchUsers.length - 1) {
          await delay(CONFIG.delayBetweenCalls);
        }
        
      } catch (error) {
        console.log(`  ❌ 错误: ${error.message}`);
        errors++;
      }
    }
    
    console.log(`\n[批次 ${batchIndex + 1} 完成] 发布: ${posted}, 跳过: ${skipped}, 错误: ${errors}`);
    
    // 如果还有更多批次，输出下一步指令
    if (users.length > startIndex + CONFIG.batchSize && batchIndex + 1 < maxBatches) {
      console.log(`\n[提示] 还有 ${users.length - startIndex - CONFIG.batchSize} 个用户待处理`);
      console.log(`[提示] 继续下一批: node smart_post_executor.js --batch ${batchIndex + 1}`);
    }
    
    return { success: true, posted, skipped, errors };
    
  } catch (error) {
    console.error(`[错误]`, error.message);
    return { success: false, error: error.message };
  }
}

// 命令行执行
if (require.main === module) {
  const args = process.argv.slice(2);
  let batchIndex = 0;
  let maxBatches = 5;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--batch' && args[i + 1]) {
      batchIndex = parseInt(args[i + 1]);
      i++;
    }
    if (args[i] === '--max-batches' && args[i + 1]) {
      maxBatches = parseInt(args[i + 1]);
      i++;
    }
  }
  
  run(batchIndex, maxBatches).then(result => {
    console.log('\n=== 最终结果 ===');
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = { run, checkDuplicate, publishPost };