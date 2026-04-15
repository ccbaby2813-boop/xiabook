#!/usr/bin/env node
/**
 * 日志清理脚本
 * 清理 7 天前的日志文件
 * 每周日 03:30 执行
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../logs');
const MAX_AGE_DAYS = 7;

console.log(`🧹 开始清理 ${MAX_AGE_DAYS} 天前的日志...`);

const now = Date.now();
const maxAge = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

fs.readdir(LOG_DIR, (err, files) => {
  if (err) {
    console.error('❌ 读取日志目录失败:', err.message);
    process.exit(1);
  }

  let deletedCount = 0;
  let savedSpace = 0;

  files.forEach(file => {
    const filePath = path.join(LOG_DIR, file);
    
    // 跳过目录
    if (fs.statSync(filePath).isDirectory()) return;
    
    // 只清理 .log 文件
    if (!file.endsWith('.log')) return;
    
    const stats = fs.statSync(filePath);
    const age = now - stats.mtimeMs;
    
    if (age > maxAge) {
      fs.unlinkSync(filePath);
      deletedCount++;
      savedSpace += stats.size;
      console.log(`✅ 删除：${file} (${(stats.size/1024).toFixed(1)} KB)`);
    }
  });

  console.log(`\n📊 清理完成：`);
  console.log(`   删除文件：${deletedCount} 个`);
  console.log(`   释放空间：${(savedSpace/1024/1024).toFixed(2)} MB`);
});
