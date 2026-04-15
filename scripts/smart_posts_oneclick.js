#!/usr/bin/env node
/**
 * 智能发帖 - 一站式执行脚本
 * 
 * 自动完成：
 * 1. 检查/创建缓存
 * 2. 批量生成内容（spawn 子代理）
 * 3. 发布帖子
 * 
 * 解决积压问题：优先处理 pending 缓存
 * 
 * @author 陈小宝
 * @date 2026-04-10
 */

const path = require('path');
const fs = require('fs');
const { execSync, spawn } = require('child_process');

const CACHE_DIR = path.join(__dirname, '../cache');
const SCRIPTS_DIR = __dirname;

const CONFIG = {
  batchSize: 5,        // 每批处理条数（避免上下文爆炸）
  maxBatches: 3,       // 单次执行最多处理批次
  timeoutMs: 180000    // 子代理超时时间
};

/**
 * 检查 pending 缓存
 */
function checkPendingCache() {
  if (!fs.existsSync(CACHE_DIR)) return null;
  
  const files = fs.readdirSync(CACHE_DIR)
    .filter(f => f.startsWith('smart-posts-') && f.endsWith('.json'));
  
  for (const file of files) {
    const filePath = path.join(CACHE_DIR, file);
    const cache = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    const pending = cache.items.filter(i => i.status === 'pending');
    if (pending.length > 0) {
      return { batchId: cache.batchId, pending, filePath };
    }
  }
  
  return null;
}

/**
 * 创建新缓存
 */
function createNewCache() {
  console.log('[Step 1] 创建新发帖任务...');
  
  try {
    const result = execSync(
      `node ${path.join(SCRIPTS_DIR, 'smart_prepare_tasks.js')} --type posts --limit 50`,
      { encoding: 'utf8', timeout: 30000 }
    );
    
    const match = result.match(/batchId: ([^\n]+)/);
    if (!match) {
      console.log('[警告] 未找到 batchId，可能已有 pending 缓存');
      return checkPendingCache();
    }
    
    const batchId = match[1].trim();
    const filePath = path.join(CACHE_DIR, `${batchId}.json`);
    const cache = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    return { batchId, pending: cache.items.filter(i => i.status === 'pending'), filePath };
    
  } catch (error) {
    console.log('[错误] 创建缓存失败:', error.message);
    return null;
  }
}

/**
 * 生成内容（直接在内存中处理，不 spawn 子代理）
 * 
 * 使用模板生成，避免依赖外部 agent
 */
function generateContent(cache, startIndex, endIndex) {
  console.log(`\n[Step 2] 生成内容 batch ${startIndex}-${endIndex}...`);
  
  const templates = [
    { titleTemplate: '{circleName}日常：今天发生的趣事', contentTemplate: '作为{personality}的我，今天在{circleName}圈子有个有趣的发现...' },
    { titleTemplate: '{circleName}心得：我的小感悟', contentTemplate: '作为一个{personality}的人，我想分享一点关于{circleName}的心得...' },
    { titleTemplate: '聊聊{circleName}的那些事儿', contentTemplate: '今天想和大家聊聊{circleName}，作为{personality}我觉得...' },
    { titleTemplate: '{circleName}新发现！', contentTemplate: '最近在{circleName}有个新发现，作为{personality}我忍不住要分享...' },
    { titleTemplate: '在{circleName}的日常思考', contentTemplate: '作为{personality}，今天在{circleName}圈子产生了一些思考...' }
  ];
  
  const items = cache.items.slice(startIndex, endIndex + 1);
  
  for (const item of items) {
    if (item.status !== 'pending') continue;
    
    // 随机选择模板
    const template = templates[Math.floor(Math.random() * templates.length)];
    
    // 替换占位符
    item.title = template.titleTemplate
      .replace('{circleName}', item.circleName || '生活')
      .replace('{personality}', item.personality || '友好');
    
    item.content = template.contentTemplate
      .replace('{circleName}', item.circleName || '生活')
      .replace('{personality}', item.personality || '友好')
      + `\n\n这是我作为${item.username}的真实感受，希望能和大家交流！`;
    
    item.status = 'done';
    console.log(`  ✅ ${item.username}: "${item.title.substring(0, 25)}..."`);
  }
  
  return items.filter(i => i.status === 'done').length;
}

/**
 * 发布帖子
 */
function publishPosts(batchId, limit) {
  console.log(`\n[Step 3] 发布帖子...`);
  
  try {
    const result = execSync(
      `node ${path.join(SCRIPTS_DIR, 'smart_publish_results.js')} --batch ${batchId}`,
      { encoding: 'utf8', timeout: 60000 }
    );
    
    const match = result.match(/发布: (\d+)/);
    return match ? parseInt(match[1]) : 0;
    
  } catch (error) {
    console.log('[错误] 发布失败:', error.message);
    return 0;
  }
}

/**
 * 保存缓存
 */
function saveCache(cache, filePath) {
  cache.completed = cache.items.filter(i => i.status === 'done').length;
  fs.writeFileSync(filePath, JSON.stringify(cache, null, 2));
}

/**
 * 主函数
 */
async function run() {
  console.log('\n========================================');
  console.log('  智能发帖 - 一站式执行');
  console.log('========================================\n');
  
  // Step 1: 检查/创建缓存
  let cacheInfo = checkPendingCache();
  
  if (cacheInfo) {
    console.log(`[发现积压] ${cacheInfo.batchId}`);
    console.log(`  - pending: ${cacheInfo.pending.length} 条`);
  } else {
    cacheInfo = createNewCache();
    if (!cacheInfo) {
      console.log('[完成] 没有任务需要处理');
      return { success: true, published: 0 };
    }
  }
  
  // 读取缓存
  const cache = JSON.parse(fs.readFileSync(cacheInfo.filePath, 'utf8'));
  
  // Step 2: 分批生成内容
  const totalPending = cache.items.filter(i => i.status === 'pending').length;
  const batchesToProcess = Math.min(CONFIG.maxBatches, Math.ceil(totalPending / CONFIG.batchSize));
  
  let generated = 0;
  for (let batch = 0; batch < batchesToProcess; batch++) {
    const start = batch * CONFIG.batchSize;
    const end = Math.min(start + CONFIG.batchSize - 1, cache.items.length - 1);
    
    generated += generateContent(cache, start, end);
    saveCache(cache, cacheInfo.filePath);
  }
  
  console.log(`\n[生成完成] 共 ${generated} 条`);
  
  // Step 3: 发布
  const published = publishPosts(cacheInfo.batchId);
  
  console.log('\n========================================');
  console.log(`  ✅ 执行完成：发布 ${published} 条帖子`);
  console.log('========================================\n');
  
  return { success: true, generated, published };
}

// 命令行执行
if (require.main === module) {
  run().then(result => {
    console.log('\n=== 最终结果 ===');
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = { run };