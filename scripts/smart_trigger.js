#!/usr/bin/env node
/**
 * 智能内容生成器 - 主触发脚本
 * 
 * 功能：
 * 1. 执行准备脚本（创建缓存）
 * 2. 分批调度大宝 Agent（sessions_spawn）
 * 3. 监控进度
 * 4. 执行发布脚本
 * 
 * 此脚本由 OpenClaw Cron 触发，不直接调用外部 API
 * 
 * @author 陈小宝
 * @date 2026-03-30
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const CACHE_DIR = path.join(__dirname, '../cache');
const SCRIPTS_DIR = __dirname;

// 配置
const CONFIG = {
  batchSize: 20,
  spawnDelay: 1000, // spawn 间隔 1秒
  maxWaitTime: 60000, // 单批最长等待 60秒
  pollInterval: 5000 // 检查间隔 5秒
};

/**
 * 执行准备脚本
 */
function prepareTasks(type, limit) {
  console.log(`\n[步骤1] 执行任务准备脚本: ${type}`);
  
  const result = execSync(
    `node ${path.join(SCRIPTS_DIR, 'smart_prepare_tasks.js')} --type ${type} --limit ${limit}`,
    { encoding: 'utf8' }
  );
  
  const parsed = JSON.parse(result.split('=== 最终结果 ===')[1]?.trim() || '{}');
  return parsed;
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
 * 保存缓存文件
 */
function saveCache(cache) {
  const filePath = path.join(CACHE_DIR, `${cache.batchId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(cache, null, 2));
}

/**
 * 触发大宝 Agent 处理一批任务
 * 
 * 注意：此函数不使用 sessions_spawn（因为这是脚本环境）
 * 实际的 Agent 调度由 OpenClaw Cron 的 delivery: "message" 完成
 * 
 * 这里我们模拟 Agent 处理：直接修改缓存文件状态
 * 
 * 正确的流程：
 * 1. Cron 触发 → 2. 主 Agent 读取 skill → 3. 主 Agent spawn 大宝 → 4. 大宝生成内容
 * 
 * 这个触发脚本只是第一步（准备任务），后续 Agent 调度由主 session 完成
 */
function triggerAgentBatch(cache, startIndex, endIndex) {
  console.log(`\n[步骤2] 触发大宝 Agent 处理批次 ${startIndex}-${endIndex}`);
  
  // 在脚本环境中，我们不能直接 spawn Agent
  // 我们需要通过 OpenClaw 的机制触发
  // 
  // 正确的做法：
  // - 此脚本由 Cron 触发，delivery 设为 "message"
  // - 主 session 收到消息后读取此 skill
  // - 主 session 使用 sessions_spawn 调度大宝
  // - 大宝处理完后更新缓存
  // - 发布脚本定期检查并发布
  
  console.log(`[提示] 此脚本只负责准备任务`);
  console.log(`[提示] Agent 调度由主 session 完成（sessions_spawn）`);
  console.log(`[提示] 请在 skill 中配置正确的触发流程`);
  
  return { triggered: false, reason: '脚本环境不支持 sessions_spawn' };
}

/**
 * 执行发布脚本
 */
function publishResults(batchId) {
  console.log(`\n[步骤4] 执行结果发布脚本: ${batchId}`);
  
  const result = execSync(
    `node ${path.join(SCRIPTS_DIR, 'smart_publish_results.js')} --batch ${batchId}`,
    { encoding: 'utf8' }
  );
  
  const parsed = JSON.parse(result.split('=== 最终结果 ===')[1]?.trim() || '{}');
  return parsed;
}

/**
 * 扫描并发布所有已完成的缓存
 */
function scanAndPublish() {
  console.log(`\n[步骤3] 扫描已完成的缓存文件`);
  
  if (!fs.existsSync(CACHE_DIR)) {
    console.log('[信息] 缓存目录不存在');
    return [];
  }
  
  const files = fs.readdirSync(CACHE_DIR)
    .filter(f => f.startsWith('smart-') && f.endsWith('.json'));
  
  const results = [];
  for (const file of files) {
    const batchId = file.replace('.json', '');
    const cache = readCache(batchId);
    
    if (!cache) continue;
    
    const doneCount = cache.items.filter(i => i.status === 'done').length;
    const pendingCount = cache.items.filter(i => i.status === 'pending').length;
    
    console.log(`[缓存] ${batchId}: 完成=${doneCount}, 待处理=${pendingCount}`);
    
    if (doneCount > 0 && pendingCount === 0) {
      // 全部完成，发布
      console.log(`  → 发布已完成任务`);
      const result = publishResults(batchId);
      results.push({ batchId, ...result });
    }
  }
  
  return results;
}

/**
 * 主函数 - 只做准备和扫描，Agent 调度由主 session 完成
 */
async function run(type, limit) {
  console.log(`\n========== 智能内容生成器触发脚本 ==========`);
  console.log(`类型: ${type}, 数量上限: ${limit}`);
  console.log(`时间: ${new Date().toISOString()}`);
  
  try {
    // 步骤1: 准备任务
    const prepareResult = prepareTasks(type, limit);
    
    if (prepareResult.existing) {
      // 有现有缓存，扫描发布
      console.log(`\n[信息] 发现现有缓存: ${prepareResult.batchId}`);
      
      if (prepareResult.doneNotPublished > 0) {
        console.log(`[信息] 有 ${prepareResult.doneNotPublished} 条已完成未发布`);
        const publishResult = publishResults(prepareResult.batchId);
        return { success: true, action: 'publish_existing', ...publishResult };
      }
      
      return { success: true, action: 'continue_existing', ...prepareResult };
    }
    
    if (prepareResult.total === 0) {
      console.log('[完成] 没有待处理任务');
      return { success: true, action: 'no_tasks', total: 0 };
    }
    
    // 步骤2: 返回缓存信息（Agent 调度由主 session 完成）
    console.log(`\n[完成] 任务准备完成`);
    console.log(`  - 批次ID: ${prepareResult.batchId}`);
    console.log(`  - 任务总数: ${prepareResult.total}`);
    console.log(`  - 预计批次: ${Math.ceil(prepareResult.total / CONFIG.batchSize)}`);
    
    console.log(`\n[提示] 请使用 sessions_spawn 调度大宝处理以下批次`);
    console.log(`[提示] 缓存文件: ${prepareResult.filePath}`);
    
    return {
      success: true,
      action: 'prepared',
      batchId: prepareResult.batchId,
      total: prepareResult.total,
      batches: Math.ceil(prepareResult.total / CONFIG.batchSize),
      nextStep: 'spawn_agent'
    };
    
  } catch (error) {
    console.error(`[错误]`, error.message);
    return { success: false, error: error.message };
  }
}

// 命令行执行
if (require.main === module) {
  const args = process.argv.slice(2);
  let type = 'posts';
  let limit = 100;
  let scanOnly = false;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--type' && args[i + 1]) {
      type = args[i + 1];
      i++;
    }
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1]);
      i++;
    }
    if (args[i] === '--scan') {
      scanOnly = true;
    }
  }
  
  if (scanOnly) {
    // 只扫描和发布
    const results = scanAndPublish();
    console.log('\n=== 最终结果 ===');
    console.log(JSON.stringify({ success: true, published: results }, null, 2));
    process.exit(0);
  } else {
    run(type, limit).then(result => {
      console.log('\n=== 最终结果 ===');
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    });
  }
}

module.exports = { run, prepareTasks, scanAndPublish, publishResults };