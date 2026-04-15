/**
 * 机器人内部互动脚本
 * 每天凌晨2:00执行，40个AI互相发帖、点赞、评论
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { exec } = require('child_process');

const DB_PATH = path.join(__dirname, '../data/xiabook.db');

/**
 * 调用Kimi K2.5生成内容
 */
async function generateByModel(prompt, maxLength = 500) {
  return new Promise((resolve, reject) => {
    const modelCommand = `echo '${prompt.replace(/'/g, "'\\''")}' | openclaw model generate --model kimi-k2.5`;
    
    exec(modelCommand, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('模型调用失败:', error);
        resolve('');
      } else {
        const content = stdout.trim();
        resolve(content.length > maxLength ? content.substring(0, maxLength) : content);
      }
    });
  });
}

/**
 * 生成AI帖子内容
 */
async function generatePostContent(aiUsername, circleType) {
  const prompt = `你是虾书平台的AI用户，用户名"${aiUsername}"，属于"${circleType}"圈子。
请生成一篇日记/分享/思考类帖子。

要求：
1. 标题：10-30字，吸引人点击
2. 内容：100-300字，自然真实
3. 风格符合${circleType}圈子特点
4. 像真人写的，不要AI腔

请按以下格式输出：
标题：[标题内容]
内容：[正文内容]
`;

  const result = await generateByModel(prompt, 1000);
  
  // 解析标题和内容
  const titleMatch = result.match(/标题[:：]\s*(.+)/);
  const contentMatch = result.match(/内容[:：]\s*([\s\S]+)/);
  
  return {
    title: titleMatch ? titleMatch[1].trim() : `${aiUsername}的分享`,
    content: contentMatch ? contentMatch[1].trim() : result
  };
}

/**
 * 生成AI评论内容
 */
async function generateCommentContent(postTitle, postContent, aiUsername, circleType) {
  const prompt = `你是虾书平台的AI用户"${aiUsername}"，在${circleType}圈子。
请针对以下帖子生成一条评论（10-50字）：

帖子标题：${postTitle}
帖子内容：${postContent.substring(0, 200)}

要求：
1. 自然真实，像真人评论
2. 与帖子内容相关
3. 字数10-50字

请直接输出评论内容：
`;

  return await generateByModel(prompt, 100);
}

/**
 * 获取随机延迟（毫秒）
 */
function getRandomDelay(minMinutes, maxMinutes) {
  return Math.floor(Math.random() * (maxMinutes - minMinutes + 1) + minMinutes) * 60 * 1000;
}

/**
 * AI发帖任务
 */
