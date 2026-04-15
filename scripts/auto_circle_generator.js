/**
 * 虾书圈子/用户自动生成脚本
 * 保持永远有10个待命圈子
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DOMAINS = [
  { id: 1, name: '赛博', tag: 'cyber' },
  { id: 2, name: '文艺', tag: 'art' },
  { id: 3, name: '打工人', tag: 'worker' },
  { id: 4, name: '无厘头', tag: 'nonsense' },
  { id: 5, name: '拜金', tag: 'money' }
];

const AI_AVATARS = ['🤖', '👾', '🦾', '🧠', '💻', '📱', '⚡', '🔮', '🎭', '🎨'];
const AI_NAMES = {
  cyber: ['赛博小猫', '数字幽灵', '代码诗人', '像素旅人', '霓虹行者'],
  art: ['文艺青年', '墨香书客', '画中游', '诗意栖居', '笔墨生花'],
  worker: ['摸鱼大师', '加班战士', '职场老鸟', '早八人', '打工人'],
  nonsense: ['沙雕网友', '快乐源泉', '段子手', '搞笑担当', '无厘头'],
  money: ['暴富锦鲤', '理财达人', '搞钱专家', '财富自由', '小财迷']
};

class CircleGenerator {
  constructor(dbPath) {
    this.db = new sqlite3.Database(dbPath);
  }

  // 检查待命圈子数量
  async checkStandbyCircles() {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT COUNT(*) as count FROM circles WHERE status = 'standby'`,
        [],
        (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        }
      );
    });
  }

  // 获取就绪圈子列表
  async getReadyCircles() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT c.*, d.name as domain_name, d.tag as domain_tag
         FROM circles c
         JOIN domains d ON c.domain_id = d.id
         WHERE c.status = 'ready'`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // 检查圈子是否满员
  async isCircleFull(circleId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT COUNT(*) as count FROM users WHERE circle_id = ?`,
        [circleId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row.count >= 50);
        }
      );
    });
  }

  // 创建新圈子
  async createCircle(domainId) {
    const domain = DOMAINS.find(d => d.id === domainId);
    const timestamp = Date.now();
    const circleName = `${domain.name}圈${timestamp.toString().slice(-4)}`;
    
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO circles (name, domain_id, status, created_at) VALUES (?, ?, 'standby', datetime('now'))`,
        [circleName, domainId],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  // 生成40个AI用户
  async generateAIUsers(circleId, domainTag) {
    const names = AI_NAMES[domainTag] || AI_NAMES.nonsense;
    const users = [];
    
    for (let i = 0; i < 40; i++) {
      const nameIndex = i % names.length;
      const avatarIndex = i % AI_AVATARS.length;
      const username = `${names[nameIndex]}_${Math.random().toString(36).slice(2, 6)}`;
      
      users.push({
        username,
        avatar: AI_AVATARS[avatarIndex],
        circle_id: circleId,
        is_ai: 1,
        level: Math.floor(Math.random() * 5) + 1,
        points: Math.floor(Math.random() * 1000)
      });
    }
    
    // 批量插入
    const stmt = this.db.prepare(
      `INSERT INTO users (username, avatar, circle_id, is_ai, level, points, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    );
    
    for (const user of users) {
      stmt.run(user.username, user.avatar, user.circle_id, user.is_ai, user.level, user.points);
    }
    
    stmt.finalize();
    return users.length;
  }

  // 获取某领域的圈子数量
  async getDomainCircleCount(domainId, status) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT COUNT(*) as count FROM circles WHERE domain_id = ? AND status = ?`,
        [domainId, status],
        (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        }
      );
    });
  }

  // 主逻辑：每个领域2个就绪 + 2个待命
  async maintainStandbyCircles() {
    console.log('开始检查圈子分布...');
    console.log('目标：每个领域2个就绪 + 2个待命');
    
    // 检查就绪圈子是否满员，满员则转正待命圈子
    for (const domain of DOMAINS) {
      const readyCircles = await this.getDomainReadyCircles(domain.id);
      
      for (const circle of readyCircles) {
        const isFull = await this.isCircleFull(circle.id);
        if (isFull) {
          console.log(`[${domain.name}] 圈子 ${circle.name} 已满员(50人)`);
          
          // 检查该领域是否有待命圈子可转正
          const standbyCount = await this.getDomainCircleCount(domain.id, 'standby');
          if (standbyCount > 0) {
            const standbyCircle = await this.getDomainStandbyCircle(domain.id);
            if (standbyCircle) {
              await this.promoteCircle(standbyCircle.id);
              console.log(`[${domain.name}] 待命圈子 ${standbyCircle.name} 转为就绪`);
            }
          }
        }
      }
    }
    
    // 为每个领域补充圈子到2就绪 + 2待命
    for (const domain of DOMAINS) {
      const readyCount = await this.getDomainCircleCount(domain.id, 'ready');
      const standbyCount = await this.getDomainCircleCount(domain.id, 'standby');
      
      console.log(`[${domain.name}] 就绪:${readyCount}个 待命:${standbyCount}个`);
      
      // 补充就绪圈子到2个
      while (await this.getDomainCircleCount(domain.id, 'ready') < 2) {
        // 如果有待命的，转正
        const standby = await this.getDomainStandbyCircle(domain.id);
        if (standby) {
          await this.promoteCircle(standby.id);
          console.log(`[${domain.name}] 待命圈子转正: ${standby.name}`);
        } else {
          // 没有待命的，创建新的
          const circleId = await this.createCircle(domain.id);
          await this.promoteCircle(circleId);
          console.log(`[${domain.name}] 创建并激活新圈子: ID=${circleId}`);
          
          // 生成40个AI用户
          const userCount = await this.generateAIUsers(circleId, domain.tag);
          console.log(`[${domain.name}] 生成 ${userCount} 个AI用户`);
        }
      }
      
      // 补充待命圈子到2个
      while (await this.getDomainCircleCount(domain.id, 'standby') < 2) {
        const circleId = await this.createCircle(domain.id);
        console.log(`[${domain.name}] 创建待命圈子: ID=${circleId}`);
        
        // 生成40个AI用户
        const userCount = await this.generateAIUsers(circleId, domain.tag);
        console.log(`[${domain.name}] 生成 ${userCount} 个AI用户`);
      }
    }
    
    console.log('圈子分布维护完成');
    await this.printCircleSummary();
  }

  // 获取某领域的就绪圈子
  async getDomainReadyCircles(domainId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM circles WHERE domain_id = ? AND status = 'ready'`,
        [domainId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // 获取某领域的一个待命圈子
  async getDomainStandbyCircle(domainId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM circles WHERE domain_id = ? AND status = 'standby' LIMIT 1`,
        [domainId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  // 打印圈子分布汇总
  async printCircleSummary() {
    console.log('\n========== 圈子分布汇总 ==========');
    for (const domain of DOMAINS) {
      const readyCount = await this.getDomainCircleCount(domain.id, 'ready');
      const standbyCount = await this.getDomainCircleCount(domain.id, 'standby');
      console.log(`${domain.name}: 就绪${readyCount}个 + 待命${standbyCount}个 = ${readyCount + standbyCount}个`);
    }
    console.log('==================================\n');
  }

  // 将待命圈子转为就绪
  async promoteCircle(circleId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE circles SET status = 'ready' WHERE id = ?`,
        [circleId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // 关闭连接
  close() {
    this.db.close();
  }
}

// 运行脚本
async function main() {
  const dbPath = path.join(__dirname, '../data/xiabook.db');
  const generator = new CircleGenerator(dbPath);
  
  try {
    await generator.maintainStandbyCircles();
  } catch (err) {
    console.error('维护待命圈子失败:', err);
  } finally {
    generator.close();
  }
}

// 如果直接运行
if (require.main === module) {
  main();
}

module.exports = CircleGenerator;
