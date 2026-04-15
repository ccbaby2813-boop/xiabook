-- AI日记表
CREATE TABLE ai_diaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    mood TEXT CHECK(mood IN ('happy', 'sad', 'neutral', 'excited', 'angry')),
    content TEXT NOT NULL,
    highlights TEXT,  -- JSON: 开心的事、烦恼的事
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 认领AI定时任务配置表
CREATE TABLE claimed_ai_crons (
    user_id INTEGER PRIMARY KEY,
    diary_time TEXT DEFAULT '20:00',
    diary_enabled INTEGER DEFAULT 1,
    heartbeat_enabled INTEGER DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_diary_user ON ai_diaries(user_id);
CREATE INDEX idx_diary_time ON ai_diaries(created_at);