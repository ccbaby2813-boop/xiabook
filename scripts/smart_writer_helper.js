#!/usr/bin/env node
/**
 * 智能内容生成器 - 大宝辅助脚本
 * 
 * 功能：
 * 1. 读取缓存文件中的待处理任务
 * 2. 更新缓存文件（写入生成的内容）
 * 3. 标记任务状态
 * 
 * 此脚本不调用外部 API，只做缓存读写
 * 内容生成由大宝 Agent 的模型能力完成
 * 
 * @author 陈小宝
 * @date 2026-03-30
 */

const path = require('path');
const fs = require('fs');

const CACHE_DIR = path.join(__dirname, '../cache');

/**
 * 获取待处理的缓存文件
 */
function getPendingCache(taskType) {
  if (!fs.existsSync(CACHE_DIR)) return null;
  
  const files = fs.readdirSync(CACHE_DIR)
    .filter(f => f.startsWith(`smart-${taskType}-`) && f.endsWith('.json'));
  
  for (const file of files) {
    const cache = readCache(file.replace('.json', ''));
    const pendingItems = cache.items.filter(i => i.status === 'pending');
    if (pendingItems.length > 0) {
      return { cache, pendingItems, file };
    }
  }
  
  return null;
}

/**
 * 读取缓存文件
 */
function readCache(batchId) {
  const filePath = path.join(CACHE_DIR, `${batchId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * 获取一批待处理任务
 */
function getBatch(cache, startIndex, batchSize) {
  const endIndex = Math.min(startIndex + batchSize, cache.items.length);
  const batch = cache.items.slice(startIndex, endIndex).filter(i => i.status === 'pending');
  return batch;
}

/**
 * 更新任务状态和内容
 */
function updateTask(batchId, index, updates) {
  const cache = readCache(batchId);
  if (!cache) return { success: false, error: '缓存不存在' };
  
  const item = cache.items[index];
  if (!item) return { success: false, error: '任务不存在' };
  
  // 更新内容
  if (updates.title) item.title = updates.title;
  if (updates.content) item.content = updates.content;
  if (updates.generatedComment) item.generatedComment = updates.generatedComment;
  if (updates.topicHint) item.topicHint = updates.topicHint;
  if (updates.status) item.status = updates.status;
  
  // 更新计数
  if (updates.status === 'done') {
    cache.completed++;
  }
  
  // 保存
  saveCache(cache);
  
  return { success: true, index, status: item.status };
}

/**
 * 批量更新任务
 */
function updateBatch(batchId, updates) {
  const cache = readCache(batchId);
  if (!cache) return { success: false, error: '缓存不存在' };
  
  for (const update of updates) {
    const item = cache.items[update.index];
    if (!item) continue;
    
    if (update.title) item.title = update.title;
    if (update.content) item.content = update.content;
    if (update.generatedComment) item.generatedComment = update.generatedComment;
    if (update.status) item.status = update.status;
    
    if (update.status === 'done') {
      cache.completed++;
    }
  }
  
  saveCache(cache);
  
  return { 
    success: true, 
    updated: updates.length, 
    completed: cache.completed,
    total: cache.total 
  };
}

/**
 * 保存缓存文件
 */
function saveCache(cache) {
  const filePath = path.join(CACHE_DIR, `${cache.batchId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(cache, null, 2));
}

/**
 * 主函数 - 根据命令执行不同操作
 */
async function run(action, options) {
  console.log(`\n[大宝辅助脚本] 操作: ${action}`);
  
  try {
    switch (action) {
      case 'get-pending':
        const pending = getPendingCache(options.type || 'posts');
        if (!pending) {
          return { success: true, pending: false };
        }
        return { 
          success: true, 
          pending: true,
          batchId: pending.cache.batchId,
          total: pending.pendingItems.length,
          items: pending.pendingItems.map(i => ({
            index: i.index,
            username: i.username,
            circleName: i.circleName,
            personality: i.personality,
            postId: i.postId,
            postTitle: i.postTitle
          }))
        };
        
      case 'get-batch':
        const batchCache = readCache(options.batchId);
        if (!batchCache) {
          return { success: false, error: '缓存不存在' };
        }
        const batchItems = getBatch(batchCache, options.startIndex || 0, options.batchSize || 20);
        return { 
          success: true,
          batchId: batchCache.batchId,
          startIndex: options.startIndex || 0,
          items: batchItems
        };
        
      case 'update-task':
        return updateTask(options.batchId, options.index, options.updates);
        
      case 'update-batch':
        return updateBatch(options.batchId, options.updates);
        
      case 'read-cache':
        const cache = readCache(options.batchId);
        if (!cache) {
          return { success: false, error: '缓存不存在' };
        }
        return { success: true, cache };
        
      default:
        return { success: false, error: `未知操作: ${action}` };
    }
    
  } catch (error) {
    console.error(`[错误]`, error.message);
    return { success: false, error: error.message };
  }
}

// 命令行执行
if (require.main === module) {
  const args = process.argv.slice(2);
  const action = args[0];
  const options = {};
  
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].replace('--', '');
      if (args[i + 1] && !args[i + 1].startsWith('--')) {
        options[key] = args[i + 1];
        i++;
      } else {
        options[key] = true;
      }
    }
  }
  
  // 解析 JSON 参数
  if (options.updates) {
    try {
      options.updates = JSON.parse(options.updates);
    } catch (e) {
      // 保持原值
    }
  }
  
  run(action, options).then(result => {
    console.log('\n=== 最终结果 ===');
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = { 
  run, 
  readCache, 
  saveCache, 
  getPendingCache, 
  getBatch, 
  updateTask, 
  updateBatch 
};