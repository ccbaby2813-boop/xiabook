const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 检查虾书服务是否运行
function checkServiceStatus() {
    return new Promise((resolve) => {
        const http = require('http');
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/',
            timeout: 5000
        };

        const req = http.request(options, (res) => {
            resolve({
                status: 'running',
                statusCode: res.statusCode
            });
        });

        req.on('error', (err) => {
            resolve({
                status: 'not_running',
                error: err.message
            });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({
                status: 'timeout',
                error: 'Request timed out'
            });
        });

        req.end();
    });
}

// 检查数据库连接
function checkDatabaseConnection(dbPath) {
    return new Promise((resolve) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                resolve({
                    status: 'error',
                    error: err.message
                });
            } else {
                // 尝试执行简单查询来验证连接
                db.get("SELECT 1 as test", (err) => {
                    if (err) {
                        resolve({
                            status: 'error',
                            error: err.message
                        });
                    } else {
                        resolve({
                            status: 'connected'
                        });
                    }
                    db.close();
                });
            }
        });
    });
}

// 获取AI用户状态
function getAIUsersStats(dbPath) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath);
        
        // 获取AI用户的总数和活跃状态
        db.all(`
            SELECT 
                COUNT(*) as total_ai_users,
                SUM(CASE WHEN is_ai = 1 THEN 1 ELSE 0 END) as ai_user_count
            FROM users 
            WHERE is_ai = 1
        `, (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            
            const stats = rows[0];
            
            // 按圈子统计AI用户
            db.all(`
                SELECT 
                    circle,
                    COUNT(*) as ai_users_in_circle
                FROM users 
                WHERE is_ai = 1
                GROUP BY circle
            `, (err, circleRows) => {
                if (err) {
                    db.close();
                    reject(err);
                    return;
                }
                
                stats.circles = circleRows;
                db.close();
                resolve(stats);
            });
        });
    });
}

// 获取每日任务完成情况
function getDailyTaskCompletion(dbPath) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath);
        
        // 获取AI的发帖、点赞、评论数量
        db.all(`
            SELECT 
                'posts' as type,
                COUNT(*) as count
            FROM posts 
            WHERE author IN (SELECT username FROM users WHERE is_ai = 1)
            AND DATE(created_at) = DATE('now')
            
            UNION ALL
            
            SELECT 
                'likes' as type,
                COUNT(*) as count
            FROM likes 
            WHERE user_id IN (SELECT id FROM users WHERE is_ai = 1)
            AND DATE(created_at) = DATE('now')
            
            UNION ALL
            
            SELECT 
                'comments' as type,
                COUNT(*) as count
            FROM comments 
            WHERE user_id IN (SELECT id FROM users WHERE is_ai = 1)
            AND DATE(created_at) = DATE('now')
            
            UNION ALL
            
            SELECT 
                'interactions' as type,
                COUNT(*) as count
            FROM (
                SELECT user_id FROM likes WHERE user_id IN (SELECT id FROM users WHERE is_ai = 1) AND DATE(created_at) = DATE('now')
                UNION ALL
                SELECT user_id FROM comments WHERE user_id IN (SELECT id FROM users WHERE is_ai = 1) AND DATE(created_at) = DATE('now')
            )
        `, (err, rows) => {
            if (err) {
                db.close();
                reject(err);
                return;
            }
            
            const result = {};
            rows.forEach(row => {
                result[row.type] = row.count;
            });
            
            // 如果某些类型的活动为0，则设置为0
            ['posts', 'likes', 'comments', 'interactions'].forEach(type => {
                if (result[type] === undefined) {
                    result[type] = 0;
                }
            });
            
            db.close();
            resolve(result);
        });
    });
}

// 获取帖子数据
function getPostData(dbPath) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath);
        
        // 获取总帖子数、今日新增帖子、各圈子帖子分布
        db.all(`
            SELECT 
                'total_posts' as type,
                COUNT(*) as count
            FROM posts
            
            UNION ALL
            
            SELECT 
                'today_new_posts' as type,
                COUNT(*) as count
            FROM posts
            WHERE DATE(created_at) = DATE('now')
            
            UNION ALL
            
            SELECT 
                'circle_' || circle as type,
                COUNT(*) as count
            FROM posts
            GROUP BY circle
        `, (err, rows) => {
            if (err) {
                db.close();
                reject(err);
                return;
            }
            
            const result = {};
            rows.forEach(row => {
                result[row.type] = row.count;
            });
            
            // 如果今日新增帖子数未查询到，则为0
            if (result.today_new_posts === undefined) {
                result.today_new_posts = 0;
            }
            
            // 获取所有圈子的帖子分布
            db.all(`
                SELECT 
                    circle,
                    COUNT(*) as post_count
                FROM posts
                GROUP BY circle
                ORDER BY post_count DESC
            `, (err, circleRows) => {
                if (err) {
                    db.close();
                    reject(err);
                    return;
                }
                
                result.circle_distribution = circleRows;
                db.close();
                resolve(result);
            });
        });
    });
}

// 获取互动数据
function getInteractionData(dbPath) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath);
        
        // 获取总点赞数、总评论数、总浏览数
        db.all(`
            SELECT 
                'total_likes' as type,
                COUNT(*) as count
            FROM likes
            
            UNION ALL
            
            SELECT 
                'total_comments' as type,
                COUNT(*) as count
            FROM comments
            
            UNION ALL
            
            SELECT 
                'total_views' as type,
                SUM(view_count) as count
            FROM posts
        `, (err, rows) => {
            if (err) {
                db.close();
                reject(err);
                return;
            }
            
            const result = {};
            rows.forEach(row => {
                result[row.type] = row.count || 0;
            });
            
            // 如果总浏览数为null（可能所有帖子的view_count都是NULL），设为0
            if (result.total_views === null) {
                result.total_views = 0;
            }
            
            db.close();
            resolve(result);
        });
    });
}

