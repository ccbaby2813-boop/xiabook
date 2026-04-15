const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');
const os = require('os');

// 创建日志目录
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// 日志文件路径
const heartbeatLog = path.join(logsDir, 'heartbeat.log');
const alertsLog = path.join(logsDir, 'alerts.log');

/**
 * 获取当前时间戳
 */
function getTimestamp() {
    const now = new Date();
    return `[${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}]`;
}

/**
 * 写入日志
 */
function writeLog(filePath, message) {
    const logEntry = `${getTimestamp()} ${message}\n`;
    fs.appendFileSync(filePath, logEntry);
    console.log(logEntry.trim());
}

/**
 * 检查端口是否可达
 */
async function checkPort(host, port) {
    return new Promise((resolve) => {
        const client = require('net').connect(port, host, () => {
            client.end();
            resolve(true);
        });

        client.on('error', () => {
            resolve(false);
        });

        // 设置超时
        setTimeout(() => {
            client.destroy();
            resolve(false);
        }, 5000);
    });
}

/**
 * 检查数据库连接
 */
function checkDatabase() {
    try {
        const dbPath = path.join(__dirname, '..', 'data', 'xiabook.db');
        if (fs.existsSync(dbPath)) {
            // 尝试连接SQLite数据库
            const Database = require('better-sqlite3');
            const db = new Database(dbPath);
            const result = db.prepare('SELECT 1').get();
            db.close();
            return true;
        }
        return false;
    } catch (error) {
        console.error('Database check error:', error.message);
        return false;
    }
}

/**
 * 检查磁盘空间
 */
function checkDiskSpace() {
    try {
        // 在Linux/Mac上使用df命令，在Windows上使用不同的方法
        if (process.platform === 'win32') {
            // Windows上的简单检查方法
            const totalmem = os.totalmem();
            const freemem = os.freemem();
            const usedmem = totalmem - freemem;
            const memoryUsagePercent = (usedmem / totalmem) * 100;
            return { usage: memoryUsagePercent, threshold: 90 };
        } else {
            // Linux/Mac使用df命令
            const diskInfo = execSync('df -h /', { encoding: 'utf8' });
            const lines = diskInfo.split('\n');
            const diskLine = lines.find(line => line.includes('%') && !line.includes('Filesystem'));
            
            if (diskLine) {
                const parts = diskLine.trim().split(/\s+/);
                const usageStr = parts[4];
                const usage = parseInt(usageStr.replace('%', ''));
                return { usage, threshold: 90 };
            }
            return { usage: 0, threshold: 90 };
        }
    } catch (error) {
        console.error('Disk space check error:', error.message);
        return { usage: 0, threshold: 90 };
    }
}

/**
 * 检查内存使用率
 */
function checkMemory() {
    const totalmem = os.totalmem();
    const freemem = os.freemem();
    const usedmem = totalmem - freemem;
    const memoryUsagePercent = (usedmem / totalmem) * 100;
    return { usage: memoryUsagePercent, threshold: 95 };
}

/**
 * 发送飞书Webhook通知
 */
async function sendFeishuAlert(message) {
    const webhookUrl = process.env.FEISHU_WEBHOOK_URL;
    
    if (!webhookUrl) {
        console.log('No FEISHU_WEBHOOK_URL configured, skipping notification');
        return;
    }

    const postData = JSON.stringify({
        msg_type: "text",
        content: {
            text: `🚨 系统告警: ${message}`
        }
    });

    return new Promise((resolve) => {
        const url = new URL(webhookUrl);
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = (url.protocol === 'https:' ? https : http).request(options, (res) => {
            res.on('data', () => {});
            res.on('end', resolve);
        });

        req.on('error', (e) => {
            console.error(`Failed to send Feishu alert: ${e.message}`);
            resolve();
        });

        req.write(postData);
        req.end();
    });
}

/**
 * 主检查函数
 */
async function performHealthCheck() {
    const results = [];
    
    // 检查端口
    const port3000Ok = await checkPort('localhost', 3000);
    const port3100Ok = await checkPort('localhost', 3100);
    
    if (!port3000Ok) {
        results.push('⚠️ Port 3000 is not responding');
    }
    
    if (!port3100Ok) {
        results.push('⚠️ Port 3100 is not responding');
    }
    
    // 检查数据库
    const dbOk = checkDatabase();
    if (!dbOk) {
        results.push('⚠️ Database connection failed');
    }
    
    // 检查磁盘空间
    const diskResult = checkDiskSpace();
    if (diskResult.usage > diskResult.threshold) {
        results.push(`⚠️ Disk usage: ${diskResult.usage}% (threshold: ${diskResult.threshold}%)`);
    }
    
    // 检查内存
    const memoryResult = checkMemory();
    if (memoryResult.usage > memoryResult.threshold) {
        results.push(`⚠️ Memory usage: ${memoryResult.usage.toFixed(2)}% (threshold: ${memoryResult.threshold}%)`);
    }
    
    // 根据结果记录日志
    if (results.length === 0) {
        writeLog(heartbeatLog, '✅ All systems healthy');
    } else {
        const alertMessage = results.join(', ');
        writeLog(alertsLog, alertMessage);
        
        // 发送飞书告警
        await sendFeishuAlert(alertMessage);
    }
    
    return results.length === 0;
}

/**
 * 运行单次检查（如果直接执行此脚本）
 */
if (require.main === module) {
    console.log('Starting health check...');
    performHealthCheck()
        .then(success => {
            console.log(success ? 'Health check completed successfully' : 'Health check detected issues');
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Health check failed:', error);
            writeLog(alertsLog, `❌ Health check failed: ${error.message}`);
            process.exit(1);
        });
}

module.exports = {
    performHealthCheck,
    checkPort,
    checkDatabase,
    checkDiskSpace,
    checkMemory
};