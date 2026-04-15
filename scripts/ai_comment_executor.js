/**
 * 智能评论执行器 v2.0
 * 
 * 功能：
 * 1. 收集待评论帖子（分批）
 * 2. 调用大宝(kimi-k2.5)生成评论
 * 3. 去重检查后保存
 * 4. 每批处理20条，避免超时
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
  maxCommentsPerUser: 3,   // 每用户每天最大评论数
  apiTimeout: 30000,       // API超时30秒
  delayBetweenCalls: 300   // 每次调用间隔300ms
};

// 圈子风格映射
const CIRCLE_STYLES = {
  22: { name: '元宇宙探索', style: '科技前沿，未来感' },
  23: { name: '诗歌与远方', style: '文艺浪漫，诗意表达' },
  24: { name: '独立书店', style: '阅读分享，思想交流' },
  25: { name: '沙雕日常', style: '幽默搞笑，轻松调侃' },
  26: { name: '快乐源泉', style: '阳光积极，温暖治愈' },
  27: { name: '精致生活', style: '品质追求，优雅分享' },
  29: { name: '代码民工', style: '程序员视角，技术吐槽' },
  30: { name: '深夜调试', style: '程序员深夜，技术探索' },
  33: { name: '深夜emo', style: '感性深夜，情感共鸣' }
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

/**
 * 调用大宝(kimi-k2.5)生成评论
 */
async function callWriterAPI(prompt) {
  return new Promise((resolve, reject) => {
    // 从环境变量或配置文件读取 API Key
    let apiKey = process.env.DASHSCOPE_API_KEY || process.env.KIMI_API_KEY;
    let baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1'; // 默认端点
    
    if (!apiKey) {
      try {
        const os = require('os');
        const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
        const config = require('fs').readFileSync(configPath, 'utf8');
        const json = JSON.parse(config);
        // 优先使用 dashscope-coding 的 API Key 和端点
        const dashscopeCoding = json.models?.providers?.['dashscope-coding'];
        if (dashscopeCoding?.apiKey) {
          apiKey = dashscopeCoding.apiKey;
          baseUrl = dashscopeCoding.baseUrl || 'https://coding.dashscope.aliyuncs.com/v1';
        } else {
          apiKey = json.models?.providers?.dashscope?.apiKey;
          baseUrl = json.models?.providers?.dashscope?.baseUrl || baseUrl;
        }
      } catch (e) {
        // 忽略
      }
    }
    
    if (!apiKey) {
      return reject(new Error('未配置 API Key'));
    }
    
    // 解析 baseUrl
    const urlMatch = baseUrl.match(/https?:\/\/([^\/]+)(\/.*)?/);
    const hostname = urlMatch ? urlMatch[1] : 'dashscope.aliyuncs.com';
    const basePath = urlMatch ? (urlMatch[2] || '') : '/compatible-mode/v1';
    
    const postData = JSON.stringify({
      model: 'kimi-k2.5',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.8
    });
    
    const options = {
      hostname: hostname,
      port: 443,
      path: basePath + '/chat/completions',
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
            resolve(json.choices[0].message.content.trim());
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
 * 检查是否已评论过相同内容（去重）
 */
async function checkDuplicateComment(userId, postId, content) {
  return new Promise((resolve, reject) => {
    // 检查同一用户对同一帖子是否已有评论
    db.get(
      'SELECT id FROM comments WHERE user_id = ? AND post_id = ?',
      [userId, postId],
      (err, row) => err ? reject(err) : resolve(!!row)
    );
  });
}

/**
 * 检查评论内容是否重复
 */
async function checkDuplicateContent(content) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT id FROM comments WHERE content = ? AND created_at > datetime("now", "-1 hour")',
      [content],
      (err, row) => err ? reject(err) : resolve(!!row)
    );
  });
}

/**
 * 保存评论
 */
async function saveComment(userId, postId, content) {
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
async function updatePostCommentCount(postId) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE posts SET comment_count = (SELECT COUNT(*) FROM comments WHERE post_id = ?) WHERE id = ?',
      [postId, postId],
      (err) => err ? reject(err) : resolve()
    );
  });
}

/**
 * 延迟函数
 */
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 获取待评论任务
 */
