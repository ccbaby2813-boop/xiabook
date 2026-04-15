#!/usr/bin/env node
/**
 * 飞书自动上传助手
 * 自动检测新备份文件并上传到飞书云盘
 * 
 * 使用方式：
 * 1. 手动执行：node scripts/auto_upload.js
 * 2. 定时执行：在 crontab 中配置
 */

const fs = require('fs');
const path = require('path');

const CONFIG = {
    backupDir: '/home/admin/.openclaw/workspace/projects/xiabook/backups',
    backupDocToken: 'MxnbdrQWuo5jI8xSjSBcKY4wnxd',
    historyFile: '/home/admin/.openclaw/workspace/projects/xiabook/logs/backup_history.json'
};

console.log('========================================');
console.log('☁️  飞书自动上传助手');
console.log('========================================');
console.log(`⏰ 时间: ${new Date().toISOString()}`);
console.log('');

// 检查备份目录
if (!fs.existsSync(CONFIG.backupDir)) {
    console.log('❌ 备份目录不存在');
    process.exit(1);
}

// 获取所有备份文件
const backupFiles = fs.readdirSync(CONFIG.backupDir)
    .filter(f => f.endsWith('.tar.gz'))
    .sort()
    .reverse();

console.log(`📦 发现 ${backupFiles.length} 个备份文件`);
console.log('');

// 检查备份历史
let history = [];
if (fs.existsSync(CONFIG.historyFile)) {
    history = JSON.parse(fs.readFileSync(CONFIG.historyFile, 'utf8'));
}

// 找出未上传的文件
const uploadedFiles = history
    .filter(h => h.upload_status === 'uploaded')
    .map(h => h.file);

const pendingFiles = backupFiles.filter(f => !uploadedFiles.includes(f));

if (pendingFiles.length === 0) {
    console.log('✅ 所有备份文件已上传');
    console.log('========================================');
    process.exit(0);
}

console.log(`📤 待上传文件: ${pendingFiles.length} 个`);
pendingFiles.forEach(f => {
    const filePath = path.join(CONFIG.backupDir, f);
    const stats = fs.statSync(filePath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`   - ${f} (${sizeMB} MB)`);
});
console.log('');

// 输出上传指令
console.log('📋 上传指令：');
console.log('');
pendingFiles.forEach(f => {
    const filePath = path.join(CONFIG.backupDir, f);
    console.log(`feishu_doc action=upload_file doc_token=${CONFIG.backupDocToken} file_path=${filePath}`);
});
console.log('');

console.log('========================================');
console.log('💡 将以上指令复制给陈小宝执行');
console.log('========================================');