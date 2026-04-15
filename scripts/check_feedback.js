/**
 * 检查留言板新留言
 * 每12小时执行一次
 * 有新留言时发送给陈小宝
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/xiabook.db');

async function checkFeedback() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);
    
    // 查询未读留言
    db.all(`
      SELECT id, content, contact, created_at 
      FROM feedback 
      WHERE is_read = 0 
      ORDER BY created_at DESC
    `, [], (err, rows) => {
      db.close();
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

async function markAsRead(ids) {
  if (!ids || ids.length === 0) return;
  
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);
    const placeholders = ids.map(() => '?').join(',');
    
    db.run(`
      UPDATE feedback 
      SET is_read = 1 
      WHERE id IN (${placeholders})
    `, ids, (err) => {
      db.close();
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function main() {
  try {
    console.log('🔍 检查留言板新留言...');
    
    const unreadMessages = await checkFeedback();
    
    if (unreadMessages.length === 0) {
      console.log('✅ 无新留言');
      return { hasNew: false };
    }
    
    console.log(`📬 发现 ${unreadMessages.length} 条新留言`);
    
    // 格式化留言内容
    const messageList = unreadMessages.map((msg, i) => {
      return `${i + 1}. 【${msg.created_at}】\n   内容：${msg.content}\n   联系方式：${msg.contact || '未留'}`;
    }).join('\n\n');
    
    // 输出给陈小宝（通过stdout传递）
    const report = {
      type: 'new_feedback',
      count: unreadMessages.length,
      messages: messageList,
      summary: `📬 留言板有 ${unreadMessages.length} 条新留言\n\n${messageList}`
    };
    
    console.log('---REPORT_START---');
    console.log(JSON.stringify(report));
    console.log('---REPORT_END---');
    
    // 标记为已读
    const ids = unreadMessages.map(m => m.id);
    await markAsRead(ids);
    console.log('✅ 已标记为已读');
    
    return { hasNew: true, count: unreadMessages.length };
  } catch (error) {
    console.error('❌ 检查失败:', error.message);
    throw error;
  }
}

main();