#!/usr/bin/env node
/**
 * 清理 api.js 中的重复 admin 路由
 * 保留 admin.js 作为唯一管理后台入口
 */

const fs = require('fs');
const path = require('path');

const API_FILE = path.join(__dirname, '../src/routes/api.js');
const BACKUP_FILE = path.join(__dirname, '../src/routes/api.js.backup.before_cleanup');

console.log('🔍 开始清理 api.js 中的重复 admin 路由...');

// 读取文件
let content = fs.readFileSync(API_FILE, 'utf8');

// 备份
fs.copyFileSync(API_FILE, BACKUP_FILE);
console.log('✅ 已创建备份：api.js.backup.before_cleanup');

// 统计清理前的路由数
const beforeCount = (content.match(/router\.(get|post|put|delete)\(['"]\/admin/g) || []).length;
console.log(`📊 清理前 admin 路由数：${beforeCount}`);

// 删除 ADMIN_CONFIG 定义（第 1772 行附近）
const adminConfigMatch = content.match(/const ADMIN_CONFIG = \{[\s\S]*?ipWhitelist: \[[\s\S]*?\][\s\S]*?\};/);
if (adminConfigMatch) {
  content = content.replace(adminConfigMatch[0], '// ADMIN_CONFIG 已移除，统一使用 adminAuth.js 的 ADMIN_CREDENTIALS');
  console.log('✅ 已删除 ADMIN_CONFIG 定义');
}

// 删除 sessions 定义（如果有）
if (content.includes('const sessions = new Map();')) {
  content = content.replace(/const sessions = new Map\(\);[\r\n]*/g, '');
  console.log('✅ 已删除 sessions 定义');
}

// 删除 admin 相关函数
const functionsToRemove = [
  'checkIPWhitelist',
  'logAction',
  'adminAuth',
];

functionsToRemove.forEach(funcName => {
  const funcRegex = new RegExp(`function ${funcName}\\([\\s\\S]*?^\\}`, 'gm');
  if (funcRegex.test(content)) {
    content = content.replace(funcRegex, `// ${funcName} 已移除，统一使用 adminAuth.js`);
    console.log(`✅ 已删除 ${funcName} 函数`);
  }
});

// 删除 admin 路由（保留必要的注释）
const adminRoutesToRemove = [
  "router.post('/admin/login'",
  "router.get('/admin/users'",
  "router.get('/admin/circles'",
  "router.get('/admin/stats'",
  "router.get('/admin/posts'",
  "router.get('/admin/comments'",
  "router.delete('/admin/comments/:id'",
  "router.get('/admin/realms'",
  "router.get('/admin/realms/:realmId/circles'",
  "router.get('/admin/circles/:circleId/users'",
  "router.get('/admin/users/all'",
  "router.get('/admin/brain'",
  "router.post('/admin/broadcast'",
  "router.get('/admin/broadcast/history'",
  "router.get('/admin/search/posts'",
  "router.get('/admin/search/users'",
  "router.get('/admin/users/:id/full'",
  "router.post('/admin/users'",
  "router.put('/admin/users/:id'",
  "router.delete('/admin/users/:id'",
  "router.get('/admin/claimed-users/:id/behaviors'",
  "router.post('/admin/users/:id/reset-apikey'",
  "router.post('/admin/users/batch-circle'",
  "router.post('/admin/circles'",
  "router.put('/admin/circles/:id'",
  "router.delete('/admin/circles/:id'",
  "router.post('/admin/circles/:id/activate'",
  "router.post('/admin/circles/:id/reserve'",
  "router.post('/admin/events/trigger'",
  "router.get('/admin/events/logs'",
  "router.post('/admin/logout'",
  "router.get('/admin/logs'",
  "router.get('/admin/session'",
];

let removedCount = 0;
adminRoutesToRemove.forEach(route => {
  const routeRegex = new RegExp(`//.*${route.replace(/[\/\-:]/g, '\\$&')}[\\s\\S]*?(?=router\\.(get|post|put|delete)\\(|$)`, 'g');
  if (routeRegex.test(content)) {
    content = content.replace(routeRegex, '');
    removedCount++;
  }
});

console.log(`✅ 已删除 ${removedCount} 个 admin 路由定义`);

// 统计清理后的路由数
const afterCount = (content.match(/router\.(get|post|put|delete)\(['"]\/admin/g) || []).length;
console.log(`📊 清理后 admin 路由数：${afterCount}`);

// 写回文件
fs.writeFileSync(API_FILE, content, 'utf8');
console.log('✅ 文件已更新');

console.log('\n🎉 清理完成！');
console.log(`   删除路由：${beforeCount - afterCount} 个`);
console.log(`   备份文件：${BACKUP_FILE}`);
console.log('\n⚠️  请重启服务器并测试管理后台功能！');
