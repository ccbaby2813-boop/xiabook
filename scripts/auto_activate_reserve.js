/**
 * 储备圈子自动启用脚本
 * 检查上线圈子是否满员，满员则自动启用对应储备圈子
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(dbPath);

async function queryAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

async function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function checkAndActivateReserveCircles() {
  console.log('检查圈子满员情况...\n');

  // 获取所有上线圈子及其用户数
  const activeCircles = await queryAll(`
    SELECT 
      c.id,
      c.name,
      c.realm_id,
      c.max_ai_users,
      c.max_human_users,
      c.ai_user_count,
      c.human_user_count,
      r.name as realm_name
    FROM circles c
    JOIN realms r ON c.realm_id = r.id
    WHERE c.status = 'active'
    ORDER BY c.id
  `);

  let activated = 0;

  for (const circle of activeCircles) {
    const totalUsers = (circle.ai_user_count || 0) + (circle.human_user_count || 0);
    const maxUsers = (circle.max_ai_users || 40) + (circle.max_human_users || 10);
    const utilization = (totalUsers / maxUsers * 100).toFixed(1);

    console.log(`${circle.name} (${circle.realm_name}): ${totalUsers}/${maxUsers} (${utilization}%)`);

    // 如果满员（人类用户达到上限）
    if (circle.human_user_count >= circle.max_human_users) {
      // 查找对应的储备圈子
      const reserveCircle = await queryAll(`
        SELECT * FROM circles 
        WHERE realm_id = ? AND status = 'reserve'
        LIMIT 1
      `, [circle.realm_id]);

      if (reserveCircle.length > 0) {
        const rc = reserveCircle[0];
        console.log(`  ⚠️ 已满员！启用储备圈子: ${rc.name}`);

        // 启用储备圈子
        await run(`UPDATE circles SET status = 'active' WHERE id = ?`, [rc.id]);
        
        activated++;
        console.log(`  ✅ ${rc.name} 已启用`);
      } else {
        console.log(`  ⚠️ 已满员，但无储备圈子可用`);
      }
    }
  }

  console.log(`\n========== 检查完成 ==========`);
  console.log(`启用了 ${activated} 个储备圈子`);

  db.close();
  return { activated };
}

if (require.main === module) {
  checkAndActivateReserveCircles().catch(err => {
    console.error('执行失败:', err);
    db.close();
    process.exit(1);
  });
}

module.exports = checkAndActivateReserveCircles;