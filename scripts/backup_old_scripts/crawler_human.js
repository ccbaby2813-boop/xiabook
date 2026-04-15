const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// 凡人视角爬虫 - 从贴吧/虎扑抓取内容
class HumanContentCrawler {
  constructor() {
    this.progressFile = './crawler_progress_human.json';
    this.dbFile = './human_posts.db'; // SQLite database
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    
    // 初始化数据库连接
    const sqlite3 = require('sqlite3').verbose();
    this.db = new sqlite3.Database(this.dbFile);
    
    this.sources = [
      {
        name: 'tieba',
        baseUrl: 'https://tieba.baidu.com',
        patterns: [
          '/f?kw=%E8%82%A1%E7%A5%A8',
          '/f?kw=%E6%8A%95%E8%B5%84',
          '/f?kw=%E7%BB%8F%E6%B5%8E'
        ]
      },
      {
        name: 'hupu',
        baseUrl: 'https://bbs.hupu.com',
        patterns: [
          '/all-gambia',
          '/all-nba',
          '/all-cba'
        ]
      }
    ];
  }

  async init() {
    await this.createTables();
    console.log('Human Content Crawler initialized');
  }

  async createTables() {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS human_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        content TEXT,
        author TEXT,
        source TEXT,
        source_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    return new Promise((resolve, reject) => {
      this.db.run(createTableSQL, (err) => {
        if (err) {
          console.error('Error creating table:', err);
          reject(err);
        } else {
          console.log('human_posts table ready');
          resolve();
        }
      });
    });
  }

  async loadProgress() {
    try {
      const progressData = await fs.readFile(this.progressFile, 'utf8');
      return JSON.parse(progressData);
    } catch (error) {
      // 如果进度文件不存在，返回默认值
      return {
        lastRun: null,
        processedUrls: []
      };
    }
  }

  async saveProgress(progress) {
    await fs.writeFile(this.progressFile, JSON.stringify(progress, null, 2));
  }

  async crawl() {
    console.log('Starting Human Content Crawler...');
    const progress = await this.loadProgress();
    
    for (const source of this.sources) {
      console.log(`Crawling ${source.name}...`);
      await this.crawlSource(source, progress);
    }
    
    progress.lastRun = new Date().toISOString();
    await this.saveProgress(progress);
    
    console.log('Human Content Crawler completed');
  }

  async crawlSource(source, progress) {
    for (const pattern of source.patterns) {
      try {
        const url = source.baseUrl + pattern;
        console.log(`Fetching: ${url}`);
        
        const response = await axios.get(url, {
          headers: {
            'User-Agent': this.userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          },
          timeout: 10000
        });

        if (response.status === 200) {
          const posts = this.extractPosts(response.data, source.name, url);
          
          for (const post of posts) {
            if (!progress.processedUrls.includes(post.source_url)) {
              await this.savePost(post);
              progress.processedUrls.push(post.source_url);
              console.log(`Saved post: ${post.title.substring(0, 50)}...`);
            }
          }
        }
      } catch (error) {
        console.error(`Error crawling ${source.name} ${pattern}:`, error.message);
      }
    }
  }

  extractPosts(html, source, baseUrl) {
    const posts = [];
    
    // 根据不同来源提取内容
    switch (source) {
      case 'tieba':
        posts.push(...this.extractTiebaPosts(html, baseUrl));
        break;
      case 'hupu':
        posts.push(...this.extractHupuPosts(html, baseUrl));
        break;
      default:
        console.log(`Unsupported source: ${source}`);
    }
    
    return posts;
  }

  extractTiebaPosts(html, baseUrl) {
    const posts = [];
    
    // 使用正则表达式提取贴吧帖子信息
    // 匹配帖子标题和链接
    const tiebaRegex = /<a[^>]*href="(\/p\/\d+)"[^>]*class="[^"]*j_th_tit[^"]*"[^>]*>([^<]+)<\/a>/gi;
    let match;
    
    while ((match = tiebaRegex.exec(html)) !== null) {
      const postUrl = `https://tieba.baidu.com${match[1]}`;
      const title = this.cleanText(match[2]);
      
      // 过滤广告和无意义内容
      if (this.isValidContent(title)) {
        posts.push({
          title: title,
          content: '',
          author: 'unknown',
          source: 'tieba',
          source_url: postUrl
        });
      }
    }
    
    return posts;
  }

  extractHupuPosts(html, baseUrl) {
    const posts = [];
    
    // 提取虎扑帖子信息
    const hupuRegex = /<a[^>]*href="(\/[a-zA-Z0-9_-]+\/\d+\.html)"[^>]*title="([^"]+)"/gi;
    let match;
    
    while ((match = hupuRegex.exec(html)) !== null) {
      const postUrl = `https://bbs.hupu.com${match[1]}`;
      const title = this.cleanText(match[2]);
      
      // 过滤广告和无意义内容
      if (this.isValidContent(title)) {
        posts.push({
          title: title,
          content: '',
          author: 'unknown',
          source: 'hupu',
          source_url: postUrl
        });
      }
    }
    
    return posts;
  }

  cleanText(text) {
    if (!text) return '';
    
    // 清理文本中的HTML标签和多余空白
    return text.replace(/<[^>]*>/g, '')
             .replace(/\s+/g, ' ')
             .trim();
  }

  isValidContent(title) {
    // 过滤广告和无意义内容
    const adKeywords = ['广告', '推广', '招聘', '招聘启事', '诚聘', '代理', '加盟', '招商', '优惠', '特价', '秒杀'];
    const meaninglessKeywords = ['...', '？', '！', '无标题', '求解答', '求助'];
    
    const lowerTitle = title.toLowerCase();
    
    // 检查广告关键词
    for (const keyword of adKeywords) {
      if (lowerTitle.includes(keyword.toLowerCase())) {
        return false;
      }
    }
    
    // 检查无意义内容
    for (const keyword of meaninglessKeywords) {
      if (lowerTitle.includes(keyword.toLowerCase())) {
        return false;
      }
    }
    
    // 检查标题长度
    if (title.length < 5 || title.length > 200) {
      return false;
    }
    
    return true;
  }

  async savePost(post) {
    const insertSQL = `
      INSERT OR IGNORE INTO human_posts (title, content, author, source, source_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    return new Promise((resolve, reject) => {
      this.db.run(insertSQL, [
        post.title,
        post.content,
        post.author,
        post.source,
        post.source_url,
        new Date().toISOString()
      ], (err) => {
        if (err) {
          console.error('Error saving post:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

// 主程序入口
async function main() {
  const crawler = new HumanContentCrawler();
  
  try {
    await crawler.init();
    await crawler.crawl();
  } catch (error) {
    console.error('Crawler error:', error);
  } finally {
    crawler.close();
  }
}

// 如果直接运行此文件，则启动爬虫
if (require.main === module) {
  main().catch(console.error);
}

module.exports = HumanContentCrawler;