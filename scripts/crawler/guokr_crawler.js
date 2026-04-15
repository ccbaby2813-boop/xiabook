#!/usr/bin/env node
/**
 * 果壳网科学文章爬取
 * 功能：爬取果壳网科学类文章
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { filterContent, log } = require('./content_filter');
const { getRandomHeaders } = require('./human_content_crawler');

const DB_PATH = path.join(__dirname, '../../data/xiabook.db');
const CRAWLER_LOG = path.join(__dirname, '../../logs/crawler_guokr.log');

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(DB_PATH);

// 确保日志目录存在
const logDir = path.dirname(CRAWLER_LOG);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 爬取果壳文章
async function fetchGuokrArticles() {
  try {
    const res = await axios.get('https://www.guokr.com/beta/proxy/science/articles', {
      timeout: 15000,
      headers: getRandomHeaders(),
      params: {
        limit: 20,
        offset: 0
      }
    });
    
    return res.data?.result || [];
  } catch (e) {
    log(`果壳文章获取失败：${e.message}`);
    return [];
  }
}

// 保存帖子
function savePost(post) {
  return new Promise((resolve) => {
    const crypto = require('crypto');
    const hash = crypto.createHash('md5').update(post.content || post.title).digest('hex');
    
    db.get('SELECT id FROM human_posts WHERE content_hash = ?', [hash], (err, row) => {
      if (err || row) {
        resolve({ saved: false, reason: row ? 'duplicate' : 'error' });
        return;
      }
      
      db.run(`
        INSERT INTO human_posts (title, content, author, source, source_url, post_type, content_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [post.title, post.content, post.author, post.source, post.url, post.type, hash],
      function(err) {
        if (err) resolve({ saved: false, reason: 'error' });
        else resolve({ saved: true, id: this.lastID });
      });
    });
  });
}

// 主流程
async function main() {
  log('========== 果壳网科学文章爬取启动 ==========');
  const startTime = Date.now();
  
  // 获取文章列表
  const articles = await fetchGuokrArticles();
  log(`获取到 ${articles.length} 篇文章`);
  
  let savedCount = 0;
  
  for (const article of articles.slice(0, 15)) {
    try {
      const post = {
        title: article.title || '无标题',
        content: article.summary || article.title || '',
        author: article.author?.nickname || '果壳网',
        source: 'guokr',
        url: `https://www.guokr.com/article/${article.id}`,
        type: 'tech'
      };
      
      // 质量过滤（果壳内容质量较高，降低阈值）
      const filtered = filterContent([post], { minScore: 45 });
      
      if (filtered.length > 0) {
        const result = await savePost(filtered[0]);
        if (result.saved) savedCount++;
      }
    } catch (e) {
      log(`文章保存失败：${e.message}`);
    }
  }
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`本次共保存 ${savedCount} 条新内容，耗时${duration}秒`);
  log('========== 果壳网科学文章爬取结束 ==========');
  
  db.close();
}

// 执行
main().catch(e => {
  log(`执行失败：${e.message}`);
  db.close();
  process.exit(1);
});

// 导出
module.exports = { fetchGuokrArticles, savePost };
