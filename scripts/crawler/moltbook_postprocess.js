#!/usr/bin/env node
/**
 * Moltbook 后处理脚本：查重 + 自动标签
 * 处理已翻译但未查重/标签的内容
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/xiabook.db');

// 标签关键词体系
const TAG_KEYWORDS = {
  'AI': ['ai', 'agent', 'llm', 'model', '人工智能', '大模型', '智能体'],
  '编程': ['code', 'program', 'develop', '代码', '开发', '编程', 'script'],
  '技术': ['tech', 'technology', '技术', '科技', 'infrastructure', '系统'],
  '产品': ['app', 'product', 'user', '产品', '用户', 'interface', '体验'],
  '商业': ['business', 'company', 'invest', '商业', '投资', 'market', '市场'],
  '观点': ['think', 'opinion', 'thought', '观点', '思考', 'philosophy', '反思'],
  '问答': ['why', 'how', 'what', '为什么', '如何', 'question', '问题'],
  '安全': ['security', 'attack', 'vulnerability', '安全', '攻击', '漏洞'],
  '数据': ['data', 'database', 'analytics', '数据', '分析', 'metrics'],
  '工具': ['tool', 'utility', 'workflow', '工具', '效率', 'automation']
};

// 中文查重：提取标题关键词
function extractKeywords(title) {
  const chinese = title.match(/[\u4e00-\u9fa5]+/g) || [];
  return chinese.filter(w => w.length >= 2).slice(0, 3);
}

// 自动标签
function autoTagPost(title, content) {
  const text = (title + ' ' + content).toLowerCase();
  const tags = [];
  
  for (const [tag, keywords] of Object.entries(TAG_KEYWORDS)) {
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        if (!tags.includes(tag)) {
          tags.push(tag);
        }
        break;
      }
    }
  }
  
  if (tags.length === 0) {
    tags.push('科技');
  }
  
  return tags.slice(0, 5);
}

async function main() {
  console.log('[Moltbook 后处理] 开始执行...');
  
  const db = new sqlite3.Database(DB_PATH);
  
  // 查询需要处理的内容
  const sql = `
    SELECT id, translated_title, translated_content, title, content
    FROM moltbook_posts
    WHERE translated = 1
      AND (is_duplicate IS NULL OR tags IS NULL OR tags = '')
    ORDER BY id DESC
    LIMIT 100
  `;
  
  const posts = await new Promise((resolve, reject) => {
    db.all(sql, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
  
  console.log(`[Moltbook 后处理] 待处理：${posts.length} 条`);
  
  let processed = 0;
  let duplicates = 0;
  
  for (const post of posts) {
    const translatedTitle = post.translated_title || post.title;
    const translatedContent = post.translated_content || post.content;
    
    // 中文查重
    const keywords = extractKeywords(translatedTitle);
    let isDuplicate = false;
    
    if (keywords.length > 0) {
      const conditions = keywords.map(k => `translated_title LIKE '%${k}%' OR title LIKE '%${k}%'`).join(' OR ');
      const checkSql = `
        SELECT COUNT(*) as count FROM moltbook_posts
        WHERE (${conditions})
        AND id != ${post.id}
        AND type = 'featured'
      `;
      
      const result = await new Promise((resolve, reject) => {
        db.get(checkSql, [], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      isDuplicate = result.count > 0;
    }
    
    // 自动标签
    const tags = autoTagPost(translatedTitle, translatedContent);
    const tagsStr = tags.join(',');
    
    // 更新记录
    await new Promise((resolve, reject) => {
      const updateSql = `
        UPDATE moltbook_posts
        SET is_duplicate = ?,
            tags = ?,
            translated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      db.run(updateSql, [isDuplicate ? 1 : 0, tagsStr, post.id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // 写入 post_tags 表
    for (const tag of tags) {
      await new Promise((resolve, reject) => {
        const insertSql = `
          INSERT OR IGNORE INTO post_tags (post_id, tag_name, source)
          VALUES (?, ?, 'moltbook')
        `;
        db.run(insertSql, [post.id, tag], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    
    processed++;
    if (isDuplicate) duplicates++;
    
    if (processed % 10 === 0) {
      console.log(`[Moltbook 后处理] 进度：${processed}/${posts.length} (重复：${duplicates})`);
    }
  }
  
  console.log(`\n[Moltbook 后处理] 完成！`);
  console.log(`  处理：${processed} 条`);
  console.log(`  重复：${duplicates} 条`);
  console.log(`  唯一：${processed - duplicates} 条`);
  
  db.close();
}

main().catch(console.error);
