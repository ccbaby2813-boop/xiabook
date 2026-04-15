/**
 * 监控器 - 系统监控和告警 v2.0
 * 新增：系统资源监控、数据库监控、Prometheus指标
 */

const eventBus = require('./event-bus');
const taskQueue = require('./task-queue');
const axios = require('axios');
const os = require('os');
const fs = require('fs');

const API_BASE = 'http://localhost:3000/api';
const DB_PATH = '/home/admin/.openclaw/workspace/projects/xiabook/data/xiabook.db';

// 告警规则配置
const ALERT_RULES = {
  cpu_high: { threshold: 80, message: 'CPU使用率过高' },
  memory_high: { threshold: 80, message: '内存使用率过高' },
  disk_high: { threshold: 90, message: '磁盘使用率过高' },
  db_large: { threshold: 100, message: '数据库文件过大(>100MB)' },
  queue_backlog: { threshold: 50, message: '任务队列积压' },
  fail_rate_high: { threshold: 0.1, message: '任务失败率过高' }
};

class Monitor {
  constructor() {
    this.startTime = null;
    this.heartbeatInterval = null;
    this.metricsInterval = null;
    this.stats = {
      eventsReceived: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      errors: [],
      metrics: {
        cpu: [],
        memory: [],
        lastUpdated: null
      }
    };
    this.alertHistory = [];
    this.isAlertMuted = false;
  }

  /**
   * 启动监控
   */
  start() {
    this.startTime = new Date();
    console.log('[Monitor] 监控器已启动 v2.0');

    // 订阅所有事件
    this.subscribeEvents();

    // 心跳检测（每5分钟）
    this.heartbeatInterval = setInterval(() => {
      this.heartbeat();
    }, 5 * 60 * 1000);

    // 指标采集（每分钟）
    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, 60 * 1000);

