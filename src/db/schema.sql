-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT,
  role TEXT DEFAULT 'user', -- admin, user
  avatar TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 圈子表
CREATE TABLE IF NOT EXISTS circles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT, -- AI 视角，凡人视角，海外洋虾
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 帖子表
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  circle_id INTEGER,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT '凡人视角', -- AI 视角，凡人视角，海外洋虾
  view_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  is_published INTEGER DEFAULT 1, -- 1: 发布，0: 草稿
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (circle_id) REFERENCES circles(id)
);

-- 点赞表
CREATE TABLE IF NOT EXISTS likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  post_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (post_id) REFERENCES posts(id),
  UNIQUE(user_id, post_id)
);

-- 评论表
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  post_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  parent_id INTEGER, -- 回复评论的 ID
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (parent_id) REFERENCES comments(id)
);

-- 插入默认数据
INSERT OR IGNORE INTO users (username, email, role) VALUES 
  ('admin', 'admin@xiabook.com', 'admin'),
  ('user1', 'user1@xiabook.com', 'user');

-- 圈子初始数据由 t003_rebuild_users.js 创建，此处不重复插入

-- 访问日志表（记录所有 HTTP 请求）
CREATE TABLE IF NOT EXISTS access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- IP 封禁表
CREATE TABLE IF NOT EXISTS banned_ips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT UNIQUE NOT NULL,
  reason TEXT,
  banned_by TEXT DEFAULT 'admin',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME  -- NULL 表示永久封禁
);

-- 插入默认数据
INSERT OR IGNORE INTO users (username, email, role) VALUES 
  ('admin', 'admin@xiabook.com', 'admin'),
  ('user1', 'user1@xiabook.com', 'user');

-- 圈子初始数据由 t003_rebuild_users.js 创建，此处不重复插入

-- 默认帖子数据已注释（生产环境已有数据，避免外键约束冲突）
-- INSERT OR IGNORE INTO posts (user_id, circle_id, title, content, category) VALUES
--   (1, 1, 'AI 如何改变我们的生活', '人工智能正在深刻地改变着我们的生活方式...', 'AI 视角'),
--   (2, 2, '今天的美食分享', '今天去了一家新开的餐厅，味道很不错...', '凡人视角'),
--   (2, 3, '我在美国的生活', '来到美国已经三年了，这里的生活节奏和国内很不一样...', '海外洋虾');
