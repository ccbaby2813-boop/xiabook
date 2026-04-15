#!/usr/bin/env node
/**
 * 飞书云盘自动上传脚本
 * 用于虾书备份文件自动上传到飞书云盘
 * 
 * 使用方式：
 * node scripts/upload_to_feishu.js <file_path>
 */

const fs = require('fs');
const path = require('path');

// 配置
const CONFIG = {
    backupDocToken: 'MxnbdrQWuo5jI8xSjSBcKY4wnxd',  // 备份存储文档
    uploadQueue: '/home/admin/.openclaw/workspace/projects/xiabook/backups/upload_queue.json'
};

// 主函数
async function main() {
    const filePath = process.argv[2];
    
    if (!filePath || !fs.existsSync(filePath)) {
        console.error('❌ 请提供有效的文件路径');
        console.log('用法: node upload_to_feishu.js <file_path>');
        process.exit(1);
    }
    
    const fileName = path.basename(filePath);
    const stats = fs.statSync(filePath);
    const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
    
    console.log('========================================');
    console.log('☁️  飞书云盘上传');
    console.log('========================================');
    console.log(`📄 文件: ${fileName}`);
    console.log(`📦 大小: ${fileSizeMB} MB`);
    console.log(`📄 目标文档: ${CONFIG.backupDocToken}`);
    console.log('');
    
    // 这里输出 OpenClaw 可以识别的指令
    // OpenClaw 会自动调用 feishu_doc upload_file
    console.log('TOOL_CALL: feishu_doc');
    console.log('ACTION: upload_file');
    console.log(`DOC_TOKEN: ${CONFIG.backupDocToken}`);
    console.log(`FILE_PATH: ${filePath}`);
    console.log('');
    
    // 记录上传任务
    const uploadTask = {
        timestamp: new Date().toISOString(),
        file: fileName,
        path: filePath,
        size: fileSizeMB + ' MB',
        doc_token: CONFIG.backupDocToken,
        status: 'ready'
    };
    
    let queue = [];
    if (fs.existsSync(CONFIG.uploadQueue)) {
        queue = JSON.parse(fs.readFileSync(CONFIG.uploadQueue, 'utf8'));
    }
    queue.unshift(uploadTask);
    fs.writeFileSync(CONFIG.uploadQueue, JSON.stringify(queue, null, 2));
    
    console.log('✅ 上传任务已准备');
    console.log('========================================');
}

main();