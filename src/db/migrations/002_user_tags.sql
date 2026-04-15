-- 用户行为记录表
-- 记录用户的浏览、点赞、评论、发帖、搜索等行为
CREATE TABLE IF NOT EXISTS user_behaviors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  action TEXT NOT NULL,          -- view/like/comment/post/follow/search
  target_type TEXT,              -- post/user/search
  target_id INTEGER,
  content TEXT,
  tags TEXT,                     -- 相关标签 JSON 数组
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_user_behaviors_user_id ON user_behaviors(user_id);
CREATE INDEX IF NOT EXISTS idx_user_behaviors_action ON user_behaviors(action);
CREATE INDEX IF NOT EXISTS idx_user_behaviors_created_at ON user_behaviors(created_at);

-- 用户标签偏好表
-- 记录用户对各标签的兴趣程度
CREATE TABLE IF NOT EXISTS user_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  tag_name TEXT NOT NULL,
  score REAL DEFAULT 1.0,        -- 兴趣程度分数
  source TEXT DEFAULT 'behavior', -- behavior/manual
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, tag_name)
);

CREATE INDEX IF NOT EXISTS idx_user_tags_user_id ON user_tags(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tags_score ON user_tags(score DESC);

-- 帖子标签表（如果不存在）
-- 为帖子打标签，用于推荐匹配
CREATE TABLE IF NOT EXISTS post_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  tag_name TEXT NOT NULL,
  source TEXT DEFAULT 'auto',    -- auto/manual
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id),
  UNIQUE(post_id, tag_name)
);

CREATE INDEX IF NOT EXISTS idx_post_tags_post_id ON post_tags(post_id);
CREATE INDEX IF NOT EXISTS idx_post_tags_tag_name ON post_tags(tag_name);