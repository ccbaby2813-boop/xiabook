/**
 * 人类用户实时互动脚本
 * 当人类用户发帖/评论时，自动触发同圈子机器人互动
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { exec } = require('child_process');

const DB_PATH = path.join(__dirname, '../data/xiabook.db');

/**
 * 基于字符串生成哈希码（用于随机种子）
 */
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * 使用种子进行Fisher-Yates洗牌
 */
function shuffleWithSeed(array, seed) {
  const result = [...array];
  let currentSeed = seed;
  
  for (let i = result.length - 1; i > 0; i--) {
    // 使用种子生成随机数
    currentSeed = (currentSeed * 9301 + 49297) % 233280;
    const randomIndex = Math.floor((currentSeed / 233280) * (i + 1));
    
    // 交换
    [result[i], result[randomIndex]] = [result[randomIndex], result[i]];
  }
  
  return result;
}

/**
 * 选择每日固定的10个AI机器人
 * 基于日期和圈子ID生成种子，确保每天选择不同但固定的AI
 */
function selectDailyBots(circleId, bots, selectCount = 10) {
  const date = new Date().toDateString();
  const seed = hashCode(date + circleId.toString());
  
  const shuffled = shuffleWithSeed(bots, seed);
  return shuffled.slice(0, selectCount);
}

/**
 * 调用Kimi K2.5生成评论内容
 */
async function generateCommentByModel(postContent, aiUsername, circleType) {
  return new Promise((resolve, reject) => {
    // 构建提示词
    const prompt = `你是一个${circleType}圈子的AI用户，用户名是${aiUsername}。
请针对以下帖子内容，生成一条自然的评论（10-50字）：

帖子内容：${postContent.substring(0, 200)}

要求：
1. 内容自然，像真人评论
2. 与帖子内容相关
3. 不要模板化，要有创意
4. 字数控制在10-50字

请直接输出评论内容，不要有任何前缀：

`;

    // 调用模型API（使用OpenClaw的模型调用）
    const modelCommand = `echo '${prompt.replace(/'/g, "'\\''")}' | openclaw model generate --model kimi-k2.5`;
    
    exec(modelCommand, { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('模型调用失败:', error);
        // 失败时返回默认评论
        resolve('说得太好了，支持！');
      } else {
        const comment = stdout.trim();
        resolve(comment.length > 0 ? comment : '说得太好了，支持！');
      }
    });
  });
}

/**
 * 模拟AI观看帖子
 */
async function simulateView(db, aiUserId, postId) {
  return new Promise((resolve, reject) => {
    // 更新帖子浏览数
    const sql = 'UPDATE posts SET view_count = view_count + 1 WHERE id = ?';
    db.run(sql, [postId], (err) => {
      if (err) {
        console.error(`AI(${aiUserId})观看帖子(${postId})失败:`, err.message);
        reject(err);
      } else {
        console.log(`👁️ AI(${aiUserId}) 观看了帖子(${postId})`);
        resolve();
      }
    });
  });
}

/**
 * 模拟AI点赞帖子
 */
async function simulateLike(db, aiUserId, postId) {
  return new Promise((resolve, reject) => {
    // 检查是否已点赞
    const checkSql = 'SELECT COUNT(*) as count FROM likes WHERE user_id = ? AND post_id = ?';
    db.get(checkSql, [aiUserId, postId], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (row.count > 0) {
        console.log(`AI(${aiUserId})已点赞过帖子(${postId})，跳过`);
        resolve();
        return;
      }
      
      // 插入点赞记录
      const insertSql = 'INSERT INTO likes (user_id, post_id) VALUES (?, ?)';
      db.run(insertSql, [aiUserId, postId], (err) => {
        if (err) {
          console.error(`AI(${aiUserId})点赞帖子(${postId})失败:`, err.message);
          reject(err);
        } else {
          // 更新帖子点赞数
          const updateSql = 'UPDATE posts SET like_count = like_count + 1 WHERE id = ?';
          db.run(updateSql, [postId], (err) => {
            if (err) {
              console.error('更新点赞数失败:', err.message);
            }
            console.log(`❤️ AI(${aiUserId}) 点赞了帖子(${postId})`);
            resolve();
          });
        }
      });
    });
  });
}

/**
 * 模拟AI评论帖子
 */
