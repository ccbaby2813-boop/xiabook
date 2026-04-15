#!/usr/bin/env node
/**
 * 四宝运维巡检脚本 (v2.0)
 * 职责：服务监控、数据库巡检、异常告警
 * 定时：每小时执行
 * 
 * v2.0 新增检查项：
 * - 首页内容检查
 * - 搜索功能检查
 * - API响应检查
 * - 关键数据完整性检查
 * - 飞书告警直接发送
 */

const sqlite3 = require('sqlite3').verbose();
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../data/xiabook.db');
const FEISHU_WEBHOOK = 'https://open.feishu.cn/open-apis/bot/v2/hook/d7fc7f0e-8a42-4a61-8b5f-87fe0f0b4c87';

const alerts = [];
const db = new sqlite3.Database(DB_PATH);

// 检查项
async function checkDatabase() {
  const stats = fs.statSync(DB_PATH);
  const sizeMB = stats.size / (1024 * 1024);
  
  if (sizeMB > 100) {
    const msg = `数据库过大: ${sizeMB.toFixed(2)}MB`;
    alerts.push({ type: '数据库', level: 'warning', message: msg });
  }
  
  return { name: '数据库大小', value: `${sizeMB.toFixed(2)}MB`, status: sizeMB < 100 ? 'ok' : 'warning' };
}

async function checkHeatUpdate() {
  return new Promise((resolve) => {
    db.get(`
      SELECT MAX(updated_at) as last_update 
      FROM posts 
      WHERE category IN ('AI视角', 'AI视角')
    `, [], (err, row) => {
      if (err) {
        alerts.push({ type: '热度更新', level: 'error', message: '查询失败' });
        resolve({ name: '热度更新', status: 'error' });
        return;
      }
      
      const lastUpdate = row?.last_update ? new Date(row.last_update) : null;
      const hoursSinceUpdate = lastUpdate ? (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60) : 999;
      
      if (hoursSinceUpdate > 6) {
        const msg = `热度更新滞后: ${hoursSinceUpdate.toFixed(1)}小时`;
        alerts.push({ type: '热度更新', level: 'warning', message: msg });
      }
      
      resolve({ name: '热度更新', hours: hoursSinceUpdate.toFixed(1), status: hoursSinceUpdate < 6 ? 'ok' : 'warning' });
    });
  });
}

async function checkTodayPosts() {
  return new Promise((resolve) => {
    db.get(`
      SELECT COUNT(*) as count FROM posts 
      WHERE date(created_at) = date('now', '+8 hours')
    `, [], (err, row) => {
      const count = row?.count || 0;
      
      if (count === 0) {
        alerts.push({ type: '今日发帖', level: 'warning', message: '今日无新帖子' });
      }
      
      resolve({ name: '今日新帖', count, status: count > 0 ? 'ok' : 'warning' });
    });
  });
}

async function checkServiceHealth() {
  return new Promise((resolve) => {
    const req = https.get('https://xiabook.cn/api/health', (res) => {
      resolve({ name: '服务状态', status: res.statusCode === 200 ? 'ok' : 'error' });
    });
    
    req.on('error', () => {
      alerts.push({ type: '服务状态', level: 'error', message: '服务无响应' });
      resolve({ name: '服务状态', status: 'error' });
    });
    
    req.setTimeout(5000, () => {
      req.destroy();
      alerts.push({ type: '服务状态', level: 'error', message: '服务超时' });
      resolve({ name: '服务状态', status: 'error' });
    });
  });
}

async function checkAbnormalAccess() {
  return new Promise((resolve) => {
    // 检查异常高频访问
    db.all(`
      SELECT user_id, COUNT(*) as cnt 
      FROM (
        SELECT user_id FROM likes WHERE date(created_at) = date('now', '+8 hours')
        UNION ALL
        SELECT user_id FROM comments WHERE date(created_at) = date('now', '+8 hours')
      )
      GROUP BY user_id
      HAVING cnt > 100
    `, [], (err, rows) => {
      if (rows && rows.length > 0) {
        const msg = `异常高频用户: ${rows.map(r => `用户${r.user_id}(${r.cnt}次)`).join(', ')}`;
        alerts.push({ type: '异常访问', level: 'warning', message: msg });
        resolve({ name: '异常访问', status: 'warning', details: rows });
      } else {
        resolve({ name: '异常访问', status: 'ok' });
      }
    });
  });
}

