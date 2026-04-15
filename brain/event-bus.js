/**
 * 事件总线 - 发布订阅模式
 * 支持 on/emit/off 方法
 * 事件类型：user.register, user.post, user.comment, crawler.done, daily.tick
 */
class EventBus {
  constructor() {
    this.events = {};
  }

  /**
   * 订阅事件
   * @param {string} eventName - 事件名称
   * @param {Function} callback - 回调函数
   */
  on(eventName, callback) {
    if (!this.events[eventName]) {
      this.events[eventName] = [];
    }
    this.events[eventName].push(callback);
  }

  /**
   * 发布事件
   * @param {string} eventName - 事件名称
   * @param {*} data - 传递的数据
   */
  emit(eventName, data) {
    if (this.events[eventName]) {
      this.events[eventName].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event handler for ${eventName}:`, error);
        }
      });
    }
  }

  /**
   * 取消订阅事件
   * @param {string} eventName - 事件名称
   * @param {Function} callback - 要移除的回调函数
   */
  off(eventName, callback) {
    if (this.events[eventName]) {
      const index = this.events[eventName].indexOf(callback);
      if (index > -1) {
        this.events[eventName].splice(index, 1);
      }
    }
  }

  /**
   * 移除所有指定事件的监听器
   * @param {string} eventName - 事件名称
   */
  removeAllListeners(eventName) {
    if (this.events[eventName]) {
      delete this.events[eventName];
    }
  }
}

// 创建全局事件总线实例
const eventBus = new EventBus();

module.exports = eventBus;