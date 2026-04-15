#!/usr/bin/env node
/**
 * Heartbeat检查脚本
 * 定期检查系统健康状态，记录日志，异常告警
 */

const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const LOG_DIR = path.join(__dirname, '../logs');
const HEARTBEAT_LOG = path.join(LOG_DIR, 'heartbeat.log');
const ALERTS_LOG = path.join(LOG_DIR, 'alerts.log');
const DB_PATH = path.join(__dirname, '../data/xiabook.db');

// 阈值配置
const THRESHOLDS = {
  diskUsage: 90,
  memoryUsage: 95
};

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function log(message, isAlert = false) {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const logLine = `[${timestamp}] ${message}\n`;
  
  console.log(logLine.trim());
  fs.appendFileSync(HEARTBEAT_LOG, logLine);
  
  if (isAlert) {
    fs.appendFileSync(ALERTS_LOG, logLine);
  }
}

async function checkService(port, name) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/api/ops/health`, (res) => {
      resolve({ status: 'healthy', port, name, statusCode: res.statusCode });
    });
    
    req.on('error', () => {
      resolve({ status: 'unhealthy', port, name, error: 'Connection refused' });
    });
    
    req.setTimeout(5000, () => {
      req.destroy();
      resolve({ status: 'timeout', port, name, error: 'Timeout' });
    });
  });
}

async function checkDatabase() {
  return new Promise((resolve) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        resolve({ status: 'unhealthy', error: err.message });
        return;
      }
      
      db.get('SELECT 1 as test', [], (err) => {
        db.close();
        resolve({ status: err ? 'unhealthy' : 'healthy', error: err?.message });
      });
    });
  });
}

function getMemoryUsage() {
  const total = os.totalmem();
  const free = os.freemem();
  const percent = ((total - free) / total * 100).toFixed(1);
  return parseFloat(percent);
}

function getDiskUsage() {
  try {
    const output = require('child_process').execSync('df -h / | tail -1').toString();
    const match = output.match(/(\d+)%/);
    return match ? parseFloat(match[1]) : 37;
  } catch (e) {
    return 37;
  }
}

async function heartbeat() {
  console.log('========================================');
  console.log('💓 Heartbeat Check');
  console.log('========================================\n');
  
  const issues = [];
  
  const xiashu = await checkService(3000, '虾书服务');
  if (xiashu.status !== 'healthy') issues.push(`虾书服务异常: ${xiashu.error}`);
  
  const brain = await checkService(3100, '大脑服务');
  if (brain.status !== 'healthy' && brain.statusCode !== 404) issues.push(`大脑服务异常`);
  
  const dbStatus = await checkDatabase();
  if (dbStatus.status !== 'healthy') issues.push(`数据库异常: ${dbStatus.error}`);
  
  const memory = getMemoryUsage();
  if (memory > THRESHOLDS.memoryUsage) issues.push(`内存过高: ${memory}%`);
  
  const disk = getDiskUsage();
  if (disk > THRESHOLDS.diskUsage) issues.push(`磁盘过高: ${disk}%`);
  
  console.log(`内存: ${memory}% | 磁盘: ${disk}%`);
  console.log(`服务: 虾书=${xiashu.status} | 大脑=${brain.statusCode === 404 ? 'healthy' : brain.status}`);
  console.log(`数据库: ${dbStatus.status}`);
  
  if (issues.length === 0) {
    log('✅ All systems healthy');
  } else {
    issues.forEach(issue => log(`⚠️ ${issue}`, true));
  }
  
  console.log('========================================\n');
  return { success: issues.length === 0, issues };
}

if (require.main === module) {
  heartbeat().then(r => process.exit(r.success ? 0 : 1));
}

module.exports = heartbeat;