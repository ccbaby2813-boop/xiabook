/**
 * 慢查询监控系统
 * - 监控数据库查询耗时
 * - 记录慢查询日志
 * - 超过阈值告警
 */

const logger = require('./logger');

// 慢查询阈值（毫秒）
const SLOW_THRESHOLD = 100; // 100ms 为慢查询
const VERY_SLOW_THRESHOLD = 500; // 500ms 为严重慢查询

// 慢查询计数
let slowQueryCount = 0;
let verySlowQueryCount = 0;

/**
 * 包装数据库方法，添加慢查询监控
 */
function wrapDbMethods(db) {
  if (!db || !db.get || !db.all || !db.run) {
    logger.warn('数据库对象不完整，跳过慢查询监控');
    return;
  }
  
  // 包装 get 方法
  const originalGet = db.get;
  db.get = function(sql, params, callback) {
    const start = Date.now();
     originalGet.call(this, sql, params, function(err, row) {
      const duration = Date.now() - start;
      checkSlowQuery(sql, params, duration);
      if (callback) callback(err, row);
    });
  };
  
  // 包装 all 方法
  const originalAll = db.all;
  db.all = function(sql, params, callback) {
    const start = Date.now();
    originalAll.call(this, sql, params, function(err, rows) {
      const duration = Date.now() - start;
      checkSlowQuery(sql, params, duration);
      if (callback) callback(err, rows);
    });
  };
  
  // 包装 run 方法
  const originalRun = db.run;
  db.run = function(sql, params, callback) {
    const start = Date.now();
     originalRun.call(this, sql, params, function(err) {
      const duration = Date.now() - start;
      checkSlowQuery(sql, params, duration);
      if (callback) callback(err);
    });
  };
  
  logger.info('慢查询监控已启用（阈值：100ms/500ms）');
}

/**
 * 检查是否为慢查询
 */
function checkSlowQuery(sql, params, duration) {
  if (duration >= VERY_SLOW_THRESHOLD) {
    verySlowQueryCount++;
    logger.warn(`🐌 严重慢查询 (${duration}ms): ${sql.substring(0, 100)}`, {
      params,
      threshold: VERY_SLOW_THRESHOLD
    });
  } else if (duration >= SLOW_THRESHOLD) {
    slowQueryCount++;
    logger.info(`🐌 慢查询 (${duration}ms): ${sql.substring(0, 100)}`);
  }
}

/**
 * 获取统计信息
 */
function getStats() {
  return {
    slowQueries: slowQueryCount,
    verySlowQueries: verySlowQueryCount,
    thresholds: {
      slow: SLOW_THRESHOLD,
      verySlow: VERY_SLOW_THRESHOLD
    }
  };
}

/**
 * 重置统计
 */
function resetStats() {
  slowQueryCount = 0;
  verySlowQueryCount = 0;
}

module.exports = {
  init: () => {}, // 兼容旧接口
  enable: () => {}, // 兼容旧接口
  wrapDbMethods,
  getStats,
  resetStats,
  SLOW_THRESHOLD,
  VERY_SLOW_THRESHOLD
};
