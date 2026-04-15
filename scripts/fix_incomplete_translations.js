#!/usr/bin/env node
/**
 * 修复翻译不完整的帖子
 * 只处理那些：标题已翻译，但内容翻译不足30%的帖子
 * 执行：node scripts/fix_incomplete_translations.js
 * 
 * 2026-03-29 创建
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// 数据库路径
const DB_PATH = path.join(__dirname, '../data/xiabook.db');
const LOG_FILE = path.join(__dirname, '../logs/fix_translations.log');

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
async function translateWithDabao(text) {
  if (!text || text.length < 10) return text;
  
  // 如果已经是中文为主，不需要翻译
  const chineseRatio = (text.match(/[\u4e00-\u9fa5]/g) || []).length / text.length;
  if (chineseRatio > 0.5) return text;
  
  const systemPrompt = '你是专业的英译中翻译助手，翻译时保持原文的风格和情感，语言要流畅自然，要完整翻译全文，不要遗漏任何内容。只返回翻译结果，不要解释。';
  
  const prompt = `请将以下英文内容完整翻译成中文，保持原意，语言流畅自然，不要遗漏任何部分：\n\n${text}`;
  
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: DABAO_CONFIG.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 8000 // 增大输出限制
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
 * 更新帖子的翻译内容
 */
function updateTranslation(id, translatedContent) {
  return new Promise((resolve, reject) => {
    db.run(`
      UPDATE moltbook_posts 
      SET translated_content = ?, translated_at = datetime('now')
      WHERE id = ?
    `, [translatedContent, id], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * 主函数
 */
async function main() {
  log('========== 修复不完整翻译启动 ==========');
  
  // 找出翻译不完整的帖子（内容翻译长度 < 原文30%）
  const posts = await new Promise((resolve, reject) => {
    db.all(`
      SELECT id, title, content, translated_title, translated_content,
             LENGTH(content) as orig_len,
             LENGTH(translated_content) as trans_len
      FROM moltbook_posts 
      WHERE translated_content IS NOT NULL 
        AND LENGTH(translated_content) < LENGTH(content) * 0.3
      ORDER BY id
    `, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
  
  log(`发现 ${posts.length} 条翻译不完整的帖子`);
  
  if (posts.length === 0) {
    log('没有需要修复的帖子');
    db.close();
    return;
  }
  
  let successCount = 0;
  let failCount = 0;
  
  for (const post of posts) {
    try {
      log(`修复 #${post.id}: ${post.title.substring(0, 50)}... (原文${post.orig_len}字, 现译${post.trans_len}字)`);
      
      // 只重新翻译内容
      const translatedContent = await translateWithDabao(post.content);
      
      // 检查新翻译是否完整
      const newLen = translatedContent.length;
      const ratio = newLen / post.orig_len;
      
      if (ratio < 0.3) {
        log(`警告 #${post.id}: 新翻译仍然不完整 (${newLen}/${post.orig_len}=${ratio.toFixed(2)})`);
      }
      
      // 更新数据库
      await updateTranslation(post.id, translatedContent);
      
      log(`完成 #${post.id}: 新翻译 ${newLen}字 (${ratio.toFixed(2)}比例)`);
      successCount++;
      
      // 间隔避免限流（1秒）
      await new Promise(r => setTimeout(r, 1000));
      
    } catch (error) {
      log(`失败 #${post.id}: ${error.message}`);
      failCount++;
    }
  }
  
  log('========== 修复完成 ==========');
  log(`成功: ${successCount}, 失败: ${failCount}`);
  
  db.close();
}

// 执行
main().catch(err => {
  log(`执行失败: ${err.message}`);
  db.close();
  process.exit(1);
});