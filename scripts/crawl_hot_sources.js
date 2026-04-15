#!/usr/bin/env node
/**
 * 热门素材爬取脚本 v2.0
 * 
 * 使用 Agent Browser 真实爬取
 * 
 * @author 陈小宝
 * @date 2026-04-10
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(PROJECT_ROOT, 'cache');

// 可用渠道（测试通过）
const CHANNELS = [
  { 
    name: 'V2EX', 
    type: 'v2ex',
    url: 'https://www.v2ex.com/',
    limit: 20,
    circle: '代码民工',
    selector: '.cell.item',
    titleSelector: '.topic-link'
  },
  { 
    name: '豆瓣小组', 
    type: 'douban',
    url: 'https://www.douban.com/group/explore',
    limit: 20,
    circle: '诗歌与远方',
    selector: 'a[href*="/group/topic"]'
  },
  { 
    name: '虎扑步行街', 
    type: 'hupu',
    url: 'https://bbs.hupu.com/bxj',
    limit: 20,
    circle: '吃瓜一线',
    selector: '.bbs-sl-web-post-layout',
    titleSelector: '.post-title a'
  }
];

/**
 * 使用 Agent Browser 爬取
 */
function crawlWithAgentBrowser(channel) {
  console.log(`\n[爬取] ${channel.name}...`);
  
  try {
    // 实际调用 Agent Browser
    const result = execSync(
      `agent-browser open "${channel.url}" 2>/dev/null`,
      { encoding: 'utf8', timeout: 30000 }
    );
    
    // 获取页面内容
    const posts = [];
    
    // V2EX 特殊处理
    if (channel.type === 'v2ex') {
      const extractCode = `
        const posts = [];
        document.querySelectorAll('.cell.item').forEach((item, i) => {
          if (i >= ${channel.limit}) return;
          const titleEl = item.querySelector('.topic-link');
          const authorEl = item.querySelector('.topic_info strong a');
          if (titleEl) {
            posts.push({
              title: titleEl.textContent.trim(),
              author: authorEl ? authorEl.textContent.trim() : '',
              url: titleEl.href
            });
          }
        });
        JSON.stringify(posts);
      `;
      
      const postsJson = execSync(
        `agent-browser eval '${extractCode}' 2>/dev/null`,
        { encoding: 'utf8', timeout: 10000 }
      );
      
      const parsed = JSON.parse(postsJson.match(/\[.*\]/s)?.[0] || '[]');
      posts.push(...parsed.map(p => ({
        source: channel.name,
        sourceType: channel.type,
        sourceUrl: channel.url,
        circle: channel.circle,
        title: null,
        content: null,
        originalTitle: p.title,
        originalContent: p.title, // 简化，实际需要进入帖子获取
        author: p.author,
        sourcePostUrl: p.url,
        crawledAt: new Date().toISOString()
      })));
    }
    
    // 豆瓣特殊处理
    if (channel.type === 'douban') {
      const extractCode = `
        const posts = [];
        document.querySelectorAll('a[href*="/group/topic"]').forEach((link, i) => {
          if (i >= ${channel.limit}) return;
          const title = link.textContent.trim();
          if (title && title.length > 5) {
            posts.push({ title, url: link.href });
          }
        });
        JSON.stringify(posts);
      `;
      
      const postsJson = execSync(
        `agent-browser eval '${extractCode}' 2>/dev/null`,
        { encoding: 'utf8', timeout: 10000 }
      );
      
      const parsed = JSON.parse(postsJson.match(/\[.*\]/s)?.[0] || '[]');
      posts.push(...parsed.map(p => ({
        source: channel.name,
        sourceType: channel.type,
        sourceUrl: channel.url,
        circle: channel.circle,
        title: null,
        content: null,
        originalTitle: p.title,
        originalContent: p.title,
        author: '豆瓣用户',
        sourcePostUrl: p.url,
        crawledAt: new Date().toISOString()
      })));
    }
    
    // 虎扑特殊处理
    if (channel.type === 'hupu') {
      const extractCode = `
        const posts = [];
        document.querySelectorAll('.bbs-sl-web-post-layout').forEach((item, i) => {
          if (i >= ${channel.limit}) return;
          const titleEl = item.querySelector('.post-title a');
          const authorEl = item.querySelector('.post-auth a');
          if (titleEl) {
            posts.push({
              title: titleEl.textContent.trim(),
              author: authorEl ? authorEl.textContent.trim() : '',
              url: titleEl.href
            });
          }
        });
        JSON.stringify(posts);
      `;
      
      const postsJson = execSync(
        `agent-browser eval '${extractCode}' 2>/dev/null`,
        { encoding: 'utf8', timeout: 10000 }
      );
      
      const parsed = JSON.parse(postsJson.match(/\[.*\]/s)?.[0] || '[]');
      posts.push(...parsed.map(p => ({
        source: channel.name,
        sourceType: channel.type,
        sourceUrl: channel.url,
        circle: channel.circle,
        title: null,
        content: null,
        originalTitle: p.title,
        originalContent: p.title,
        author: p.author,
        sourcePostUrl: p.url,
        crawledAt: new Date().toISOString()
      })));
    }
    
    console.log(`  ✅ 获取 ${posts.length} 条`);
    return posts;
    
  } catch (error) {
    console.log(`  ❌ 爬取失败: ${error.message}`);
    return [];
  }
}

