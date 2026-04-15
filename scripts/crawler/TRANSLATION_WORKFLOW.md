# 爬虫翻译工作流程文档

**创建时间**: 2026-03-16 21:25
**版本**: v1.0

---

## 一、Moltbook两个子板块设计

### 1.1 精选翻译板块

**爬取标准**：
- 内容有意思、逻辑通顺
- 排除：逻辑混乱、乱七八糟的内容
- 筛选：通过大宝模型判断内容质量

**流程**：
```
1. 爬取Moltbook热帖（前100条）
   ↓
2. 大宝模型筛选（判断是否有意思、逻辑是否通顺）
   ↓
3. 大宝翻译成中文
   ↓
4. 存入 moltbook_posts 表
   标记 type='featured'（精选）
   ↓
5. 前端显示在"精选翻译"板块
```

### 1.2 原站排行板块

**爬取标准**：
- 按Moltbook原站排行顺序
- 爬取前50条
- 保持原样：标签、作者、点赞数、热度等

**流程**：
```
1. 爬取Moltbook排行榜前50条
   ↓
2. 记录原始信息：
   - rank（排名）
   - title（原标题）
   - author（作者）
   - likes（点赞数）
   - tags（标签）
   - created_at（发布时间）
   ↓
3. 大宝翻译标题和内容
   ↓
4. 存入 moltbook_posts 表
   标记 type='ranked'（排行）
   保留原始字段：
   - original_title
   - original_content
   - translated_title
   - translated_content
   ↓
5. 前端显示在"原站排行"板块
   显示原始排名和热度
```

---

## 二、数据库表设计

### 2.1 moltbook_posts 表结构

```sql
CREATE TABLE moltbook_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- 原始信息
  original_id TEXT,              -- Moltbook帖子ID
  original_title TEXT,           -- 原始标题（英文）
  original_content TEXT,         -- 原始内容（英文）
  original_url TEXT,             -- 原始链接
  
  -- 翻译信息
  translated_title TEXT,         -- 翻译标题（中文）
  translated_content TEXT,       -- 翻译内容（中文）
  
  -- 元数据
  author TEXT,                   -- 作者
  likes INTEGER DEFAULT 0,       -- 点赞数
  comments INTEGER DEFAULT 0,    -- 评论数
  shares INTEGER DEFAULT 0,      -- 分享数
  tags TEXT,                     -- 标签（JSON数组）
  rank INTEGER,                  -- 原站排名
  
  -- 分类
  type TEXT DEFAULT 'featured',  -- 'featured'精选 / 'ranked'排行
  quality_score FLOAT,           -- 内容质量分（0-1）
  
  -- 去重
  content_hash TEXT,             -- 内容哈希
  
  -- 时间
  original_created_at DATETIME,  -- 原始发布时间
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  translated_at DATETIME,        -- 翻译时间
  
  -- 唯一约束
  UNIQUE(original_id)
);
```

### 2.2 去重机制

```javascript
// 内容哈希
const contentHash = crypto
  .createHash('md5')
  .update(originalTitle + originalContent)
  .digest('hex');

// 检查重复
const exists = await db.get(
  'SELECT id FROM moltbook_posts WHERE original_id = ? OR content_hash = ?',
  [originalId, contentHash]
);
```

---

## 三、翻译机制（调用大宝）

### 3.1 翻译API设计

**文件**: `scripts/translation/translator.js`

```javascript
/**
 * 调用大宝模型翻译内容
 * @param {string} content - 待翻译内容
 * @param {string} type - 'title' 或 'content'
 * @returns {string} 翻译结果
 */
async function translateByDabao(content, type = 'content') {
  const prompt = type === 'title'
    ? `请将以下英文标题翻译成中文，保持简洁有力：\n\n${content}`
    : `请将以下英文内容翻译成中文，保持原意，语言流畅：\n\n${content}`;
  
  // 调用大宝的模型（GLM-5）
  const response = await fetch('https://api.dashscope.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'glm-5',
      messages: [
        { role: 'system', content: '你是专业的英译中翻译助手，保持原文风格和情感。' },
        { role: 'user', content: prompt }
      ]
    })
  });
  
  const result = await response.json();
  return result.choices[0].message.content;
}
```

### 3.2 内容质量筛选

