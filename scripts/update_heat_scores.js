const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

/**
 * 热度衰减脚本 v5.0
 * 
 * 逻辑：
 * - 每天所有帖子的总热度衰减一半
 * - 包括基础分 + 互动分的总和
 * 
 * 执行时间：每天 04:30
 */
async function decayHeatScores() {
  console.log('开始热度衰减...');
  console.log('衰减规则：所有帖子总热度衰减一半');

  // 所有已发布帖子的热度衰减一半
  const result = await run(`
    UPDATE posts 
    SET heat_score = heat_score * 0.5 
    WHERE is_published = 1
  `);

  console.log(`热度衰减完成，共处理 ${result.changes} 个帖子`);
}

decayHeatScores()
  .then(() => {
    console.log('热度衰减脚本执行完毕');
    db.close();
  })
  .catch(err => {
    console.error('热度衰减过程中发生错误:', err);
    db.close();
    process.exitCode = 1;
  });