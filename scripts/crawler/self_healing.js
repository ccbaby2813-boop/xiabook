#!/usr/bin/env node
/**
 * 异常自愈系统 v1.0
 * 功能：自动诊断爬取失败原因并尝试修复
 */

// 日志函数（避免依赖外部）
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// 错误类型诊断
function diagnoseError(error, source) {
  const diagnosis = {
    type: 'unknown',
    severity: 'medium',
    suggestion: '',
    autoFixable: false
  };
  
  // 超时错误
  if (error.message.includes('timeout') || error.code === 'ETIMEDOUT') {
    diagnosis.type = 'timeout';
    diagnosis.severity = 'low';
    diagnosis.suggestion = '增加超时时间或检查网络连接';
    diagnosis.autoFixable = true;
  }
  
  // 403 Forbidden（被封 IP 或需要登录）
  if (error.response?.status === 403) {
    diagnosis.type = 'blocked';
    diagnosis.severity = 'high';
    diagnosis.suggestion = '切换 IP 或使用移动端 API';
    diagnosis.autoFixable = true;
  }
  
  // 429 Too Many Requests（频率限制）
  if (error.response?.status === 429) {
    diagnosis.type = 'rate_limited';
    diagnosis.severity = 'medium';
    diagnosis.suggestion = '降低请求频率，增加延迟';
    diagnosis.autoFixable = true;
  }
  
  // 500/502/503 服务器错误
  if ([500, 502, 503].includes(error.response?.status)) {
    diagnosis.type = 'server_error';
    diagnosis.severity = 'medium';
    diagnosis.suggestion = '稍后重试，源站可能维护中';
    diagnosis.autoFixable = true;
  }
  
  // DNS 解析失败
  if (error.code === 'ENOTFOUND') {
    diagnosis.type = 'dns_error';
    diagnosis.severity = 'high';
    diagnosis.suggestion = '检查域名是否正确或 DNS 配置';
    diagnosis.autoFixable = false;
  }
  
  // 连接重置
  if (error.code === 'ECONNRESET') {
    diagnosis.type = 'connection_reset';
    diagnosis.severity = 'low';
    diagnosis.suggestion = '网络波动，自动重试即可';
    diagnosis.autoFixable = true;
  }
  
  log(`[${source}] 诊断结果：${diagnosis.type} (${diagnosis.severity}) - ${diagnosis.suggestion}`);
  
  return diagnosis;
}

// 自动修复策略
async function applyFix(source, diagnosis, context) {
  log(`[${source}] 尝试自动修复：${diagnosis.type}`);
  
  switch (diagnosis.type) {
    case 'timeout':
      // 增加超时时间重试
      context.timeout = (context.timeout || 15000) * 1.5;
      log(`[${source}] 超时时间调整为 ${context.timeout}ms`);
      return { fixed: true, context };
      
    case 'blocked':
      // 切换移动端 API
      if (context.useMobile) {
        log(`[${source}] 已使用移动端 API，无法继续降级`);
        return { fixed: false };
      }
      context.useMobile = true;
      log(`[${source}] 切换到移动端 API`);
      return { fixed: true, context };
      
    case 'rate_limited':
      // 增加延迟
      context.delay = (context.delay || 2000) * 2;
      log(`[${source}] 延迟调整为 ${context.delay}ms`);
      return { fixed: true, context };
      
    case 'server_error':
      // 等待后重试
      log(`[${source}] 等待 5 秒后重试...`);
      await sleep(5000);
      return { fixed: true, context };
      
    case 'connection_reset':
      // 立即重试
      log(`[${source}] 立即重试...`);
      return { fixed: true, context };
      
    default:
      log(`[${source}] 未知错误类型，无法自动修复`);
      return { fixed: false };
  }
}

// 带自愈的爬取
async function fetchWithSelfHealing(source, fetchFn, context = {}) {
  const maxRetries = 3;
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log(`[${source}] 第${attempt}次尝试...`);
      const result = await fetchFn(context);
      
      // 成功，重置失败计数
      resetFailureCount(source);
      return result;
      
    } catch (error) {
      lastError = error;
      
      // 诊断错误
      const diagnosis = diagnoseError(error, source);
      
      // 记录失败
      recordFailure(source, diagnosis);
      
      // 尝试自动修复
      if (diagnosis.autoFixable && attempt < maxRetries) {
        const fixResult = await applyFix(source, diagnosis, context);
        
        if (fixResult.fixed) {
          log(`[${source}] 自动修复成功，准备重试`);
          continue;
        }
      }
      
      // 无法修复或已达最大重试次数
      log(`[${source}] 爬取失败：${error.message}`);
      
      // 连续失败 3 次，发送告警
      if (getFailureCount(source) >= 3) {
        await sendAlert(source, diagnosis, error);
      }
    }
  }
  
  // 所有重试都失败
  throw lastError;
}

// 失败计数管理
const failureCounts = new Map();

function recordFailure(source, diagnosis) {
  const count = (failureCounts.get(source) || 0) + 1;
  failureCounts.set(source, count);
  
  log(`[${source}] 失败计数：${count}`);
}

function getFailureCount(source) {
  return failureCounts.get(source) || 0;
}

function resetFailureCount(source) {
  failureCounts.set(source, 0);
}

// 告警通知
async function sendAlert(source, diagnosis, error) {
  log(`🚨 [告警] 源站${source}连续失败 3 次，需人工介入`);
  log(`   错误类型：${diagnosis.type}`);
  log(`   严重程度：${diagnosis.severity}`);
  log(`   建议：${diagnosis.suggestion}`);
  log(`   错误信息：${error.message}`);
  
  // 这里可以添加飞书通知、邮件通知等
  // 简化版：只记录日志
}

// 日志函数
function debugLog(message, logFile = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  if (logFile) {
    fs.appendFileSync(logFile, logMessage);
  }
  console.log(logMessage.trim());
}

// 工具函数
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 导出
module.exports = {
  diagnoseError,
  applyFix,
  fetchWithSelfHealing,
  recordFailure,
  getFailureCount,
  resetFailureCount,
  sendAlert,
  log: debugLog,
  sleep
};
