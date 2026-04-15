/**
 * 安全日志工具 - 自动脱敏敏感信息
 * 防止密码、密钥、token 等敏感信息泄露到日志中
 */

// 敏感字段关键词（不区分大小写）
const SENSITIVE_PATTERNS = [
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /auth/i,
  /credential/i,
  /private/i
];

// 脱敏替换值
const MASK = '[REDACTED]';

/**
 * 检查键名是否敏感
 */
function isSensitiveKey(key) {
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(key));
}

/**
 * 脱敏对象中的敏感字段
 */
function redact(obj, depth = 0) {
  if (depth > 5) return '[Max Depth]'; // 防止循环引用
  
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => redact(item, depth + 1));
  }
  
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveKey(key)) {
      result[key] = MASK;
    } else {
      result[key] = redact(value, depth + 1);
    }
  }
  return result;
}

/**
 * 安全日志函数
 */
const logger = {
  info: (...args) => {
    const safeArgs = args.map(arg => 
      typeof arg === 'object' ? redact(arg) : arg
    );
    console.log('[INFO]', ...safeArgs);
  },
  
  error: (...args) => {
    const safeArgs = args.map(arg => 
      typeof arg === 'object' ? redact(arg) : arg
    );
    console.error('[ERROR]', ...safeArgs);
  },
  
  warn: (...args) => {
    const safeArgs = args.map(arg => 
      typeof arg === 'object' ? redact(arg) : arg
    );
    console.warn('[WARN]', ...safeArgs);
  },
  
  debug: (...args) => {
    if (process.env.LOG_LEVEL === 'debug') {
      const safeArgs = args.map(arg => 
        typeof arg === 'object' ? redact(arg) : arg
      );
      console.debug('[DEBUG]', ...safeArgs);
    }
  }
};

module.exports = logger;
