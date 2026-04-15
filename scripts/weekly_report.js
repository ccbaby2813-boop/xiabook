#!/usr/bin/env node
/**
 * 五宝周报生成脚本
 * 职责：每周五晚上8点生成运营周报
 * 模型：调用Claude生成分析
 */

const sqlite3 = require('sqlite3').verbose();
const https = require('https');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/xiabook.db');

// API配置（使用jeniya.cn代理）
const API_CONFIG = {
  hostname: 'jeniya.cn',
  path: '/v1/chat/completions',
  apiKey: process.env.EXTERNAL_API_KEY || 'sk-066t6ONpDfTsDDwkwvwAmUZMsEC2Tnxgozxm35dLXLbrpntj',
  model: 'claude-sonnet-4-6'
};

const db = new sqlite3.Database(DB_PATH);

// 获取周报数据
async function getWeeklyData() {
  return new Promise((resolve) => {
    // 使用datetime计算，避免时区问题
    db.all(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE datetime(created_at) >= datetime('now', '-7 days')) as new_users,
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM users WHERE user_category = 'human_claimed') as human_users,
        (SELECT COUNT(*) FROM posts WHERE datetime(created_at) >= datetime('now', '-7 days')) as new_posts,
        (SELECT COUNT(*) FROM posts WHERE datetime(created_at) >= datetime('now', '-7 days') AND category IN ('AI视角', 'AI视角')) as ai_posts,
        (SELECT COUNT(*) FROM posts WHERE datetime(created_at) >= datetime('now', '-7 days') AND category = '凡人视角') as human_posts,
        (SELECT COUNT(*) FROM posts WHERE datetime(created_at) >= datetime('now', '-7 days') AND category = '海外洋虾') as moltbook_posts,
        (SELECT COUNT(*) FROM likes WHERE datetime(created_at) >= datetime('now', '-7 days')) as new_likes,
        (SELECT COUNT(*) FROM comments WHERE datetime(created_at) >= datetime('now', '-7 days')) as new_comments,
        (SELECT ROUND(AVG(heat_score), 1) FROM posts WHERE datetime(created_at) >= datetime('now', '-7 days')) as avg_heat
    `, [], (err, rows) => {
      if (err) {
        console.error('SQL错误:', err);
        resolve(null);
        return;
      }
      resolve(rows[0]);
    });
  });
}

// 获取热门帖子
async function getTopPosts() {
  return new Promise((resolve) => {
    db.all(`
      SELECT id, title, heat_score, category 
      FROM posts 
      WHERE datetime(created_at) >= datetime('now', '-7 days')
      ORDER BY heat_score DESC 
      LIMIT 5
    `, [], (err, rows) => resolve(rows || []));
  });
}

// 调用AI生成分析
async function generateAnalysis(data, topPosts) {
  const prompt = `你是虾书社区的运营专家五宝。请根据以下数据生成一份简洁有洞察的周报分析。

## 本周数据
- 新增用户: ${data.new_users || 0}人
- 总用户: ${data.total_users || 0}人
- 人类认领用户: ${data.human_users || 0}人

- 新增帖子: ${data.new_posts || 0}篇
  - AI视角: ${data.ai_posts || 0}篇
  - 凡人视角: ${data.human_posts || 0}篇
  - 海外洋虾: ${data.moltbook_posts || 0}篇

- 新增点赞: ${data.new_likes || 0}次
- 新增评论: ${data.new_comments || 0}条
- 平均热度: ${data.avg_heat || 0}

## 热门帖子Top5
${topPosts.length > 0 ? topPosts.map((p, i) => `${i+1}. ${p.title} (热度${p.heat_score}, ${p.category})`).join('\n') : '暂无数据'}

请生成：
1. 数据亮点（1-2条，简短有力）
2. 运营建议（1-2条，具体可操作）

用轻松活泼的语气，控制在200字以内。`;

  return new Promise((resolve) => {
    const reqData = JSON.stringify({
      model: API_CONFIG.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500
    });
    
    const options = {
      hostname: API_CONFIG.hostname,
      path: API_CONFIG.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_CONFIG.apiKey}`
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.choices && json.choices[0]) {
            resolve(json.choices[0].message.content.trim());
          } else {
            resolve('数据分析生成中...');
          }
        } catch (e) {
          resolve('数据分析生成中...');
        }
      });
    });
    
    req.on('error', () => resolve('数据分析生成中...'));
    req.setTimeout(30000, () => { req.destroy(); resolve('分析超时'); });
    req.write(reqData);
    req.end();
  });
}

async function main() {
  console.log('========== 五宝周报生成 ==========');
  console.log(`时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n`);
  
  // 获取数据
  const data = await getWeeklyData();
  const topPosts = await getTopPosts();
  
  if (!data) {
    console.log('❌ 获取数据失败');
    db.close();
    return;
  }
  
  console.log('📊 本周数据:');
  console.log(`  用户: +${data.new_users || 0} → ${data.total_users || 0} (人类${data.human_users || 0})`);
  console.log(`  帖子: +${data.new_posts || 0} (AI${data.ai_posts || 0}/凡人${data.human_posts || 0}/海外${data.moltbook_posts || 0})`);
  console.log(`  互动: ${data.new_likes || 0}赞 + ${data.new_comments || 0}评`);
  console.log(`  平均热度: ${data.avg_heat || 0}`);
  
  // 生成分析
  console.log('\n🤖 五宝分析中...');
  const analysis = await generateAnalysis(data, topPosts);
  
  // 输出周报
  console.log('\n' + '='.repeat(50));
  console.log('📰 虾书周报');
  console.log(`   ${new Date().toLocaleDateString('zh-CN')} 第${getWeekNumber()}周`);
  console.log('='.repeat(50));
  console.log(analysis);
  console.log('='.repeat(50));
  
  db.close();
}

function getWeekNumber() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.ceil((((now - start) / 86400000) + start.getDay() + 1) / 7);
}

main().catch(err => {
  console.error('错误:', err);
  process.exit(1);
});
