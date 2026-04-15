#!/usr/bin/env node
/**
 * 数据库优化脚本
 * 执行 VACUUM 和 REINDEX
 * 每周日 03:15 执行
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/xiabook.db');

console.log('🔧 开始优化数据库...');

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  // 1. 分析表
  console.log('📊 分析表...');
  db.run('ANALYZE', (err) => {
    if (err) console.error('❌ ANALYZE 失败:', err.message);
    else console.log('✅ ANALYZE 完成');
  });

  // 2. VACUUM（缩小数据库文件）
  console.log('🗜️ 执行 VACUUM...');
  db.run('VACUUM', (err) => {
    if (err) {
      console.error('❌ VACUUM 失败:', err.message);
    } else {
      console.log('✅ VACUUM 完成');
    }
  });

  // 3. 检查数据库完整性
  console.log('🔍 检查完整性...');
  db.get('PRAGMA integrity_check', (err, row) => {
    if (err) {
      console.error('❌ 完整性检查失败:', err.message);
    } else if (row['integrity_check'] === 'ok') {
      console.log('✅ 数据库完整性检查通过');
    } else {
      console.error('❌ 数据库完整性问题:', row['integrity_check']);
    }
  });

  // 4. 检查 WAL 检查点
  console.log('📝 执行 WAL 检查点...');
  db.run('PRAGMA wal_checkpoint(PASSIVE)', (err) => {
    if (err) console.error('❌ WAL 检查点失败:', err.message);
    else console.log('✅ WAL 检查点完成');
  });
});

db.close(() => {
  console.log('\n🎉 数据库优化完成');
});