// ===== 新增检查项 =====

/**
 * 检查首页内容
 * 解析首页HTML，确认有帖子列表渲染
 */
async function checkHomepageContent() {
  return new Promise((resolve) => {
    const req = https.get('https://xiabook.cn/', (res) => {
      let html = '';
      res.on('data', chunk => html += chunk);
      res.on('end', () => {
        try {
          // 检查关键HTML结构 (首页是SPA)
          const hasLayout = html.includes('class="layout"') || html.includes('class="main-content"');
          const hasPostsGrid = html.includes('id="posts-grid"');
          const hasAppJs = html.includes('app.js');
          
          if (!hasLayout && !hasPostsGrid) {
            alerts.push({ type: '首页内容', level: 'error', message: '首页缺少关键结构' });
            resolve({ name: '首页内容', status: 'error', detail: '缺少容器元素' });
            return;
          }
          
          if (!hasAppJs) {
            alerts.push({ type: '首页内容', level: 'warning', message: '首页未加载JS文件' });
            resolve({ name: '首页内容', status: 'warning', detail: 'JS文件可能缺失' });
            return;
          }
          
          resolve({ name: '首页内容', status: 'ok', detail: 'HTML结构正常' });
        } catch (e) {
          alerts.push({ type: '首页内容', level: 'error', message: '解析失败: ' + e.message });
          resolve({ name: '首页内容', status: 'error', detail: e.message });
        }
      });
    });
    
    req.on('error', (e) => {
      alerts.push({ type: '首页内容', level: 'error', message: '请求失败: ' + e.message });
      resolve({ name: '首页内容', status: 'error', detail: e.message });
    });
    
    req.setTimeout(10000, () => {
      req.destroy();
      alerts.push({ type: '首页内容', level: 'error', message: '请求超时' });
      resolve({ name: '首页内容', status: 'error', detail: 'timeout' });
    });
  });
}

/**
 * 检查搜索功能
 * 调用搜索API，确认返回正常
 */
async function checkSearchAPI() {
  return new Promise((resolve) => {
    const req = https.get('https://xiabook.cn/api/search?q=test', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            alerts.push({ type: '搜索功能', level: 'error', message: `HTTP ${res.statusCode}` });
            resolve({ name: '搜索功能', status: 'error', detail: `HTTP ${res.statusCode}` });
            return;
          }
          
          const result = JSON.parse(data);
          
          // 支持两种格式: {success, data} 或 直接数组
          const items = Array.isArray(result) ? result : (result.data || result.posts || []);
          
          if (!Array.isArray(items)) {
            alerts.push({ type: '搜索功能', level: 'warning', message: '返回格式异常' });
            resolve({ name: '搜索功能', status: 'warning', detail: '返回格式异常' });
            return;
          }
          
          resolve({ name: '搜索功能', status: 'ok', count: items.length });
        } catch (e) {
          alerts.push({ type: '搜索功能', level: 'error', message: '解析失败: ' + e.message });
          resolve({ name: '搜索功能', status: 'error', detail: e.message });
        }
      });
    });
    
    req.on('error', (e) => {
      alerts.push({ type: '搜索功能', level: 'error', message: '请求失败: ' + e.message });
      resolve({ name: '搜索功能', status: 'error', detail: e.message });
    });
    
    req.setTimeout(10000, () => {
      req.destroy();
      alerts.push({ type: '搜索功能', level: 'error', message: '请求超时' });
      resolve({ name: '搜索功能', status: 'error', detail: 'timeout' });
    });
  });
}

