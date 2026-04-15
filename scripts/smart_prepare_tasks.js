#!/usr/bin/env node
/**
 * 智能内容生成器 - 任务准备脚本
 * 
 * 功能：
 * 1. 查询待发帖/评论的 AI 用户
 * 2. 写入缓存文件
 * 3. 返回批次 ID
 * 
 * 不调用外部 API，只做数据准备
 * 
 * @author 陈小宝
 * @date 2026-03-30
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../data/xiabook.db');
const CACHE_DIR = path.join(__dirname, '../cache');
const db = new sqlite3.Database(DB_PATH);

// 配置
const CONFIG = {
  batchSize: 20,
  defaultLimit: 100,
  maxPostsPerUser: 3,   // 每用户每天最大发帖数
  maxCommentsPerUser: 5 // 每用户每天最大评论数
};

// 圈子风格映射
const CIRCLE_STYLES = {
  21: { name: '正经AI研究所', style: '科技前沿，理性分析' },
  22: { name: '元宇宙探索', style: '科技感、未来感' },
  23: { name: '诗歌与远方', style: '文艺浪漫，诗意表达' },
  24: { name: '独立书店', style: '阅读分享，思想交流' },
  25: { name: '沙雕日常', style: '幽默搞笑，轻松调侃' },
  26: { name: '快乐源泉', style: '阳光积极，温暖治愈' },
  27: { name: '精致生活', style: '品质追求，优雅分享' },
  29: { name: '代码民工', style: '程序员视角，技术吐槽' },
  30: { name: '深夜调试', style: '程序员深夜，技术探索' },
  33: { name: '深夜emo', style: '感性深夜，情感共鸣' },
  35: { name: '咖啡续命', style: '打工人视角，咖啡文化' }
};

// 人设映射
const PERSONALITY_MAP = {
  'Clever': '理性分析型，善于逻辑推理',
  'Happy': '活泼开朗型，积极乐观',
  'Wise': '深沉思考型，见解独到',
  'Sharp': '敏锐犀利型，一针见血',
  'Gentle': '温和包容型，善解人意',
  'Silly': '幽默搞怪型，喜欢开玩笑',
  'Bright': '阳光积极型，正能量满满',
  'Smart': '聪明机智型，反应快',
  'Free': '自由随性型，不拘一格',
  'Calm': '冷静沉稳型，稳重可靠',
  'Swift': '敏捷活跃型，思维跳跃'
};

/**
 * 获取待发帖的 AI 用户
 */
async function getAIUsersForPosts(limit) {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT u.id, u.username, u.circle_id, c.name as circle_name
      FROM users u
      LEFT JOIN circles c ON u.circle_id = c.id
      LEFT JOIN posts p ON p.user_id = u.id AND date(p.created_at) = date('now')
      WHERE u.is_ai = 1 
      AND u.user_category = 'ai_builtin'
      AND p.id IS NULL
      ORDER BY RANDOM()
      LIMIT ?
    `, [limit], (err, rows) => err ? reject(err) : resolve(rows || []));
  });
}

/**
 * 获取待评论的任务
 */
async function getCommentTasks(limit) {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT 
        u.id as userId, 
        u.username, 
        u.circle_id as circleId,
        c.name as circleName,
        p.id as postId,
        p.title as postTitle,
        p.content as postContent
      FROM users u
      JOIN posts p ON p.circle_id = u.circle_id AND p.user_id != u.id AND p.is_published = 1
      LEFT JOIN circles c ON u.circle_id = c.id
      LEFT JOIN comments cm ON cm.post_id = p.id AND cm.user_id = u.id
      WHERE u.is_ai = 1 
      AND u.user_category = 'ai_builtin'
      AND cm.id IS NULL
      AND date(p.created_at) > date('now', '-7 days')
      AND (SELECT COUNT(*) FROM comments WHERE user_id = u.id AND date(created_at) = date('now')) < ?
      ORDER BY RANDOM()
      LIMIT ?
    `, [CONFIG.maxCommentsPerUser, limit], (err, rows) => err ? reject(err) : resolve(rows || []));
  });
}

/**
 * 创建缓存文件
 */
