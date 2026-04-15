#!/usr/bin/env node
/**
 * 海外洋虾补翻译脚本
 * 用途：翻译 translated_title = title 或为空的帖子
 * 执行：node scripts/moltbook_fix_untranslated.js
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/xiabook.db');
const LOG_FILE = path.join(__dirname, '../logs/moltbook_fix_untranslated.log');

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(DB_PATH);

// API 配置（dashscope-coding）
const API_KEY = process.env.EXTERNAL_API_KEY || 'sk-sp-58ea47d39619490690a225d6f6ed9bd6';
const API_URL = 'coding.dashscope.aliyuncs.com';
const API_MODEL = 'qwen3-coder-plus';

function log(msg) {
  const ts = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `[${ts}] ${msg}\n`);
  console.log(msg);
}

async function translate(text, type = 'content') {
  if (!text || text.length < 10) return text;
  
  // 检查是否已主要是中文
  const chineseRatio = (text.match(/[\u4e00-\u9fa5]/g) || []).length / text.length;
  if (chineseRatio > 0.3) return text;
  
  const prompt = type === 'title'
    ? `翻译以下英文标题为中文，简洁有力，只返回翻译结果：\n${text}`
    : `翻译以下英文内容为中文，保持原意，语言流畅自然，只返回翻译结果：\n${text}`;
  
  const body = {
    model: API_MODEL,
    messages: [
      { role: 'system', content: '你是英译中翻译助手，只返回翻译结果' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.3,
    max_tokens: type === 'title' ? 200 : 4000
  };
  
  return new Promise((resolve, reject) => {
    const https = require('https');
    const postData = JSON.stringify(body);
    
    const req = https.request({
      hostname: API_URL,
      port: 443,
      path: '/v1/chat/completions',
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
      log(`请求失败: ${e.message}`);
      resolve(text);
    });
    
    req.write(postData);
    req.end();
  });
}

async function main() {
  log('=== 开始补翻译 ===');
  
  // 查找需要翻译的帖子
  const posts = await new Promise((resolve, reject) => {
    db.all(`
      SELECT id, title, content 
      FROM moltbook_posts 
      WHERE translated_title = title OR translated_title IS NULL OR translated_title = ''
      LIMIT 50
    `, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
  
  log(`找到 ${posts.length} 条需要翻译的帖子`);
  
  for (const p of posts) {
    log(`翻译 ID=${p.id}: ${p.title.slice(0, 50)}...`);
    
    const translatedTitle = await translate(p.title, 'title');
    const translatedContent = await translate(p.content, 'content');
    
    // 更新数据库
    await new Promise((resolve, reject) => {
      db.run(`
        UPDATE moltbook_posts 
        SET translated_title = ?, translated_content = ?, translated = 1, translated_at = ?
        WHERE id = ?
      `, [translatedTitle, translatedContent, new Date().toISOString(), p.id], (err) => {
        if (err) {
          log(`更新失败 ID=${p.id}: ${err.message}`);
          reject(err);
        } else {
          log(`更新成功 ID=${p.id}: ${translatedTitle.slice(0, 30)}...`);
          resolve();
        }
      });
    });
    
    // 每条间隔 1 秒，避免 API 限流
    await new Promise(r => setTimeout(r, 1000));
  }
  
  log('=== 补翻译完成 ===');
  db.close();
}

main().catch(e => {
  log(`脚本错误: ${e.message}`);
  db.close();
});