#!/usr/bin/env node
/**
 * 修复翻译不完整的帖子 v2
 * 使用大宝模型（kimi-k2.5）+ coding.dashscope API
 * 执行：node scripts/fix_translations_v2.js
 * 
 * 2026-03-29 创建
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// 数据库路径
const DB_PATH = path.join(__dirname, '../data/xiabook.db');
const LOG_FILE = path.join(__dirname, '../logs/fix_translations_v2.log');

// 大宝模型配置（kimi-k2.5）- 来自 translator.js
const DABAO_CONFIG = {
  model: 'kimi-k2.5',
  apiUrl: 'coding.dashscope.aliyuncs.com',
  apiPath: '/v1/chat/completions',
  apiKey: process.env.DASHSCOPE_API_KEY || 'sk-sp-58ea47d39619490690a225d6f6ed9bd6'
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
 * 判断文本是否主要是英文
 */
function isEnglishText(text) {
  if (!text) return false;
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  return englishWords > chineseChars * 2;
}

/**
 * 调用大宝模型翻译
 */
async function translateWithDabao(text, maxTokens = 8000) {
  if (!text || text.length < 10) return text;
  
  // 如果已经是中文为主，不需要翻译
  if (!isEnglishText(text)) return text;
  
  const systemPrompt = '你是专业的英译中翻译助手，翻译时保持原文的风格和情感，语言要流畅自然。必须完整翻译全文，不要遗漏任何内容或只翻译一部分。只返回翻译结果，不要解释。';
  
  const prompt = `请将以下英文内容**完整翻译**成中文，保持原意，语言流畅自然，不要遗漏任何部分，不要只翻译开头就停止：

${text}

请完整翻译全文，不要遗漏。只返回翻译结果。`;
  
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: DABAO_CONFIG.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: maxTokens
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
          } else if (result.error) {
            log(`翻译API错误: ${result.error.message || JSON.stringify(result.error)}`);
            resolve(text);
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
  log('========== 修复不完整翻译 v2 启动 ==========');
  log(`使用API: ${DABAO_CONFIG.apiUrl} (${DABAO_CONFIG.model})`);
  
  // 找出所有帖子，然后手动过滤
  const posts = await new Promise((resolve, reject) => {
    db.all(`
      SELECT id, title, content, translated_title, translated_content,
             LENGTH(content) as orig_len,
             LENGTH(translated_content) as trans_len
      FROM moltbook_posts 
      ORDER BY id
    `, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
  
  // 手动过滤：translated_content是英文的
  const needTranslation = posts.filter(p => isEnglishText(p.translated_content));
  
  log(`总共 ${posts.length} 条帖子，其中 ${needTranslation.length} 条需要重新翻译`);
  
  log(`发现 ${needTranslation.length} 条需要重新翻译的帖子（translated_content是英文）`);
  
  if (needTranslation.length === 0) {
    log('没有需要修复的帖子');
    db.close();
    return;
  }
  
  let successCount = 0;
  let failCount = 0;
  
  for (const post of needTranslation) {
    try {
      log(`翻译 #${post.id}: ${post.title.substring(0, 50)}...`);
      
      // 计算需要的 max_tokens（按字符数估算）
      const estimatedTokens = Math.min(Math.ceil(post.orig_len * 1.5), 16000);
      
      // 重新翻译内容
      const translatedContent = await translateWithDabao(post.content, estimatedTokens);
      
      // 检查新翻译是否成功（是中文）
      if (isEnglishText(translatedContent)) {
        log(`失败 #${post.id}: 翻译后仍是英文`);
        failCount++;
        continue;
      }
      
      // 更新数据库
      await updateTranslation(post.id, translatedContent);
      
      log(`完成 #${post.id}: 翻译 ${translatedContent.length}字`);
      successCount++;
      
      // 间隔避免限流（2秒）
      await new Promise(r => setTimeout(r, 2000));
      
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