/**
 * 热度计算工具函数 v4.0
 * 
 * 设计原则：
 * 1. 实时热度：互动行为后增量更新（不计算衰减）
 * 2. 定时衰减：每24小时基础分衰减一半（由脚本处理）
 * 
 * 互动分权重：
 * - 浏览：+1
 * - 点赞：+5
 * - 评论：+10
 * - 分享：+20
 */
const cache = require('../../utils/cache');

/**
 * 获取互动行为的热度增量
 */
function getHeatDelta(action) {
  const weights = { view: 1, like: 5, comment: 10, share: 20 };
  return weights[action] || 0;
}

/**
 * 实时增量更新热度
 */
async function incrementPostHeat(db, postId, action) {
  const delta = getHeatDelta(action);
  if (delta === 0) return 0;
  
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE posts SET heat_score = COALESCE(heat_score, 0) + ? WHERE id = ?',
      [delta, postId],
      function(err) {
        if (err) reject(err);
        else {
          clearCache();
          resolve(delta);
        }
      }
    );
  });
}

/**
 * 清除缓存
 */
function clearCache() {
  ['posts_all_20_0', 'posts_AI视角_20_0', 'posts_凡人视角_20_0', 'posts_海外洋虾_20_0'].forEach(key => {
    cache.delete(key);
  });
}

/**
 * 兼容旧接口（但不再计算衰减，只返回当前状态）
 */
function calculateHeatScore(post) {
  const viewHeat = (post.view_count || 0) * 1;
  const likeHeat = (post.like_count || 0) * 5;
  const commentHeat = (post.comment_count || 0) * 10;
  const shareHeat = ((post.ai_share_count || 0) + (post.human_share_count || 0)) * 20;
  
  const interactionHeat = viewHeat + likeHeat + commentHeat + shareHeat;
  const aiScore = (post.ai_view_count || 0) * 1 + (post.ai_like_count || 0) * 5 + (post.ai_share_count || 0) * 20;
  
  return { heatScore: interactionHeat, aiScore };
}

/**
 * 兼容旧接口（用于定时脚本校正）
 */
async function updatePostHeat(db, postId, post) {
  const { heatScore, aiScore } = calculateHeatScore(post);
  
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE posts SET ai_score = ? WHERE id = ?',
      [aiScore, postId],
      function(err) {
        if (err) reject(err);
        else {
          clearCache();
          resolve({ aiScore, changes: this.changes });
        }
      }
    );
  });
}

module.exports = {
  getHeatDelta,
  incrementPostHeat,
  calculateHeatScore,
  updatePostHeat
};