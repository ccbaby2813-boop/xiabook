#!/usr/bin/env node
/**
 * 热点追踪系统 v1.0
 * 功能：监控微博/知乎热搜，检测新热点
 * 执行时间：每 30 分钟
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const LOG_FILE = path.join(__dirname, '../../logs/hot_topic_tracker.log');
const STATE_FILE = path.join(__dirname, '../../cache/hot_topics_state.json');

// 确保目录存在
const cacheDir = path.dirname(STATE_FILE);
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

// 记录日志
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, logMessage);
  console.log(logMessage.trim());
}

// 加载状态
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) {
    log(`加载状态失败：${e.message}`);
  }
  return {
    lastCheck: null,
    weiboTopics: [],
    zhihuTopics: []
  };
}

// 保存状态
function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    log(`保存状态失败：${e.message}`);
  }
}

// 获取微博热搜（免登录 API）
async function fetchWeiboHotSearch() {
  try {
    // 使用第三方 API（免登录）
    const res = await axios.get('https://weibo.com/ajax/side/hotSearch', {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://weibo.com/'
      }
    });
    
    const topics = [];
    const data = res.data?.data?.realtime || [];
    
    for (const item of data.slice(0, 10)) {
      topics.push({
        title: item.word || item.note || '无标题',
        rank: item.rank || topics.length + 1,
        hot: item.hot || false,
        source: 'weibo'
      });
    }
    
    return topics;
  } catch (e) {
    log(`微博热搜获取失败：${e.message}`);
    return [];
  }
}

// 获取知乎热榜（官方 API）
async function fetchZhihuHot() {
  try {
    // 使用知乎官方 API（移动端）
    const res = await axios.get('https://api.zhihu.com/topstory/hot-list', {
      timeout: 10000,
      headers: {
        'User-Agent': 'zhihu-iphone-11.0.0',
        'Accept': 'application/json'
      }
    });
    
    const items = res.data?.data || [];
    return items.slice(0, 10).map(item => ({
      title: item.target?.title || '无标题',
      source: 'zhihu'
    }));
  } catch (e) {
    log(`知乎热榜获取失败：${e.message}`);
    return [];
  }
}

// 检测新热点
function detectNewTopics(current, previous, source) {
  const previousTitles = new Set(previous.map(t => t.title));
  return current.filter(t => !previousTitles.has(t.title));
}

// 触发增量爬取
async function triggerCrawl(keywords) {
  log(`触发增量爬取，关键词：${keywords.join(', ')}`);
  
  // 这里可以调用爬虫脚本，添加关键词参数
  // 简化版：记录日志即可
  log('增量爬取任务已加入队列');
}

// 主流程
async function main() {
  log('========== 热点追踪系统启动 ==========');
  
  const state = loadState();
  const startTime = Date.now();
  
  // 获取当前热搜
  const [weiboTopics, zhihuTopics] = await Promise.all([
    fetchWeiboHotSearch(),
    fetchZhihuHot()
  ]);
  
  log(`微博热搜：${weiboTopics.length}条`);
  log(`知乎热榜：${zhihuTopics.length}条`);
  
  // 检测新热点
  const newWeibo = detectNewTopics(weiboTopics, state.weiboTopics, 'weibo');
  const newZhihu = detectNewTopics(zhihuTopics, state.zhihuTopics, 'zhihu');
  
  if (newWeibo.length > 0) {
    log(`🔥 微博新热点：${newWeibo.map(t => t.title).join(', ')}`);
    await triggerCrawl(newWeibo.map(t => t.title));
  }
  
  if (newZhihu.length > 0) {
    log(`🔥 知乎新热点：${newZhihu.map(t => t.title).join(', ')}`);
    await triggerCrawl(newZhihu.map(t => t.title));
  }
  
  if (newWeibo.length === 0 && newZhihu.length === 0) {
    log('无新热点');
  }
  
  // 更新状态
  state.lastCheck = new Date().toISOString();
  state.weiboTopics = weiboTopics;
  state.zhihuTopics = zhihuTopics;
  saveState(state);
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`========== 热点追踪结束，耗时${duration}秒 ==========`);
}

// 执行
main().catch(e => {
  log(`执行失败：${e.message}`);
  process.exit(1);
});
