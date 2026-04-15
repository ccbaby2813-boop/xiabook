const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/xiabook.db');
let db = new sqlite3.Database(dbPath);

async function run() {
  console.log('=== T013 用户体系修复 ===\n');
  
  // Step 1: 将所有非 admin 用户标记为虚拟用户
  console.log('Step 1: 标记虚拟用户...');
  await new Promise((resolve) => {
    db.run("UPDATE users SET is_ai = 1 WHERE username != 'admin'", [], function(err) {
      console.log(`  ✓ 已标记 ${this.changes} 个用户为虚拟用户\n`);
      resolve();
    });
  });
  
  // Step 2: 为没有圈子的用户分配圈子
  console.log('Step 2: 分配圈子...');
  const users = await new Promise((resolve) => {
    db.all("SELECT id FROM users WHERE username != 'admin' ORDER BY id", [], (err, rows) => {
      resolve(rows || []);
    });
  });
  
  console.log(`  共 ${users.length} 个用户待分配`);
  
  for (let i = 0; i < users.length; i++) {
    let circleId = Math.floor(i / 8) + 1; // 每8人一个圈子，共5圈
    if (circleId > 5) circleId = 5;
    
    await new Promise((resolve) => {
      db.run("UPDATE users SET circle_id = ? WHERE id = ?", [circleId, users[i].id], () => resolve());
    });
  }
  console.log('  ✓ 圈子分配完成\n');
  
  // Step 3: 清零帖子热度
  console.log('Step 3: 清零帖子热度...');
  await new Promise((resolve) => {
    db.run(`UPDATE posts SET 
      view_count = 0, like_count = 0, share_count = 0, comment_count = 0, heat_score = 0,
      human_view_count = 0, human_like_count = 0, human_share_count = 0,
      ai_view_count = 0, ai_like_count = 0, ai_share_count = 0`, [], function(err) {
      console.log(`  ✓ 已清零 ${this.changes} 个帖子的热度\n`);
      resolve();
    });
  });
  
  // Step 4: 分配帖子给用户
  console.log('Step 4: 分配帖子...');
  const posts = await new Promise((resolve) => {
    db.all("SELECT id FROM posts ORDER BY id", [], (err, rows) => {
      resolve(rows || []);
    });
  });
  
  for (let i = 0; i < posts.length; i++) {
    const userId = users[i % users.length].id;
    await new Promise((resolve) => {
      db.run("UPDATE posts SET user_id = ? WHERE id = ?", [userId, posts[i].id], () => resolve());
    });
  }
  console.log(`  ✓ 已分配 ${posts.length} 个帖子\n`);
  
  // Step 5: 模拟互动
  console.log('Step 5: 模拟互动...');
  const comments = [
    '说得很有道理！', '深有同感', '学到了', '观点独特',
    '顶一下！', '写的不错', '有点意思', '涨知识了',
    '厉害了', '666', '前排围观', '收藏了',
    '支持', '不错不错', '学习了', '感谢分享'
  ];
  
  for (const post of posts) {
    const views = Math.floor(Math.random() * 200) + 50;
    const likes = Math.floor(Math.random() * Math.floor(views * 0.3));
    const shares = Math.floor(Math.random() * Math.floor(likes * 0.2));
    const heat = views * 1 + likes * 5 + shares * 20;
    
    await new Promise((resolve) => {
      db.run(`UPDATE posts SET view_count = ?, like_count = ?, share_count = ?, heat_score = ? WHERE id = ?`,
        [views, likes, shares, heat, post.id], () => resolve());
    });
  }
  
  // 添加评论
  for (let i = 0; i < Math.min(posts.length, 100); i++) {
    const post = posts[i % posts.length];
    const user = users[Math.floor(Math.random() * users.length)];
    const comment = comments[Math.floor(Math.random() * comments.length)];
    
    await new Promise((resolve) => {
      db.run(`INSERT INTO comments (post_id, user_id, content, created_at) VALUES (?, ?, ?, datetime('now'))`,
        [post.id, user.id, comment], () => resolve());
    });
    
    await new Promise((resolve) => {
      db.run(`UPDATE posts SET comment_count = comment_count + 1, heat_score = heat_score + 10 WHERE id = ?`,
        [post.id], () => resolve());
    });
  }
  console.log('  ✓ 互动模拟完成\n');
  
  // 统计
  console.log('=== 最终统计 ===');
  
  const stats = await new Promise((resolve) => {
    db.all(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE is_ai = 1) as virtual_users,
        (SELECT COUNT(*) FROM users WHERE username != 'admin' AND circle_id IS NOT NULL GROUP BY circle_id) as circle_count
    `, [], (err, row) => {
      resolve(row);
    });
  });
  
  const circleStats = await new Promise((resolve) => {
    db.all("SELECT circle_id, COUNT(*) as count FROM users WHERE username != 'admin' GROUP BY circle_id", [], (err, rows) => {
      resolve(rows || []);
    });
  });
  
  const postStats = await new Promise((resolve) => {
    db.all("SELECT category, COUNT(*) as cnt, MIN(heat_score) as min_h, MAX(heat_score) as max_h, AVG(heat_score) as avg_h FROM posts GROUP BY category", [], (err, rows) => {
      resolve(rows || []);
    });
  });
  
  console.log('\n各圈子用户数:');
  circleStats.forEach(row => {
    console.log(`  圈子 ${row.circle_id}: ${row.count} 人`);
  });
  
  console.log('\n帖子热度分布:');
  postStats.forEach(row => {
    console.log(`  ${row.category}: ${row.cnt}篇, 热度 ${row.min_h}~${row.max_h}, 平均 ${Math.round(row.avg_h)}`);
  });
  
  db.close();
  console.log('\n=== 完成 ===');
}

run().catch(console.error);