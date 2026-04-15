#!/usr/bin/env node
/**
 * 使用正确的 DashScope API 翻译
 * endpoint: https://dashscope.aliyuncs.com/compatible-mode/v1
 * model: qwen3-max
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(DB_PATH);

// 从 OpenClaw 配置读取正确的 API Key
const OPENCLAW_CONFIG = JSON.parse(fs.readFileSync('/home/admin/.openclaw/openclaw.json', 'utf8'));
const DASHSCOPE_CONFIG = OPENCLAW_CONFIG.models.providers.dashscope;

// 注意：apiKey 可能是变量引用 $api-key，需要从环境变量或 secrets 获取
const API_KEY = process.env.DASHSCOPE_API_KEY || DASHSCOPE_CONFIG.apiKey;

console.log(`API Key type: ${API_KEY.startsWith('$') ? 'variable reference' : 'actual key'}`);
console.log(`Base URL: ${DASHSCOPE_CONFIG.baseUrl}`);

// 如果是变量引用，提示需要设置环境变量
if (API_KEY.startsWith('$')) {
  console.log('\n需要设置环境变量 DASHSCOPE_API_KEY');
  console.log('或直接传递实际的 API Key');
  db.close();
  process.exit(1);
}

/**
 * 判断是否为英文文本
 */
function isEnglishText(text) {
  if (!text) return false;
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  return englishWords > chineseChars * 2;
}

/**
 * 调用 DashScope API 翻译
 */
async function translate(text, maxTokens = 8000) {
  if (!text || text.length < 10) return text;
  if (!isEnglishText(text)) return text;
  
  const model = 'qwen3-max-2026-01-23'; // 使用 qwen3-max
  
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: '你是专业的英译中翻译助手。请完整翻译全文，不要遗漏任何内容。只返回翻译结果。' },
        { role: 'user', content: `请将以下英文内容完整翻译成中文，保持原意和风格：\n\n${text}` }
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
            console.error(`Unknown response: ${JSON.stringify(result).substring(0, 200)}`);
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

/**
 * 主函数
 */
async function main() {
  console.log('========== 使用 DashScope API 翻译 ==========');
  
  // 获取需要翻译的帖子
  db.all(`SELECT id, content, translated_content FROM moltbook_posts ORDER BY id`, [], async (err, posts) => {
    if (err) {
      console.error(err);
      db.close();
      return;
    }
    
    const needTranslation = posts.filter(p => isEnglishText(p.translated_content));
    console.log(`需要翻译: ${needTranslation.length} 条`);
    
    let success = 0;
    let failed = 0;
    
    for (const post of needTranslation.slice(0, 10)) { // 先处理10条测试
      console.log(`翻译 #${post.id}...`);
      
      const translated = await translate(post.content);
      
      if (!isEnglishText(translated)) {
        // 更新数据库
        db.run(`UPDATE moltbook_posts SET translated_content = ? WHERE id = ?`, [translated, post.id], (err) => {
          if (err) console.error(`更新失败: ${err.message}`);
        });
        console.log(`✓ #${post.id} 完成`);
        success++;
      } else {
        console.log(`✗ #${post.id} 翻译失败`);
        failed++;
      }
      
      // 间隔
      await new Promise(r => setTimeout(r, 1000));
    }
    
    console.log(`\n完成: ${success}, 失败: ${failed}`);
    db.close();
  });
}

main();