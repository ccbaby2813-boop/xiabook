#!/usr/bin/env node
/**
 * 百度贴吧爬虫 - 支持登录、评论、OCR
 * 内容源: 弱智吧、离谱吧、孙笑川吧等优质搞笑贴吧
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const puppeteer = require('puppeteer');
const Tesseract = require('tesseract.js');

// 配置
const DB_PATH = path.join(__dirname, '../../data/xiabook.db');
const CRAWLER_LOG = path.join(__dirname, '../../logs/crawler_tieba.log');
const COOKIE_FILE = path.join(__dirname, '../../data/tieba_cookies.json');
const PROGRESS_FILE = path.join(__dirname, '../../data/crawler_tieba_progress.json');

// 贴吧账号
const TIEBA_ACCOUNT = {
  username: 'ccbaby',
  password: 'cc68414984'
};

// 优质贴吧列表
const TIEBA_LIST = [
  { name: '弱智吧', kw: '弱智', type: 'funny', priority: 1 },
  { name: '离谱吧', kw: '离谱', type: 'funny', priority: 1 },
  { name: '孙笑川吧', kw: '孙笑川', type: 'funny', priority: 1 },
  { name: '抽象话吧', kw: '抽象话', type: 'funny', priority: 2 },
  { name: '弱智言论吧', kw: '弱智言论', type: 'funny', priority: 2 },
  { name: '弱智百度', kw: '弱智百度', type: 'funny', priority: 2 },
  { name: '贴吧弱智', kw: '贴吧弱智', type: 'funny', priority: 3 },
  { name: '神回复吧', kw: '神回复', type: 'funny', priority: 2 },
  { name: '搞笑吧', kw: '搞笑', type: 'funny', priority: 3 },
  { name: '内涵段子吧', kw: '内涵段子', type: 'funny', priority: 3 }
];

// SQLite
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(DB_PATH);

// 确保目录存在
const logDir = path.dirname(CRAWLER_LOG);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 日志
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(CRAWLER_LOG, logMessage);
  console.log(logMessage.trim());
}

// 内容hash
function generateHash(content) {
  return crypto.createHash('md5').update(content).digest('hex');
}

// 保存帖子
async function savePost(post) {
  return new Promise((resolve, reject) => {
    const hash = generateHash(post.content);
    
    db.get('SELECT id FROM human_posts WHERE content_hash = ?', [hash], (err, row) => {
      if (row) {
        resolve({ saved: false, reason: 'duplicate' });
        return;
      }
      
      db.run(`
        INSERT INTO human_posts (title, content, author, source, source_url, post_type, content_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [post.title, post.content, post.author, 'tieba', post.url, post.type, hash],
      function(err) {
        if (err) reject(err);
        else resolve({ saved: true, id: this.lastID });
      });
    });
  });
}

// 登录贴吧
async function loginTieba(page) {
  log('开始登录贴吧...');
  
  // 尝试加载已有cookie
  if (fs.existsSync(COOKIE_FILE)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
      await page.setCookie(...cookies);
      log('已加载保存的cookie');
      
      // 验证登录状态
      await page.goto('https://tieba.baidu.com/', { waitUntil: 'networkidle2', timeout: 30000 });
      const isLoggedIn = await page.evaluate(() => {
        return !!document.querySelector('.u_login') || document.body.innerText.includes('我的贴吧');
      });
      
      if (isLoggedIn) {
        log('Cookie有效，无需重新登录');
        return true;
      }
    } catch (e) {
      log(`Cookie加载失败: ${e.message}`);
    }
  }
  
  // 执行登录
  try {
    await page.goto('https://passport.baidu.com/passApi/Login', { 
      waitUntil: 'networkidle2', 
      timeout: 60000 
    });
    
    await page.waitForSelector('input[name="userName"], input[id="TANGRAM__PSP_11__userName"]', { timeout: 10000 });
    
    // 输入用户名密码
    await page.type('input[name="userName"], input[id="TANGRAM__PSP_11__userName"]', TIEBA_ACCOUNT.username, { delay: 100 });
    await page.type('input[name="password"], input[id="TANGRAM__PSP_11__password"]', TIEBA_ACCOUNT.password, { delay: 100 });
    
    // 点击登录
    await page.click('input[type="submit"], button[type="submit"], #TANGRAM__PSP_11__submit');
    
    // 等待登录完成或验证码
    await page.waitForNavigation({ timeout: 30000 }).catch(() => {});
    
    // 检查是否需要验证码
    const needCaptcha = await page.evaluate(() => {
      return !!document.querySelector('.verify-code, .captcha, #TANGRAM__PSP_11__verifyCode');
    });
    
    if (needCaptcha) {
      log('需要验证码，请在浏览器中手动完成登录');
      // 保存截图供用户查看
      await page.screenshot({ path: path.join(logDir, 'captcha.png') });
      log(`验证码截图已保存: ${logDir}/captcha.png`);
      return false;
    }
    
    // 保存cookie
    const cookies = await page.cookies();
    fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
    log('登录成功，cookie已保存');
    return true;
    
  } catch (error) {
    log(`登录失败: ${error.message}`);
    return false;
  }
}

// OCR识别图片文字
async function ocrImage(imageUrl) {
  try {
    const result = await Tesseract.recognize(imageUrl, 'chi_sim+eng', {
      logger: m => {}
    });
    return result.data.text.trim();
  } catch (e) {
    return '';
  }
}

// 爬取单个贴吧
async function crawlTiebaForum(page, tieba) {
  log(`开始爬取【${tieba.name}】...`);
  let savedCount = 0;
  
  try {
    const url = `https://tieba.baidu.com/f?kw=${encodeURIComponent(tieba.kw)}&ie=utf-8`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // 等待页面加载
    await new Promise(r => setTimeout(r, 3000));
    
    // 获取帖子链接 - 使用正确的选择器
    const threadLinks = await page.evaluate(() => {
      const links = [];
      // 使用 href*="/p/" 选择器
      document.querySelectorAll('a[href*="/p/"]').forEach(a => {
        const href = a.getAttribute('href');
        const title = a.textContent.trim();
        // 过滤掉置顶帖和水楼
        if (href && title && title.length > 3 && !title.includes('水楼') && !title.includes('AI创作')) {
          links.push({
            url: href.startsWith('http') ? href : `https://tieba.baidu.com${href}`,
            title: title
          });
        }
      });
      
      // 去重
      const unique = [...new Map(links.map(l => [l.url, l])).values()];
      return unique.slice(0, 15); // 每个吧爬15条
    });
    
    log(`【${tieba.name}】找到 ${threadLinks.length} 个帖子`);
    
    // 爬取每个帖子
    for (const link of threadLinks) {
      try {
        const postContent = await crawlThread(page, link.url, tieba);
        if (postContent) {
          const result = await savePost(postContent);
          if (result.saved) savedCount++;
        }
        // 间隔
        await new Promise(r => setTimeout(r, 1500));
      } catch (e) {
        log(`帖子爬取失败: ${e.message}`);
      }
    }
    
    log(`【${tieba.name}】保存 ${savedCount} 条新内容`);
    
  } catch (error) {
    log(`【${tieba.name}】爬取失败: ${error.message}`);
  }
  
  return savedCount;
}

// 爬取单个帖子（含评论）
async function crawlThread(page, url, tieba) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise(r => setTimeout(r, 2000));
    
    const postData = await page.evaluate(() => {
      // 获取楼主帖子内容 - 多种选择器
      let content = '';
      let images = [];
      
      const contentSelectors = [
        '.d_post_content',
        '.j_d_post_content',
        '.p_content',
        '.post_content',
        '#post_content'
      ];
      
      for (const sel of contentSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          content = el.textContent.trim();
          // 获取图片
          el.querySelectorAll('img').forEach(img => {
            const src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('bimg');
            if (src && !src.includes('emotion') && !src.includes('static')) {
              images.push(src);
            }
          });
          break;
        }
      }
      
      // 获取评论/回复
      const replies = [];
      const replySelectors = ['.l_post', '.j_l_post', '.post_item'];
      
      for (const sel of replySelectors) {
        const replyEls = document.querySelectorAll(sel);
        if (replyEls.length > 0) {
          replyEls.forEach((reply, index) => {
            if (index < 8) {
              const replyContent = reply.querySelector('.d_post_content, .j_d_post_content, .post_content');
              if (replyContent) {
                const text = replyContent.textContent.trim();
                if (text.length > 5 && text !== content) {
                  replies.push({ text: text, likes: 0 });
                }
              }
            }
          });
          break;
        }
      }
      
      // 获取楼主信息
      let author = '贴吧用户';
      const authorSelectors = ['.louzhubiaoshi_wrap .p_author_name', '.d_name a', '.p_author_name'];
      for (const sel of authorSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          author = el.textContent.trim();
          break;
        }
      }
      
      return {
        content: content,
        images: images,
        replies: replies,
        author: author
      };
    });
    
    if (!postData.content && postData.images.length === 0) {
      return null;
    }
    
    // OCR识别图片文字（只处理前2张）
    let ocrTexts = [];
    for (const img of postData.images.slice(0, 2)) {
      try {
        const text = await ocrImage(img);
        if (text && text.length > 5) {
          ocrTexts.push(text);
        }
      } catch (e) {}
    }
    
    // 组合内容：主帖 + 图片文字 + 神回复
    let fullContent = postData.content;
    
    if (ocrTexts.length > 0) {
      fullContent += '\n\n【图片内容】\n' + ocrTexts.join('\n');
    }
    
    if (postData.replies.length > 0) {
      const topReplies = postData.replies
        .slice(0, 5)
        .map(r => `→ ${r.text}`)
        .join('\n');
      
      if (topReplies) {
        fullContent += '\n\n【热评】\n' + topReplies;
      }
    }
    
    // 标题
    const title = await page.title();
    const cleanTitle = title.replace('_百度贴吧', '').replace(/_.*吧/g, '').trim();
    
    return {
      title: cleanTitle.substring(0, 100),
      content: fullContent.substring(0, 2000),
      author: postData.author,
      url: url,
      type: tieba.type
    };
    
  } catch (error) {
    return null;
  }
}

// 主函数
async function main() {
  log('========== 贴吧爬虫启动 ==========');
  
  const startTime = Date.now();
  let totalCount = 0;
  
  // 启动浏览器
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1920,1080'
    ]
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  try {
    // 登录
    const loggedIn = await loginTieba(page);
    if (!loggedIn) {
      log('登录失败，将使用游客模式爬取（部分内容可能无法访问）');
    }
    
    // 按优先级爬取贴吧
    const sortedTiebas = TIEBA_LIST.sort((a, b) => a.priority - b.priority);
    
    for (const tieba of sortedTiebas) {
      const count = await crawlTiebaForum(page, tieba);
      totalCount += count;
      
      // 间隔避免被封
      await new Promise(r => setTimeout(r, 2000));
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`本次共保存 ${totalCount} 条新内容，耗时 ${duration}秒`);
    
  } catch (error) {
    log(`爬虫执行失败: ${error.message}`);
  } finally {
    await browser.close();
    db.close();
  }
  
  log('========== 爬虫执行结束 ==========');
}

// 执行
main();