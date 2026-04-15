/**
 * 重新分配AI用户到圈子
 * 规则：每个圈子40个AI用户 + 10个人类空位
 */
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, '../data/xiabook.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('打开数据库失败:', err);
    process.exit(1);
  }
  console.log('数据库连接成功');
  run();
});

async function run() {
  return new Promise((resolve) => {
    // 获取所有AI用户
    db.all('SELECT id, username FROM users WHERE user_category = "ai_builtin" ORDER BY id', [], (err, aiUsers) => {
      if (err) { console.error(err); resolve(); return; }
      console.log(`总AI用户数: ${aiUsers.length}`);
      
      // 获取所有圈子
      db.all('SELECT id, name FROM circles ORDER BY id', [], (err, circles) => {
        if (err) { console.error(err); resolve(); return; }
        console.log(`总圈子数: ${circles.length}`);
        
        const AI_PER_CIRCLE = 40;
        const fullCircles = Math.floor(aiUsers.length / AI_PER_CIRCLE);
        const remaining = aiUsers.length % AI_PER_CIRCLE;
        
        console.log(`可满员圈子: ${fullCircles}个`);
        console.log(`剩余AI用户: ${remaining}个\n`);
        
        // 开始事务
        db.run('BEGIN TRANSACTION', (err) => {
          if (err) { console.error(err); resolve(); return; }
          
          let userIndex = 0;
          const updates = [];
          
          circles.forEach((circle, circleIndex) => {
            const assignCount = circleIndex < fullCircles ? AI_PER_CIRCLE : 
                                (circleIndex === fullCircles ? remaining : 0);
            
            for (let i = 0; i < assignCount && userIndex < aiUsers.length; i++) {
              updates.push({ userId: aiUsers[userIndex].id, circleId: circle.id });
              userIndex++;
            }
          });
          
          console.log(`需要更新: ${updates.length}个用户`);
          
          // 批量更新
          const stmt = db.prepare('UPDATE users SET circle_id = ? WHERE id = ?');
          let done = 0;
          
          updates.forEach(({ userId, circleId }) => {
            stmt.run(circleId, userId, (err) => {
              if (err) console.error('更新失败:', userId, err);
              done++;
              if (done === updates.length) {
                stmt.finalize();
                db.run('COMMIT', (err) => {
                  if (err) console.error(err);
                  verify();
                  resolve();
                });
              }
            });
          });
          
          if (updates.length === 0) {
            stmt.finalize();
            db.run('COMMIT');
            verify();
            resolve();
          }
        });
      });
    });
  });
}

function verify() {
  console.log('\n=== 分配结果验证 ===\n');
  db.all(`
    SELECT c.id, c.name, 
           COUNT(CASE WHEN u.user_category = 'ai_builtin' THEN 1 END) as ai_count,
           COUNT(CASE WHEN u.user_category LIKE 'human%' THEN 1 END) as human_count
    FROM circles c
    LEFT JOIN users u ON u.circle_id = c.id
    GROUP BY c.id
    ORDER BY c.id
  `, [], (err, results) => {
    if (err) { console.error(err); db.close(); return; }
    
    results.forEach(r => {
      const status = r.ai_count === 40 ? '✅' : (r.ai_count > 40 ? '❌超员' : (r.ai_count === 0 ? '⚪空' : '⚠️不满'));
      console.log(`${status} ${r.name}: AI=${r.ai_count}, 人类=${r.human_count}`);
    });
    
    db.close();
    console.log('\n✅ 分配完成');
  });
}