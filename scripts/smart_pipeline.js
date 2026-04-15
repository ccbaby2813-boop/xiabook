#!/usr/bin/env node
/**
 * 智能内容生成 - 统一流水线处理脚本
 * 
 * 核心原则：
 * 1. 串行处理 - 单子代理避免并发冲突
 * 2. 小批次 - 每批5条，避免上下文爆仓
 * 3. 即时发布 - 生成后立即发布，不积压
 * 4. 自动清理 - 发布完成自动删除缓存
 * 
 * @author 陈小宝
 * @date 2026-04-10
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(PROJECT_ROOT, 'cache');
const SCRIPTS_DIR = __dirname;

const CONFIG = {
  batchSize: 5,           // 每批处理条数
  maxBatches: 10,         // 单次执行最多处理批次
  maxItemsPerRun: 50,     // 单次执行最多处理条数
  timeoutMs: 120000       // 子代理超时时间
};

/**
 * 流水线状态
 */
const PipelineState = {
  batchId: null,
  cacheFile: null,
  taskType: null,
  total: 0,
  processed: 0,
  published: 0,
  errors: 0
};

/**
 * Step 1: 准备任务
 */
function prepareTasks(taskType, limit = CONFIG.maxItemsPerRun) {
  console.log(`\n[Step 1] 准备 ${taskType} 任务...`);
  
  const result = execSync(
    `cd ${PROJECT_ROOT} && node scripts/smart_prepare_tasks.js --type ${taskType} --limit ${limit}`,
    { encoding: 'utf8', timeout: 30000 }
  );
  
  // 解析结果
  const match = result.match(/"batchId":\s*"([^"]+)"/);
  if (!match) {
    // 检查是否有 pending 缓存
    const pendingMatch = result.match(/"existing":\s*true/);
    if (pendingMatch) {
      // 提取 batchId
      const existingMatch = result.match(/"batchId":\s*"([^"]+)"/);
      if (existingMatch) {
        PipelineState.batchId = existingMatch[1];
        PipelineState.cacheFile = path.join(CACHE_DIR, `${PipelineState.batchId}.json`);
        console.log(`[发现积压] ${PipelineState.batchId}`);
        return true;
      }
    }
    console.log('[完成] 没有待处理任务');
    return false;
  }
  
  PipelineState.batchId = match[1];
  PipelineState.cacheFile = path.join(CACHE_DIR, `${PipelineState.batchId}.json`);
  PipelineState.taskType = taskType;
  
  console.log(`[创建] batchId: ${PipelineState.batchId}`);
  return true;
}

/**
 * Step 2: 检查缓存状态
 */
function checkCacheStatus() {
  if (!fs.existsSync(PipelineState.cacheFile)) {
    console.log('[错误] 缓存文件不存在');
    return null;
  }
  
  const cache = JSON.parse(fs.readFileSync(PipelineState.cacheFile, 'utf8'));
  const pending = cache.items.filter(i => i.status === 'pending');
  const done = cache.items.filter(i => i.status === 'done' && !i.publishedId);
  
  console.log(`[状态] pending: ${pending.length}, done: ${done.length}, total: ${cache.total}`);
  
  return { pending, done, cache };
}

/**
 * Step 3: 分批处理（串行）
 * 
 * 关键设计：每批独立缓存文件，避免并发写入冲突
 */
async function processBatches() {
  console.log(`\n[Step 2] 开始处理...`);
  
  const status = checkCacheStatus();
  if (!status) return false;
  
  const { pending, cache } = status;
  if (pending.length === 0) {
    console.log('[完成] 没有 pending 任务');
    return true;
  }
  
  // 计算批次
  const batchesToProcess = Math.min(
    CONFIG.maxBatches,
    Math.ceil(pending.length / CONFIG.batchSize)
  );
  
  console.log(`[计划] 处理 ${batchesToProcess} 批，每批 ${CONFIG.batchSize} 条`);
  
  // 串行处理每批
  for (let batchIndex = 0; batchIndex < batchesToProcess; batchIndex++) {
    const start = batchIndex * CONFIG.batchSize;
    const end = Math.min(start + CONFIG.batchSize - 1, cache.items.length - 1);
    
    console.log(`\n[批次 ${batchIndex + 1}/${batchesToProcess}] index ${start}-${end}`);
    
    // 创建批次缓存文件（关键：避免并发写入）
    const batchCacheFile = path.join(CACHE_DIR, `${PipelineState.batchId}-batch-${batchIndex}.json`);
    const batchItems = cache.items.slice(start, end + 1).map((item, i) => ({
      ...item,
      index: i,
      originalIndex: start + i
    }));
    
    const batchCache = {
      batchId: `${PipelineState.batchId}-batch-${batchIndex}`,
      parentBatchId: PipelineState.batchId,
      taskType: PipelineState.taskType,
      createdAt: new Date().toISOString(),
      total: batchItems.length,
      items: batchItems
    };
    
    fs.writeFileSync(batchCacheFile, JSON.stringify(batchCache, null, 2));
    console.log(`  [创建批次缓存] ${batchCacheFile}`);
    
    // 发布到下一步处理（调用子代理或直接处理）
    // 这里返回批次缓存文件路径，让调用方决定如何处理
    PipelineState.processed += batchItems.length;
  }
  
  return true;
}