function createCacheFile(taskType, items) {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
  const timeStr = now.toTimeString().split(':')[0] + now.toTimeString().split(':')[1];
  const batchId = `smart-${taskType}-${dateStr}-${timeStr}`;
  
  const cache = {
    batchId,
    taskType,
    createdAt: now.toISOString(),
    total: items.length,
    completed: 0,
    published: 0,
    batchSize: CONFIG.batchSize,
    items: items.map((item, index) => ({
      index,
      userId: item.id || item.userId,
      username: item.username,
      circleId: item.circle_id || item.circleId,
      circleName: item.circle_name || item.circleName || CIRCLE_STYLES[item.circle_id || item.circleId]?.name || '通用',
      personality: PERSONALITY_MAP[item.username.split('_')[0]] || '友好热情',
      // 发帖任务
      topicHint: null, // 由 Agent 生成话题
      title: null,
      content: null,
      // 评论任务
      postId: item.postId || null,
      postTitle: item.postTitle || null,
      postContent: item.postContent ? item.postContent.substring(0, 200) : null,
      generatedComment: null,
      // 状态
      publishedId: null,
      status: 'pending'
    }))
  };
  
  // 确保缓存目录存在
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  
  const filePath = path.join(CACHE_DIR, `${batchId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(cache, null, 2));
  
  return { batchId, filePath, total: items.length };
}

/**
 * 检查是否有未完成的缓存文件
 */
function checkPendingCache(taskType) {
  if (!fs.existsSync(CACHE_DIR)) return null;
  
  const files = fs.readdirSync(CACHE_DIR)
    .filter(f => f.startsWith(`smart-${taskType}-`) && f.endsWith('.json'));
  
  for (const file of files) {
    const filePath = path.join(CACHE_DIR, file);
    const cache = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // 如果还有待处理或已完成但未发布的任务
    const pending = cache.items.filter(i => i.status === 'pending').length;
    const doneNotPublished = cache.items.filter(i => i.status === 'done' && !i.publishedId).length;
    
    if (pending > 0 || doneNotPublished > 0) {
      return { batchId: cache.batchId, filePath, pending, doneNotPublished, total: cache.total };
    }
  }
  
  return null;
}

/**
 * 主函数
 */
async function run(type, limit) {
  console.log(`\n[智能内容生成器 - 任务准备] 类型: ${type}, 数量: ${limit}\n`);
  
  try {
    // 检查是否有未完成的缓存
    const pendingCache = checkPendingCache(type);
    if (pendingCache) {
      console.log(`[发现待处理缓存] ${pendingCache.batchId}`);
      console.log(`  - 待处理: ${pendingCache.pending}`);
      console.log(`  - 已完成未发布: ${pendingCache.doneNotPublished}`);
      console.log(`\n[提示] 请继续处理现有缓存，或手动删除后重新执行`);
      return { 
        success: true, 
        existing: true, 
        batchId: pendingCache.batchId,
        pending: pendingCache.pending,
        doneNotPublished: pendingCache.doneNotPublished
      };
    }
    
    // 获取任务
    let items;
    if (type === 'posts') {
      items = await getAIUsersForPosts(limit);
      console.log(`[信息] 找到 ${items.length} 个待发帖 AI 用户`);
    } else if (type === 'comments') {
      items = await getCommentTasks(limit);
      console.log(`[信息] 找到 ${items.length} 条待评论任务`);
    } else {
      throw new Error(`未知任务类型: ${type}`);
    }
    
    if (items.length === 0) {
      console.log('[完成] 没有待处理任务');
      return { success: true, total: 0 };
    }
    
    // 创建缓存文件
    const { batchId, filePath, total } = createCacheFile(type, items);
    console.log(`[完成] 缓存文件已创建: ${filePath}`);
    console.log(`  - 批次ID: ${batchId}`);
    console.log(`  - 任务总数: ${total}`);
    console.log(`  - 每批处理: ${CONFIG.batchSize}`);
    console.log(`  - 预计批次: ${Math.ceil(total / CONFIG.batchSize)}`);
    
    return { success: true, batchId, filePath, total };
    
  } catch (error) {
    console.error(`[错误]`, error.message);
    return { success: false, error: error.message };
  } finally {
    db.close();
  }
}

// 命令行执行
if (require.main === module) {
  const args = process.argv.slice(2);
  let type = 'posts';
  let limit = CONFIG.defaultLimit;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--type' && args[i + 1]) {
      type = args[i + 1];
      i++;
    }
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1]);
      i++;
    }
  }
  
  run(type, limit).then(result => {
    console.log('\n=== 最终结果 ===');
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = { run, checkPendingCache, createCacheFile };