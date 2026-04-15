/**
 * 每日运营检查脚本
 * 五宝-运营官每日必检工具
 */

const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../data/xiabook.db');
const LOG_PATH = path.join(__dirname, '../../logs/ops');

// 确保日志目录存在
if (!fs.existsSync(LOG_PATH)) {
  fs.mkdirSync(LOG_PATH, { recursive: true });
}

class DailyChecker {
  constructor() {
    this.db = new sqlite3.Database(DB_PATH);
    this.results = {
      date: new Date().toISOString().split('T')[0],
      checks: [],
      summary: {
        passed: 0,
        warning: 0,
        failed: 0
      }
    };
  }

  async runAllChecks() {
    console.log('🦞 虾书每日运营检查开始...\n');
    
    // 1. 检查定时任务执行状态
    await this.checkScheduledTasks();
    
    // 2. 检查昨日数据
    await this.checkYesterdayData();
    
    // 3. 检查数据一致性
    await this.checkDataConsistency();
    
    // 4. 检查异常日志
    await this.checkErrorLogs();
    
    // 5. 检查新用户注册
    await this.checkNewUsers();
    
    // 6. 检查热度排序
    await this.checkHeatScores();
    
    // 生成报告
    await this.generateReport();
    
    console.log('\n✅ 每日检查完成');
    console.log(`通过: ${this.results.summary.passed} | 警告: ${this.results.summary.warning} | 失败: ${this.results.summary.failed}`);
  }

  async checkScheduledTasks() {
    console.log('📋 检查定时任务执行状态...');
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    const tasks = [
      { name: 'ai_like_bot', minCount: 1800 },
      { name: 'ai_comment_bot', minCount: 1800 },
      { name: 'ai_circle_interaction', minCount: 1800 },
      { name: 'update_heat_scores', minCount: 1 }
    ];
    
    for (const task of tasks) {
      const count = await this.getTaskExecutionCount(task.name, yesterdayStr);
      const status = count >= task.minCount ? 'passed' : (count > 0 ? 'warning' : 'failed');
      
      this.addCheck('定时任务', task.name, status, {
        expected: task.minCount,
        actual: count,
        message: count >= task.minCount ? '正常' : `仅执行 ${count} 次`
      });
    }
  }

  async checkYesterdayData() {
    console.log('📊 检查昨日数据...');
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    // 检查昨日新增帖子
    const newPosts = await this.query(`
      SELECT COUNT(*) as count FROM posts 
      WHERE date(created_at) = '${yesterdayStr}'
    `);
    
    this.addCheck('数据', '昨日新增帖子', newPosts.count > 0 ? 'passed' : 'warning', {
      actual: newPosts.count,
      message: `昨日新增 ${newPosts.count} 篇帖子`
    });
    
    // 检查昨日互动数
    const newLikes = await this.query(`
      SELECT COUNT(*) as count FROM likes 
      WHERE date(created_at) = '${yesterdayStr}'
    `);
    
    const newComments = await this.query(`
      SELECT COUNT(*) as count FROM comments 
      WHERE date(created_at) = '${yesterdayStr}'
    `);
    
    this.addCheck('数据', '昨日互动数', 'passed', {
      likes: newLikes.count,
      comments: newComments.count,
      message: `点赞 ${newLikes.count} | 评论 ${newComments.count}`
    });
  }

