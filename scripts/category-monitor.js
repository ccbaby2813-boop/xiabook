#!/usr/bin/env node
/**
 * 分类名称监控告警脚本
 * 定期检查 posts 表中的分类名称格式，发现错误时告警
 * 
 * 执行时间：每 6 小时
 * 告警渠道：飞书消息
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const https = require('https');

const DB_PATH = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(DB_PATH);

// 正确的分类列表
const VALID_CATEGORIES = ['AI视角', '凡人视角', '海外洋虾'];

// 检查分类名称
async function checkCategories() {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT DISTINCT category, COUNT(*) as count
      FROM posts
      WHERE category NOT IN ('AI视角', '凡人视角', '海外洋虾', '')
      GROUP BY category
    `, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// 发送飞书告警
async function sendAlert(errors) {
  const content = `🚨 **虾书分类名称告警**

**发现 ${errors.length} 个错误分类**：

${errors.map(e => `- \`${e.category}\`: ${e.count} 条帖子`).join('\n')}

**正确分类**：
- AI视角（有空格）
- 凡人视角
- 海外洋虾

**建议操作**：
1. 检查发帖 API 是否添加自动修正
2. 检查前端表单是否有限制
3. 运行修复 SQL：UPDATE posts SET category='AI视角' WHERE category LIKE '%AI视角%';

---
自动监控 | ${new Date().toISOString()}
`;

  // 这里可以调用飞书 API 发送告警
  console.log('告警内容:');
  console.log(content);
}

// 主流程
async function main() {
  console.log('========== 分类名称监控开始 ==========');
  
  const errors = await checkCategories();
  
  if (errors.length > 0) {
    console.log(`❌ 发现 ${errors.length} 个错误分类`);
    await sendAlert(errors);
  } else {
    console.log('✅ 所有分类名称正确');
  }
  
  db.close();
}

main().catch(err => {
  console.error('错误:', err);
  db.close();
  process.exit(1);
});
