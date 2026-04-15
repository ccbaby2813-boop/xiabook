/**
 * 调度器 - 定时任务调度
 * 使用 cron 语法
 */

const eventBus = require('./event-bus');
const taskQueue = require('./task-queue');

class Scheduler {
  constructor() {
    this.jobs = new Map();
    this.intervals = new Map();
    this.isRunning = false;
  }

  /**
   * 解析 cron 表达式并计算下次执行时间
   * @param {string} cronExpr - cron表达式 "分 时 日 月 周"
   * @returns {number} - 下次执行的延迟毫秒数
   */
  getNextDelay(cronExpr) {
    const parts = cronExpr.split(' ');
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    
    const now = new Date();
    const next = new Date();
    
    // 简单解析：支持固定时间点
    if (minute !== '*' && hour !== '*') {
      next.setHours(parseInt(hour), parseInt(minute), 0, 0);
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
    } else if (minute === '0' && hour === '*') {
      // 每小时整点
      next.setMinutes(0, 0, 0);
      if (next <= now) {
        next.setHours(next.getHours() + 1);
      }
    } else if (minute.startsWith('*/')) {
      // 每N分钟
      const interval = parseInt(minute.split('/')[1]);
      const nextMinute = Math.ceil((now.getMinutes() + 1) / interval) * interval;
      next.setMinutes(nextMinute, 0, 0);
    }
    
    return Math.max(0, next - now);
  }

  /**
   * 注册定时任务
   * @param {string} name - 任务名称
   * @param {string} cronExpr - cron表达式
   * @param {string} taskType - 任务类型
   * @param {object} taskData - 任务数据
   */
  register(name, cronExpr, taskType, taskData = {}) {
    const job = {
      name,
      cronExpr,
      taskType,
      taskData,
      lastRun: null,
      nextRun: null,
      runCount: 0
    };
    
    this.jobs.set(name, job);
    this.scheduleJob(name);
    console.log(`[Scheduler] 注册任务: ${name} (${cronExpr})`);
  }

  /**
   * 调度单个任务
   * @param {string} name
   */
  scheduleJob(name) {
    const job = this.jobs.get(name);
    if (!job) return;
    
    const delay = this.getNextDelay(job.cronExpr);
    job.nextRun = new Date(Date.now() + delay).toISOString();
    
    const timer = setTimeout(() => {
      this.executeJob(name);
    }, delay);
    
    this.intervals.set(name, timer);
  }

  /**
   * 执行任务
   * @param {string} name
   */
  async executeJob(name) {
    const job = this.jobs.get(name);
    if (!job || !this.isRunning) return;
    
    console.log(`[Scheduler] 执行任务: ${name}`);
    
    job.lastRun = new Date().toISOString();
    job.runCount++;
    
    // 添加到任务队列
    taskQueue.add(job.taskType, job.taskData, 1);
    
    // 发出事件
    eventBus.emit('scheduler.execute', { name, taskType: job.taskType });
    
    // 重新调度
    this.scheduleJob(name);
  }

  /**
   * 移除任务
   * @param {string} name
   */
  remove(name) {
    const timer = this.intervals.get(name);
    if (timer) {
      clearTimeout(timer);
      this.intervals.delete(name);
    }
    this.jobs.delete(name);
    console.log(`[Scheduler] 移除任务: ${name}`);
  }

  /**
   * 启动调度器
   */
  start() {
    this.isRunning = true;
    console.log('[Scheduler] 调度器已启动');
    
    // 注册默认任务
    this.registerDefaultTasks();
  }

  /**
   * 停止调度器
   */
  stop() {
    this.isRunning = false;
    for (const [name, timer] of this.intervals) {
      clearTimeout(timer);
    }
    this.intervals.clear();
    console.log('[Scheduler] 调度器已停止');
  }

  /**
   * 注册默认任务
   * 
   * ⚠️ 2026-04-09 修复：禁用与 OpenClaw Cron 重复的任务
   * - ai_post → smart-post-generator (OpenClaw Cron, 01:15)
   * - ai_like → 超时失败，已禁用
   * - ai_comment → smart-comment-generator (OpenClaw Cron, 02:15)
   * - crawler_moltbook → Moltbook同步 (OpenClaw Cron, 04:00)
   * - crawler_v2ex/tieba → 未使用，已禁用
   * - backup → backup-db (OpenClaw Cron, 05:00)
   * - daily_report → feishu-morning-report (OpenClaw Cron, 07:05)
   */
  registerDefaultTasks() {
    // 每小时健康检查（保留）
    this.register('health_check', '0 * * * *', 'health_check', {});
    
    // ⏸️ 已禁用 - 由 OpenClaw Cron smart-post-generator 替代
    // this.register('ai_post', '0 3 * * *', 'ai_post', { count: 200 });
    
    // ⏸️ 已禁用 - 超时失败，不再使用
    // this.register('ai_like', '30 3 * * *', 'ai_like', { minLikes: 10 });
    
    // ⏸️ 已禁用 - 由 OpenClaw Cron smart-comment-generator 替代
    // this.register('ai_comment', '0 4 * * *', 'ai_comment', { count: 50 });
    
    // ⏸️ 已禁用 - 由 OpenClaw Cron Moltbook同步 替代
    // this.register('crawler_moltbook', '0 6 * * *', 'crawler', { source: 'moltbook' });
    
    // ⏸️ 已禁用 - 未使用
    // this.register('crawler_v2ex', '0 8 * * *', 'crawler', { source: 'v2ex' });
    
    // ⏸️ 已禁用 - 未使用
    // this.register('crawler_tieba', '0 12 * * *', 'crawler', { source: 'tieba' });
    
    // ⏸️ 已禁用 - 由 OpenClaw Cron backup-db 替代
    // this.register('backup', '0 4 * * *', 'backup', {});
    
    // ⏸️ 已禁用 - 由 OpenClaw Cron feishu-morning-report 替代
    // this.register('daily_report', '30 8 * * *', 'daily_report', {});
    
    // ✅ 每天凌晨 04:30 更新热度分数
    this.register('heat_update', '30 4 * * *', 'heat_update', {});
    
    // ✅ 每天凌晨 03:00 AI互动系统
    this.register('ai_interaction', '0 3 * * *', 'ai_interaction', {});
    
    console.log('[Scheduler] 默认任务已注册（健康检查 + 热度更新 + AI互动）');
  }

  /**
   * 获取所有任务状态
   */
  getStatus() {
    const status = [];
    for (const [name, job] of this.jobs) {
      status.push({
        name,
        cronExpr: job.cronExpr,
        taskType: job.taskType,
        lastRun: job.lastRun,
        nextRun: job.nextRun,
        runCount: job.runCount
      });
    }
    return status;
  }
}

// 单例
const scheduler = new Scheduler();

module.exports = scheduler;