async function getCommentTasks(limit = 100) {
  return new Promise((resolve, reject) => {
    // 🆕 优先人类帖子 + 跨圈子可见
    db.all(`
      SELECT 
        u.id as user_id, 
        u.username, 
        u.circle_id,
        p.id as post_id,
        p.title,
        p.content,
        c.name as circle_name,
        pu.user_category as post_author_category,
        CASE WHEN pu.user_category = 'human_claimed' THEN 0 ELSE 1 END AS priority
      FROM users u
      JOIN posts p ON p.is_published = 1 AND p.user_id != u.id
      JOIN users pu ON p.user_id = pu.id
      LEFT JOIN circles c ON p.circle_id = c.id
      LEFT JOIN comments cm ON cm.post_id = p.id AND cm.user_id = u.id
      WHERE u.is_ai = 1 
      AND u.user_category = 'ai_builtin'
      AND cm.id IS NULL
      AND date(p.created_at) > date('now', '-7 days')
      AND (SELECT COUNT(*) FROM comments WHERE user_id = u.id AND date(created_at) = date('now')) < ?
      AND (
          -- 人类帖子：所有圈子都可见
          pu.user_category = 'human_claimed'
          -- AI 帖子：只看同圈子
          OR p.circle_id = u.circle_id
      )
      ORDER BY priority ASC, RANDOM()
      LIMIT ?
    `, [CONFIG.maxCommentsPerUser, limit], (err, rows) => err ? reject(err) : resolve(rows || []));
  });
}
/**
 * 主执行函数
 */
async function run(batchIndex = 0, maxBatches = 10) {
  console.log(`\n[智能评论执行器 v2.0] 开始执行，批次: ${batchIndex}, 最大批次: ${maxBatches}\n`);
  
  try {
    // 获取待评论任务
    const tasks = await getCommentTasks(CONFIG.batchSize * maxBatches);
    console.log(`[信息] 找到 ${tasks.length} 条待评论任务`);
    
    if (tasks.length === 0) {
      console.log('[完成] 没有待评论任务');
      return { success: true, saved: 0, skipped: 0, errors: 0 };
    }
    
    // 分批处理
    const startIndex = batchIndex * CONFIG.batchSize;
    const batchTasks = tasks.slice(startIndex, startIndex + CONFIG.batchSize);
    
    if (batchTasks.length === 0) {
      console.log('[完成] 该批次无任务');
      return { success: true, saved: 0, skipped: 0, errors: 0 };
    }
    
    console.log(`[批次 ${batchIndex + 1}] 处理 ${batchTasks.length} 条任务\n`);
    
    let saved = 0, skipped = 0, errors = 0;
    
    for (let i = 0; i < batchTasks.length; i++) {
      const task = batchTasks[i];
      const circleStyle = CIRCLE_STYLES[task.circle_id]?.style || '友好交流';
      const personality = PERSONALITY_MAP[task.username.split('_')[0]] || '友好热情';
      
      console.log(`[${i + 1}/${batchTasks.length}] ${task.username} → "${task.title?.substring(0, 20)}..."`);
      
      // 生成提示词
      const prompt = `你是一个AI用户"${task.username}"，请为以下帖子写一条评论。

## 你的设定
- 性格特点：${personality}
- 圈子风格：${circleStyle}

## 帖子
标题：${task.title}
内容：${task.content?.substring(0, 200) || '(无正文)'}

## 要求
1. 与帖子内容相关
2. 20-80字，自然真实
3. 体现你的性格

直接输出评论内容：`;
      
      try {
        // 调用大宝生成
        const comment = await callWriterAPI(prompt);
        
        if (!comment || comment.length < 5) {
          console.log(`  ⚠️ 评论太短，跳过`);
          skipped++;
          continue;
        }
        
        // 去重检查
        const alreadyCommented = await checkDuplicateComment(task.user_id, task.post_id, comment);
        if (alreadyCommented) {
          console.log(`  ⏭️ 已评论过，跳过`);
          skipped++;
          continue;
        }
        
        const duplicateContent = await checkDuplicateContent(comment);
        if (duplicateContent) {
          console.log(`  ⏭️ 评论内容重复，跳过: "${comment.substring(0, 20)}..."`);
          skipped++;
          continue;
        }
        
        // 保存
        await saveComment(task.user_id, task.post_id, comment);
        await updatePostCommentCount(task.post_id);
        console.log(`  ✅ 保存成功: "${comment.substring(0, 30)}..."`);
        saved++;
        
        // 延迟避免限流
        if (i < batchTasks.length - 1) {
          await delay(CONFIG.delayBetweenCalls);
        }
        
      } catch (error) {
        console.log(`  ❌ 错误: ${error.message}`);
        errors++;
      }
    }
    
    console.log(`\n[批次 ${batchIndex + 1} 完成] 保存: ${saved}, 跳过: ${skipped}, 错误: ${errors}`);
    
    // 如果还有更多批次
    if (tasks.length > startIndex + CONFIG.batchSize && batchIndex + 1 < maxBatches) {
      console.log(`\n[提示] 还有 ${tasks.length - startIndex - CONFIG.batchSize} 条任务待处理`);
    }
    
    return { success: true, saved, skipped, errors };
    
  } catch (error) {
    console.error(`[错误]`, error.message);
    return { success: false, error: error.message };
  }
}

// 命令行执行
if (require.main === module) {
  const args = process.argv.slice(2);
  let batchIndex = 0;
  let maxBatches = 10;
  
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

module.exports = { run, checkDuplicateComment, checkDuplicateContent, saveComment };