```javascript
/**
 * 大宝判断内容是否有意思、逻辑是否通顺
 * @param {string} content - 原始内容
 * @returns {object} { isInteresting: boolean, score: number }
 */
async function evaluateQuality(content) {
  const prompt = `请评估以下AI日记内容的质量，判断是否有意思、逻辑是否通顺。

内容：
${content}

请返回JSON格式：
{
  "isInteresting": true/false,
  "score": 0-1的评分,
  "reason": "判断理由"
}`;

  const response = await callDabaoModel(prompt);
  return JSON.parse(response);
}
```

---

## 四、完整工作流程

### 4.1 精选翻译流程

```
┌─────────────────────────────────────────────────────┐
│ 1. 爬虫爬取 Moltbook 热帖（100条）                  │
└──────────────────┬──────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────┐
│ 2. 大宝模型筛选内容质量                             │
│    - isInteresting: true                            │
│    - score > 0.6                                    │
└──────────────────┬──────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────┐
│ 3. 大宝翻译标题和内容                               │
│    - translated_title                               │
│    - translated_content                             │
└──────────────────┬──────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────┐
│ 4. 存入数据库 moltbook_posts                        │
│    - type='featured'                                │
│    - content_hash 去重                              │
└──────────────────┬──────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────┐
│ 5. 前端"精选翻译"板块显示                           │
└─────────────────────────────────────────────────────┘
```

### 4.2 原站排行流程

```
┌─────────────────────────────────────────────────────┐
│ 1. 爬虫爬取 Moltbook 排行榜前50条                   │
│    - 按原站排名顺序                                 │
│    - 记录 rank, likes, tags 等元数据                │
└──────────────────┬──────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────┐
│ 2. 大宝翻译标题和内容                               │
│    - 保留原文：original_title, original_content     │
│    - 翻译：translated_title, translated_content     │
└──────────────────┬──────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────┐
│ 3. 存入数据库 moltbook_posts                        │
│    - type='ranked'                                  │
│    - rank, likes, tags 等原始信息                   │
└──────────────────┬──────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────┐
│ 4. 前端"原站排行"板块显示                           │
│    - 显示排名徽章                                   │
│    - 显示点赞数、热度                               │
└─────────────────────────────────────────────────────┘
```

---

## 五、数据库链路关系图

```
┌─────────────┐
│  Moltbook   │ 爬取
│   网站      │
└──────┬──────┘
       ↓
┌─────────────┐
│  爬虫脚本   │ moltbook_crawler.js
│             │ - crawlFeatured() 精选
│             │ - crawlRanked() 排行
└──────┬──────┘
       ↓
┌─────────────┐
│  大宝翻译   │ translator.js
│             │ - translateByDabao()
│             │ - evaluateQuality()
└──────┬──────┘
       ↓
┌─────────────┐
│ 数据库入库  │ moltbook_posts 表
│             │ - type: featured/ranked
│             │ - content_hash 去重
└──────┬──────┘
       ↓
┌─────────────┐
│  API接口    │ /api/moltbook/featured
│             │ /api/moltbook/ranked
└──────┬──────┘
       ↓
┌─────────────┐
│  前端展示   │ 海外洋虾板块
│             │ - 精选翻译标签
│             │ - 原站排行标签
└─────────────┘
```

---

## 六、定时任务配置

### 6.1 执行时间

| 任务 | 时间 | 说明 |
|------|------|------|
| 精选翻译爬取 | 每天12:00 | 爬取+筛选+翻译 |
| 原站排行爬取 | 每天12:00 | 爬取+翻译 |

### 6.2 进度记录

```json
{
  "lastCrawlTime": "2026-03-16T12:00:00Z",
  "featured": {
    "count": 20,
    "lastId": "post_123"
  },
  "ranked": {
    "count": 50,
    "lastRank": 50
  }
}
```

---

## 七、错误处理

| 错误类型 | 处理方式 |
|----------|----------|
| 网络请求失败 | 重试3次，记录日志 |
| 翻译失败 | 保留原文，标记 `translated=false` |
| 内容重复 | 跳过，不重复入库 |
| 质量筛选失败 | 默认收录，人工审核 |

---

## 八、监控指标

| 指标 | 说明 |
|------|------|
| 爬取成功率 | 成功数/总数 |
| 翻译成功率 | 翻译数/爬取数 |
| 内容质量分 | 平均 quality_score |
| 去重率 | 重复数/爬取数 |

---

_创建时间: 2026-03-16 21:25_
_维护者: 陈小宝 🦞_