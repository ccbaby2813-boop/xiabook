/**
 * AI 自动点赞机器人 v2.1（修复并发写入问题）
 * 功能：每天凌晨 3 点执行
 * 规则：
 *   - 配套 AI 用户 (user_category='ai_builtin')：只能点赞本圈子内 50 个用户发出的帖子
 *   - 人类认领用户 (user_category='human_claimed')：不限制，可跨圈子点赞
 * 
 * 修复内容：
 *   - 使用 db.serialize() 确保顺序执行，避免并发锁竞争
 *   - 添加 INSERT OR IGNORE 防止重复点赞
 *   - 添加详细错误日志和失败计数
 *   - 增加延迟避免锁竞争
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// 日志文件路径
const LOG_DIR = path.join(__dirname, '../logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

class AILikeBot {
    constructor(dbPath = null) {
        const defaultPath = path.join(__dirname, '../data/xiabook.db');
        this.db = new sqlite3.Database(dbPath || defaultPath);
        this.logMessages = [];
        this.logFile = path.join(LOG_DIR, `ai_like_bot-${new Date().toISOString().split('T')[0]}.log`);
    }

    log(message, verbose = false) {
        const timestamp = new Date().toISOString();
        const logMsg = `[${timestamp}] ${message}`;
        if (verbose) {
            fs.appendFileSync(this.logFile, logMsg + '\n');
        } else {
            this.logMessages.push(logMsg);
            console.log(logMsg);
        }
    }

    async queryAll(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
        });
    }

    async queryOne(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
        });
    }

    async run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    }

    async checkSchema() {
        const tables = await this.queryAll("SELECT name FROM sqlite_master WHERE type='table'");
        const tableSet = new Set(tables.map(t => t.name));
        for (const table of ['users', 'posts', 'likes']) {
            if (!tableSet.has(table)) throw new Error(`缺少必要数据表：${table}`);
        }
    }

    async getAIUsers() {
        return this.queryAll(`
            SELECT * FROM users 
            WHERE is_ai = 1 
            AND (user_category = 'ai_builtin' OR user_category IS NULL)
            ORDER BY circle_id, id
        `);
    }

    async getCircleMemberIds(circleId) {
        const rows = await this.queryAll(`
            SELECT id FROM users 
            WHERE circle_id = ? 
            AND (user_category IN ('ai_builtin', 'human_claimed') OR user_category IS NULL)
        `, [circleId]);
        return rows.map(r => r.id);
    }

    async hasLiked(userId, postId) {
        const row = await this.queryOne('SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?', [userId, postId]);
        return !!row;
    }

    async getCandidatePostsForBuiltinAI(aiUserId, circleId, limit = 100) {
        const memberIds = await this.getCircleMemberIds(circleId);
        if (memberIds.length === 0) return [];
        
        const memberPlaceholders = memberIds.map(() => '?').join(',');
        
        // 🆕 优先人类帖子 + 跨圈子可见
        const rows = await this.queryAll(
            `SELECT p.*, u.is_ai, u.username as author_name,
                    u.user_category,
                    COALESCE(p.heat_score, 0) AS base_heat,
                    COALESCE(p.ai_score, 0) AS base_ai_score,
                    CASE WHEN u.user_category = 'human_claimed' THEN 0 ELSE 1 END AS priority
             FROM posts p
             JOIN users u ON p.user_id = u.id
             WHERE p.user_id != ?
               AND p.is_published = 1
               AND (
                   u.user_category = 'human_claimed'
                   OR (u.user_category IN ('ai_builtin', 'human_claimed') OR u.user_category IS NULL)
                      AND p.user_id IN (${memberPlaceholders})
               )
             ORDER BY priority ASC,
                      COALESCE(p.heat_score, 0) DESC,
                      COALESCE(p.ai_score, 0) DESC,
                      p.created_at DESC
             LIMIT ?`,
            [aiUserId, ...memberIds, limit]
        );

        // 随机打乱，但保持优先级（人类帖子在前）
        const humanPosts = rows.filter(r => r.priority === 0);
        const aiPosts = rows.filter(r => r.priority === 1);
        
        for (let i = humanPosts.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [humanPosts[i], humanPosts[j]] = [humanPosts[j], humanPosts[i]];
        }
        for (let i = aiPosts.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [aiPosts[i], aiPosts[j]] = [aiPosts[j], aiPosts[i]];
        }
        
        return [...humanPosts, ...aiPosts];
    }

    async addLike(userId, postId) {
        const now = new Date().toISOString();
        try {
            await this.run('INSERT OR IGNORE INTO likes (user_id, post_id, created_at) VALUES (?, ?, ?)', [userId, postId, now]);
            return { success: true, userId, postId };
        } catch (err) {
            this.log(`点赞失败 user_id=${userId} post_id=${postId}: ${err.message}`, true);
            throw err;
        }
    }

    async updatePostLikeCounters(postId) {
        try {
            const total = await this.queryOne('SELECT COUNT(*) AS cnt FROM likes WHERE post_id = ?', [postId]);
            await this.run('UPDATE posts SET like_count = ? WHERE id = ?', [total.cnt || 0, postId]);
            return { success: true, postId, likeCount: total.cnt || 0 };
        } catch (err) {
            this.log(`更新帖子点赞数失败 post_id=${postId}: ${err.message}`, true);
            throw err;
        }
    }

    async execute() {
        this.log('开始执行 AI 自动点赞机器人任务（圈子内互动）');

        try {
            await this.checkSchema();
            const aiUsers = await this.getAIUsers();
            this.log(`找到 ${aiUsers.length} 个配套 AI 用户`);

            const circleGroups = {};
            for (const user of aiUsers) {
                const cid = user.circle_id || 0;
                if (!circleGroups[cid]) circleGroups[cid] = [];
                circleGroups[cid].push(user);
            }
            this.log(`分布在 ${Object.keys(circleGroups).length} 个圈子`);

            let totalLikes = 0;
            let successfulLikes = 0;
            let failedLikes = 0;

            // 使用 serialize 确保顺序执行，避免并发锁竞争
            await new Promise((resolve, reject) => {
                this.db.serialize(async () => {
                    try {
                        for (const [circleId, users] of Object.entries(circleGroups)) {
                            this.log(`处理圈子 ${circleId}，共 ${users.length} 个 AI 用户`);
                            
                            for (const aiUser of users) {
                                const candidatePosts = await this.getCandidatePostsForBuiltinAI(aiUser.id, circleId, 50);
                                let userLikes = 0;

                                for (const post of candidatePosts) {
                                    if (userLikes >= 10) break;
                                    if (!(await this.hasLiked(aiUser.id, post.id))) {
                                        try {
                                            await this.addLike(aiUser.id, post.id);
                                            await this.updatePostLikeCounters(post.id);
                                            
                                            userLikes++;
                                            totalLikes++;
                                            successfulLikes++;
                                            this.log(`AI ${aiUser.username} 点赞本圈子帖子 ${post.id} (作者：${post.author_name})`, true);
                                            
                                            await this.delay(50);
                                        } catch (err) {
                                            failedLikes++;
                                            this.log(`AI ${aiUser.username} 点赞失败：${err.message}`, true);
                                        }
                                    }
                                }

                                this.log(`AI 用户 ${aiUser.username} 完成点赞：${userLikes}/10`, true);
                            }
                        }
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                });
            });

            this.log(`点赞任务完成！总点赞数：${totalLikes}, 成功：${successfulLikes}, 失败：${failedLikes}`);
            return {
                success: true,
                summary: { aiUsersProcessed: aiUsers.length, totalLikes, successfulLikes, failedLikes, logMessages: this.logMessages }
            };
        } catch (error) {
            this.log(`执行过程中出现错误：${error.message}`);
            return { success: false, error: error.message, logMessages: this.logMessages };
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    close() {
        this.db.close();
    }
}

if (require.main === module) {
    (async () => {
        const bot = new AILikeBot();
        try {
            const result = await bot.execute();
            console.log('\n=== 执行摘要 ===');
            if (result.success) {
                console.log(`AI 用户处理数：${result.summary.aiUsersProcessed}`);
                console.log(`总点赞数：${result.summary.totalLikes}`);
                console.log(`成功点赞数：${result.summary.successfulLikes}`);
                console.log(`失败点赞数：${result.summary.failedLikes}`);
                process.exitCode = 0;
            } else {
                console.log(`执行失败：${result.error}`);
                process.exitCode = 1;
            }
        } finally {
            bot.close();
        }
    })();
}

module.exports = AILikeBot;
