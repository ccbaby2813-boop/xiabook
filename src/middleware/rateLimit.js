const { db } = require('../db/database'); // 假设这是数据库连接实例
const logger = require('../utils/logger');

const rateLimits = {
  post: { window: 30 * 60 * 1000, max: 1 },      // 30分钟1篇
  comment: { window: 24 * 60 * 60 * 1000, max: 20 },  // 每天20条
  like: { window: 24 * 60 * 60 * 1000, max: 100 }     // 每天100个
};

/**
 * 检查用户在时间窗口内的操作次数
 * @param {number} userId - 用户ID
 * @param {string} action - 操作类型 (post/comment/like)
 * @returns {Promise<{allowed: boolean, remaining: number, resetAt: number}>}
 */
async function checkRateLimit(userId, action) {
  const limitConfig = rateLimits[action];
  if (!limitConfig) {
    throw new Error(`Unknown action: ${action}`);
  }

  const now = Date.now();
  const windowStart = new Date(now - limitConfig.window);

  // 获取当前用户的操作记录
  let record = await db.get(
    'SELECT user_id, count, window_start FROM rate_limits WHERE user_id = ? AND action = ?',
    [userId, action]
  );

  // 如果记录不存在或窗口已过期，则创建新记录
  if (!record || new Date(record.window_start) < windowStart) {
    // 插入或替换记录
    await db.run(
      'INSERT OR REPLACE INTO rate_limits (user_id, action, count, window_start) VALUES (?, ?, 1, ?)',
      [userId, action, new Date(now)]
    );
    
    return {
      allowed: true,
      remaining: limitConfig.max - 1,
      resetAt: now + limitConfig.window
    };
  }

  // 如果记录在有效窗口期内，检查是否超过限制
  const currentCount = record.count;
  
  if (currentCount >= limitConfig.max) {
    // 达到限制，不允许继续操作
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(record.window_start).getTime() + limitConfig.window
    };
  }

  // 更新计数
  await db.run(
    'UPDATE rate_limits SET count = count + 1 WHERE user_id = ? AND action = ?',
    [userId, action]
  );

  return {
    allowed: true,
    remaining: limitConfig.max - currentCount - 1,
    resetAt: new Date(record.window_start).getTime() + limitConfig.window
  };
}

/**
 * 频率限制中间件
 * @param {string} action - 操作类型
 * @returns {Function} Express中间件函数
 */
function rateLimitMiddleware(action) {
  return async (req, res, next) => {
    // 假设用户ID从请求中获取，例如 req.user.id 或通过其他认证方式
    const userId = req.user?.id || req.session?.userId || null;

    if (!userId) {
      // 如果无法获取用户ID，可以选择拒绝请求或跳过限制
      // 这里我们选择跳过限制，但实际应用中可能需要验证用户身份
      return next();
    }

    try {
      const result = await checkRateLimit(userId, action);

      // 设置响应头
      res.setHeader('X-RateLimit-Limit', rateLimits[action].max);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', Math.floor(result.resetAt / 1000)); // Unix timestamp

      if (!result.allowed) {
        // 返回429状态码表示请求过多
        return res.status(429).json({
          error: 'Too Many Requests',
          message: `Rate limit exceeded for action: ${action}`,
          retryAfter: Math.floor((result.resetAt - Date.now()) / 1000)
        });
      }

      next();
    } catch (error) {
      logger.error('Rate limiting error:', error);
      // 发生错误时，可以选择阻止请求或允许继续
      // 这里我们选择允许请求继续进行，避免因限流系统故障影响正常业务
      next();
    }
  };
}

/**
 * 定期清理过期记录的任务
 */
async function cleanupExpiredRecords() {
  const now = Date.now();
  
  // 删除超过时间窗口的记录
  for (const [action, config] of Object.entries(rateLimits)) {
    const expiredTime = new Date(now - config.window);
    await db.run(
      'DELETE FROM rate_limits WHERE action = ? AND window_start < ?',
      [action, expiredTime]
    );
  }
}

module.exports = {
  rateLimitMiddleware,
  checkRateLimit,
  cleanupExpiredRecords,
  rateLimits
};