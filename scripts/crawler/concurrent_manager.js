#!/usr/bin/env node
/**
 * 批量并发控制器 v1.0
 * 功能：智能管理爬虫并发，根据源站响应时间动态调整
 */

class ConcurrentManager {
  constructor(options = {}) {
    this.maxConcurrency = options.maxConcurrency || 5;
    this.baseDelay = options.baseDelay || 1000;
    this.timeout = options.timeout || 15000;
    
    // 源站性能统计
    this.sourceStats = new Map();
    
    // 当前运行任务
    this.runningTasks = new Map();
  }
  
  // 记录源站响应时间
  recordResponseTime(source, duration, success) {
    if (!this.sourceStats.has(source)) {
      this.sourceStats.set(source, {
        times: [],
        successRate: 1,
        avgTime: 0
      });
    }
    
    const stats = this.sourceStats.get(source);
    stats.times.push(duration);
    
    // 保留最近 10 次
    if (stats.times.length > 10) {
      stats.times.shift();
    }
    
    stats.avgTime = stats.times.reduce((a, b) => a + b, 0) / stats.times.length;
    stats.successRate = success ? 
      (stats.successRate * 0.9 + 0.1) : 
      (stats.successRate * 0.9);
  }
  
  // 计算最优并发数
  calculateOptimalConcurrency(sources) {
    const stats = [];
    
    for (const source of sources) {
      const sourceStat = this.sourceStats.get(source);
      if (sourceStat) {
        stats.push({
          source,
          avgTime: sourceStat.avgTime,
          successRate: sourceStat.successRate
        });
      } else {
        stats.push({
          source,
          avgTime: this.baseDelay,
          successRate: 1
        });
      }
    }
    
    // 快速源站多并发，慢速源站少并发
    const fastSources = stats.filter(s => s.avgTime < 2000);
    const mediumSources = stats.filter(s => s.avgTime >= 2000 && s.avgTime < 5000);
    const slowSources = stats.filter(s => s.avgTime >= 5000);
    
    return {
      fast: Math.min(fastSources.length, 3),
      medium: Math.min(mediumSources.length, 2),
      slow: Math.min(slowSources.length, 1),
      total: Math.min(
        fastSources.length + mediumSources.length * 0.5 + slowSources.length * 0.25,
        this.maxConcurrency
      )
    };
  }
  
  // 执行带限流的任务
  async executeWithRateLimit(source, task) {
    const startTime = Date.now();
    
    try {
      const result = await Promise.race([
        task(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), this.timeout)
        )
      ]);
      
      const duration = Date.now() - startTime;
      this.recordResponseTime(source, duration, true);
      
      return result;
    } catch (e) {
      const duration = Date.now() - startTime;
      this.recordResponseTime(source, duration, false);
      throw e;
    }
  }
  
  // 批量执行任务（智能并发）
  async executeBatch(tasks, logger = null) {
    const sources = tasks.map(t => t.source);
    const concurrency = this.calculateOptimalConcurrency(sources);
    
    const logFn = logger || ((msg) => {});
    logFn(`智能并发：快速${concurrency.fast}，中速${concurrency.medium}，慢速${concurrency.slow}`);
    
    // 按源站速度分组
    const fastTasks = tasks.filter(t => {
      const stat = this.sourceStats.get(t.source);
      return !stat || stat.avgTime < 2000;
    });
    
    const mediumTasks = tasks.filter(t => {
      const stat = this.sourceStats.get(t.source);
      return stat && stat.avgTime >= 2000 && stat.avgTime < 5000;
    });
    
    const slowTasks = tasks.filter(t => {
      const stat = this.sourceStats.get(t.source);
      return stat && stat.avgTime >= 5000;
    });
    
    // 分批执行
    const results = [];
    
    // 快速任务并行
    if (fastTasks.length > 0) {
      const fastResults = await Promise.allSettled(
        fastTasks.map(t => this.executeWithRateLimit(t.source, t.fn))
      );
      results.push(...fastResults);
      logFn(`快速源站完成：${fastTasks.length}个`);
    }
    
    // 中速任务分批
    if (mediumTasks.length > 0) {
      for (let i = 0; i < mediumTasks.length; i += 2) {
        const batch = mediumTasks.slice(i, i + 2);
        const batchResults = await Promise.allSettled(
          batch.map(t => this.executeWithRateLimit(t.source, t.fn))
        );
        results.push(...batchResults);
        logFn(`中速源站批次完成：${batch.length}个`);
        await this.sleep(500);
      }
    }
    
    // 慢速任务串行
    if (slowTasks.length > 0) {
      for (const task of slowTasks) {
        const result = await this.executeWithRateLimit(task.source, task.fn);
        results.push(result);
        logFn(`慢速源站完成：${task.source}`);
        await this.sleep(1000);
      }
    }
    
    return results;
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 日志函数
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// 导出
module.exports = { ConcurrentManager, log };