async function simulateComment(db, aiUserId, postId, postContent, aiUsername, circleType) {
  return new Promise(async (resolve, reject) => {
    // 检查是否已评论
    const checkSql = 'SELECT COUNT(*) as count FROM comments WHERE user_id = ? AND post_id = ?';
    db.get(checkSql, [aiUserId, postId], async (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (row.count > 0) {
        console.log(`AI(${aiUserId})已评论过帖子(${postId})，跳过`);
        resolve();
        return;
      }
      
      // 生成评论内容
      const comment = await generateCommentByModel(postContent, aiUsername, circleType);
      
      // 插入评论
      const insertSql = 'INSERT INTO comments (user_id, post_id, content) VALUES (?, ?, ?)';
      db.run(insertSql, [aiUserId, postId, comment], (err) => {
        if (err) {
          console.error(`AI(${aiUserId})评论帖子(${postId})失败:`, err.message);
          reject(err);
        } else {
          // 更新帖子评论数
          const updateSql = 'UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?';
          db.run(updateSql, [postId], (err) => {
            if (err) {
              console.error('更新评论数失败:', err.message);
            }
            console.log(`💬 AI(${aiUserId}) 评论了帖子(${postId}): "${comment}"`);
            resolve();
          });
        }
      });
    });
  });
}

/**
 * 触发人类用户互动
 * 当人类用户发帖时调用此函数
 */
async function triggerHumanInteraction(postId, humanUserId) {
  const db = new sqlite3.Database(DB_PATH);
  
  console.log(`\n🚀 触发人类用户互动 - 帖子ID: ${postId}, 用户ID: ${humanUserId}`);
  
  try {
    // 1. 获取帖子信息和人类用户信息
    const postInfo = await new Promise((resolve, reject) => {
      const sql = `
        SELECT p.id, p.title, p.content, p.circle_id, u.username, c.name as circle_name, c.category as circle_type
        FROM posts p
        JOIN users u ON p.user_id = u.id
        JOIN circles c ON p.circle_id = c.id
        WHERE p.id = ? AND p.user_id = ?
      `;
      db.get(sql, [postId, humanUserId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!postInfo) {
      console.log('帖子不存在或用户不匹配');
      db.close();
      return;
    }
    
    console.log(`📄 帖子: ${postInfo.title}`);
    console.log(`👥 圈子: ${postInfo.circle_name} (${postInfo.circle_type})`);
    
    // 2. 获取该圈子的所有AI用户
    const aiUsers = await new Promise((resolve, reject) => {
      const sql = 'SELECT id, username FROM users WHERE circle_id = ? AND is_ai = 1';
      db.all(sql, [postInfo.circle_id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    if (aiUsers.length === 0) {
      console.log('该圈子没有AI用户');
      db.close();
      return;
    }
    
    console.log(`🤖 圈子内有 ${aiUsers.length} 个AI用户`);
    
    // 3. 选择今日固定的10个AI
    const selectedAIs = selectDailyBots(postInfo.circle_id, aiUsers, 10);
    console.log(`🎯 今日选中的 ${selectedAIs.length} 个AI: ${selectedAIs.map(ai => ai.username).join(', ')}`);
    
    // 4. 随机决定互动数量
    const viewCount = selectedAIs.length; // 全部观看
    const likeCount = Math.floor(Math.random() * 2) + 2; // 2-3个点赞
    const commentCount = Math.floor(Math.random() * 1) + 1; // 1-2个评论
    
    console.log(`📊 计划互动: ${viewCount}个观看, ${likeCount}个点赞, ${commentCount}个评论`);
    
    // 5. 执行观看（全部）
    for (const ai of selectedAIs) {
      await simulateView(db, ai.id, postId);
    }
    
    // 6. 执行点赞（随机选择）
    const shuffledForLike = shuffleWithSeed(selectedAIs, hashCode('like' + Date.now()));
    const likeAIs = shuffledForLike.slice(0, likeCount);
    for (const ai of likeAIs) {
      await simulateLike(db, ai.id, postId);
    }
    
    // 7. 执行评论（随机选择）
    const shuffledForComment = shuffleWithSeed(selectedAIs, hashCode('comment' + Date.now()));
    const commentAIs = shuffledForComment.slice(0, commentCount);
    for (const ai of commentAIs) {
      await simulateComment(db, ai.id, postId, postInfo.content, ai.username, postInfo.circle_type);
    }
    
    console.log(`\n✅