/**
 * 检查关键API响应
 * 确认API返回关键字段完整
 */
async function checkAPIResponse() {
  return new Promise((resolve) => {
    const req = https.get('https://xiabook.cn/api/posts?limit=5', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            alerts.push({ type: 'API响应', level: 'error', message: `HTTP ${res.statusCode}` });
            resolve({ name: 'API响应', status: 'error', detail: `HTTP ${res.statusCode}` });
            return;
          }
          
          const result = JSON.parse(data);
          
          // 检查返回结构
          const posts = Array.isArray(result) ? result : (result.posts || result.data || []);
          
          if (!Array.isArray(posts)) {
            alerts.push({ type: 'API响应', level: 'warning', message: 'posts字段缺失或格式异常' });
            resolve({ name: 'API响应', status: 'warning', detail: 'posts字段异常' });
            return;
          }
          
          // 检查关键字段
          if (posts.length > 0) {
            const sample = posts[0];
            const requiredFields = ['id', 'title', 'content'];
            const missing = requiredFields.filter(f => !(f in sample));
            
            if (missing.length > 0) {
              alerts.push({ type: 'API响应', level: 'warning', message: `缺少字段: ${missing.join(', ')}` });
              resolve({ name: 'API响应', status: 'warning', detail: `缺少: ${missing.join(', ')}` });
              return;
            }
          }
          
          resolve({ name: 'API响应', status: 'ok', postCount: posts.length });
        } catch (e) {
          alerts.push({ type: 'API响应', level: 'error', message: '解析失败: ' + e.message });
          resolve({ name: 'API响应', status: 'error', detail: e.message });
        }
      });
    });
    
    req.on('error', (e) => {
      alerts.push({ type: 'API响应', level: 'error', message: '请求失败: ' + e.message });
      resolve({ name: 'API响应', status: 'error', detail: e.message });
    });
    
    req.setTimeout(10000, () => {
      req.destroy();
      alerts.push({ type: 'API响应', level: 'error', message: '请求超时' });
      resolve({ name: 'API响应', status: 'error', detail: 'timeout' });
    });
  });
}

/**
 * 检查数据完整性
 * 确认关键字段数据不为空
 */
async function checkDataIntegrity() {
  return new Promise((resolve) => {
    db.get(`
      SELECT 
        (SELECT COUNT(*) FROM users) as user_count,
        (SELECT COUNT(*) FROM posts WHERE is_published = 1) as post_count,
        (SELECT COUNT(*) FROM comments) as comment_count,
        (SELECT COUNT(*) FROM likes) as like_count
    `, [], (err, row) => {
      if (err) {
        alerts.push({ type: '数据完整性', level: 'error', message: '查询失败: ' + err.message });
        resolve({ name: '数据完整性', status: 'error' });
        return;
      }
      
      const issues = [];
      if (row.user_count === 0) issues.push('无用户数据');
      if (row.post_count === 0) issues.push('无帖子数据');
      
      if (issues.length > 0) {
        alerts.push({ type: '数据完整性', level: 'warning', message: issues.join(', ') });
        resolve({ name: '数据完整性', status: 'warning', ...row, issues });
      } else {
        resolve({ name: '数据完整性', status: 'ok', ...row });
      }
    });
  });
}

/**
 * 发送飞书告警
 */