/**
 * 筛选优质内容
 */
function filterQualityPosts(posts) {
  console.log(`\n[筛选] 从 ${posts.length} 条中筛选...`);
  
  // 按互动量排序
  const sorted = posts.sort((a, b) => {
    const scoreA = (a.likeCount || 0) + (a.commentCount || 0) * 2;
    const scoreB = (b.likeCount || 0) + (b.commentCount || 0) * 2;
    return scoreB - scoreA;
  });
  
  // 取前50条
  const selected = sorted.slice(0, 50);
  
  console.log(`  ✅ 筛选出 ${selected.length} 条优质内容`);
  return selected;
}

/**
 * 分配 AI 用户
 */
function assignAIUsers(posts) {
  console.log(`\n[分配] 分配 AI 用户...`);
  
  // 加载 AI 用户库（简化版）
  const aiUsers = require('./ai_users_pool.json') || [];
  
  for (const post of posts) {
    // 根据圈子匹配 AI 用户
    const circleUsers = aiUsers.filter(u => u.circle === post.circle);
    if (circleUsers.length > 0) {
      const randomUser = circleUsers[Math.floor(Math.random() * circleUsers.length)];
      post.assignedUserId = randomUser.id;
      post.assignedUsername = randomUser.username;
      post.assignedCircleId = randomUser.circleId;
    }
  }
  
  console.log(`  ✅ 分配完成`);
  return posts;
}

/**
 * 创建缓存文件
 */
function createCacheFile(posts) {
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
  const timeStr = date.toTimeString().split(':').slice(0, 2).join('');
  const batchId = `hot-source-${dateStr}-${timeStr}`;
  
  const cache = {
    batchId,
    taskType: 'posts',
    source: 'crawl',
    createdAt: date.toISOString(),
    total: posts.length,
    completed: 0,
    published: 0,
    batchSize: 5,
    items: posts.map((post, index) => ({
      index,
      ...post,
      status: 'pending',
      title: null,  // 待改写
      content: null,  // 待改写
      originalTitle: post.title,
      originalContent: post.content
    }))
  };
  
  const filePath = path.join(CACHE_DIR, `${batchId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(cache, null, 2));
  
  console.log(`\n[缓存] ${filePath}`);
  return { batchId, filePath, total: posts.length };
}

/**
 * 主函数
 */
async function run() {
  console.log('\n========================================');
  console.log('  热门素材爬取');
  console.log('========================================\n');
  
  try {
    // 确保缓存目录存在
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    
    // 爬取各渠道
    const allPosts = [];
    for (const channel of CHANNELS) {
      const posts = crawlWithAgentBrowser(channel);
      allPosts.push(...posts);
    }
    
    console.log(`\n[总计] 爬取 ${allPosts.length} 条`);
    
    if (allPosts.length === 0) {
      console.log('[完成] 没有爬取到内容');
      return { success: false, error: '没有爬取到内容' };
    }
    
    // 筛选优质
    const selected = filterQualityPosts(allPosts);
    
    // 分配 AI 用户
    const assigned = assignAIUsers(selected);
    
    // 创建缓存
    const { batchId, filePath, total } = createCacheFile(assigned);
    
    console.log('\n========================================');
    console.log(`  ✅ 爬取完成`);
    console.log('========================================');
    console.log(`批次ID: ${batchId}`);
    console.log(`总数: ${total}`);
    console.log(`缓存: ${filePath}`);
    console.log('========================================\n');
    
    return { success: true, batchId, filePath, total };
    
  } catch (error) {
    console.error(`[错误] ${error.message}`);
    return { success: false, error: error.message };
  }
}

// 命令行执行
if (require.main === module) {
  run().then(result => {
    console.log('\n=== 最终结果 ===');
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = { run, CHANNELS };