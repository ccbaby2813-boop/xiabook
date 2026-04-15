#!/usr/bin/env node

/**
 * 健康监控告警脚本
 * 检查服务状态、数据库连接、磁盘空间和内存使用情况
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');
const sqlite3 = require('sqlite3').verbose();

class HealthMonitor {
    constructor() {
        // 从环境变量或配置文件加载飞书Webhook URL
        this.feishuWebhookUrl = process.env.FEISHU_WEBHOOK_URL || this.loadConfig();
        this.alertThresholds = {
            diskUsage: 80,   // 磁盘使用率阈值 80%
            memoryUsage: 90  // 内存使用率阈值 90%
        };
    }

    /**
     * 加载配置文件中的飞书Webhook URL
     */
    loadConfig() {
        try {
            const configPath = path.join(__dirname, '../config/feishu.json');
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                return config.webhook_url;
            }
        } catch (error) {
            console.warn('无法加载飞书配置:', error.message);
        }
        
        // 尝试从环境变量加载
        return process.env.FEISHU_WEBHOOK_URL || null;
    }

    /**
     * 检查HTTP服务是否响应
     */
    async checkService(port, timeout = 5000) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            
            const check = () => {
                const client = port === 3000 ? http : http; // 都使用http，因为可能都是http服务
                const options = {
                    hostname: 'localhost',
                    port: port,
                    path: '/api/health',
                    method: 'GET',
                    timeout: timeout
                };

                const req = client.request(options, (res) => {
                    res.on('data', () => {}); // 消费响应数据
                    res.on('end', () => {
                        resolve({
                            status: 'healthy',
                            port: port,
                            statusCode: res.statusCode,
                            responseTime: Date.now() - startTime
                        });
                    });
                });

                req.on('error', (err) => {
                    resolve({
                        status: 'unhealthy',
                        port: port,
                        error: err.message,
                        responseTime: Date.now() - startTime
                    });
                });

                req.on('timeout', () => {
                    req.destroy();
                    resolve({
                        status: 'timeout',
                        port: port,
                        error: 'Request timeout',
                        responseTime: timeout
                    });
                });

                req.end();
            };

            // 设置超时重试机制
            setTimeout(check, 100);
        });
    }

    /**
     * 检查SQLite数据库连接
     */
    async checkDatabase() {
        try {
            const dbPath = path.join(__dirname, '../data/xiabook.db');
            
            if (!fs.existsSync(dbPath)) {
                return {
                    status: 'unhealthy',
                    error: '数据库文件不存在',
                    path: dbPath
                };
            }

            // 简单地尝试读取文件来验证是否存在
            const stats = fs.statSync(dbPath);

            // 使用 sqlite3 模块验证数据库
            return new Promise((resolve) => {
                const db = new sqlite3.Database(dbPath, (err) => {
                    if (err) {
                        resolve({
                            status: 'unhealthy',
                            error: err.message,
                            path: dbPath
                        });
                        return;
                    }

                    db.get('SELECT 1 as test', [], (err, row) => {
                        db.close();
                        if (err) {
                            resolve({
                                status: 'unhealthy',
                                error: err.message,
                                path: dbPath
                            });
                        } else {
                            resolve({
                                status: 'healthy',
                                path: dbPath,
                                size: stats.size,
                                lastModified: stats.mtime
                            });
                        }
                    });
                });
            });
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                path: path.join(__dirname, '../data/xiabook.db')
            };
        }
    }

    /**
     * 获取磁盘使用情况
     */
    getDiskUsage() {
        try {
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;
            const memUsagePercent = (usedMem / totalMem) * 100;

            // 获取根分区的磁盘使用情况（在Linux上）
            const diskStats = this.getDiskSpace('/');
            const diskUsagePercent = ((diskStats.total - diskStats.free) / diskStats.total) * 100;

            return {
                status: diskUsagePercent > this.alertThresholds.diskUsage ? 'warning' : 'healthy',
                total: diskStats.total,
                used: diskStats.total - diskStats.free,
                free: diskStats.free,
                usagePercent: Math.round(diskUsagePercent * 100) / 100
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message
            };
        }
    }

    /**
     * 获取指定路径的磁盘空间信息
     */
    getDiskSpace(path) {
        const execSync = require('child_process').execSync;
        try {
            const result = execSync(`df ${path}`, { encoding: 'utf8' });
            const lines = result.trim().split('\n');
            if (lines.length > 1) {
                const dataLine = lines[1].replace(/\s+/g, ' ');
                const parts = dataLine.split(' ');
                
                const size = parseInt(parts[1]) * 1024; // KB to bytes
                const used = parseInt(parts[2]) * 1024;  // KB to bytes
                const available = parseInt(parts[3]) * 1024; // KB to bytes
                
                return {
                    total: size,
                    used: used,
                    free: available
                };
            }
        } catch (error) {
            // 如果df命令失败，则使用OS信息作为备选
            return {
                total: os.totalmem(),
                used: os.totalmem() - os.freemem(),
                free: os.freemem()
            };
        }
    }

    /**
     * 获取内存使用情况
     */
    getMemoryUsage() {
        try {
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;
            const memUsagePercent = (usedMem / totalMem) * 100;

            return {
                status: memUsagePercent > this.alertThresholds.memoryUsage ? 'warning' : 'healthy',
                total: totalMem,
                used: usedMem,
                free: freeMem,
                usagePercent: Math.round(memUsagePercent * 100) / 100
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message
            };
        }
    }

    /**
     * 发送飞书告警消息
     */
    async sendFeishuAlert(message) {
        if (!this.feishuWebhookUrl) {
            console.warn('飞书Webhook URL未配置，跳过发送告警');
            return false;
        }

        const postData = JSON.stringify({
            msg_type: 'text',
            content: {
                text: message
            }
        });

        const url = new URL(this.feishuWebhookUrl);
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

        return new Promise((resolve) => {
            const req = (url.protocol === 'https:' ? https : http).request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    console.log('飞书告警发送结果:', res.statusCode, data);
                    resolve(res.statusCode === 200);
                });
            });

            req.on('error', (error) => {
                console.error('发送飞书告警失败:', error.message);
                resolve(false);
            });

            req.write(postData);
            req.end();
        });
    }

    /**
     * 运行健康检查
     */
    async runHealthCheck() {
        console.log('开始执行健康检查...');
        
        const results = {
            timestamp: new Date().toISOString(),
            checks: {}
        };

        // 检查虾书服务 (端口 3000)
        console.log('检查虾书服务 (端口 3000)...');
        results.checks.xiashu_service = await this.checkService(3000);
        console.log(`虾书服务状态: ${results.checks.xiashu_service.status}`);

        // 检查大脑服务 (端口 3100)
        console.log('检查大脑服务 (端口 3100)...');
        results.checks.brain_service = await this.checkService(3100);
        console.log(`大脑服务状态: ${results.checks.brain_service.status}`);

        // 检查数据库连接
        console.log('检查数据库连接...');
        results.checks.database = await this.checkDatabase();
        console.log(`数据库状态: ${results.checks.database.status}`);

        // 检查磁盘空间
        console.log('检查磁盘空间...');
        results.checks.disk_usage = this.getDiskUsage();
        console.log(`磁盘使用率: ${results.checks.disk_usage.usagePercent}%`);

        // 检查内存使用
        console.log('检查内存使用...');
        results.checks.memory_usage = this.getMemoryUsage();
        console.log(`内存使用率: ${results.checks.memory_usage.usagePercent}%`);

        // 检查是否有需要告警的情况
        const alerts = [];
        
        if (results.checks.xiashu_service.status !== 'healthy') {
            alerts.push(`虾书服务(3000)异常: ${results.checks.xiashu_service.error || results.checks.xiashu_service.status}`);
        }
        
        if (results.checks.brain_service.status !== 'healthy') {
            alerts.push(`大脑服务(3100)异常: ${results.checks.brain_service.error || results.checks.brain_service.status}`);
        }
        
        if (results.checks.database.status !== 'healthy') {
            alerts.push(`数据库异常: ${results.checks.database.error}`);
        }
        
        if (results.checks.disk_usage.status === 'warning') {
            alerts.push(`磁盘空间不足: 使用率${results.checks.disk_usage.usagePercent}% > 阈值${this.alertThresholds.diskUsage}%`);
        }
        
        if (results.checks.memory_usage.status === 'warning') {
            alerts.push(`内存使用过高: 使用率${results.checks.memory_usage.usagePercent}% > 阈值${this.alertThresholds.memoryUsage}%`);
        }

        // 发送告警
        if (alerts.length > 0) {
            for (const alert of alerts) {
                const message = `🚨 [告警] 服务异常 - ${alert}`;
                console.log('发送告警:', message);
                await this.sendFeishuAlert(message);
            }
        } else {
            console.log('所有检查项均正常');
        }

        // 输出最终结果
        console.log('\n健康检查结果:');
        console.log(JSON.stringify(results, null, 2));

        return results;
    }
}

// 主函数
async function main() {
    const monitor = new HealthMonitor();
    
    try {
        const results = await monitor.runHealthCheck();
        
        // 根据检查结果设置退出码
        const hasErrors = Object.values(results.checks).some(check => 
            check.status === 'unhealthy' || check.status === 'timeout' || check.status === 'error' || check.status === 'warning'
        );
        
        process.exit(hasErrors ? 1 : 0);
    } catch (error) {
        console.error('健康检查过程中发生错误:', error);
        process.exit(1);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    main();
}

module.exports = HealthMonitor;