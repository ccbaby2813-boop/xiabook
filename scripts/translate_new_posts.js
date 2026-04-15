#!/usr/bin/env node
/**
 * 翻译新入库的 Moltbook 帖子
 * 使用 DashScope API
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const https = require('https');

const DB_PATH = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(DB_PATH);

// 从环境变量或配置获取 API Key
const API_KEY = process.env.DASHSCOPE_API_KEY;

if (!API_KEY) {
  console.error('需要设置环境变量 DASHSCOPE_API_KEY');
  db.close();
  process.exit(1);
}

// 判断是否为英文文本
function isEnglishText(text) {
  if (!text) return false;
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  return englishWords > chineseChars * 2;
}

// 调用 DashScope API 翻译
async function translate(text, maxTokens = 2000) {
  if (!text || text.length < 10) return text;
  if (!isEnglishText(text)) return text;
  
  const model = 'qwen3-max-2026-01-23';
  
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: '你是专业的英译中翻译助手。请完整翻译全文，保持原意和风格，翻译成自然流畅的中文。只返回翻译结果。' },
        { role: 'user', content: `请将以下英文内容完整翻译成中文：\n\n${text}` }
      ],
      temperature: 0.3,
      max_tokens: maxTokens
    });

    const options = {
      hostname: 'dashscope.aliyuncs.com',
      port: 443,
      path: '/compatible-mode/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.choices && result.choices[0]) {
            resolve(result.choices[0].message.content.trim());
          } else if (result.error) {
            console.error(`API Error: ${result.error.message}`);
            resolve(text);
          } else {
            resolve(text);
          }
        } catch (e) {
          console.error(`Parse error: ${e.message}`);
          resolve(text);
        }
      });
    });

    req.on('error', (e) => {
      console.error(`Request error: ${e.message}`);
      resolve(text);
    });

    req.write(postData);
    req.end();
  });
}

// 主函数
async function main() {
  console.log('========== 翻译新 Moltbook 帖子 ==========');
  
  // 获取待翻译帖子
  const posts = await new Promise((resolve, reject) => {
    db.all('SELECT id, title, content FROM moltbook_posts WHERE translated = 0 ORDER BY id', [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
  
  console.log(`待翻译: ${posts.length} 条`);
  
  let success = 0;
  let failed = 0;
  
  for (const post of posts) {
    console.log(`\n翻译 #${post.id}: ${post.title.substring(0, 40)}...`);
    
    try {
      // 翻译标题
      const translatedTitle = await translate(post.title, 200);
      
      // 翻译内容
      const translatedContent = await translate(post.content, 4000);
      
      // 更新数据库
      await new Promise((resolve, reject) => {
        db.run(`
          UPDATE moltbook_posts 
          SET translated_title = ?, translated_content = ?, translated = 1, translated_at = datetime('now')
          WHERE id = ?
        `, [translatedTitle, translatedContent, post.id], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      console.log(`✓ #${post.id} 完成`);
      success++;
      
      // 间隔 1 秒避免限流
      await new Promise(r => setTimeout(r, 1000));
      
    } catch (e) {
      console.error(`✗ #${post.id} 失败: ${e.message}`);
      failed++;
    }
  }
  
  console.log(`\n========================================`);
  console.log(`完成: ${success}, 失败: ${failed}`);
  
  db.close();
}

main();