#!/usr/bin/env node
/**
 * 海外洋虾批量重翻译脚本
 * 用途：重新翻译 moltbook_posts 表中所有内容
 * 执行：node scripts/moltbook_retranslate.js
 * 
 * 2026-03-27 创建
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// 数据库路径
const DB_PATH = path.join(__dirname, '../data/xiabook.db');
const LOG_FILE = path.join(__dirname, '../logs/moltbook_retranslate.log');

// 大宝模型配置（qwen3-max）
const DABAO_CONFIG = {
  model: 'qwen3-max',
  apiUrl: 'dashscope.aliyuncs.com',
  apiPath: '/compatible-mode/v1/chat/completions',
  apiKey: process.env.EXTERNAL_API_KEY || 'sk-066t6ONpDfTsDDwkwvwAmUZMsEC2Tnxgozxm35dLXLbrpntj'
};

// 确保日志目录存在
const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(DB_PATH);

// 日志函数
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, logMessage);
  console.log(logMessage.trim());
}

/**
 * 调用大宝模型翻译
 */
async function translateWithDabao(text, type = 'content') {
  if (!text || text.length < 10) return text;
  
  // 如果已经是中文为主，不需要翻译
  const chineseRatio = (text.match(/[\u4e00-\u9fa5]/g) || []).length / text.length;
  if (chineseRatio > 0.5) return text;
  
  const systemPrompt = type === 'title' 
    ? '你是专业的英译中翻译助手，翻译标题时要保持原文的吸引力和情感，翻译要简洁有力。只返回翻译结果，不要解释。'
    : '你是专业的英译中翻译助手，翻译时保持原文的风格和情感，语言要流畅自然。只返回翻译结果，不要解释。';
  
  const prompt = type === 'title'
    ? `请将以下英文标题翻译成中文，保持简洁有力：\n\n${text}`
    : `请将以下英文内容翻译成中文，保持原意，语言流畅自然：\n\n${text}`;
  
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: DABAO_CONFIG.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: type === 'title' ? 200 : 4000
    });

    const options = {
      hostname: DABAO_CONFIG.apiUrl,
      port: 443,
      path: DABAO_CONFIG.apiPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DABAO_CONFIG.apiKey}`,
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
          } else {
            log(`翻译API响应异常: ${JSON.stringify(result).substring(0, 200)}`);
            resolve(text);
          }
        } catch (error) {
          log(`翻译解析失败: ${error.message}`);
          resolve(text);
        }
      });
    });

    req.on('error', (error) => {
      log(`翻译请求失败: ${error.message}`);
      resolve(text);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * 更新帖子的翻译
 */
function updateTranslation(id, translatedTitle, translatedContent) {
  return new Promise((resolve, reject) => {
    db.run(`
      UPDATE moltbook_posts 
      SET translated_title = ?, translated_content = ?, translated = 1, translated_at = datetime('now')
      WHERE id = ?
    `, [translatedTitle, translatedContent, id], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * 主函数
 */
async function main() {
  log('========== 海外洋虾批量重翻译启动 ==========');
  
  // 获取所有帖子
  const posts = await new Promise((resolve, reject) => {
    db.all('SELECT id, title, content, translated_title FROM moltbook_posts ORDER BY id', [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
  
  log(`共 ${posts.length} 条帖子需要检查`);
  
  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;
  
  for (const post of posts) {
    try {
      // 检查是否需要重翻译（如果已翻译且中文比例高，跳过）
      const chineseRatio = (post.translated_title?.match(/[\u4e00-\u9fa5]/g) || []).length / (post.translated_title?.length || 1);
      
      if (chineseRatio > 0.5) {
        log(`跳过 #${post.id}: 已是中文翻译`);
        skipCount++;
        continue;
      }
      
      log(`翻译 #${post.id}: ${post.title.substring(0, 40)}...`);
      
      // 翻译标题和内容
      const translatedTitle = await translateWithDabao(post.title, 'title');
      await new Promise(r => setTimeout(r, 200)); // 间隔
      const translatedContent = await translateWithDabao(post.content, 'content');
      
      // 更新数据库
      await updateTranslation(post.id, translatedTitle, translatedContent);
      
      log(`完成 #${post.id}: ${translatedTitle.substring(0, 40)}...`);
      successCount++;
      
      // 间隔避免限流
      await new Promise(r => setTimeout(r, 500));
      
    } catch (error) {
      log(`失败 #${post.id}: ${error.message}`);
      failCount++;
    }
  }
  
  log('========== 批量翻译完成 ==========');
  log(`成功: ${successCount}, 跳过: ${skipCount}, 失败: ${failCount}`);
  
  db.close();
}

// 执行
main().catch(err => {
  log(`执行失败: ${err.message}`);
  db.close();
  process.exit(1);
});