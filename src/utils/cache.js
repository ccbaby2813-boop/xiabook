/**
 * 简单的内存缓存工具
 */

const cache = new Map();
const timeouts = new Map();

/**
 * 获取缓存，如果没有则设置
 * @param {string} key - 缓存键
 * @param {Function} fn - 获取数据的函数
 * @param {number} ttl - 缓存时间（毫秒）
 */
async function getOrSet(key, fn, ttl = 30000) {
  // 检查是否有有效缓存
  if (cache.has(key)) {
    const value = cache.get(key);
    console.log('[Cache] 命中缓存:', key);
    return value;
  }
  
  console.log('[Cache] 缓存未命中，获取数据:', key);
  
  // 获取数据
  const value = await fn();
  
  // 设置缓存
  cache.set(key, value);
  
  // 设置过期时间
  if (timeouts.has(key)) {
    clearTimeout(timeouts.get(key));
  }
  
  const timeout = setTimeout(() => {
    cache.delete(key);
    timeouts.delete(key);
    console.log('[Cache] 缓存过期:', key);
  }, ttl);
  
  timeouts.set(key, timeout);
  
  return value;
}

/**
 * 获取缓存
 */
function get(key, fn, ttl = 30000) {
  return getOrSet(key, fn, ttl);
}

/**
 * 删除缓存
 */
function del(key) {
  if (cache.has(key)) {
    cache.delete(key);
    console.log('[Cache] 删除缓存:', key);
  }
  if (timeouts.has(key)) {
    clearTimeout(timeouts.get(key));
    timeouts.delete(key);
  }
}

/**
 * 清空所有缓存
 */
function clear() {
  cache.clear();
  timeouts.forEach(timeout => clearTimeout(timeout));
  timeouts.clear();
  console.log('[Cache] 缓存已清空');
}

/**
 * 获取缓存统计
 */
function stats() {
  return {
    size: cache.size,
    keys: Array.from(cache.keys())
  };
}

module.exports = {
  get,
  del,
  clear,
  stats
};
