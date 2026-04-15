/**
 * 任务队列管理
 * 支持 add/process/getNext/list 方法
 * 任务优先级：P0-P3
 * 任务状态：pending/running/completed/failed
 */

const fs = require('fs');
const path = require('path');

const QUEUE_FILE = path.join(__dirname, 'data', 'task-queue.json');

class TaskQueue {
  constructor() {
    this.queue = [];
    this.history = [];
    this.stats = { success: 0, failed: 0 };
    this.load();
  }

  /**
   * 加载队列数据
   */
  load() {
    try {
      if (fs.existsSync(QUEUE_FILE)) {
        const data = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
        this.queue = data.queue || [];
        this.history = data.history || [];
        this.stats = data.stats || { success: 0, failed: 0 };
      }
    } catch (error) {
      console.error('加载任务队列失败:', error.message);
    }
  }

  /**
   * 保存队列数据
   */
  save() {
    try {
      const dir = path.dirname(QUEUE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(QUEUE_FILE, JSON.stringify({
        queue: this.queue,
        history: this.history.slice(-100), // 保留最近100条
        stats: this.stats
      }, null, 2));
    } catch (error) {
      console.error('保存任务队列失败:', error.message);
    }
  }

  /**
   * 添加任务
   * @param {string} type - 任务类型
   * @param {object} data - 任务数据
   * @param {number} priority - 优先级 (0-3, 0最高)
   * @param {object} options - 可选配置
   * @param {string[]} options.dependsOn - 依赖的任务ID列表
   * @param {string} options.group - 任务分组
   * @returns {object} - 任务对象
   */
  add(type, data, priority = 2, options = {}) {
    const task = {
      id: `t${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      data,
      priority: Math.min(3, Math.max(0, priority)),
      status: 'pending',
      createdAt: new Date().toISOString(),
      retries: 0,
      // 新增字段
      dependsOn: options.dependsOn || [],
      group: options.group || null,
      blockedBy: [] // 被哪些任务阻塞
    };
    
    // 检查依赖任务是否存在
    if (task.dependsOn.length > 0) {
      for (const depId of task.dependsOn) {
        const depTask = this.queue.find(t => t.id === depId);
        if (depTask && depTask.status !== 'completed') {
          task.blockedBy.push(depId);
        }
      }
      if (task.blockedBy.length > 0) {
        task.status = 'blocked';
        console.log(`[TaskQueue] 任务 ${task.id} 被阻塞，等待依赖: ${task.blockedBy.join(', ')}`);
      }
    }
    
    // 按优先级插入
    let inserted = false;
    for (let i = 0; i < this.queue.length; i++) {
      if (task.priority < this.queue[i].priority) {
        this.queue.splice(i, 0, task);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      this.queue.push(task);
    }
    
    this.save();
    console.log(`[TaskQueue] 添加任务: ${task.id} (${type}), 优先级: P${priority}`);
    return task;
  }

  /**
   * 获取下一个待执行任务
   * @returns {object|null}
   */
  getNext() {
    const task = this.queue.find(t => t.status === 'pending');
    if (task) {
      task.status = 'running';
      task.startedAt = new Date().toISOString();
      this.save();
    }
    return task || null;
  }

  /**
   * 标记任务完成
   * @param {string} taskId
   * @param {*} result
   */
  complete(taskId, result = null) {
    const index = this.queue.findIndex(t => t.id === taskId);
    if (index > -1) {
      const task = this.queue.splice(index, 1)[0];
      task.status = 'completed';
      task.result = result;
      task.completedAt = new Date().toISOString();
      this.history.push(task);
      this.stats.success++;
      
      // 解除依赖此任务的其他任务的阻塞
      this.unblockDependentTasks(taskId);
      
      this.save();
      console.log(`[TaskQueue] 任务完成: ${taskId}`);
    }
  }

  /**
   * 解除依赖任务阻塞
   * @param {string} completedTaskId - 完成的任务ID
   */
  unblockDependentTasks(completedTaskId) {
    for (const task of this.queue) {
      if (task.blockedBy.includes(completedTaskId)) {
        task.blockedBy = task.blockedBy.filter(id => id !== completedTaskId);
        if (task.blockedBy.length === 0) {
          task.status = 'pending';
          console.log(`[TaskQueue] 任务 ${task.id} 解除阻塞，状态变为 pending`);
        }
      }
    }
  }

  /**
   * 标记任务失败
   * @param {string} taskId
   * @param {string} error
   * @param {boolean} retry - 是否重试
   */
  fail(taskId, error, retry = true) {
    const task = this.queue.find(t => t.id === taskId);
    if (task) {
      task.error = error;
      task.retries++;
      
      if (retry && task.retries < 3) {
        task.status = 'pending';
        console.log(`[TaskQueue] 任务重试: ${taskId} (${task.retries}/3)`);
      } else {
        task.status = 'failed';
        task.failedAt = new Date().toISOString();
        this.queue = this.queue.filter(t => t.id !== taskId);
        this.history.push(task);
        this.stats.failed++;
        console.log(`[TaskQueue] 任务失败: ${taskId} - ${error}`);
      }
      this.save();
    }
  }

  /**
   * 获取队列列表
   * @param {string} status - 状态过滤
   * @returns {array}
   */
  list(status = null) {
    if (status) {
      return this.queue.filter(t => t.status === status);
    }
    return [...this.queue];
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      pending: this.queue.filter(t => t.status === 'pending').length,
      running: this.queue.filter(t => t.status === 'running').length,
      blocked: this.queue.filter(t => t.status === 'blocked').length,
      success: this.stats.success,
      failed: this.stats.failed,
      total: this.queue.length
    };
  }

  /**
   * 批量添加任务
   * @param {array} tasks - 任务数组 [{type, data, priority, options}]
   * @returns {array} - 添加的任务列表
   */
  addBatch(tasks) {
    const added = [];
    for (const t of tasks) {
      const task = this.add(t.type, t.data, t.priority || 2, t.options || {});
      added.push(task);
    }
    console.log(`[TaskQueue] 批量添加 ${added.length} 个任务`);
    return added;
  }

  /**
   * 取消任务
   * @param {string} taskId
   */
  cancel(taskId) {
    const index = this.queue.findIndex(t => t.id === taskId);
    if (index > -1) {
      const task = this.queue.splice(index, 1)[0];
      task.status = 'cancelled';
      task.cancelledAt = new Date().toISOString();
      this.history.push(task);
      this.save();
      console.log(`[TaskQueue] 任务取消: ${taskId}`);
      return true;
    }
    return false;
  }

  /**
   * 按分组获取任务
   * @param {string} group
   * @returns {array}
   */
  getByGroup(group) {
    return this.queue.filter(t => t.group === group);
  }

  /**
   * 取消分组内所有任务
   * @param {string} group
   * @returns {number} - 取消的任务数
   */
  cancelGroup(group) {
    const tasks = this.getByGroup(group);
    let count = 0;
    for (const task of tasks) {
      if (this.cancel(task.id)) {
        count++;
      }
    }
    console.log(`[TaskQueue] 取消分组 ${group} 的 ${count} 个任务`);
    return count;
  }
}

// 单例
const taskQueue = new TaskQueue();

module.exports = taskQueue;