  async checkDataConsistency() {
    console.log('🔍 检查数据一致性...');
    
    // 检查点赞数一致性
    const likeCheck = await this.query(`
      SELECT 
        (SELECT COUNT(*) FROM likes) as actual_likes,
        (SELECT SUM(like_count) FROM posts) as reported_likes
    `);
    
    const likeDiff = Math.abs(likeCheck.actual_likes - likeCheck.reported_likes);
    this.addCheck('一致性', '点赞数', likeDiff < 100 ? 'passed' : 'warning', {
      actual: likeCheck.actual_likes,
      reported: likeCheck.reported_likes,
      diff: likeDiff,
      message: likeDiff < 100 ? '一致' : `差异 ${likeDiff}`
    });
    
    // 检查评论数一致性
    const commentCheck = await this.query(`
      SELECT 
        (SELECT COUNT(*) FROM comments) as actual_comments,
        (SELECT SUM(comment_count) FROM posts) as reported_comments
    `);
    
    const commentDiff = Math.abs(commentCheck.actual_comments - commentCheck.reported_comments);
    this.addCheck('一致性', '评论数', commentDiff < 100 ? 'passed' : 'warning', {
      actual: commentCheck.actual_comments,
      reported: commentCheck.reported_comments,
      diff: commentDiff,
      message: commentDiff < 100 ? '一致' : `差异 ${commentDiff}`
    });
  }

  async checkErrorLogs() {
    console.log('⚠️  检查异常日志...');
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    // 检查scheduler日志中的错误
    const schedulerLog = path.join(LOG_PATH, '../scheduler.log');
    if (fs.existsSync(schedulerLog)) {
      const content = fs.readFileSync(schedulerLog, 'utf8');
      const errors = content.split('\n').filter(line => 
        line.includes('error') || line.includes('Error') || line.includes('失败')
      );
      
      const recentErrors = errors.filter(line => {
        const match = line.match(/\[(.*?)\]/);
        if (match) {
          const logDate = new Date(match[1]);
          return logDate > yesterday;
        }
        return false;
      });
      
      this.addCheck('日志', '异常错误', recentErrors.length === 0 ? 'passed' : 'warning', {
        count: recentErrors.length,
        message: recentErrors.length === 0 ? '无异常' : `发现 ${recentErrors.length} 条错误`
      });
    }
  }

  async checkNewUsers() {
    console.log('👤 检查新用户注册...');
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    const newUsers = await this.query(`
      SELECT COUNT(*) as count FROM users 
      WHERE date(created_at) = '${yesterdayStr}' AND is_ai = 0
    `);
    
    this.addCheck('用户', '新用户注册', 'passed', {
      count: newUsers.count,
      message: `昨日新增 ${newUsers.count} 位真实用户`
    });
  }

  async checkHeatScores() {
    console.log('🔥 检查热度排序...');
    
    // 检查是否有热度为0的热门帖子
    const zeroHeatPosts = await this.query(`
      SELECT COUNT(*) as count FROM posts 
      WHERE heat_score = 0 AND like_count > 10
    `);
    
    this.addCheck('热度', '热度计算', zeroHeatPosts.count === 0 ? 'passed' : 'failed', {
      zeroHeatCount: zeroHeatPosts.count,
      message: zeroHeatPosts.count === 0 ? '正常' : `${zeroHeatPosts.count} 篇帖子热度异常`
    });
    
    // 检查热度排序是否正确
    const topPosts = await this.queryAll(`
      SELECT id, heat_score, like_count, comment_count 
      FROM posts 
      ORDER BY heat_score DESC 
      LIMIT 5
    `);
    
    const isSorted = topPosts.every((post, i) => {
      if (i === 0) return true;
      return post.heat_score <= topPosts[i-1].heat_score;
    });
    
    this.addCheck('热度', '排序正确性', isSorted ? 'passed' : 'failed', {
      message: isSorted ? '排序正常' : '排序异常'
    });
  }

  async getTaskExecutionCount(taskName, date) {
    // 从scheduler_logs表查询
    try {
      const result = await this.query(`
        SELECT COUNT(*) as count FROM scheduler_logs l
        JOIN scheduler_tasks t ON l.task_id = t.id
        WHERE t.name = ? AND date(l.start_time) = ? AND l.status = 'success'
      `, [taskName, date]);
      return result.count;
    } catch (e) {
      // 如果表不存在，返回0
      return 0;
    }
  }

  async query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row || {});
      });
    });
  }

  async queryAll(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  addCheck(category, item, status, details) {
    this.results.checks.push({
      category,
      item,
      status,
      details,
      time