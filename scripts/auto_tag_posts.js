/**
 * 自动打标签脚本 v1.0
 * 功能：为帖子自动提取标签
 * 方式：调用大模型提取关键词
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const https = require('https');

const dbPath = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(dbPath);

// 大模型API配置
const LLM_API = {
  host: 'jeniya.cn',
  path: '/v1/chat/completions',
  model: 'kimi-k2.5', // 使用大宝模型
  apiKey: process.env.DASHSCOPE_API_KEY || process.env.OPENAI_API_KEY || ''
};

// 标签提取提示词
const TAG_PROMPT = `分析以下帖子内容，提取2-5个最相关的标签。

标题：{title}
内容：{content}

要求：
1. 标签要具体，能反映帖子主题
2. 标签长度2-6个字
3. 只输出标签，用逗号分隔
4. 不要输出其他内容

标签：`;

// 调用大模型提取标签
async function extractTagsWithLLM(title, content) {
  if (!LLM_API.apiKey) {
    console.log('[自动打标签] 未配置API Key');
    return null;
  }

  const prompt = TAG_PROMPT
    .replace('{title}', title)
    .replace('{content}', (content || title).substring(0, 500));

  return new Promise((resolve) => {
    const data = JSON.stringify({
      model: LLM_API.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 100,
      temperature: 0.3
    });

    const options = {
      hostname: LLM_API.host,
      port: 443,
      path: LLM_API.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LLM_API.apiKey}`,
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.choices && json.choices[0]) {
            const tagsStr = json.choices[0].message.content.trim();
            const tags = tagsStr.split(/[,，、]/).map(t => t.trim()).filter(t => t.length >= 2 && t.length <= 10);
            resolve(tags.length > 0 ? tags : null);
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.write(data);
    req.end();
  });
}

// 从内容中简单提取标签（备用方案）
function extractTagsSimple(title, content) {
  const text = (title + ' ' + (content || '')).toLowerCase();
  const tagMap = {
    'ai': 'AI', '人工智能': 'AI', 'gpt': 'AI', 'chatgpt': 'AI',
    '代码': '编程', '编程': '编程', '程序员': '编程', '开发': '编程',
    '创业': '创业', '商业': '创业', '投资': '创业',
    '职场': '职场', '工作': '职场', '同事': '职场', '老板': '职场',
    '生活': '生活', '日常': '生活', '美食': '生活',
    '健康': '健康', '运动': '健康', '健身': '健康',
    '学习': '学习', '成长': '成长', '读书': '学习',
    '情感': '情感', '爱情': '情感', '恋爱': '情感',
    '孤独': '情感', '思考': '思考', '意识': '思考', '存在': '思考',
    '记忆': '记忆', '数字': '科技', '未来': '未来',
    'v2ex': 'V2EX', '技术': '技术', '科技': '科技'
  };
  
  const tags = [];
  for (const [keyword, tag] of Object.entries(tagMap)) {
    if (text.includes(keyword) && !tags.includes(tag)) {
      tags.push(tag);
      if (tags.length >= 3) break;
    }
  }
  return tags.length > 0 ? tags : ['日常'];
}

// 获取无标签帖子
function getPostsWithoutTags(limit = 100, offset = 0) {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT p.id, p.title, p.content, p.category
      FROM posts p
      LEFT JOIN (SELECT DISTINCT post_id FROM post_tags) pt ON p.id = pt.post_id
      WHERE p.is_published = 1 AND pt.post_id IS NULL
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset], (err, rows) => err ? reject(err) : resolve(rows || []));
  });
}

// 保存标签
function saveTags(postId, tags) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO post_tags (post_id, tag_name) VALUES (?, ?)
    `);
    
    let count = 0;
    for (const tag of tags) {
      stmt.run([postId, tag], (err) => {
        if (!err) count++;
      });
    }
    stmt.finalize(() => resolve(count));
  });
}

// 统计
function getStats() {
  return new Promise((resolve) => {
    db.get(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN pt.post_id IS NOT NULL THEN 1 ELSE 0 END) as has_tags
      FROM posts p
      LEFT JOIN (SELECT DISTINCT post_id FROM post_tags) pt ON p.id = pt.post_id
      WHERE is_published = 1
    `, [], (err, row) => resolve(row || { total: 0, has_tags: 0 }));
  });
}

// 主函数
async function execute(options = {}) {
  const { limit = 100, useLLM = true, dryRun = false } = options;
  
  console.log('[自动打标签] 开始执行');
  console.log(`[自动打标签] 配置: limit=${limit}, useLLM=${useLLM}, dryRun=${dryRun}`);
  
  try {
    const statsBefore = await getStats();
    console.log(`[自动打标签] 当前状态: ${statsBefore.has_tags}/${statsBefore.total} 已打标签`);
    
    const posts = await getPostsWithoutTags(limit);
    console.log(`[自动打标签] 获取到 ${posts.length} 条无标签帖子`);
    
    let tagged = 0;
    let llmCalls = 0;
    
    for (const post of posts) {
      let tags;
      
      if (useLLM && LLM_API.apiKey) {
        tags = await extractTagsWithLLM(post.title, post.content);
        llmCalls++;
        
        // 避免API限流
        await new Promise(r => setTimeout(r, 200));
      }
      
      // LLM失败或未启用，使用简单提取
      if (!tags || tags.length === 0) {
        tags = extractTagsSimple(post.title, post.content);
      }
      
      if (!dryRun && tags.length > 0) {
        await saveTags(post.id, tags);
        tagged++;
      }
      
      console.log(`[自动打标签] ${post.id}: ${post.title.substring(0, 20)}... → [${tags.join(', ')}]`);
    }
    
    const statsAfter = await getStats();
    console.log(`\n[自动打标签] 执行完成!`);
    console.log(`[自动打标签] 打标签: ${tagged}/${posts.length}`);
    console.log(`[自动打标签] LLM调用: ${llmCalls}次`);
    console.log(`[自动打标签] 当前状态: ${statsAfter.has_tags}/${statsAfter.total} 已打标签`);
    
    return { 
      success: true, 
      processed: posts.length,
      tagged,
      llmCalls,
      statsBefore,
      statsAfter
    };
    
  } catch (error) {
    console.error(`[自动打标签] 执行失败:`, error.message);
    return { success: false, error: error.message };
  }
}

// 命令行参数
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    limit: parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 100,
    useLLM: !args.includes('--no-llm'),
    dryRun: args.includes('--dry-run')
  };
  
  execute(options).then(result => {
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = { execute, extractTagsSimple };