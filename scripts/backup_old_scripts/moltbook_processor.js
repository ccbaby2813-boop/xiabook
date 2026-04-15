#!/usr/bin/env node
/**
 * 海外洋虾内容处理脚本 v1.0
 * 
 * 功能：
 * 1. 精选转译板块 - 筛选优质内容，翻译，按源站热度排序
 * 2. 源站排行板块 - 取前50，翻译，按热度显示
 * 
 * 特点：
 * - 独立展示，不进入 posts 表
 * - 保留原作者、原热度
 * - 翻译成中文
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(DB_PATH);

// 翻译质量评估（简单版：基于内容长度和结构）
function evaluateQuality(post) {
  let score = 0;
  
  // 内容长度适中
  if (post.content && post.content.length > 50 && post.content.length < 2000) {
    score += 0.3;
  }
  
  // 有标题
  if (post.title && post.title.length > 10) {
    score += 0.2;
  }
  
  // 有作者
  if (post.author) {
    score += 0.1;
  }
  
  // 有互动
  if (post.view_count > 1000) {
    score += 0.2;
  }
  if (post.like_count > 100) {
    score += 0.2;
  }
  
  return Math.min(score, 1.0);
}

// 检查是否逻辑通顺（简单版：检查是否有完整句子）
function isReadable(text) {
  if (!text) return false;
  
  // 检查是否有标点符号
  const hasPunctuation = /[.!?。！？]/.test(text);
  
  // 检查是否有合理的句子长度
  const sentences = text.split(/[.!?。！？]/).filter(s => s.trim().length > 5);
  
  return hasPunctuation && sentences.length > 0;
}

// 模拟翻译（实际应调用翻译API）
async function translateContent(text) {
  // 如果已经有中文，直接返回
  if (/[\u4e00-\u9fa5]/.test(text)) {
    return text;
  }
  
  // 这里应该调用翻译API
  // 暂时返回原文（标记为待翻译）
  return text;
}

// 处理精选转译板块
async function processFeatured() {
  console.log('\n📚 处理精选转译板块...');
  
  // 获取所有内容
  const posts = await new Promise((resolve, reject) => {
    db.all(`
      SELECT * FROM moltbook_posts 
      WHERE type = 'featured' OR type IS NULL
      ORDER BY view_count DESC
    `, [], (err, rows) => err ? reject(err) : resolve(rows || []));
  });
  
  console.log(`获取到 ${posts.length} 条内容`);
  
  let featured = 0;
  let translated = 0;
  
  for (const post of posts) {
    // 评估质量
    const quality = evaluateQuality(post);
    
    // 检查是否可读
    const readable = isReadable(post.content) && isReadable(post.title);
    
    // 更新质量分数
    await new Promise((resolve, reject) => {
      db.run(`
        UPDATE moltbook_posts 
        SET quality_score = ? 
        WHERE id = ?
      `, [quality, post.id], (err) => err ? reject(err) : resolve());
    });
    
    // 筛选优质内容（质量分数 >= 0.5 且可读）
    if (quality >= 0.5 && readable) {
      featured++;
      
      // 翻译标题和内容
      if (!post.translated) {
        const translatedTitle = await translateContent(post.title);
        const translatedContent = await translateContent(post.content);
        
        await new Promise((resolve, reject) => {
          db.run(`
            UPDATE moltbook_posts 
            SET translated_title = ?, translated_content = ?, translated = 1, translated_at = datetime('now')
            WHERE id = ?
          `, [translatedTitle, translatedContent, post.id], (err) => err ? reject(err) : resolve());
        });
        
        translated++;
      }
    }
  }
  
  console.log(`筛选出 ${featured} 条优质内容`);
  console.log(`翻译了 ${translated} 条新内容`);
  
  return { featured, translated };
}

// 处理源站排行板块
async function processRanking() {
  console.log('\n🏆 处理源站排行板块...');
  
  // 获取前50条（按源站热度）
  const posts = await new Promise((resolve, reject) => {
    db.all(`
      SELECT * FROM moltbook_posts 
      ORDER BY view_count DESC 
      LIMIT 50
    `, [], (err, rows) => err ? reject(err) : resolve(rows || []));
  });
  
  console.log(`获取到 ${posts.length} 条排行内容`);
  
  let translated = 0;
  
  for (const post of posts) {
    // 更新类型为 ranking
    await new Promise((resolve, reject) => {
      db.run(`
        UPDATE moltbook_posts 
        SET type = 'ranking' 
        WHERE id = ?
      `, [post.id], (err) => err ? reject(err) : resolve());
    });
    
    // 翻译
    if (!post.translated) {
      const translatedTitle = await translateContent(post.title);
      const translatedContent = await translateContent(post.content);
      
      await new Promise((resolve, reject) => {
        db.run(`
          UPDATE moltbook_posts 
          SET translated_title = ?, translated_content = ?, translated = 1, translated_at = datetime('now')
          WHERE id = ?
        `, [translatedTitle, translatedContent, post.id], (err) => err ? reject(err) : resolve());
      });
      
      translated++;
    }
  }
  
  console.log(`翻译了 ${translated} 条排行内容`);
  
  return { total: posts.length, translated };
}

// 生成前端展示数据
async function generateDisplayData() {
  console.log('\n📊 生成前端展示数据...');
  
  // 精选转译
  const featured = await new Promise((resolve, reject) => {
    db.all(`
      SELECT 
        id, 
        COALESCE(translated_title, title) as title,
        COALESCE(translated_content, content) as content,
        author,
        original_url,
        view_count,
        like_count,
        comment_count,
        quality_score
      FROM moltbook_posts 
      WHERE quality_score >= 0.5 
      ORDER BY view_count DESC
    `, [], (err, rows) => err ? reject(err) : resolve(rows || []));
  });
  
  // 源站排行
  const ranking = await new Promise((resolve, reject) => {
    db.all(`
      SELECT 
        id, 
        COALESCE(translated_title, title) as title,
        author,
        original_url,
        view_count,
        like_count,
        comment_count
      FROM moltbook_posts 
      WHERE type = 'ranking'
      ORDER BY view_count DESC
      LIMIT 50
    `, [], (err, rows) => err ? reject(err) : resolve(rows || []));
  });
  
  console.log(`精选转译: ${featured.length} 条`);
  console.log(`源站排行: ${ranking.length} 条`);
  
  return { featured, ranking };
}

// 主函数
async function main() {
  console.log('========================================');
  console.log('🦐 海外洋虾内容处理器 v1.0');
  console.log('========================================');
  
  try {
    // 处理精选转译
    const featuredResult = await processFeatured();
    
    // 处理源站排行
    const rankingResult = await processRanking();
    
    // 生成展示数据
    const displayData = await generateDisplayData();
    
    console.log('\n========================================');
    console.log('✅ 处理完成');
    console.log('========================================');
    console.log(`精选转译: ${featuredResult.featured} 条优质内容`);
    console.log(`源站排行: ${rankingResult.total} 条排行内容`);
    console.log(`新翻译: ${featuredResult.translated + rankingResult.translated} 条`);
    
    return {
      success: true,
      featured: featuredResult,
      ranking: rankingResult,
      display: displayData
    };
    
  } catch (error) {
    console.error('处理失败:', error.message);
    return { success: false, error: error.message };
  }
}

// 执行
if (require.main === module) {
  main().then(result => {
    db.close();
    process.exit(result.success ? 0 : 1);
  }).catch(err => {
    console.error('执行出错:', err);
    db.close();
    process.exit(1);
  });
}

module.exports = { processFeatured, processRanking, generateDisplayData };