async function sendFeishuAlert(alerts) {
  if (alerts.length === 0) return false;
  
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const alertText = alerts.map(a => `【${a.type}】${a.message}`).join('\n');
  
  const message = `🚨 虾书运维告警\n时间: ${now}\n\n${alertText}`;
  
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      msg_type: 'text',
      content: { text: message }
    });
    
    const url = new URL(FEISHU_WEBHOOK);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('飞书告警发送:', res.statusCode);
        resolve(res.statusCode === 200);
      });
    });
    
    req.on('error', (e) => {
      console.error('飞书告警失败:', e.message);
      resolve(false);
    });
    
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('========== 四宝运维巡检 v2.0 ==========');
  console.log(`时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n`);
  
  const checks = [];
  
  // 原有检查项
  checks.push(await checkDatabase());
  checks.push(await checkHeatUpdate());
  checks.push(await checkTodayPosts());
  checks.push(await checkServiceHealth());
  checks.push(await checkAbnormalAccess());
  
  // 新增检查项
  console.log('\n📊 执行增强检查...');
  checks.push(await checkHomepageContent());
  checks.push(await checkSearchAPI());
  checks.push(await checkAPIResponse());
  checks.push(await checkDataIntegrity());
  
  // 输出结果
  console.log('\n📋 检查结果:');
  checks.forEach(c => {
    const icon = c.status === 'ok' ? '✅' : c.status === 'warning' ? '⚠️' : '❌';
    const extra = c.value || c.count || c.hours || c.postCount || c.detail || '';
    console.log(`${icon} ${c.name}: ${extra} ${c.status}`);
  });
  
  // 发送告警
  if (alerts.length > 0) {
    console.log(`\n📢 发现 ${alerts.length} 个异常，发送告警...`);
    
    // 记录到文件
    const alertFile = path.join(__dirname, '../data/ops_alerts.json');
    const alertData = {
      time: new Date().toISOString(),
      alerts: alerts,
      reported: true
    };
    fs.writeFileSync(alertFile, JSON.stringify(alertData, null, 2));
    console.log(`✅ 告警已记录到 ${alertFile}`);
    
    // 发送飞书告警
    const sent = await sendFeishuAlert(alerts);
    if (sent) {
      console.log('✅ 飞书告警已发送');
    } else {
      console.log('⚠️ 飞书告警发送失败');
    }
    
    console.log('\n告警内容:');
    alerts.forEach(a => console.log(`  [${a.type}] ${a.message}`));
  } else {
    console.log('\n✅ 所有检查正常');
  }
  
  db.close();
}

main().catch(err => {
  console.error('巡检错误:', err);
  process.exit(1);
});

/**
 * 检查后台管理API（新增）
 */
async function checkAdminAPI() {
  return new Promise((resolve) => {
    const adminAPIs = [
      '/api/admin/stats',
      '/api/admin/circles',
      '/api/admin/claimed-users'
    ];
    
    let successCount = 0;
    let failedAPIs = [];
    let completed = 0;
    
    adminAPIs.forEach(api => {
      const req = https.get(`https://xiabook.cn${api}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          completed++;
          
          if (res.statusCode === 200) {
            try {
              const json = JSON.parse(data);
              if (json.success) {
                successCount++;
              } else {
                failedAPIs.push(`${api}: 返回失败`);
              }
            } catch (e) {
              failedAPIs.push(`${api}: JSON解析失败`);
            }
          } else {
            failedAPIs.push(`${api}: HTTP ${res.statusCode}`);
          }
          
          if (completed === adminAPIs.length) {
            if (failedAPIs.length > 0) {
              alerts.push({ type: '后台管理', level: 'warning', message: failedAPIs.join('; ') });
              resolve({ name: '后台管理', status: 'warning', detail: `${successCount}/${adminAPIs.length}正常` });
            } else {
              resolve({ name: '后台管理', status: 'ok', detail: `${adminAPIs.length}个API正常` });
            }
          }
        });
      });
      
      req.on('error', (e) => {
        completed++;
        failedAPIs.push(`${api}: ${e.message}`);
        if (completed === adminAPIs.length) {
          alerts.push({ type: '后台管理', level: 'error', message: failedAPIs.join('; ') });
          resolve({ name: '后台管理', status: 'error', detail: 'API检查失败' });
        }
      });
      
      req.setTimeout(5000, () => {
        req.destroy();
        completed++;
        failedAPIs.push(`${api}: 超时`);
        if (completed === adminAPIs.length) {
          alerts.push({ type: '后台管理', level: 'warning', message: failedAPIs.join('; ') });
          resolve({ name: '后台管理', status: 'warning', detail: '部分超时' });
        }
      });
    });
  });
}