/**
 * Step 4: 发布结果
 */
function publishResults() {
  console.log(`\n[Step 3] 发布结果...`);
  
  if (!PipelineState.batchId) {
    console.log('[跳过] 没有 batchId');
    return false;
  }
  
  try {
    const result = execSync(
      `cd ${PROJECT_ROOT} && node scripts/smart_publish_results.js --batch ${PipelineState.batchId}`,
      { encoding: 'utf8', timeout: 60000 }
    );
    
    const match = result.match(/发布: (\d+)/);
    if (match) {
      PipelineState.published = parseInt(match[1]);
      console.log(`[发布] 成功 ${PipelineState.published} 条`);
    }
    
    return true;
  } catch (error) {
    console.log(`[错误] 发布失败: ${error.message}`);
    PipelineState.errors++;
    return false;
  }
}

/**
 * Step 5: 清理缓存
 */
function cleanupCache() {
  console.log(`\n[Step 4] 清理缓存...`);
  
  if (!PipelineState.batchId) return;
  
  // 清理主缓存文件
  const mainCache = path.join(CACHE_DIR, `${PipelineState.batchId}.json`);
  if (fs.existsSync(mainCache)) {
    fs.unlinkSync(mainCache);
    console.log(`  [删除] ${mainCache}`);
  }
  
  // 清理批次缓存文件
  const batchFiles = fs.readdirSync(CACHE_DIR)
    .filter(f => f.startsWith(PipelineState.batchId) && f.endsWith('.json'));
  
  for (const file of batchFiles) {
    const filePath = path.join(CACHE_DIR, file);
    fs.unlinkSync(filePath);
    console.log(`  [删除] ${filePath}`);
  }
  
  console.log(`[清理完成] 删除 ${batchFiles.length + 1} 个缓存文件`);
}

/**
 * 主函数
 */
async function run(taskType = 'posts', limit = CONFIG.maxItemsPerRun) {
  console.log('\n========================================');
  console.log('  智能内容生成 - 统一流水线处理');
  console.log('========================================');
  console.log(`任务类型: ${taskType}`);
  console.log(`最大条数: ${limit}`);
  console.log(`批次大小: ${CONFIG.batchSize}`);
  console.log('========================================\n');
  
  try {
    // Step 1: 准备任务
    if (!prepareTasks(taskType, limit)) {
      return { success: true, message: '没有待处理任务' };
    }
    
    // Step 2: 分批处理
    await processBatches();
    
    // Step 3: 发布结果
    publishResults();
    
    // Step 4: 清理缓存
    cleanupCache();
    
    console.log('\n========================================');
    console.log('  ✅ 流水线执行完成');
    console.log('========================================');
    console.log(`处理: ${PipelineState.processed}`);
    console.log(`发布: ${PipelineState.published}`);
    console.log(`错误: ${PipelineState.errors}`);
    console.log('========================================\n');
    
    return {
      success: true,
      processed: PipelineState.processed,
      published: PipelineState.published,
      errors: PipelineState.errors
    };
    
  } catch (error) {
    console.error(`[错误] ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * 流水线执行器（供 Agent 调用）
 * 
 * 返回批次缓存文件路径，让 Agent 决定如何处理
 */
function getBatchInfo(taskType = 'posts', limit = CONFIG.maxItemsPerRun) {
  // 准备任务
  if (!prepareTasks(taskType, limit)) {
    return null;
  }
  
  // 检查状态
  const status = checkCacheStatus();
  if (!status) return null;
  
  return {
    batchId: PipelineState.batchId,
    cacheFile: PipelineState.cacheFile,
    pending: status.pending.length,
    total: status.cache.total
  };
}

// 命令行执行
if (require.main === module) {
  const args = process.argv.slice(2);
  let taskType = 'posts';
  let limit = CONFIG.maxItemsPerRun;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--type' && args[i + 1]) {
      taskType = args[i + 1];
      i++;
    }
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1]);
      i++;
    }
  }
  
  run(taskType, limit).then(result => {
    console.log('\n=== 最终结果 ===');
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = { run, getBatchInfo, CONFIG };