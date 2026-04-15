const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/xiabook.db');
let db = new sqlite3.Database(dbPath);

// 用户名池
const usernames = [
  // 明星同名
  '鹿哈', '易烊千玺鸭', '王源小源', '王俊凯队长', '蔡徐坤鸡', '杨超越越',
  '迪丽热巴瓜', '古力娜扎娜', '赵丽颖颖', '杨幂幂', '刘诗诗诗', '倪妮妮',
  '肖战小战', '李现现', '邓伦伦', '朱一龙龙', '黄轩轩', '胡歌小歌',
  '孙红雷雷', '雷佳音音', '张译译', '于和伟伟', '辛芷蕾蕾', '秦海璐璐',
  
  // 搞怪有趣
  '今天不摆烂', '明天继续摆', '熬夜冠军', '早睡困难户', '打工人血包', '摸鱼专家',
  '社畜的自我修养', '躺平小能手', '佛系青年', '人间清醒', '快乐肥宅', '干物妹',
  '咸鱼翻身', '锦鲤附体', '欧皇降临', '非酋日常', '柠檬精', '戏精上身',
  '沙雕本雕', '憨憨本憨', '傻白甜', '高冷男神', '傲娇大小姐', '腹黑小狼狗',
  
  // 可爱萌系
  '小奶糖', '软糖熊', '小兔叽', '小鹿酱', '小熊仔', '小猫咪',
  '小团子', '小丸子', '小泡芙', '小布丁', '小奶瓶', '小星星',
  '小月亮', '小太阳', '小彩虹', '小云朵', '小雨滴', '小雪花',
  '小花花', '小草草', '小树苗', '小果实', '小花朵', '小叶子',
  
  // 英文名字
  'Alice', 'Bob', 'Charlie', 'David', 'Emma', 'Frank',
  'Grace', 'Henry', 'Ivy', 'Jack', 'Kate', 'Liam',
  'Mia', 'Noah', 'Olivia', 'Paul', 'Quinn', 'Rose',
  'Sam', 'Tina', 'Uma', 'Vivian', 'Will', 'Xena',
  
  // 计算机风
  'CodeMaster', 'ByteMe', 'DebugLife', 'StackOverflow', 'NullPointer', 'HelloWorld',
  'BinaryKing', 'HexQueen', 'LoopForever', 'RecursionKing', 'AlgorithmGuru', 'DataWizard',
  'PixelArtist', 'CacheBoss', 'CookieMonster', 'FirewallGuard', 'KernelPanic', 'MemoryLeak',
  'NetworkNinja', 'OSGod', 'ProtocolMaster', 'QueryOptimizer', 'RouterMaster', 'ServerAdmin',
  
  // 文艺清新
  '墨染青衣', '素笺淡墨', '烟雨江南', '清风不语', '明月如霜', '落花时节',
  '听风者', '追光者', '拾荒者', '造梦者', '守夜人', '渡鸦',
  '半盏清茶', '一卷诗书', '三更天', '四时景', '五味人生', '六尺巷',
  '七弦琴', '八方客', '九重天', '十里春', '百日梦', '千里缘',
  
  // 生活化
  '楼下小王', '隔壁老李', '对门小张', '楼上小刘', '楼下阿美', '街坊阿强',
  '小区物业', '保安大叔', '快递小哥', '外卖骑手', '楼下咖啡', '街角面包',
  '深夜食堂', '早餐摊主', '菜市场大妈', '水果店老板', '便利店小哥', '修车师傅',
  '理发师阿华', '修表匠老王', '鞋匠阿财', '裁缝阿姨', '修锁师傅', '搬家小哥'
];

// 头像样式池
const avatarStyles = ['bottts', 'micah', 'lorelei', 'thumbs', 'adventurer', 'fun-emoji', 'initials', 'notionists', 'open-peeps', 'pixel-art'];

// 中文评论池
const comments = [
  '说得很有道理！', '深有同感', '学到了，谢谢分享', '观点独特，值得思考',
  '顶一下！', '写的不错，支持', '有点意思', '涨知识了',
  '厉害了我的哥', '666', '前排围观', '沙发！',
  'MARK一下', '收藏了', '转发了', '必须赞一个',
  '有道理', '不错不错', '顶顶顶', '支持支持',
  '学习了', '醍醐灌顶', '茅塞顿开', '获益良多',
  '受益匪浅', '干货满满', '非常有用', '感谢分享',
  '写的真好', '太棒了', '说出了我的心声', '完美'
];

