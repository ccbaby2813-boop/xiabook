/**
 * 错误监控告警系统
 * - 捕获未处理错误
 * - 错误频率统计
 * - 达到阈值发送告警
 */

const logger = require('./logger');

// 错误计数（按错误类型）
const errorCounts = new Map();

// 告警阈值（次/小时）
const ALERT_THRESHOLD = 3;

// 告警冷却时间（毫秒）
const ALERT_COOLDOWN = 60 * 60 * 1000; // 1 小时

// 上次告警时间
let lastAlertTime = 0;

/**
 * 记录错误
 */
function captureError(err, context = {}) {
  const errorKey = err.message || err.toString();
  const now = Date.now();
  
  // 更新错误计数
  const count = (errorCounts.get(errorKey) || 0) + 1;
  errorCounts.set(errorKey, count);
  
  // 记录错误日志（自动脱敏）
  logger.error(`错误 #${count}: ${errorKey}`, {
    stack: err.stack,
    context,
    timestamp: new Date().toISOString()
  });
  
  // 检查是否需要告警
  if (count >= ALERT_THRESHOLD && now - lastAlertTime > ALERT_COOLDOWN) {
    sendAlert(errorKey, count, context);
    lastAlertTime = now;
    // 重置计数
    errorCounts.clear();
  }
}

/**
 * 发送告警（目前仅日志，后续可集成飞书/邮件）
 */
function sendAlert(errorKey, count, context) {
  logger.warn(`🚨 错误告警：${errorKey} 在 1 小时内发生 ${count} 次`, context);
  // 发送飞书告警
  sendFeishuAlert(errorKey, count);
  
  // TODO: 集成飞书 webhook 发送告警
  // await fetch(FEISHU_WEBHOOK, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     msg_type: 'text',
  //     content: { text: `🚨 虾书错误告警\n错误：${errorKey}\n次数：${count}\n时间：${new Date().toLocaleString('zh-CN')}` }
  //   })
  // });
}

/**
 * 初始化错误监控
 */
function init() {
  // 捕获未处理的 Promise 拒绝
  process.on('unhandledRejection', (reason, promise) => {
    captureError(new Error(`Unhandled Rejection: ${reason}`), { promise });
  });
  
  // 捕获未捕获的异常
  process.on('uncaughtException', (err) => {
    captureError(err, { source: 'uncaughtException' });
    // 不退出进程，让服务器继续运行
  });
  
  logger.info('[INFO] 错误监控系统已启动（阈值：3 次/小时）');
}

module.exports = {
  init,
  capture: captureError,
  errorCounts
};

// ===== 飞书告警通知（P1-023 优化）=====
async function sendFeishuAlert(errorKey, count) {
  const webhook = process.env.FEISHU_WEBHOOK;
  if (!webhook) {
    logger.warn('FEISHU_WEBHOOK 未配置，跳过告警通知');
    return;
  }
  
  const message = {
    msg_type: 'text',
    content: {
      text: `🚨 虾书错误告警\n\n错误类型：${errorKey}\n发生次数：${count} 次/小时\n时间：${new Date().toISOString()}\n\n请尽快处理！`
    }
  };
  
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });
    logger.info('飞书告警已发送');
  } catch (error) {
    logger.error('飞书告警发送失败', { error: error.message });
  }
}

// 导出函数供外部使用
module.exports.sendFeishuAlert = sendFeishuAlert;

// ===== 监控告警优化（P2-019）=====
// 添加更多监控指标
const metrics = {
  apiResponseTime: [],
  errorRate: 0,
  requestCount: 0
};

// 记录 API 响应时间
function recordApiResponseTime(time) {
  metrics.apiResponseTime.push(time);
  if (metrics.apiResponseTime.length > 100) {
    metrics.apiResponseTime.shift();
  }
}

// 计算平均响应时间
function getAverageResponseTime() {
  if (metrics.apiResponseTime.length === 0) return 0;
  const sum = metrics.apiResponseTime.reduce((a, b) => a + b, 0);
  return sum / metrics.apiResponseTime.length;
}

// 导出函数
module.exports.recordApiResponseTime = recordApiResponseTime;
module.exports.getAverageResponseTime = getAverageResponseTime;
module.exports.metrics = metrics;