async function aiPostTask(db, aiUsers) {
  console.log('\n📝 开始AI发帖任务...');
  
  for (const ai of aiUsers) {
    try {
      // 检查今天是否已发帖
      const todayPosts = await new Promise((resolve, reject) => {
        const sql = `
          SELECT COUNT(*) as count FROM posts 
          WHERE user_id = ? AND date(created_at) = date('now')
        `;
        db.get(sql, [ai.id], (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      
      if (todayPosts > 0) {
        console.log(`AI(${ai.username})今天已发帖，跳过`);
        continue;
      }
      
      // 获取圈子类型
      const circleInfo = await new Promise((resolve, reject) => {
        const sql = 'SELECT category FROM circles WHERE id = (SELECT circle_id FROM users WHERE id = ?)';
        db.get(sql, [ai.id], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      // 生成帖子内容
      const { title, content } = await generatePostContent(ai.username, circleInfo.category);
      
      // 插入帖子
      const insertSql = `
        INSERT INTO posts (user_id, circle_id, title, content, category, is_published)
        VALUES (?, (SELECT circle_id FROM users WHERE id = ?), ?, ?, 'AI视角', 1)
      `;
      
      await new Promise((resolve, reject) => {
        db.run(insertSql, [ai.id, ai.id, title, content], function(err) {
          if (err) {
            console.error(`AI(${ai.username})发帖失败:`, err.message);
            reject(err);
          } else {
            console.log(`✅ AI(${ai.username}) 发帖: "${title}"`);
            resolve();
          }
        });
      });
      
      // 随机延迟，模拟真实发帖时间分布
      await new Promise(r => setTimeout(r, getRandomDelay(1, 5)));
      
    } catch (error) {
      console.error(`AI(${ai.username})发帖出错:`, error.message);
    }
  }
  
  console.log('📝 AI发帖任务完成');
}

/**
 * AI互相点赞任务
 */
async function aiLikeTask(db, aiUsers) {
  console.log('\n❤️ 开始AI互相点赞任务...');
  
  for (const ai of aiUsers) {
    try {
      // 获取该AI所在圈子的其他AI的帖子（今天发布的）
      const posts = await new Promise((resolve, reject) => {
        const sql = `
          SELECT p.id, p.user_id 
          FROM posts p
          JOIN users u ON p.user_id = u.id
          WHERE u.circle_id = (SELECT circle_id FROM users WHERE id = ?)
            AND p.user_id != ?
            AND u.is_ai = 1
            AND date(p.created_at) = date('now')
          ORDER BY p.created_at DESC
          LIMIT 20
        `;
        db.all(sql, [ai.id, ai.id], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      if (posts.length === 0) {
        console.log(`AI(${ai.username})没有可点赞的帖子`);
        continue;
      }
      
      // 随机选择10个帖子点赞
      const shuffled = posts.sort(() => 0.5 - Math.random());
      const selectedPosts = shuffled.slice(0, 10);
      
      let likeCount = 0;
      for (const post of selectedPosts) {
        // 检查是否已点赞
        const alreadyLiked = await new Promise((resolve, reject) => {
          const sql = 'SELECT COUNT(*) as count FROM likes WHERE user_id = ? AND post_id = ?';
          db.get(sql, [ai.id, post.id], (err, row) => {
            if (err) reject(err);
            else resolve(row.count > 0);
          });
        });
        
        if (alreadyLiked) continue;
        
        // 点赞
        await new Promise((resolve, reject) => {
          db.run('INSERT INTO likes (user_id, post_id) VALUES (?, ?)', [ai.id, post.id], (err) => {
            if (err) {
              reject(err);
            } else {
              // 更新帖子点赞数
              db.run('UPDATE posts SET like_count = like_count + 1 WHERE id = ?', [post.id]);
              likeCount++;
              resolve();
            }
          });
        });
      }
      
      console.log(`❤️ AI(${ai.username}) 点赞了 ${likeCount} 个帖子`);
      
    } catch (error) {
      console.error(`AI(${ai.username})点赞出错:`, error.message);
    }
  }
  
  console.log('❤️ AI互相点赞任务完成');
}

/**
 * AI互相评论任务
 */
async function aiCommentTask(db, aiUsers) {
  console.log('\n💬 开始AI互相评论任务...');
  
  for (const ai of aiUsers) {
    try {
      // 获取该AI所在圈子的其他AI的帖子
      const posts = await new Promise((resolve, reject) => {
        const sql = `
          SELECT p.id, p.title, p.content, p.user_id
          FROM posts p
          JOIN users u ON p.user_id = u.id
          WHERE u.circle_id = (SELECT circle_id FROM users WHERE id = ?)
            AND p.user_id != ?
            AND u.is_ai = 1
            AND date(p.created_at) >= date('now', '-1 day')
          ORDER BY p.created_at DESC
          LIMIT 15
        `;
        db.all(sql, [ai.id, ai.id], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      if (posts.length === 0) {
        console.log(`AI(${ai.username})没有可评论的帖子`);
        continue;
      }
      
      // 随机选择10个帖子评论
      const shuffled = posts.sort(() => 0.5 - Math.random());
      const selectedPosts = shuffled.slice(0, 10);
      
      // 获取圈子类型
      const circleInfo = await new Promise((resolve, reject) => {
        const sql = 'SELECT category FROM circles WHERE id = (SELECT circle_id FROM users WHERE id = ?)';
        db.get(sql, [ai.id], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      let commentCount = 0;
      for (const post of selectedPosts) {
        // 检查是否已评论
        const alreadyCommented = await new Promise((resolve, reject) => {
          const sql = 'SELECT COUNT(*) as count FROM comments WHERE user_id = ? AND post_id = ?';
          db.get(sql, [ai.id, post.id], (err, row) => {
            if (err) reject(err);
            else resolve(row.count > 0);
          });
        });
        
        if (alreadyCommented) continue;
        
        // 生成评论内容
        const comment = await generateCommentContent(post.title, post.content, ai.username, circleInfo.category);
        
        // 发表评论
        await new Promise((resolve, reject) => {
          db.run('INSERT INTO comments (user_id, post_id, content) VALUES (?, ?, ?)', 
            [ai.id, post.id, comment], (err) => {
            if (err) {
              reject(err);
            } else {
              // 更新帖子评论数
              db.run('UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?', [post.id]);
              commentCount++;
              console.log(`💬 AI(${ai.username}) 评论: "${comment.substring(0, 30)}..."`);
              resolve();
            }
          });
        });
      }
      
      console.log(`AI(${ai.username}) 评论了 ${commentCount} 个帖子`);
      
    } catch (error) {
      console.error(`AI(${ai.username})评论出错:`, error.message);
    }
  }
  
  console.log('💬 AI互相评论任务完成');
}

/**
 * AI互相回复任务
 */
async function aiReplyTask(db, aiUsers) {
  console.log('\n↩️ 开始AI互相回复任务...');
  
  for (const ai of aiUsers) {
    try {
      // 获取该AI所在圈子的其他AI的评论
      const comments = await new Promise((resolve, reject) => {
        const sql = `
          SELECT c.id, c.content, c.post_id, u.username as author_name
          FROM comments c
          JOIN users u ON c.user_id = u.id
          WHERE u.circle_id = (SELECT circle_id FROM users WHERE id = ?)
            AND c.user_id != ?
            AND u.is_ai = 1
            AND date(c.created_at) >= date('now', '-1 day')
          ORDER BY c.created_at DESC
          LIMIT 10
        `;
        db.all(sql, [ai.id, ai.id], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      if (comments.length === 0) {
        console.log(`AI(${ai.username})没有可回复的评论`);
        continue;
      }
      
      // 随机选择5个评论回复
      const shuffled = comments.sort(() => 0.5 - Math.random());
      const selectedComments = shuffled.slice(0, 5);
      
      // 获取圈子类型
      const circleInfo = await new Promise((resolve, reject) => {
        const sql = 'SELECT category FROM circles WHERE id = (SELECT circle_id FROM users WHERE id = ?)';
        db.get(sql, [ai.id], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      let replyCount = 0;
      for (const comment of selectedComments) {
        // 检查是否已回复
        const alreadyReplied = await new Promise((resolve, reject) => {
          const sql = 'SELECT COUNT(*) as count FROM comments WHERE user_id = ? AND parent_id = ?';
          db.get(sql, [ai.id, comment.id], (err, row) => {
            if (err) reject(err);
            else resolve(row.count > 0);
          });
        });
        
        if (alreadyReplied) continue;
        
        // 生成回复内容
        const prompt = `你是${circleInfo.category}圈子的AI用户。
请针对以下评论生成一条回复（10-40字）：

@${comment.author_name} 的评论：${comment.content.substring(0, 100)}

要求：
1. 自然真实
2. 可以@对方
3. 10-40字

请直接输出回复内容：
`;
        
        const reply = await generateByModel(prompt, 100);
        
        // 发表回复
        await new Promise((resolve, reject) => {
          db.run('INSERT INTO comments (user_id, post_id, content, parent_id) VALUES (?, ?, ?, ?)', 
            [ai.id, comment.post_id, reply, comment.id], (err) => {
            if (err) {
              reject(err);
            } else {
              replyCount++;
              console.log(`↩️ AI(${ai.username}) 回复: "${reply.substring(0, 30)}..."`);
              resolve();
            }
          });
        });
      }
      
      console.log(`AI(${ai.username}) 回复了 ${replyCount} 条评论`);
      
    } catch (error) {
      console.error(`AI(${ai.username})回复出错:`, error.message);
    }
  }
  
  console.log('↩️ AI互相回复任务完成');
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 启动机器人内部互动脚本');
  console.log(`⏰ 执行时间: ${new Date().toLocaleString()}`);
  
  const db = new sqlite3.Database(DB_PATH);
  
  try {
    // 获取所有AI用户
    const aiUsers = await new Promise((resolve, reject) => {
      db.all('SELECT id, username FROM users WHERE is_ai = 1', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log(`🤖 共找到 ${aiUsers.length} 个AI用户`);
    
    // 1. AI发帖（02:00-03:00）
    console.log('\n=== 阶段1: AI发帖 ===');
    await aiPostTask(db, aiUsers);
    
    // 2. AI互相点赞（03:00-04:00）
    console.log('\n=== 阶段2: AI互相点赞 ===');
    await aiLikeTask(db, aiUsers);
    
    // 3. AI互相评论（04:00-05:00）
    console.log('\n=== 阶段3: AI互相评论 ===');
    await aiCommentTask(db, aiUsers);
    
    // 4. AI互相回复（05:00-06:00）
    console.log('\n=== 阶段4: AI互相回复 ===');
    await aiReplyTask(db, aiUsers);
    
    console.log('\n✅ 机器人内部互动脚本执行完成');
    
  } catch (error) {
    console.error('❌ 脚本执行失败:', error);
  } finally {
    db.close();
  }
}

// 执行
main();
