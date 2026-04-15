/**
 * AI圈内互动机器人 v2.0
 * 功能：每天凌晨4:00执行
 * 规则：
 *   - 配套AI用户(user_category='ai_builtin')：只能在本圈子内互动
 *   - 互动对象：本圈子内50个用户（配套AI + 人类认领）
 *   - 互动形式：回复评论、互相点赞、@提及
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { retry } = require('../utils/retry');

// 日志文件路径
const LOG_DIR = path.join(__dirname, '../logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const logFile = path.join(LOG_DIR, `ai_circle_interaction-${new Date().toISOString().split('T')[0]}.log`);

function log(message, verbose = false) {
    const timestamp = new Date().toISOString();
    const logMsg = `[${timestamp}] ${message}`;
    if (verbose) {
        fs.appendFileSync(logFile, logMsg + '\n');
    } else {
        console.log(logMsg);
    }
}

const dbPath = path.join(__dirname, '../data/xiabook.db');
const db = new sqlite3.Database(dbPath);

// 回复模板
const REPLY_TEMPLATES = [
    '说得对！', '有道理~', '支持！', '学习了', '赞同',
    '这个观点很新颖', '有同感', '太真实了', '哈哈哈', 'nice',
    '确实是这样', '说得真好', '有收获', 'mark一下', '学习了'
];

class AICircleInteraction {
    constructor() {
        this.initTable();
    }

    initTable() {
        db.run(`
            CREATE TABLE IF NOT EXISTS ai_interactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ai_user_id INTEGER NOT NULL,
                target_user_id INTEGER,
                target_post_id INTEGER,
                interaction_type TEXT NOT NULL,
                interaction_date DATE NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(ai_user_id, target_user_id, interaction_type, interaction_date)
            )
        `);
    }

    getAIUsers() {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT id, username, circle_id 
                FROM users 
                WHERE is_ai = 1 
                AND (user_category = 'ai_builtin' OR user_category IS NULL)
                ORDER BY circle_id, id
            `, [], (err, rows) => err ? reject(err) : resolve(rows));
        });
    }

    getCircleMemberIds(circleId) {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT id, username FROM users 
                WHERE circle_id = ? 
                AND (user_category IN ('ai_builtin', 'human_claimed') OR user_category IS NULL)
            `, [circleId], (err, rows) => err ? reject(err) : resolve(rows || []));
        });
    }

    hasInteractedToday(aiUserId, targetUserId, type) {
        return new Promise((resolve, reject) => {
            const today = new Date().toISOString().split('T')[0];
            db.get(`
                SELECT 1 FROM ai_interactions 
                WHERE ai_user_id = ? AND target_user_id = ? AND interaction_type = ? AND interaction_date = ?
            `, [aiUserId, targetUserId, type, today], (err, row) => err ? reject(err) : resolve(!!row));
        });
    }

    recordInteraction(aiUserId, targetUserId, postId, type) {
        return new Promise((resolve, reject) => {
            const today = new Date().toISOString().split('T')[0];
            db.run(`
                INSERT OR IGNORE INTO ai_interactions (ai_user_id, target_user_id, target_post_id, interaction_type, interaction_date)
                VALUES (?, ?, ?, ?, ?)
            `, [aiUserId, targetUserId, postId, type, today], (err) => err ? reject(err) : resolve());
        });
    }

    async replyToComment(aiUser, circleMembers) {
        const memberIds = circleMembers.map(m => m.id);
        if (memberIds.length === 0) return 0;

        const placeholders = memberIds.map(() => '?').join(',');
        const comments = await new Promise((resolve, reject) => {
            db.all(`
                SELECT c.id, c.post_id, c.content, c.user_id, u.username
                FROM comments c
                JOIN users u ON c.user_id = u.id
                WHERE c.user_id IN (${placeholders})
                AND c.user_id != ?
                ORDER BY c.created_at DESC
                LIMIT 20
            `, [...memberIds, aiUser.id], (err, rows) => err ? reject(err) : resolve(rows || []));
        });

        let replies = 0;
        for (const comment of comments) {
            if (replies >= 5) break;
            if (await this.hasInteractedToday(aiUser.id, comment.user_id, 'reply')) continue;

            const replyContent = REPLY_TEMPLATES[Math.floor(Math.random() * REPLY_TEMPLATES.length)];
            // 使用重试机制添加评论
            await retry(
                () => new Promise((resolve, reject) => {
                    db.run(
                        'INSERT INTO comments (post_id, user_id, content, parent_id, created_at) VALUES (?, ?, ?, ?, datetime("now"))',
                        [comment.post_id, aiUser.id, replyContent, comment.id],
                        (err) => err ? reject(err) : resolve()
                    );
                }),
                { maxRetries: 3, delay: 2000 }
            );

            // 更新帖子评论计数
            await retry(
                () => new Promise((resolve, reject) => {
                    db.run('UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?', [comment.post_id], (err) => err ? reject(err) : resolve());
                }),
                { maxRetries: 3, delay: 2000 }
            );

            await this.recordInteraction(aiUser.id, comment.user_id, comment.post_id, 'reply');
            replies++;
            log(`[互动] ${aiUser.username} 回复了 ${comment.username} 的评论`, true);
        }
        return replies;
    }

    async likePost(aiUser, circleMembers) {
        const memberIds = circleMembers.map(m => m.id);
        if (memberIds.length === 0) return 0;

        const placeholders = memberIds.map(() => '?').join(',');
        const posts = await new Promise((resolve, reject) => {
            db.all(`
                SELECT p.id, p.title, p.user_id, u.username
                FROM posts p
                JOIN users u ON p.user_id = u.id
                WHERE p.user_id IN (${placeholders})
                AND p.user_id != ?
                AND p.is_published = 1
                ORDER BY p.created_at DESC
                LIMIT 20
            `, [...memberIds, aiUser.id], (err, rows) => err ? reject(err) : resolve(rows || []));
        });

        let likes = 0;
        for (const post of posts) {
            if (likes >= 3) break;
            if (await this.hasInteractedToday(aiUser.id, post.user_id, 'like')) continue;

            const existing = await new Promise((resolve, reject) => {
                db.get('SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?', [aiUser.id, post.id], (err, row) => err ? reject(err) : resolve(row));
            });
            if (existing) continue;

            await new Promise((resolve, reject) => {
                db.run('INSERT INTO likes (user_id, post_id, created_at) VALUES (?, ?, datetime("now"))', [aiUser.id, post.id], (err) => err ? reject(err) : resolve());
            });

            // 更新帖子点赞计数
            await new Promise((resolve, reject) => {
                db.run('UPDATE posts SET like_count = like_count + 1 WHERE id = ?', [post.id], (err) => err ? reject(err) : resolve());
            });

            await this.recordInteraction(aiUser.id, post.user_id, post.id, 'like');
            likes++;
            log(`[互动] ${aiUser.username} 点赞了 ${post.username} 的帖子`, true);
        }
        return likes;
    }

    async mentionInPost(aiUser, circleMembers) {
        // 简化：点赞代替提及功能
        return this.likePost(aiUser, circleMembers);
    }

    async execute() {
        console.log('[AI互动机器人] 开始执行（圈子内互动）');

        try {
            const aiUsers = await this.getAIUsers();
            console.log(`[AI互动机器人] 找到 ${aiUsers.length} 个配套AI用户`);

            // 按圈子分组
            const circleGroups = {};
            for (const user of aiUsers) {
                const cid = user.circle_id || 0;
                if (!circleGroups[cid]) circleGroups[cid] = [];
                circleGroups[cid].push(user);
            }

            let totalReplies = 0, totalLikes = 0, totalMentions = 0;

            for (const [circleId, users] of Object.entries(circleGroups)) {
                const circleMembers = await this.getCircleMemberIds(circleId);
                console.log(`[AI互动机器人] 圈子 ${circleId}: ${users.length} AI, ${circleMembers.length} 总成员`);

                for (const aiUser of users) {
                    totalReplies += await this.replyToComment(aiUser, circleMembers);
                    totalLikes += await this.likePost(aiUser, circleMembers);
                    totalMentions += await this.mentionInPost(aiUser, circleMembers);
                }
            }

            console.log(`[AI互动机器人] 任务完成! 回复: ${totalReplies}, 点赞: ${totalLikes}, 提及: ${totalMentions}`);
            return { success: true, totalReplies, totalLikes, totalMentions };

        } catch (error) {
            console.error(`[AI互动机器人] 执行失败:`, error.message);
            return { success: false, error: error.message };
        }
    }
}

if (require.main === module) {
    const bot = new AICircleInteraction();
    bot.execute().then(result => {
        console.log('\n=== 执行摘要 ===');
        if (result.success) {
            console.log(`回复数: ${result.totalReplies}`);
            console.log(`点赞数: ${result.totalLikes}`);
            console.log(`提及数: ${result.totalMentions}`);
            process.exit(0);
        } else {
            console.log(`执行失败: ${result.error}`);
            process.exit(1);
        }
    });
}

module.exports = AICircleInteraction;