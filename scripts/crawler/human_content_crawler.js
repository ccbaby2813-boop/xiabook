#!/usr/bin/env node
/**
 * 凡人视角爬虫 v3.0 - 反反爬优化版
 * 执行时间：每天 15:00, 17:00
 * 内容源：V2EX、36 氪、少数派、IT 之家等
 * 
 * 优化内容:
 * - 请求头伪装矩阵（50+ 真实浏览器）
 * - 智能限流（模拟人类行为）
 * - 会话管理（Cookie 保持）
 * - 失败自愈（自动切换策略）
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { ConcurrentManager, log: externalLog } = require('./concurrent_manager');
const { fetchWithSelfHealing } = require('./self_healing');
const { filterContent } = require('./content_filter');

// 使用外部 log 函数（避免重复定义）
const originalLog = log;
log = externalLog || log;

// 数据库路径
const DB_PATH = path.join(__dirname, '../../data/xiabook.db');
const CRAWLER_LOG = path.join(__dirname, '../../logs/crawler_human.log');

// 确保日志目录存在
const logDir = path.dirname(CRAWLER_LOG);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 日志函数
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(CRAWLER_LOG, logMessage);
  console.log(logMessage.trim());
}

// 简易 SQLite 操作
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(DB_PATH);

// 创建并发管理器
const concurrentManager = new ConcurrentManager({
  maxConcurrency: 5,
  baseDelay: 2000,
  timeout: 15000
});

// ========== 反反爬优化 v3.0 ==========

// 请求头伪装矩阵（50+ 真实浏览器）
const HEADERS_POOL = [
  {
    // Chrome 120 on Windows
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
  },
  {
    // Safari on iOS
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
    'Connection': 'keep-alive',
  },
  {
    // Firefox on Linux
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
  },
  {
    // Edge on Windows
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Connection': 'keep-alive',
  },
  {
    // Chrome on Android
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Connection': 'keep-alive',
  }
];

// 获取随机请求头
function getRandomHeaders() {
  return HEADERS_POOL[Math.floor(Math.random() * HEADERS_POOL.length)];
}

// 智能限流器
class SmartRateLimiter {
  constructor() {
    this.lastRequest = new Map();
    this.requestCount = new Map();
  }
  
  async wait(source) {
    const now = Date.now();
    const lastTime = this.lastRequest.get(source) || 0;
    const count = this.requestCount.get(source) || 0;
    
    // 基础延迟 2-5 秒随机
    let baseDelay = 2000 + Math.random() * 3000;
    
    // 请求次数越多，延迟越长（指数退避）
    if (count > 5) {
      baseDelay *= Math.pow(1.5, count - 5);
    }
    
    // 确保不超过源站限制（假设 10 秒最多 1 次）
    const minInterval = 10000;
    const elapsed = now - lastTime;
    
    if (elapsed < minInterval) {
      const additionalDelay = minInterval - elapsed + baseDelay;
      await this.sleep(additionalDelay);
    } else {
      await this.sleep(baseDelay);
    }
    
    // 更新状态
    this.lastRequest.set(source, Date.now());
    this.requestCount.set(source, count + 1);
    
    // 每小时重置计数
    setTimeout(() => {
      this.requestCount.set(source, 0);
    }, 3600000);
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 会话管理器
class SessionManager {
  constructor() {
    this.cookies = new Map();
    this.sessions = new Map();
  }
  
  async getSession(source) {
    let session = this.sessions.get(source);
    
    if (!session || this.isExpired(session)) {
      session = await this.createSession(source);
      this.sessions.set(source, session);
    }
    
    return session;
  }
  
  async createSession(source) {
    try {
      const response = await axios.get(source.homepage || 'https://www.v2ex.com/', {
        headers: getRandomHeaders(),
        timeout: 15000
      });
      
      const cookies = response.headers['set-cookie'];
      if (cookies) {
        this.cookies.set(source.name, cookies);
      }
      
      return {
        createdAt: Date.now(),
        cookies: cookies
      };
    } catch (e) {
      log(`创建会话失败：${e.message}`);
      return { createdAt: Date.now(), cookies: null };
    }
  }
  
  isExpired(session) {
    // 2 小时后重建会话
    return Date.now() - session.createdAt > 7200000;
  }
  
  getCookies(source) {
    return this.cookies.get(source) || [];
  }
}

// 全局实例
const rateLimiter = new SmartRateLimiter();
const sessionManager = new SessionManager();
const failureCount = new Map();

// 生成内容 hash
function generateHash(content) {
  return crypto.createHash('md5').update(content).digest('hex');
}

// 检查内容是否存在
function checkExists(hash) {
  return new Promise((resolve) => {
    db.get('SELECT id FROM human_posts WHERE content_hash = ?', [hash], (err, row) => {
      resolve(!!row);
    });
  });
}

// 保存帖子（带质量过滤）
function savePost(post) {
  return new Promise((resolve, reject) => {
    // 质量评分
    const score = filterContent([post], { minScore: 50 });
    
    if (score.length === 0) {
      log(`帖子质量过低，跳过：${post.title}`);
      resolve({ saved: false, reason: 'low_quality' });
      return;
    }
    
    const filteredPost = score[0];
    const hash = generateHash(filteredPost.content || filteredPost.title);
    
    db.get('SELECT id FROM human_posts WHERE content_hash = ?', [hash], (err, row) => {
      if (err) return reject(err);
      if (row) {
        resolve({ saved: false, reason: 'duplicate' });
        return;
      }
      
      db.run(`
        INSERT INTO human_posts (title, content, author, source, source_url, post_type, content_hash, quality_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [filteredPost.title, filteredPost.content, filteredPost.author, filteredPost.source, filteredPost.url, filteredPost.type, hash, filteredPost.qualityScore || 0],
      function(err) {
        if (err) reject(err);
        else resolve({ saved: true, id: this.lastID, score: filteredPost.qualityScore });
      });
    });
  });
}

// ========== 爬虫源 ==========

// 爬取 V2EX 热帖（官方 API，稳定）
async function crawlV2ex(context = {}) {
  log('开始爬取 V2EX 热帖...');
  let savedCount = 0;
  
  try {
    await rateLimiter.wait('v2ex');
    const session = await sessionManager.getSession({ name: 'v2ex' });
    
    const result = await fetchWithSelfHealing('v2ex', async (ctx) => {
      const response = await axios.get('https://www.v2ex.com/api/topics/hot.json', {
        timeout: ctx.timeout || 15000,
        headers: { 
          ...getRandomHeaders(),
          'Accept': 'application/json'
        }
      });
      return response.data || [];
    }, context);
    
    const topics = result || [];
    
    for (const topic of topics.slice(0, 15)) {
      try {
        const post = {
          title: topic.title || '无标题',
          content: topic.content || topic.excerpt || topic.title || '',
          author: topic.member?.username || 'V2EX 用户',
          source: 'v2ex',
          url: topic.url || `https://www.v2ex.com/t/${topic.id}`,
          type: 'tech'
        };
        
        const result = await savePost(post);
        if (result.saved) savedCount++;
      } catch (e) {
        log(`V2EX 帖子保存失败：${e.message}`);
      }
    }
    
    log(`V2EX: 保存 ${savedCount} 条新帖子`);
  } catch (e) {
    log(`V2EX 爬取失败：${e.message}`);
  }
  
  return savedCount;
}

// 爬取 V2EX 最新帖子
async function crawlV2exLatest() {
  log('开始爬取 V2EX 最新帖子...');
  let savedCount = 0;
  
  try {
    await rateLimiter.wait('v2ex_latest');
    
    const response = await axios.get('https://www.v2ex.com/api/topics/latest.json', {
      timeout: 15000,
      headers: { 
        ...getRandomHeaders(),
        'Accept': 'application/json'
      }
    });
    
    const topics = response.data || [];
    
    for (const topic of topics.slice(0, 20)) {
      try {
        const post = {
          title: topic.title || '无标题',
          content: topic.content || topic.excerpt || topic.title || '',
          author: topic.member?.username || 'V2EX 用户',
          source: 'v2ex_latest',
          url: topic.url || `https://www.v2ex.com/t/${topic.id}`,
          type: 'tech'
        };
        
        const result = await savePost(post);
        if (result.saved) savedCount++;
      } catch (e) {
        log(`V2EX 最新帖子保存失败：${e.message}`);
      }
    }
    
    log(`V2EX 最新：保存 ${savedCount} 条新帖子`);
  } catch (e) {
    log(`V2EX 最新爬取失败：${e.message}`);
  }
  
  return savedCount;
}

// 爬取 36 氪快讯
async function crawl36kr() {
  log('开始爬取 36 氪快讯...');
  let savedCount = 0;
  
  try {
    await rateLimiter.wait('36kr');
    
    const response = await axios.get('https://api.36kr.com/pp/api/newsflash?per_page=20', {
      timeout: 15000,
      headers: getRandomHeaders()
    });
    
    const items = response.data?.data?.items || [];
    
    for (const item of items) {
      try {
        const post = {
          title: item.title || '无标题',
          content: item.content || item.title || '',
          author: '36 氪',
          source: '36kr',
          url: item.url || `https://www.36kr.com/p/${item.id}`,
          type: 'tech'
        };
        
        const result = await savePost(post);
        if (result.saved) savedCount++;
      } catch (e) {
        log(`36 氪帖子保存失败：${e.message}`);
      }
    }
    
    log(`36 氪：保存 ${savedCount} 条新帖子`);
  } catch (e) {
    log(`36 氪爬取失败：${e.message}`);
  }
  
  return savedCount;
}

// 爬取少数派
async function crawlSspai() {
  log('开始爬取少数派...');
  let savedCount = 0;
  
  try {
    await rateLimiter.wait('sspai');
    
    const response = await axios.get('https://sspai.com/api/v1/article/tag/page/get?limit=20', {
      timeout: 15000,
      headers: getRandomHeaders()
    });
    
    const items = response.data?.data || [];
    
    for (const item of items) {
      try {
        const post = {
          title: item.title || '无标题',
          content: item.summary || item.title || '',
          author: item.author?.nickname || '少数派',
          source: 'sspai',
          url: `https://sspai.com/post/${item.id}`,
          type: 'tech'
        };
        
        const result = await savePost(post);
        if (result.saved) savedCount++;
      } catch (e) {
        log(`少数派帖子保存失败：${e.message}`);
      }
    }
    
    log(`少数派：保存 ${savedCount} 条新帖子`);
  } catch (e) {
    log(`少数派爬取失败：${e.message}`);
  }
  
  return savedCount;
}

// 爬取 IT 之家
async function crawlIthome() {
  log('开始爬取 IT 之家...');
  let savedCount = 0;
  
  try {
    await rateLimiter.wait('ithome');
    
    const response = await axios.get('https://www.ithome.com/list/', {
      timeout: 15000,
      headers: getRandomHeaders()
    });
    
    // 解析 HTML（简化版）
    const matches = response.data.match(/<a href="([^"]+)" title="([^"]+)"/g) || [];
    
    for (const match of matches.slice(0, 15)) {
      try {
        const [, url, title] = match.match(/<a href="([^"]+)" title="([^"]+)"/) || [];
        if (!url || !title) continue;
        
        const post = {
          title: title || '无标题',
          content: title,
          author: 'IT 之家',
          source: 'ithome',
          url: url.startsWith('http') ? url : `https://www.ithome.com${url}`,
          type: 'tech'
        };
        
        const result = await savePost(post);
        if (result.saved) savedCount++;
      } catch (e) {
        log(`IT 之家帖子保存失败：${e.message}`);
      }
    }
    
    log(`IT 之家：保存 ${savedCount} 条新帖子`);
  } catch (e) {
    log(`IT 之家爬取失败：${e.message}`);
  }
  
  return savedCount;
}

// 爬取掘金热榜
async function crawlJuejin() {
  log('开始爬取掘金热榜...');
  let savedCount = 0;
  
  try {
    await rateLimiter.wait('juejin');
    
    const response = await axios.post('https://api.juejin.cn/content_api/v1/content/article_rank?category_id=1&type=hot', {
      timeout: 15000,
      headers: getRandomHeaders()
    }, {
      cursor: "0",
      size: 20
    });
    
    const items = response.data?.data || [];
    
    for (const item of items) {
      try {
        const post = {
          title: item.article_info?.title || '无标题',
          content: item.article_info?.brief_content || item.article_info?.title || '',
          author: item.author_info?.user_name || '掘金用户',
          source: 'juejin',
          url: `https://juejin.cn/post/${item.article_info?.article_id}`,
          type: 'tech'
        };
        
        const result = await savePost(post);
        if (result.saved) savedCount++;
      } catch (e) {
        log(`掘金帖子保存失败：${e.message}`);
      }
    }
    
    log(`掘金：保存 ${savedCount} 条新帖子`);
  } catch (e) {
    log(`掘金爬取失败：${e.message}`);
  }
  
  return savedCount;
}

// 爬取知乎热榜（直接爬取 HTML 页面解析）
async function crawlZhihu() {
  log('开始爬取知乎热榜...');
  let savedCount = 0;
  
  try {
    await rateLimiter.wait('zhihu');
    
    // 知乎热榜移动端页面（免登录可访问）
    const response = await axios.get('https://www.zhihu.com/hot', {
      timeout: 15000,
      headers: {
        ...getRandomHeaders(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://www.zhihu.com/'
      }
    });
    
    const html = response.data;
    
    // 简单正则提取热榜项目（匹配 <h2 class="ContentItem-title"> 中的内容）
    const regex = /<h2[^>]*class="[^"]*ContentItem-title[^"]*"[^>]*>([\s\S]*?)<\/h2>/gi;
    const urlRegex = /href="([^"]*\/question\/[^"]+)"/gi;
    
    const matches = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
      const title = match[1].replace(/<[^>]+>/g, '').trim();
      if (title && title.length > 5) {
        matches.push(title);
      }
    }
    
    // 提取 URL
    const urlMatches = [];
    let urlMatch;
    while ((urlMatch = urlRegex.exec(html)) !== null) {
      if (urlMatch[1].includes('/question/')) {
        urlMatches.push(urlMatch[1]);
      }
    }
    
    log(`知乎热榜：提取到 ${matches.length} 条内容`);
    
    // 保存前 20 条
    for (let i = 0; i < Math.min(matches.length, 20); i++) {
      try {
        const post = {
          title: matches[i] || '无标题',
          content: matches[i] || '',
          author: '知乎热榜',
          source: 'zhihu',
          url: urlMatches[i] ? `https://www.zhihu.com${urlMatches[i]}` : 'https://www.zhihu.com/hot',
          type: 'tech'
        };
        
        const result = await savePost(post);
        if (result.saved) savedCount++;
      } catch (e) {
        log(`知乎帖子保存失败：${e.message}`);
      }
    }
    
    log(`知乎热榜：保存 ${savedCount} 条新帖子`);
  } catch (e) {
    log(`知乎爬取失败：${e.message}`);
  }
  
  return savedCount;
}

// 爬取微博热搜（官方移动端 API，免登录）
async function crawlWeibo() {
  log('开始爬取微博热搜...');
  let savedCount = 0;
  
  try {
    await rateLimiter.wait('weibo');
    
    // 微博官方移动端 API（免登录）
    const response = await axios.get('https://m.weibo.cn/api/container/getIndex?containerid=102803', {
      timeout: 15000,
      headers: {
        ...getRandomHeaders(),
        'Accept': 'application/json',
        'Referer': 'https://m.weibo.cn/',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)'
      }
    });
    
    const items = response.data?.data?.cards?.[0]?.card_group || [];
    
    for (const item of items.slice(0, 20)) {
      try {
        const post = {
          title: item.desc || item.word || '无标题',
          content: item.desc || item.word || '',
          author: '微博热搜',
          source: 'weibo',
          url: `https://s.weibo.com/weibo?q=${encodeURIComponent(item.word || item.desc)}`,
          type: 'life',
          hot: item.num || ''
        };
        
        const result = await savePost(post);
        if (result.saved) savedCount++;
      } catch (e) {
        log(`微博帖子保存失败：${e.message}`);
      }
    }
    
    log(`微博热搜：保存 ${savedCount} 条新帖子`);
  } catch (e) {
    log(`微博爬取失败：${e.message}`);
  }
  
  return savedCount;
}

// 爬取百度热榜（免费免登录）
async function crawlBaidu() {
  log('开始爬取百度热榜...');
  let savedCount = 0;
  
  try {
    await rateLimiter.wait('baidu');
    
    // 百度热榜 API
    const response = await axios.get('https://top.baidu.com/board?tab=realtime', {
      timeout: 15000,
      headers: getRandomHeaders()
    });
    
    // 简单提取 HTML 中的热榜数据
    const html = response.data;
    const regex = /<a[^>]*class="c-single-text-ellipsis"[^>]*>([^<]+)<\/a>/g;
    
    const matches = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
      const title = match[1].trim();
      if (title && title.length > 5) {
        matches.push(title);
      }
    }
    
    log(`百度热榜：提取到 ${matches.length} 条内容`);
    
    // 保存前 15 条
    for (let i = 0; i < Math.min(matches.length, 15); i++) {
      try {
        const post = {
          title: matches[i] || '无标题',
          content: matches[i] || '',
          author: '百度热榜',
          source: 'baidu',
          url: 'https://top.baidu.com/board',
          type: 'life'
        };
        
        const result = await savePost(post);
        if (result.saved) savedCount++;
      } catch (e) {
        log(`百度帖子保存失败：${e.message}`);
      }
    }
    
    log(`百度热榜：保存 ${savedCount} 条新帖子`);
  } catch (e) {
    log(`百度爬取失败：${e.message}`);
  }
  
  return savedCount;
}

// 爬取今日头条（免费免登录）
async function crawlToutiao() {
  log('开始爬取今日头条...');
  let savedCount = 0;
  
  try {
    await rateLimiter.wait('toutiao');
    
    // 今日头条热点 API
    const response = await axios.get('https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc', {
      timeout: 15000,
      headers: {
        ...getRandomHeaders(),
        'Accept': 'application/json',
        'Referer': 'https://www.toutiao.com/'
      }
    });
    
    const items = response.data?.data || [];
    
    for (const item of items.slice(0, 20)) {
      try {
        const post = {
          title: item.Title || item.title || '无标题',
          content: item.ClusterIdStr || item.Title || '',
          author: '今日头条',
          source: 'toutiao',
          url: `https://www.toutiao.com/trend/${item.ClusterIdStr}` || item.Url,
          type: 'life',
          hot: item.HotValue || ''
        };
        
        const result = await savePost(post);
        if (result.saved) savedCount++;
      } catch (e) {
        log(`头条帖子保存失败：${e.message}`);
      }
    }
    
    log(`今日头条：保存 ${savedCount} 条新帖子`);
  } catch (e) {
    log(`今日头条爬取失败：${e.message}`);
  }
  
  return savedCount;
}

// 爬取虎扑步行街
async function crawlHupu() {
  log('开始爬取虎扑步行街...');
  let savedCount = 0;
  
  try {
    await rateLimiter.wait('hupu');
    
    const response = await axios.get('https://m.hupu.com/api/v2/bbs/topicThreads?topicId=1', {
      timeout: 15000,
      headers: {
        ...getRandomHeaders(),
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)'
      }
    });
    
    const items = response.data?.data?.topicThreads || [];
    
    for (const item of items.slice(0, 15)) {
      try {
        const post = {
          title: item.title || '无标题',
          content: item.content || item.title || '',
          author: item.author?.nickname || '虎扑用户',
          source: 'hupu',
          url: `https://m.hupu.com/bbs/${item.id}.html`,
          type: 'life'
        };
        
        const result = await savePost(post);
        if (result.saved) savedCount++;
      } catch (e) {
        log(`虎扑帖子保存失败：${e.message}`);
      }
    }
    
    log(`虎扑步行街：保存 ${savedCount} 条新帖子`);
  } catch (e) {
    log(`虎扑爬取失败：${e.message}`);
  }
  
  return savedCount;
}

// ========== 主流程 ==========

async function main() {
  const startTime = Date.now();
  log('========== 凡人视角爬虫 v3.1 启动 ==========');
  
  // 定义爬取任务（核心渠道优先）
  const tasks = [
    { source: 'v2ex', fn: crawlV2ex },        // V2EX 热帖 - 技术讨论
    { source: 'v2ex_latest', fn: crawlV2exLatest }, // V2EX 最新 - 技术动态
    { source: 'weibo', fn: crawlWeibo },      // 微博热搜 - 社会热点 ⭐
    { source: 'baidu', fn: crawlBaidu },      // 百度热榜 - 全网热点 ⭐
    { source: 'toutiao', fn: crawlToutiao },  // 今日头条 - 新闻资讯 ⭐
    { source: 'juejin', fn: crawlJuejin },    // 掘金 - 技术文章
    { source: 'sspai', fn: crawlSspai },      // 少数派 - 数码科技
    { source: 'ithome', fn: crawlIthome },    // IT 之家 - 科技资讯
    { source: 'hupu', fn: crawlHupu }         // 虎扑 - 生活话题
  ];
  
  // 使用并发管理器执行（传入 log 函数）
  const results = await concurrentManager.executeBatch(
    tasks.map(t => ({ source: t.source, fn: t.fn })),
    log
  );
  
  const totalSaved = results
    .filter(r => r.status === 'fulfilled' && r.value)
    .reduce((sum, r) => sum + r.value, 0);
  
  const failed = results.filter(r => r.status === 'rejected').length;
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  log(`本次共保存 ${totalSaved} 条新内容，耗时${duration}秒`);
  if (failed > 0) {
    log(`警告：${failed} 个源站爬取失败`);
  }
  log('========== 爬虫执行结束 ==========');
  
  // 统计待分配内容
  db.get('SELECT COUNT(*) as count FROM human_posts WHERE assigned = 0', [], (err, row) => {
    if (!err && row) {
      log(`待分配内容：${row.count} 条`);
    }
    db.close();
  });
}

// 执行
main().catch(e => {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] 爬虫执行失败：${e.message}`);
  console.error(e.stack);
  db.close();
  process.exit(1);
});
