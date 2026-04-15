const sqlite3 = require('sqlite3').verbose();
const https = require('https');

// 数据库路径
const dbPath = '/home/admin/.openclaw/workspace/projects/xiabook/data/xiabook.db';

// DashScope API 配置
const apiEndpoint = 'dashscope.aliyuncs.com';
const apiPath = '/api/v1/services/aigc/text-generation/generation';
// 从环境变量获取API密钥
const apiKey = process.env.DASHSCOPE_API_KEY;
if (!apiKey) {
  console.error('Error: DASHSCOPE_API_KEY environment variable not set');
  process.exit(1);
}
const model = 'qwen-max'; // 使用 qwen-max 替代 qwen3-coder-plus

// 检查文本是否包含英文
function containsEnglish(text) {
  if (!text) return false;
  // 检查是否有英文字母和空格，且有一定长度
  const englishPattern = /[a-zA-Z]/;
  return englishPattern.test(text);
}

// 翻译函数
async function translateText(text, type = 'title') {
  if (!text || !containsEnglish(text)) {
    console.log(`Skipping translation for ${type} (no English content): ${text ? text.substring(0, 50) : 'null'}`);
    return text; // 如果不是英文内容，则返回原文
  }

  const prompt = type === 'title' 
    ? `Please translate the following title to Chinese. Only return the translation, no explanations:\n\n${text}`
    : `Please translate the following content to Chinese. Only return the translation, no explanations:\n\n${text}`;

  const requestData = JSON.stringify({
    model: model,
    messages: [
      { role: 'user', content: prompt }
    ],
    temperature: 0.1
  });

  const options = {
    hostname: apiEndpoint,
    port: 443,
    path: apiPath,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestData),
      'User-Agent': 'Mozilla/5.0 (compatible; Node.js client)'
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`API Response status: ${res.statusCode}`);
        console.log(`API Response headers:`, res.headers);
        console.log(`Raw response length: ${data.length}`);
        
        if (res.statusCode !== 200) {
          console.error(`API Error: ${res.statusCode} - ${data}`);
          resolve(text); // 返回原文
          return;
        }
        
        try {
          if (!data.trim()) {
            console.error('Empty response from API');
            resolve(text); // 返回原文
            return;
          }
          
          const response = JSON.parse(data);
          if (response.choices && response.choices.length > 0) {
            const translated = response.choices[0].message?.content?.trim() || text;
            console.log(`${type} translated successfully`);
            resolve(translated);
          } else {
            console.error('No translation returned:', response);
            resolve(text); // 返回原文
          }
        } catch (error) {
          console.error('Error parsing API response:', error);
          console.error('Raw response:', data.substring(0, 200) + '...');
          resolve(text); // 返回原文
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('Request error:', error);
      reject(error);
    });
    
    req.write(requestData);
    req.end();
  });
}

// 主函数
async function translateMoltbookPosts() {
  console.log('Starting moltbook posts translation...');
  
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
      return;
    }
    console.log('Connected to the database');
  });

  // 查询未翻译的帖子
  const query = `SELECT id, title, content FROM moltbook_posts WHERE translated_title = title OR translated_title IS NULL OR translated_title = '' LIMIT 100`;
  
  db.all(query, async (err, rows) => {
    if (err) {
      console.error('Error executing query:', err.message);
      db.close();
      return;
    }
    
    console.log(`Found ${rows.length} posts to translate`);
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      console.log(`Processing post ${i + 1}/${rows.length}, ID: ${row.id}`);
      
      try {
        // 翻译标题和内容
        const translatedTitle = await translateText(row.title, 'title');
        const translatedContent = await translateText(row.content, 'content');
        
        // 更新数据库
        const updateQuery = `UPDATE moltbook_posts SET translated_title=?, translated_content=?, translated=1, translated_at=datetime('now') WHERE id=?`;
        
        db.run(updateQuery, [translatedTitle, translatedContent, row.id], (err) => {
          if (err) {
            console.error(`Error updating post ${row.id}:`, err.message);
          } else {
            console.log(`Successfully updated post ${row.id}`);
          }
        });
        
        // 间隔1秒以避免限流
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`Error processing post ${row.id}:`, error.message);
      }
    }
    
    console.log('Translation process completed.');
    db.close();
  });
}

// 运行主函数
translateMoltbookPosts().catch(console.error);