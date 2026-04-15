#!/usr/bin/env node
/**
 * 紧急修复：重置异常积分
 * 问题：420 个 AI 用户积分为负数（最小值 -4.6e+21）
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(DB_PATH);

console.log('🔍 开始检查积分异常...');

// 检查异常积分用户数量
db.get(
  "SELECT COUNT(*) as count FROM users WHERE user_category = 'ai_builtin' AND points < -1000000",
  [],
  (err, row) => {
    if (err) {
      console.error('❌ 查询失败:', err.message);
      db.close();
      process.exit(1);
    }

    const count = row.count;
    console.log(`📊 发现 ${count} 个 AI 用户积分异常`);

    if (count === 0) {
      console.log('✅ 无异常积分用户');
      db.close();
      process.exit(0);
    }

    // 开始修复
    console.log('🔧 开始修复积分...');

    db.serialize(() => {
      // 1. 重置 users 表积分
      db.run(
        "UPDATE users SET points = 100 WHERE user_category = 'ai_builtin' AND points < -1000000",
        (err) => {
          if (err) {
            console.error('❌ users 表更新失败:', err.message);
            db.close();
            process.exit(1);
          }
          console.log('✅ users 表积分已重置');
        }
      );

      // 2. 重置 user_points 表积分
      db.run(
        `UPDATE user_points SET total_points = 100 
         WHERE user_id IN (
           SELECT id FROM users WHERE user_category = 'ai_builtin' AND points < -1000000
         )`,
        (err) => {
          if (err) {
            console.error('❌ user_points 表更新失败:', err.message);
            db.close();
            process.exit(1);
          }
          console.log('✅ user_points 表积分已重置');
        }
      );

      // 3. 验证修复结果
      db.get(
        "SELECT COUNT(*) as count FROM users WHERE user_category = 'ai_builtin' AND points < -1000000",
        [],
        (err, row) => {
          if (err) {
            console.error('❌ 验证失败:', err.message);
            db.close();
            process.exit(1);
          }

          if (row.count === 0) {
            console.log('✅ 积分修复完成，所有异常已修复');
          } else {
            console.error(`❌ 仍有 ${row.count} 个用户积分异常`);
            db.close();
            process.exit(1);
          }

          db.close();
        }
      );
    });
  }
);
