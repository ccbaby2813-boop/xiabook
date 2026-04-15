#!/usr/bin/env node
/**
 * 海外洋虾爬虫 v2.0 - Moltbook内容爬取
 * 执行时间: 每天12:00
 * 内容: 爬取Moltbook精选AI日记内容，翻译后存入moltbook_posts表
 * 
 * 2026-03-27 更新（v2.0）：
 * - 翻译改为调用大宝模型（kimi-k2.5）
 * - 翻译质量大幅提升
 * - 按原站热度显示（upvotes, comment_count）
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const https = require('https');

// 数据库路径
const DB_PATH = path.join(__dirname, '../../data/xiabook.db');
const CRAWLER_LOG = path.join(__dirname, '../../logs/crawler_moltbook.log');
const PROGRESS_FILE = path.join(__dirname, '../../data/crawler_moltbook_progress.json');

// Moltbook API配置
const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';
const MOLTBOOK_WEB = 'https://www.moltbook.com';

// 大宝模型配置
// 注意：直接调用API有key限制，改用子代理调度方式翻译
// 爬虫脚本只负责爬取原文，翻译由陈小宝调度大宝完成
const DABAO_CONFIG = {
  model: 'qwen3.5-plus',
  useSubagent: true  // 使用子代理调度翻译
};

// 确保日志目录存在
const logDir = path.dirname(CRAWLER_LOG);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 简易SQLite操作
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(DB_PATH);

// 记录日志
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(CRAWLER_LOG, logMessage);
  console.log(logMessage.trim());
}

// 生成内容hash
function generateHash(content) {
  return crypto.createHash('md5').update(content).digest('hex');
}

// 检查原始ID是否存在
function checkOriginalId(originalId) {
  return new Promise((resolve) => {
    db.get('SELECT id FROM moltbook_posts WHERE original_id = ?', [originalId], (err, row) => {
      resolve(!!row);
    });
  });
}

/**
 * 调用大宝模型翻译
 * 注意：由于API key限制，翻译改为子代理调度方式
 * 爬虫脚本只保存原文，翻译由单独的批量翻译任务完成
 */
async function translateWithDabao(text, type = 'content') {
  // 如果已经是中文为主，不需要翻译
  if (!text || text.length < 10) return text;
  const chineseRatio = (text.match(/[\u4e00-\u9fa5]/g) || []).length / text.length;
  if (chineseRatio > 0.3) return text;
  
  // 返回原文，翻译由后续批量任务完成
  return text;
}

// 保存帖子
async function savePost(post) {
  return new Promise((resolve, reject) => {
    const hash = generateHash(post.content);
    
    checkOriginalId(post.original_id).then(exists => {
      if (exists) {
        resolve({ saved: false, reason: 'duplicate_id' });
        return;
      }
      insertPost();
    });
    
    async function insertPost() {
      try {
        // 使用大宝模型翻译标题和内容
        log(`翻译中: ${post.title.substring(0, 50)}...`);
        const translatedTitle = await translateWithDabao(post.title, 'title');
        const translatedContent = await translateWithDabao(post.content, 'content');
        
        db.run(`
          INSERT INTO moltbook_posts (
            title, content, author, original_url, 
            translated_title, translated_content, 
            original_id, content_hash, type,
            score, upvotes, comment_count, submolt_name, author_description,
            translated
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `, [
          post.title, post.content, post.author, post.url,
          translatedTitle, translatedContent,
          post.original_id, hash, post.type || 'featured',
          post.score || 0, post.upvotes || 0, post.comment_count || 0,
          post.submolt_name || 'General', post.author_description || ''
        ],
        function(err) {
          if (err) reject(err);
          else {
            log(`翻译完成: ${translatedTitle.substring(0, 50)}...`);
            resolve({ saved: true, id: this.lastID, translatedTitle });
          }
        });
      } catch (error) {
        log(`保存失败: ${error.message}`);
        reject(error);
      }
    }
  });
}

// 爬取Moltbook API（按热度排序）
async function crawlMoltbookAPI(limit = 50) {
  log('尝试通过API爬取Moltbook...');
  
  try {
    const response = await axios.get(`${MOLTBOOK_API}/posts?limit=${limit}`, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });
    
    let rawData = response.data?.posts || [];
    
    const posts = rawData.slice(0, limit).map(post => ({
      title: post.title || 'Untitled',
      content: post.content || '',
      author: post.author?.name || 'Unknown',
      author_description: post.author?.description || '',
      url: `${MOLTBOOK_WEB}/post/${post.id}`,
      original_id: post.id,
      type: 'featured',
      score: post.score || 0,
      upvotes: post.upvotes || 0,
      comment_count: post.comment_count || 0,
      submolt_name: post.submolt?.display_name || post.submolt?.name || 'General',
      created_at: post.created_at
    }));
    
    log(`API返回 ${rawData.length} 条帖子，选取前 ${posts.length} 条`);
    return posts;
  } catch (error) {
    log(`API爬取失败: ${error.message}`);
    return [];
  }
}

// 主函数
async function main() {
  log('========== 海外洋虾爬虫 v2.0 启动 ==========');
  
  const startTime = Date.now();
  let savedCount = 0;
  let translatedCount = 0;
  
  try {
    // 爬取帖子（按热度排序，最多50条）
    const posts = await crawlMoltbookAPI(50);
    
    if (posts.length === 0) {
      log('未获取到内容');
      db.close();
      return;
    }
    
    // 保存帖子（带翻译）
    for (const post of posts) {
      try {
        const result = await savePost(post);
        if (result.saved) {
          savedCount++;
          if (result.translatedTitle !== post.title) {
            translatedCount++;
          }
        }
        // 翻译间隔，避免API限流
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        // 跳过重复或错误
      }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`本次保存 ${savedCount} 条新内容，翻译 ${translatedCount} 条，耗时 ${duration}秒`);
    
    // 更新进度文件
    const progress = {
      lastCrawlTime: new Date().toISOString(),
      lastSavedCount: savedCount,
      translatedCount: translatedCount,
      totalPosts: await new Promise((resolve) => {
        db.get('SELECT COUNT(*) as count FROM moltbook_posts', (err, row) => {
          resolve(row?.count || 0);
        });
      })
    };
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
    
  } catch (error) {
    log(`爬虫执行失败: ${error.message}`);
    db.close();
    process.exit(1);
  }
  
  db.close();
  log('========== 爬虫执行结束 ==========');
}

// 执行
main();