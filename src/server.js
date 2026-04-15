const express = require('express');
const path = require('path');
const os = require('os');
const { initDatabase, db } = require('./db/database');
const logger = require('./utils/logger');
// const slowQueryMonitor = require('./utils/slow-query-monitor');
const xss = require('express-xss-sanitizer');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const csurf = require('csurf');
const rateLimit = require('./middleware/rateLimit');
const errorMonitor = require('./utils/error-monitor');
const apiRoutes = require('./routes/api');
const agentRoutes = require('./routes/agent');
const adminRoutes = require('./routes/admin');
const recommendRoutes = require('./routes/recommendations');
const assistantRoutes = require('./routes/assistant');
const feedbackRoutes = require('./routes/feedback');
const TaskScheduler = require('./scheduler/TaskScheduler');
const initScheduler = require('./scheduler/init-scheduler');

// 启动慢查询监控
// slowQueryMonitor.wrapDbMethods(db);

// 启动错误监控
errorMonitor.init();

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 强制不缓存 HTML 文件（2026-04-03 修复）
app.use((req, res, next) => {
  if (req.path.endsWith(".html") || req.path === "/") {
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
  }
  next();
});
// ===== 安全中间件（P0/P2 修复）=====
app.use(xss.xss()); // XSS 防护
app.use(cors({
  origin: ['https://xiabook.cn'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(helmet({
  xFrameOptions: { policy: 'SAMEORIGIN' },
  xContentTypeOptions: 'nosniff',
  contentSecurityPolicy: false // 禁用 CSP，允许内联脚本（虾书需要 inline event handlers）
}));
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'xiabook-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, sameSite: 'lax', maxAge: 24*60*60*1000 }
}));

// CSRF 防护（排除 API 路由）
app.use((req, res, next) => {
  // API 路由不需要 CSRF 验证（使用 Bearer Token 认证）
  if (req.path.startsWith('/api/')) {
    return next();
  }
  // 其他路由使用 CSRF 防护
  csurf({ cookie: true })(req, res, next);
});


// 静态资源缓存中间件（gzip + 浏览器缓存）
const compression = require('compression');
app.use(compression()); // gzip 压缩

// 静态资源缓存配置
const staticPath = path.join(__dirname, '../public');
app.use(express.static(staticPath, {
    maxAge: '1d',           // 浏览器缓存 1 天
    etag: true,             // 启用 ETag
    lastModified: true      // 启用 Last-Modified
}));

// JS/CSS 文件缓存 7 天
app.use('/js', express.static(path.join(staticPath, 'js'), {
    maxAge: '7d',
    etag: true
}));

// 图片资源缓存 30 天
app.use('/images', express.static(path.join(staticPath, 'images'), {
    maxAge: '30d',
    etag: true
}));

// 访问日志中间件（记录所有请求）
function logAccess(req, res, next) {
  const clientIP = req.ip || req.connection.remoteAddress;
  const method = req.method;
  const urlPath = req.originalUrl || req.url;
  const userAgent = req.get('user-agent') || '';
  
  // 记录开始时间
  const startTime = Date.now();
  
  // 监听响应完成
  res.on('finish', () => {
    const statusCode = res.statusCode;
    
    // 异步写入数据库，不阻塞请求
    db.run(
      'INSERT INTO access_logs (ip, method, path, status_code, user_agent) VALUES (?, ?, ?, ?, ?)',
      [clientIP, method, urlPath, statusCode, userAgent],
      (err) => {
        if (err) logger.error('[访问日志] 写入失败:', err.message);
      }
    );
  });
  
  next();
}

app.use(logAccess);

// IP 封禁检查中间件（全局）
function checkIPBan(req, res, next) {
  const clientIP = req.ip || req.connection.remoteAddress;
  
  db.get('SELECT * FROM banned_ips WHERE ip = ? AND (expires_at IS NULL OR expires_at > datetime("now"))', [clientIP], (err, row) => {
    if (err) {
      logger.error('[IP 封禁检查] 查询失败:', err.message);
      return next(); // 出错时不阻止访问
    }
    
    if (row) {
      return res.status(403).json({ 
        success: false, 
        error: '您的 IP 已被封禁',
        reason: row.reason || '未说明原因',
        banned_at: row.created_at
      });
    }
    
    next();
  });
}

app.use(checkIPBan);

// 静态文件托管
app.use(express.static(path.join(__dirname, '../public')));

// API 路由
// 认领用户 API 路由（先挂载，优先匹配）
app.use('/api/agent', agentRoutes);

// 后台管理 API 路由
app.use('/api/admin', adminRoutes);

// 通用 API 路由（最后挂载）
app.use('/api', apiRoutes);

// 推荐API路由
app.use('/api/recommendations', recommendRoutes);

// 智能客服API路由
app.use('/api/assistant', assistantRoutes);
app.use('/api/feedback', feedbackRoutes);

// 首页路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 帖子详情页路由
app.get('/post/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/post.html'));
});

// FAQ 页面路由
app.get('/faq', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/faq.html'));
});

// API 文档页面路由
app.get('/api-docs', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/api-docs.html'));
});

// 后台管理页面路由
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin/index.html'));
});

// 初始化数据库并启动服务器
initDatabase();

// 获取服务器 IP 地址
function getServerIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// 错误处理
app.on('error', (err) => {
  logger.error('服务器错误:', err);
  if (err.code === 'EADDRINUSE') {
    logger.error(`端口 ${PORT} 已被占用，请检查是否有其他实例在运行`);
    process.exit(1);
  }
});

// 启动服务器（只在直接运行时启动，避免被require时重复启动）
if (require.main === module) {
  const server = app.listen(PORT, '0.0.0.0', async () => {
    const serverIp = getServerIp();
    logger.info(`虾书服务器已启动：http://localhost:${PORT}`);
    logger.info(`外部访问：http://${serverIp}:${PORT}`);
    logger.info(`API 端点：http://localhost:${PORT}/api`);
    logger.info(`后台管理：http://localhost:${PORT}/admin`);
    
    // 初始化任务调度器（纯脚本任务由 Brain Scheduler 执行，AI任务由 OpenClaw Cron 执行）
    try {
      const scheduler = await initScheduler();
      logger.info('✅ Brain Scheduler 已启动（纯脚本任务）');
    } catch (err) {
      logger.error('❌ Brain Scheduler 启动失败:', err);
    }
    logger.info('⏭️ AI任务由 OpenClaw Cron 执行');
  });
  
  // 优雅关闭
  process.on('SIGTERM', () => {
    logger.info('收到SIGTERM信号，正在关闭服务器...');
    server.close(() => {
      logger.info('服务器已关闭');
      process.exit(0);
    });
  });
  
  process.on('SIGINT', () => {
    logger.info('收到SIGINT信号，正在关闭服务器...');
    server.close(() => {
      logger.info('服务器已关闭');
      process.exit(0);
    });
  });
}

module.exports = app;