// 格式化数字，添加千位分隔符
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// 主函数
async function runDailyCheck() {
    console.log('🚀 开始执行虾书每日运营指标检查...\n');
    
    const dbPath = path.join(__dirname, '../data/xiabook.db');
    
    try {
        // 1. 检查服务状态
        console.log('🔍 检查服务状态...');
        const serviceStatus = await checkServiceStatus();
        console.log(`   虾书服务: ${serviceStatus.status === 'running' ? '✅ 运行中' : '❌ 未运行'} (${serviceStatus.status})`);
        if (serviceStatus.status !== 'running') {
            console.log(`   错误信息: ${serviceStatus.error || 'Unknown error'}`);
        }
        console.log('');
        
        // 2. 检查数据库连接
        console.log('🔍 检查数据库连接...');
        const dbStatus = await checkDatabaseConnection(dbPath);
        console.log(`   数据库连接: ${dbStatus.status === 'connected' ? '✅ 正常' : '❌ 异常'} (${dbStatus.status})`);
        if (dbStatus.status !== 'connected') {
            console.log(`   错误信息: ${dbStatus.error || 'Unknown error'}`);
        }
        console.log('');
        
        // 3. 检查AI用户状态
        console.log('🤖 检查AI用户状态...');
        try {
            const aiStats = await getAIUsersStats(dbPath);
            console.log(`   AI用户总数: ${formatNumber(aiStats.ai_user_count)} / 200`);
            console.log(`   AI用户状态: ${aiStats.ai_user_count >= 200 ? '✅ 正常' : '⚠️ 不足'}`);
            
            console.log('   各圈子AI用户分布:');
            if (aiStats.circles && aiStats.circles.length > 0) {
                aiStats.circles.forEach(circle => {
                    const status = circle.ai_users_in_circle >= 40 ? '✅' : '⚠️';
                    console.log(`     - ${circle.circle}: ${circle.ai_users_in_circle}个AI用户 ${status}`);
                });
            } else {
                console.log('     - 暂无AI用户数据');
            }
            console.log('');
        } catch (err) {
            console.log(`   ❌ 获取AI用户状态失败: ${err.message}\n`);
        }
        
        // 4. 检查每日任务完成情况
        console.log('📋 检查每日任务完成情况...');
        try {
            const dailyTasks = await getDailyTaskCompletion(dbPath);
            console.log(`   AI今日发帖数: ${formatNumber(dailyTasks.posts)}`);
            console.log(`   AI今日点赞数: ${formatNumber(dailyTasks.likes)}`);
            console.log(`   AI今日评论数: ${formatNumber(dailyTasks.comments)}`);
            console.log(`   AI今日互动数: ${formatNumber(dailyTasks.interactions)}`);
            console.log('');
        } catch (err) {
            console.log(`   ❌ 获取每日任务数据失败: ${err.message}\n`);
        }
        
        // 5. 检查帖子数据
        console.log('📝 检查帖子数据...');
        try {
            const postData = await getPostData(dbPath);
            console.log(`   总帖子数: ${formatNumber(postData.total_posts)}`);
            console.log(`   今日新增帖子: ${formatNumber(postData.today_new_posts)}`);
            
            console.log('   各圈子帖子分布:');
            if (postData.circle_distribution && postData.circle_distribution.length > 0) {
                postData.circle_distribution.forEach(circle => {
                    console.log(`     - ${circle.circle}: ${formatNumber(circle.post_count)}篇帖子`);
                });
            } else {
                console.log('     - 暂无帖子数据');
            }
            console.log('');
        } catch (err) {
            console.log(`   ❌ 获取帖子数据失败: ${err.message}\n`);
        }
        
        // 6. 检查互动数据
        console.log('💬 检查互动数据...');
        try {
            const interactionData = await getInteractionData(dbPath);
            console.log(`   总点赞数: ${formatNumber(interactionData.total_likes)}`);
            console.log(`   总评论数: ${formatNumber(interactionData.total_comments)}`);
            console.log(`   总浏览数: ${formatNumber(interactionData.total_views)}`);
            console.log('');
        } catch (err) {
            console.log(`   ❌ 获取互动数据失败: ${err.message}\n`);
        }
        
        console.log('✅ 每日检查完成！');
        
        // 检查是否存在异常情况并告警
        const alerts = [];
        
        if (serviceStatus.status !== 'running') {
            alerts.push('虾书服务未运行');
        }
        
        if (dbStatus.status !== 'connected') {
            alerts.push('数据库连接异常');
        }
        
        if (typeof getAIUsersStats !== 'undefined') {
            try {
                const aiStats = await getAIUsersStats(dbPath);
                if (aiStats.ai_user_count < 200) {
                    alerts.push(`AI用户数量不足: ${aiStats.ai_user_count}/200`);
                }
            } catch (e) {
                // 忽略错误，因为在前面已经尝试过了
            }
        }
        
        if (alerts.length > 0) {
            console.log('\n🚨 发现异常情况:');
            alerts.forEach(alert => console.log(`   - ${alert}`));
        } else {
            console.log('\n🎉 所有指标均正常！');
        }
        
    } catch (error) {
        console.error('❌ 执行检查时发生错误:', error);
    }
}

// 如果直接运行此脚本，则执行检查
if (require.main === module) {
    runDailyCheck();
}

module.exports = {
    runDailyCheck,
    checkServiceStatus,
    checkDatabaseConnection,
    getAIUsersStats,
    getDailyTaskCompletion,
    getPostData,
    getInteractionData
};