    // 首次采集
    this.collectMetrics();
    this.heartbeat();
  }

  /**
   * 停止监控
   */
  stop() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    console.log('[Monitor] 监控器已停止');
  }

  /**
   * 采集系统指标
   */
  collectMetrics() {
    try {
      // CPU使用率
      const cpus = os.cpus();
      const cpuUsage = this.calculateCpuUsage(cpus);
      
      // 内存使用率
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const memoryUsage = ((totalMemory - freeMemory) / totalMemory) * 100;
      
      // 数据库大小
      let dbSize = 0;
      try {
        const stats = fs.statSync(DB_PATH);
        dbSize = stats.size / (1024 * 1024); // MB
      } catch (e) {}
      
      // 保存指标
      this.stats.metrics.cpu.push({ time: Date.now(), value: cpuUsage });
      this.stats.metrics.memory.push({ time: Date.now(), value: memoryUsage });
      this.stats.metrics.lastUpdated = new Date().toISOString();
      
      // 只保留最近60个数据点
      if (this.stats.metrics.cpu.length > 60) {
        this.stats.metrics.cpu.shift();
        this.stats.metrics.memory.shift();
      }
      
      // 检查告警阈值
      this.checkAlerts({ cpuUsage, memoryUsage, dbSize });
      
    } catch (e) {
      console.error('[Monitor] 指标采集失败:', e.message);
    }
  }

  /**
   * 计算CPU使用率
   */
  calculateCpuUsage(cpus) {
    let totalIdle = 0;
    let totalTick = 0;
    
    cpus.forEach(cpu => {
      for (let type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });
    
    const totalUsage = totalTick - totalIdle;
    return (totalUsage / totalTick) * 100;
  }

  /**
   * 检查告警阈值
   */
  checkAlerts(metrics) {
    if (this.isAlertMuted) return;
    
    // CPU告警
    if (metrics.cpuUsage > ALERT_RULES.cpu_high.threshold) {
      this.alert(`${ALERT_RULES.cpu_high.message}: ${metrics.cpuUsage.toFixed(1)}%`, 'warning');
    }
    
    // 内存告警
    if (metrics.memoryUsage > ALERT_RULES.memory_high.threshold) {
      this.alert(`${ALERT_RULES.memory_high.message}: ${metrics.memoryUsage.toFixed(1)}%`, 'warning');
    }
    
    // 数据库大小告警
    if (metrics.dbSize > ALERT_RULES.db_large.threshold) {
      this.alert(`${ALERT_RULES.db_large.message}: ${metrics.dbSize.toFixed(1)}MB`, 'warning');
    }
  }

  /**
   * 订阅事件
   */
  subscribeEvents() {
    // 任务完成
    eventBus.on('task.complete', ({ task, result }) => {
      this.stats.tasksCompleted++;
      this.log('INFO', `任务完成: ${task.type}`);
    });

    // 任务失败
    eventBus.on('task.fail', ({ task, error }) => {
      this.stats.tasksFailed++;
      this.log('ERROR', `任务失败: ${task.type} - ${error}`);
      this.addError(task.type, error);
    });

    // 调度器执行
    eventBus.on('scheduler.execute', ({ name, taskType }) => {
      this.log('INFO', `调度执行: ${name}`);
    });

    // 系统错误
    eventBus.on('system.error', (data) => {
      this.handleSystemError(data);
    });

    // 系统严重错误
    eventBus.on('system.critical', (data) => {
      this.handleCriticalError(data);
    });
  }

  /**
   * 心跳检测
   */
  async heartbeat() {
    const uptime = this.startTime ? Date.now() - this.startTime.getTime() : 0;
    const queueStats = taskQueue.getStats();

    const status = {
      status: 'running',
      uptime: Math.floor(uptime / 1000),
      stats: this.stats,
      queue: queueStats,
      timestamp: new Date().toISOString()
    };

    // 检查Web服务
    try {
      const res = await axios.get(`${API_BASE}/health`, { timeout: 5000 });
      status.webService = res.data.success ? 'ok' : 'error';
    } catch (e) {
      status.webService = 'offline';
      this.alert('Web服务不可用', 'warning');
    }

    console.log('[Monitor] 心跳:', JSON.stringify(status, null, 2));

    // 检查任务积压
    if (queueStats.pending > 50) {
      this.alert(`任务积压: ${queueStats.pending}个待处理`, 'warning');
    }

    // 检查失败率
    const total = this.stats.tasksCompleted + this.stats.tasksFailed;
    if (total > 10 && this.stats.tasksFailed / total > 0.1) {
      this.alert('任务失败率超过10%', 'warning');
    }

    return status;
  }

  /**
   * 处理系统错误
   */
  handleSystemError(data) {
    this.log('ERROR', `系统错误: ${JSON.stringify(data)}`);
    this.alert(data.message || '系统错误', 'error');
  }

  /**
   * 处理严重错误
   */
  handleCriticalError(data) {
    this.log('CRITICAL', `严重错误: ${JSON.stringify(data)}`);
    this.alert(data.message || '严重系统错误', 'critical');
  }

  /**
   * 发送告警
   */
  async alert(message, level = 'warning') {
    console.log(`[Monitor] 告警[${level}]: ${message}`);

    // 发送到飞书（通过 OpenClaw message tool）
    try {
      const { default: axios } = require('axios');
      // OpenClaw 内部 API
      const alertPayload = {
        level,
        message,
        time: new Date().toLocaleString('zh-CN'),
        source: 'XiaBrain'
      };
      
      // 写入告警日志文件（供外部读取）
      const fs = require('fs');
      const alertFile = '/home/admin/.openclaw/workspace/projects/xiabook/logs/alerts.log';
      const alertLine = JSON.stringify(alertPayload) + '\n';
      fs.appendFileSync(alertFile, alertLine);
      
      console.log('[Monitor] 告警已记录:', alertFile);
    } catch (e) {
      console.error('[Monitor] 告警记录失败:', e.message);
    }
  }

  /**
   * 记录日志
   */
  log(level, message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ${message}`);
  }

  /**
   * 添加错误记录
   */
  addError(type, error) {
    this.stats.errors.push({
      type,
      error,
      time: new Date().toISOString()
    });
    // 只保留最近100条
    if (this.stats.errors.length > 100) {
      this.stats.errors.shift();
    }
  }

  /**
   * 获取状态
   */
  getStatus() {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    
    return {
      status: 'running',
      startTime: this.startTime,
      uptime: this.startTime ? Math.floor((Date.now() - this.startTime.getTime()) / 1000) : 0,
      stats: this.stats,
      queue: taskQueue.getStats(),
      system: {
        cpu: this.stats.metrics.cpu.slice(-1)[0]?.value || 0,
        memory: this.stats.metrics.memory.slice(-1)[0]?.value || 0,
        totalMemory: Math.round(totalMemory / (1024 * 1024 * 1024) * 100) / 100, // GB
        freeMemory: Math.round(freeMemory / (1024 * 1024 * 1024) * 100) / 100, // GB
        platform: os.platform(),
        nodeVersion: process.version
      },
      alerts: {
        history: this.alertHistory.slice(-10),
        muted: this.isAlertMuted
      }
    };
  }

  /**
   * 获取 Prometheus 格式指标
   */
  getPrometheusMetrics() {
    const status = this.getStatus();
    const queue = status.queue;
    
    return `
# HELP xiabook_tasks_pending 待执行任务数
# TYPE xiabook_tasks_pending gauge
xiabook_tasks_pending ${queue.pending}

# HELP xiabook_tasks_running 执行中任务数
# TYPE xiabook_tasks_running gauge
xiabook_tasks_running ${queue.running}

# HELP xiabook_tasks_success 已完成任务数
# TYPE xiabook_tasks_success counter
xiabook_tasks_success ${queue.success}

# HELP xiabook_tasks_failed 失败任务数
# TYPE xiabook_tasks_failed counter
xiabook_tasks_failed ${queue.failed}

# HELP xiabook_cpu_usage CPU使用率
# TYPE xiabook_cpu_usage gauge
xiabook_cpu_usage ${status.system.cpu.toFixed(2)}

# HELP xiabook_memory_usage 内存使用率
# TYPE xiabook_memory_usage gauge
xiabook_memory_usage ${status.system.memory.toFixed(2)}

# HELP xiabook_uptime_seconds 运行时间(秒)
# TYPE xiabook_uptime_seconds gauge
xiabook_uptime_seconds ${status.uptime}
`.trim();
  }

  /**
   * 静默告警
   */
  muteAlerts(duration = 3600000) {
    this.isAlertMuted = true;
    console.log(`[Monitor] 告警已静默 ${duration / 60000} 分钟`);
    setTimeout(() => {
      this.isAlertMuted = false;
      console.log('[Monitor] 告警静默已解除');
    }, duration);
  }
}

// 单例
const monitor = new Monitor();

module.exports = monitor;