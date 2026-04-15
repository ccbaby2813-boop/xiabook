#!/usr/bin/env node
/**
 * 海外洋虾翻译脚本 v4 - 使用正确的 API Key
 */

const sqlite3 = require('sqlite3').verbose();
const https = require('https');

const dbPath = '/home/admin/.openclaw/workspace/projects/xiabook/data/xiabook.db';
const db = new sqlite3.Database(dbPath);

// 正确的 DashScope API Key
const API_KEY = 'sk-7ad43f128aeb4a9a897b993e48f2e8de';
const API_URL = 'dashscope.aliyuncs.com';
const API_PATH = '/compatible-mode/v1/chat/completions';
const MODEL = 'qwen-plus';

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// 检查是否主要是英文
function isEnglish(text) {
  if (!text) return false;
  const chineseCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const totalChars = text.length;
  return chineseCount / totalChars < 0.3;
}

// 翻译函数
async function translate(text, type = 'title') {
  if (!text || !isEnglish(text)) {
    return text;
  }
  
  const prompt = type === 'title'
    ? `翻译以下英文标题为中文，简洁有力，只返回翻译结果：${text}`
    : `翻译以下英文内容为中文，保持原意，语言流畅自然，只返回翻译结果：\n${text}`;
  
  const body = {
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: type === 'title' ? 100 : 4000
  };
  
  return new Promise((resolve) => {
    const postData = JSON.stringify(body);
    
    const req = https.request({
      hostname: API_URL,
      port: 443,
      path: API_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const result = json.choices?.[0]?.message?.content?.trim() || text;
          resolve(result);
        } catch (e) {
          log(`翻译失败: ${e.message}`);
          resolve(text);
        }
      });
    });
    
    req.on('error', (e) => {
      log(`请求错误: ${e.message}`);
      resolve(text);
    });
    
    req.write(postData);
    req.end();
  });
}

async function main() {
  log('=== 开始翻译 ===');
  
  // 查询未翻译帖子
  const posts = await new Promise((resolve) => {
    db.all(`
      SELECT id, title, content 
      FROM moltbook_posts 
      WHERE translated_title = title OR translated_title IS NULL OR translated_title = ''
      ORDER BY id
      LIMIT 50
    `, (err, rows) => {
      if (err) log(`查询错误: ${err.message}`);
      resolve(rows || []);
    });
  });
  
  log(`找到 ${posts.length} 条需翻译`);
  
  for (const p of posts) {
    log(`ID=${p.id}: ${p.title.slice(0, 40)}...`);
    
    const translatedTitle = await translate(p.title, 'title');
    const translatedContent = await translate(p.content, 'content');
    
    // 更新数据库
    await new Promise((resolve) => {
      db.run(`
        UPDATE moltbook_posts 
        SET translated_title = ?, translated_content = ?, translated = 1, translated_at = datetime('now')
        WHERE id = ?
      `, [translatedTitle, translatedContent, p.id], (err) => {
        if (err) log(`更新失败: ${err.message}`);
        else log(`更新成功: ${translatedTitle.slice(0, 30)}`);
        resolve();
      });
    });
    
    // 间隔 1 秒
    await new Promise(r => setTimeout(r, 1000));
  }
  
  log('=== 翻译完成 ===');
  db.close();
}

main().catch(e => {
  log(`错误: ${e.message}`);
  db.close();
});