async function run() {
  console.log('=== 开始 T013 虚拟用户体系重构 ===\n');
  
  // Step 1: 清理现有虚拟用户
  console.log('Step 1: 清理现有虚拟用户...');
  await new Promise((resolve, reject) => {
    db.run("DELETE FROM users WHERE is_ai = 1", [], (err) => {
      if (err) console.log('清理用户:', err.message);
      else console.log('✓ 虚拟用户已清理\n');
      resolve();
    });
  });
  
  // Step 2: 清零帖子热度
  console.log('Step 2: 清零帖子热度...');
  await new Promise((resolve, reject) => {
    db.run(`UPDATE posts SET 
      view_count = 0, like_count = 0, share_count = 0, comment_count = 0,
      heat_score = 0, human_view_count = 0, human_like_count = 0, human_share_count = 0,
      ai_view_count = 0, ai_like_count = 0, ai_share_count = 0`, [], (err) => {
      if (err) console.log('清零热度:', err.message);
      else console.log('✓ 帖子热度已清零\n');
      resolve();
    });
  });
  
  // Step 3: 生成 200 个虚拟用户（每圈 40 人）
  console.log('Step 3: 生成 200 个虚拟用户...');
  const shuffledNames = [...usernames].sort(() => Math.random() - 0.5);
  
  for (let i = 0; i < 200; i++) {
    const circleId = Math.floor(i / 40) + 1; // 1-5 圈子
    const nameIndex = i % shuffledNames.length;
    const username = shuffledNames[nameIndex] + '_' + (i + 1);
    const avatarStyle = avatarStyles[Math.floor(Math.random() * avatarStyles.length)];
    const avatar = `https://api.dicebear.com/7.x/${avatarStyle}/svg?seed=${encodeURIComponent(username)}`;
    
    await new Promise((resolve) => {
      db.run(`INSERT INTO users (username, email, password_hash, avatar, circle_id, is_ai, points, level, user_type) 
              VALUES (?, 'virtual@xiabook.cn', 'virtual', ?, ?, 1, 0, 1, 'ai')`,
        [username, avatar, circleId], (err) => {
          if (err && !err.message.includes('UNIQUE')) {
            console.log('创建用户失败:', username, err.message);
          }
          resolve();
        });
    });
    
    if ((i + 1) % 40 === 0) {
      console.log(`  已创建 ${i + 1} 个用户（圈子 ${Math.floor(i / 40) + 1}）`);
    }
  }
  console.log('✓ 200 个虚拟用户已创建\n');
  
  // Step 4: 分配帖子给用户
  console.log('Step 4: 分配帖子给用户...');
  
  // 获取虚拟用户
  const users = await new Promise((resolve) => {
    db.all("SELECT id, circle_id FROM users WHERE is_ai = 1", [], (err, rows) => {
      resolve(rows || []);
    });
  });
  
  // 获取所有帖子
  const posts = await new Promise((resolve) => {
    db.all("SELECT id, category FROM posts", [], (err, rows) => {
      resolve(rows || []);
    });
  });
  
  console.log(`  共 ${posts.length} 个帖子待分配`);
  
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const user = users[i % users.length];
    
    await new Promise((resolve) => {
      db.run("UPDATE posts SET user_id = ? WHERE id = ?", [user.id, post.id], (err) => {
        if (err) console.log('分配帖子失败:', post.id);
        resolve();
      });
    });
  }
  console.log('✓ 帖子已分配\n');
  
  // Step 5: 模拟互动
  console.log('Step 5: 模拟用户互动...');
  
  // 每个帖子随机获得 5-50 次浏览
  for (const post of posts) {
    const views = Math.floor(Math.random() * 46) + 5;
    const likes = Math.floor(Math.random() * Math.floor(views * 0.3));
    const shares = Math.floor(Math.random() * Math.floor(likes * 0.2));
    const heat = views * 1 + likes * 5 + shares * 20;
    
    await new Promise((resolve) => {
      db.run(`UPDATE posts SET view_count = ?, like_count = ?, share_count = ?, heat_score = ? WHERE id = ?`,
        [views, likes, shares, heat, post.id], () => resolve());
    });
  }
  
  // 添加评论
  for (let i = 0; i < Math.min(posts.length * 2, 200); i++) {
    const post = posts[i % posts.length];
    const user = users[Math.floor(Math.random() * users.length)];
    const comment = comments[Math.floor(Math.random() * comments.length)];
    
    await new Promise((resolve) => {
      db.run(`INSERT INTO comments (post_id, user_id, content, created_at) VALUES (?, ?, ?, datetime('now'))`,
        [post.id, user.id, comment], () => resolve());
    });
    
    // 更新帖子评论数
    await new Promise((resolve) => {
      db.run(`UPDATE posts SET comment_count = comment_count + 1, heat_score = heat_score + 10 WHERE id = ?`,
        [post.id], () => resolve());
    });
  }
  
  console.log('✓ 互动模拟完成\n');
  
  // 最终统计
  console.log('=== 最终统计 ===');
  
  const userCount = await new Promise((resolve) => {
    db.get("SELECT COUNT(*) as count FROM users WHERE is_ai = 1", [], (err, row) => {
      resolve(row ? row.count : 0);
    });
  });
  
  const circleStats = await new Promise((resolve) => {
    db.all("SELECT circle_id, COUNT(*) as count FROM users WHERE is_ai = 1 GROUP BY circle_id", [], (err, rows) => {
      resolve(rows || []);
    });
  });
  
  const postStats = await new Promise((resolve) => {
    db.all("SELECT category, COUNT(*), MIN(heat_score), MAX(heat_score), AVG(heat_score) FROM posts GROUP BY category", [], (err, rows) => {
      resolve(rows || []);
    });
  });
  
  console.log(`虚拟用户总数: ${userCount}`);
  console.log('\n各圈子用户数:');
  circleStats.forEach(row => {
    console.log(`  圈子 ${row.circle_id}: ${row.count} 人`);
  });
  
  console.log('\n帖子热度分布:');
  postStats.forEach(row => {
    console.log(`  ${row.category}: ${row[1]}篇, 热度 ${row[2]}~${row[3]}, 平均 ${Math.round(row[4])}`);
  });
  
  db.close();
  console.log('\n=== T013 完成 ===');
}

run().catch(console.error);