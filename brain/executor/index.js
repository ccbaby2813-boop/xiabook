/**
 * 执行器入口
 * 根据任务类型分发到对应处理模块
 */

const eventBus = require('../event-bus');
const taskQueue = require('../task-queue');
const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');

// API基础地址
const API_BASE = 'http://localhost:3000/api';
const SCRIPTS_DIR = path.join(__dirname, '../../scripts');

// 任务处理器映射
const handlers = {
  // === 定时任务 ===
  health_check: async (data) => {
    const res = await axios.get(`${API_BASE}/ops/health`, { timeout: 5000 });
    return res.data;
  },

  ai_post: async (data) => {
    // 从爬虫数据分配给AI用户发帖
    const res = await axios.post('http://localhost:3100/api/brain/distribute', data);
    return res.data;
  },

  ai_like: async (data) => {
    // 调用现有AI点赞脚本
    return runScript('ai_like_bot.js');
  },

  ai_comment: async (data) => {
    // 调用现有AI评论脚本
    return runScript('ai_comment_bot.js');
  },

  crawler: async (data) => {
    const { source } = data;
    const scriptMap = {
      moltbook: 'crawler/moltbook_crawler.js',
      v2ex: 'crawler/human_content_crawler_agentbrowser.js',
      tieba: 'crawler/tieba_crawler_agentbrowser.js'
    };
    const script = scriptMap[source];
    if (!script) throw new Error(`未知爬虫: ${source}`);
    return runScript(script);
  },

  backup: async (data) => {
    return runScript('feishu_backup.js');
  },

  daily_report: async (data) => {
    // 五宝生成报表 - 调用大脑服务（无需认证）
    const res = await axios.get('http://localhost:3100/api/operator/report');
    return res.data;
  },

  heat_update: async (data) => {
    return runScript('update_heat_scores.js');
  },

  ai_interaction: async (data) => {
    return runScript('ai_interaction.js');
  },

  // === 用户事件 ===
  welcome: async (data) => {
    // 调用大脑服务（无需认证）
    const res = await axios.post('http://localhost:3100/api/operator/welcome', data);
    return res.data;
  },

  interact: async (data) => {
    const res = await axios.post('http://localhost:3100/api/dabao/interact', data);
    return res.data;
  },

  reply: async (data) => {
    const res = await axios.post('http://localhost:3100/api/dabao/comment', data);
    return res.data;
  },

  // === 系统事件 ===
  alert: async (data) => {
    const res = await axios.post(`${API_BASE}/ops/alert`, data);
    return res.data;
  },

  recover: async (data) => {
    // 重启服务
    return { success: true, message: '恢复操作已触发' };
  },

  // === 运营事件 ===
  broadcast: async (data) => {
    const res = await axios.post(`${API_BASE}/admin/broadcast`, data);
    return res.data;
  }
};

// 运行脚本
function runScript(scriptName) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(SCRIPTS_DIR, scriptName);
    const child = spawn('node', [scriptPath], {
      cwd: SCRIPTS_DIR,
      env: { ...process.env, NODE_PATH: path.join(__dirname, '../../node_modules') }
    });
    
    let output = '';
    let errorOutput = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
      console.log(`[Script:${scriptName}] ${data.toString().trim()}`);
    });
    
    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.error(`[Script:${scriptName}:ERROR] ${data.toString().trim()}`);
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output, script: scriptName });
      } else {
        reject(new Error(`脚本执行失败: ${scriptName}\n${errorOutput}`));
      }
    });
    
    child.on('error', (err) => {
      reject(new Error(`脚本启动失败: ${scriptName} - ${err.message}`));
    });
  });
}

// 默认处理器
const defaultHandler = async (task) => {
  console.log(`[Executor] 未识别任务类型: ${task.type}`);
  return { success: false, error: '未知任务类型' };
};

/**
 * 执行单个任务
 */
async function execute(task) {
  console.log(`[Executor] 执行任务: ${task.id} (${task.type})`);

  const handler = handlers[task.type] || defaultHandler;
  const timeout = getTimeout(task.type);

  try {
    const result = await Promise.race([
      handler(task.data),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('任务超时')), timeout)
      )
    ]);

    taskQueue.complete(task.id, result);
    eventBus.emit('task.complete', { task, result });
    return result;
  } catch (error) {
    console.error(`[Executor] 任务失败: ${task.id}`, error.message);
    taskQueue.fail(task.id, error.message, shouldRetry(task.type));
    eventBus.emit('task.fail', { task, error: error.message });
    throw error;
  }
}

/**
 * 获取任务超时时间
 */
function getTimeout(taskType) {
  const timeouts = {
    health_check: 10000,
    ai_post: 300000,
    ai_like: 120000,
    ai_comment: 120000,
    crawler: 600000,
    backup: 1800000,
    daily_report: 30000,
    heat_update: 60000,
    default: 60000
  };
  return timeouts[taskType] || timeouts.default;
}

/**
 * 是否应该重试
 */
function shouldRetry(taskType) {
  const noRetry = ['health_check', 'daily_report'];
  return !noRetry.includes(taskType);
}

/**
 * 启动执行器循环
 */
function start(interval = 5000) {
  console.log('[Executor] 执行器已启动');

  const loop = async () => {
    const task = taskQueue.getNext();
    if (task) {
      try {
        await execute(task);
      } catch (e) {
        // 已在execute中处理
      }
    }
  };

  // 定时检查队列
  setInterval(loop, interval);

  // 立即执行一次
  loop();
}

module.exports = {
  execute,
  start,
  handlers,
  runScript
};