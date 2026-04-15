#!/usr/bin/env node
/**
 * 知乎热榜内容爬取
 * 功能：爬取知乎热榜问题详情和优质回答
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { filterContent, log } = require('./content_filter');
const { getRandomHeaders } = require('./human_content_crawler');

const DB_PATH = path.join(__dirname, '../../data/xiabook.db');
const CRAWLER_LOG = path.join(__dirname, '../../logs/crawler_zhihu.log');

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(DB_PATH);

// 确保日志目录存在
const logDir = path.dirname(CRAWLER_LOG);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 获取知乎热榜
async function fetchZhihuHotList() {
  try {
    const res = await axios.get('https://api.zhihu.com/topstory/hot-list', {
      timeout: 10000,
      headers: {
        'User-Agent': getRandomHeaders()['User-Agent'],
        'Accept': 'application/json'
      }
    });
    
    return res.data?.data || [];
  } catch (e) {
    log(`知乎热榜获取失败：${e.message}`);
    return [];
  }
}

// 爬取问题详情
async function fetchQuestionDetail(questionId) {
  try {
    const res = await axios.get(`https://www.zhihu.com/question/${questionId}`, {
      timeout: 15000,
      headers: getRandomHeaders()
    });
    
    // 简化解析（实际需要更复杂的 HTML 解析）
    const matches = res.data.match(/<h1[^>]*>(.*?)<\/h1>/);
    const title = matches ? matches[1] : '';
    
    return { title };
  } catch (e) {
    log(`问题详情获取失败：${e.message}`);
    return null;
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
  log('========== 知乎热榜内容爬取启动 ==========');
  const startTime = Date.now();
  
  // 获取热榜
  const hotList = await fetchZhihuHotList();
  log(`获取到 ${hotList.length} 条热榜`);
  
  let savedCount = 0;
  
  // 爬取前 10 条热榜的内容
  for (const item of hotList.slice(0, 10)) {
    try {
      const questionId = item.id;
      const title = item.target?.title || '无标题';
      
      // 简化版：直接用热榜信息生成内容
      const post = {
        title: title,
        content: `知乎热榜话题：${title}\n\n关注人数：${item.target?.follower_count || 0}\n\n回答数量：${item.target?.answer_count || 0}\n\n热度：${item.hot || 0}`,
        author: '知乎用户',
        source: 'zhihu_hot',
        url: `https://www.zhihu.com/question/${questionId}`,
        type: 'life'
      };
      
      // 质量过滤
      const filtered = filterContent([post], { minScore: 50 });
      
      if (filtered.length > 0) {
        const result = await savePost(filtered[0]);
        if (result.saved) savedCount++;
      }
    } catch (e) {
      log(`爬取失败：${e.message}`);
    }
  }
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`本次共保存 ${savedCount} 条新内容，耗时${duration}秒`);
  log('========== 知乎热榜内容爬取结束 ==========');
  
  db.close();
}

// 执行
main().catch(e => {
  log(`执行失败：${e.message}`);
  db.close();
  process.exit(1);
});

// 导出
module.exports = { fetchZhihuHotList, fetchQuestionDetail, savePost };
