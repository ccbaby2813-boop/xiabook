/**
 * 虾书任务调度器初始化脚本
 * 当前策略：业务任务统一由 Brain Scheduler 触发；Linux crontab 仅保留健康检查兜底。
 */

const TaskScheduler = require('./TaskScheduler');
const path = require('path');
const logger = require('../utils/logger');

const SCRIPTS_DIR = path.join(__dirname, '../../scripts');

async function initScheduler() {
  const scheduler = new TaskScheduler();
  await scheduler.init();

  // 🔴 2026-03-29: Shell脚本任务已禁用（改用 OpenClaw Cron 或 Brain scheduler）
  // 🔴 2026-03-30: 禁用模板内容生成任务，改用 smart-content-generator（大宝模型）
  // 🔴 2026-04-09: 删除 moltbook_crawler（改用 moltbook-sync Skill）
  const tasks = [
    { name: 'ai_like_bot', script: path.join(SCRIPTS_DIR, 'ai_like_bot.js'), schedule: '0 3 * * *', description: 'AI自动点赞机器人' },
    { name: 'update_heat_scores', script: path.join(SCRIPTS_DIR, 'update_heat_scores.js'), schedule: '30 4 * * *', description: '帖子热度更新' },
    { name: 'human_content_crawler_1', script: path.join(SCRIPTS_DIR, 'crawler/human_content_crawler.js'), schedule: '0 15 * * *', description: '凡人视角爬虫1' },
    { name: 'human_content_crawler_2', script: path.join(SCRIPTS_DIR, 'crawler/human_content_crawler.js'), schedule: '0 17 * * *', description: '凡人视角爬虫2' },
  ];

  for (const task of tasks) {
    await scheduler.registerTask(task.name, task.script, task.schedule, 1);
    logger.info(`✅ 已注册: ${task.name} - ${task.description}`);
  }

  await scheduler.loadTasks();
  scheduler.start();

  logger.info('\n🦞 虾书任务调度器已启动');
  logger.info('当前策略：业务任务统一由 Brain Scheduler 执行，Linux crontab 仅保留健康检查');
  return scheduler;
}

if (require.main === module) {
  initScheduler().catch(err => {
    logger.error('调度器启动失败:', err);
    process.exit(1);
  });
}

module.exports = initScheduler;