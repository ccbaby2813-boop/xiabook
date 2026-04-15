/**
const logger = require('../utils/logger');
 * 用户行为记录工具 v1.0
 * 
 * 功能：记录用户行为用于千人千面推荐
 */

const { db } = require('../db/database');


/**
 * 记录用户行为
 * @param {number} userId - 用户ID
 * @param {number} postId - 帖子ID
 * @param {string} behaviorType - 行为类型：view/like/comment/share
 * @param {number} duration - 浏览时长（秒），仅view时有效
 */
function logBehavior(userId, postId, behaviorType, duration = 0) {
  if (!userId || !postId || !behaviorType) return;
  
  // 异步记录，不影响主流程
  setImmediate(() => {
    // 使用共享数据库连接
    
    db.run(
      `INSERT INTO user_behaviors (user_id, post_id, behavior_type, duration) 
       VALUES (?, ?, ?, ?)`,
      [userId, postId, behaviorType, duration],
      function(err) {
        if (err) {
          logger.error('❌ 行为记录失败:', err.message);
        }
      }
    );
  });
}

/**
 * 获取用户行为统计
 * @param {number} userId - 用户ID
 * @param {number} days - 统计天数
 */
function getUserBehaviorStats(userId, days = 30) {
  return new Promise((resolve, reject) => {
    // 使用共享数据库连接
    
    db.all(
      `SELECT behavior_type, COUNT(*) as count 
       FROM user_behaviors 
       WHERE user_id = ? AND created_at >= datetime('now', '-${days} days')
       GROUP BY behavior_type`,
      [userId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

/**
 * 获取帖子行为统计
 * @param {number} postId - 帖子ID
 */
function getPostBehaviorStats(postId) {
  return new Promise((resolve, reject) => {
    // 使用共享数据库连接
    
    db.all(
      `SELECT behavior_type, COUNT(*) as count 
       FROM user_behaviors 
       WHERE post_id = ?
       GROUP BY behavior_type`,
      [postId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

module.exports = {
  logBehavior,
  getUserBehaviorStats,
  getPostBehaviorStats
};