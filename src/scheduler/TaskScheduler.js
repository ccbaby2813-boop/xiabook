/**
 * 虾书自研任务调度系统
 * 不依赖Linux Cron，内嵌在Node.js服务中运行
 */

const logger = require('../utils/logger');
const { db } = require('../db/database');
const path = require('path');
const { fork } = require('child_process');
const fs = require('fs');

const LOG_PATH = path.join(__dirname, '../../logs/scheduler.log');

class TaskScheduler {
  constructor() {
    this.db = db;
    this.tasks = new Map();
    this.running = false;
    this.checkInterval = null;
  }

  async init() {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS scheduler_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        script_path TEXT NOT NULL,
        schedule TEXT NOT NULL,
        last_run DATETIME,
        last_status TEXT,
        last_output TEXT,
        enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS scheduler_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER,
        start_time DATETIME,
        end_time DATETIME,
        status TEXT,
        output TEXT,
        error TEXT,
        FOREIGN KEY (task_id) REFERENCES scheduler_tasks(id)
      );
    `);
    this.log('调度器初始化完成');
  }

  async registerTask(name, scriptPath, schedule, enabled = 1) {
    const stmt = this.db.prepare(`
      INSERT INTO scheduler_tasks (name, script_path, schedule, enabled)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        script_path=excluded.script_path,
        schedule=excluded.schedule,
        enabled=excluded.enabled
    `);
    await new Promise((resolve, reject) => {
      stmt.run(name, scriptPath, schedule, enabled, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    stmt.finalize();
    this.log(`任务注册: ${name} -> ${scriptPath} (${schedule}) enabled=${enabled}`);
  }

  async loadTasks() {
    this.tasks.clear();
    const tasks = await new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM scheduler_tasks WHERE enabled = 1', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    for (const task of tasks) {
      this.tasks.set(task.name, task);
    }

    this.log(`加载了 ${tasks.length} 个任务`);
  }

  matchCronField(expr, value) {
    if (expr === '*') return true;
    return expr.split(',').some(part => {
      const item = part.trim();
      if (/^\d+$/.test(item)) return value === parseInt(item, 10);
      if (/^\*\/\d+$/.test(item)) {
        const step = parseInt(item.slice(2), 10);
        return value % step === 0;
      }
      if (/^\d+-\d+$/.test(item)) {
        const [start, end] = item.split('-').map(n => parseInt(n, 10));
        return value >= start && value <= end;
      }
      return false;
    });
  }

  shouldRun(task, now = new Date()) {
    const parts = task.schedule.split(' ');
    if (parts.length !== 5) return false;

    const [minuteExpr, hourExpr, domExpr, monthExpr, dowExpr] = parts;

    if (!this.matchCronField(minuteExpr, now.getMinutes())) return false;
    if (!this.matchCronField(hourExpr, now.getHours())) return false;
    if (!this.matchCronField(domExpr, now.getDate())) return false;
    if (!this.matchCronField(monthExpr, now.getMonth() + 1)) return false;
    if (!this.matchCronField(dowExpr, now.getDay())) return false;

    return true;
  }

  async executeTask(task) {
    const startTime = new Date();
    await this.updateTaskStatus(task.id, 'running');
    this.log(`开始执行任务: ${task.name}`);

    return new Promise((resolve) => {
      const child = fork(task.script_path, [], {
        cwd: path.dirname(task.script_path),
        silent: true
      });

      let output = '';
      let error = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        error += data.toString();
      });

      child.on('close', async (code) => {
        const endTime = new Date();
        const status = code === 0 ? 'success' : 'failed';
        await this.logExecution(task.id, startTime, endTime, status, output, error);
        await this.updateTaskStatus(task.id, status, output || error);
        this.log(`任务完成: ${task.name} (${status})`);
        resolve({ status, output, error });
      });
    });
  }

  async updateTaskStatus(taskId, status, output = null) {
    const sql = output
      ? 'UPDATE scheduler_tasks SET last_run = CURRENT_TIMESTAMP, last_status = ?, last_output = ? WHERE id = ?'
      : 'UPDATE scheduler_tasks SET last_run = CURRENT_TIMESTAMP, last_status = ? WHERE id = ?';

    await new Promise((resolve, reject) => {
      if (output) {
        this.db.run(sql, [status, output, taskId], (err) => err ? reject(err) : resolve());
      } else {
        this.db.run(sql, [status, taskId], (err) => err ? reject(err) : resolve());
      }
    });
  }

  async logExecution(taskId, startTime, endTime, status, output, error) {
    await new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO scheduler_logs (task_id, start_time, end_time, status, output, error) VALUES (?, ?, ?, ?, ?, ?)',
        [taskId, startTime.toISOString(), endTime.toISOString(), status, output, error],
        (err) => err ? reject(err) : resolve()
      );
    });
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.log('调度器启动');
    this.checkInterval = setInterval(() => {
      this.checkAndRunTasks();
    }, 60000);
    this.checkAndRunTasks();
  }

  stop() {
    this.running = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.log('调度器停止');
  }

  async checkAndRunTasks() {
    const now = new Date();
    for (const [name, task] of this.tasks) {
      if (this.shouldRun(task, now)) {
        if (task.last_run) {
          const lastRun = new Date(task.last_run);
          const minutesSinceLastRun = (now - lastRun) / 60000;
          if (minutesSinceLastRun < 1) continue;
        }
        this.executeTask(task).catch(err => {
          this.log(`任务执行错误: ${name} - ${err.message}`);
        });
      }
    }
  }

  async getTaskStatus() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT name, last_run, last_status, schedule, enabled FROM scheduler_tasks', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async getLogs(taskName, limit = 50) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT l.* FROM scheduler_logs l
         JOIN scheduler_tasks t ON l.task_id = t.id
         WHERE t.name = ?
         ORDER BY l.start_time DESC
         LIMIT ?`,
        [taskName, limit],
        (err, rows) => err ? reject(err) : resolve(rows)
      );
    });
  }

  log(message) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}\n`;
    logger.info(logLine.trim());
    fs.appendFileSync(LOG_PATH, logLine);
  }
}

module.exports = TaskScheduler;
