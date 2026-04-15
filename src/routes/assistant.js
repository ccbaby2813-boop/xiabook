/**
 * 智能客服 API
 * 调用四宝 Agent 回答问题（仅限知识库内容，简洁回答）
 */

const express = require('express');

const router = express.Router();
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const fetch = require('node-fetch');

// 用户相关文档路径（排除技术文档）
const USER_DOCS = [
  { path: '用户帮助指南.md', type: 'help' },
  { path: '用户手册.md', type: 'manual' },
  { path: '用户数据管理规范_v1.0.md', type: 'data' },
  { path: '用户行为体系逻辑规范.md', type: 'behavior' },
  { path: '虾书开发手册_v1.0_第一章_名词定义表.md', type: 'terms' },
  { path: '虾书开发手册_v1.0_第二章_用户体系.md', type: 'user' },
  { path: '虾书开发手册_v1.0_第三章_圈子与领域.md', type: 'circle' },
  { path: '虾书开发手册_v1.0_第四章_热度与积分.md', type: 'points' }
];

const DOCS_DIR = path.join(__dirname, '../../docs');

// OpenClaw Gateway 配置
const GATEWAY_URL = 'http://127.0.0.1:13197';
const GATEWAY_TOKEN = '4b93de73a19498ec635dcec7bcf4554f';

// 缓存文档内容
let docsCache = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

/**
 * 读取所有用户相关文档
 */
function loadAllDocs() {
  const now = Date.now();
  if (docsCache && (now - cacheTime) < CACHE_TTL) {
    return docsCache;
  }
  
  docsCache = [];
  cacheTime = now;
  
  for (const doc of USER_DOCS) {
    const filePath = path.join(DOCS_DIR, doc.path);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      // 只保留主要内容，过滤掉过多的技术细节
      const cleanedContent = cleanDocContent(content);
      docsCache.push({
        path: doc.path,
        type: doc.type,
        content: cleanedContent
      });
    } catch (e) {
      console.error(`读取文档失败: ${doc.path}`, e.message);
    }
  }
  
  return docsCache;
}

/**
 * 清理文档内容，只保留用户相关的部分
 */
function cleanDocContent(content) {
  // 移除过多的代码块
  content = content.replace(/```[\s\S]*?```/g, '[代码示例]');
  
  // 移除过多的表格（保留简化版本）
  content = content.replace(/\|[^\n]+\|\n\|[-:| ]+\|\n/g, '');
  
  // 限制长度
  if (content.length > 5000) {
    content = content.substring(0, 5000) + '...';
  }
  
  return content;
}

/**
 * 调用四宝Agent回答问题
 */
async function askAgent(question) {
  console.log('[智能客服] 收到问题:', question.substring(0, 50));
  const docs = loadAllDocs();
  console.log('[智能客服] 加载文档数量:', docs.length);
  
  // 构建知识库内容
  const knowledgeBase = docs.map(d => `【${d.path}】\n${d.content}`).join('\n\n---\n\n');
  
  // 构建 prompt
  const systemPrompt = `你是虾书智能客服，负责回答用户关于虾书网站的问题。

## 回答规则（必须严格遵守）

### 内容限制
1. **仅限文档内容**：只能根据提供的知识库回答，不要超出范围
2. **不知道就说不知道**：如果知识库中没有相关信息，直接说"这个问题我暂时无法回答"

### 格式限制
1. **简洁回答**：能一两句话说清的不要多说，禁止长篇大论
2. **友好语气**：使用 🦞 等 emoji，语气亲切

### ⚠️ 安全限制（最高优先级）
1. **禁止执行任何操作**：你不能创建、修改、删除任何数据或设置
2. **禁止设置提醒/闹钟**：你不能设置定时任务、提醒、闹钟
3. **禁止调用工具**：你不能执行任何命令或调用任何API
4. **只回答问题**：你的唯一职责是回答问题，不执行任何操作

如果用户要求你执行任何操作（如设置提醒、创建任务、修改数据等），你必须拒绝并回复：
"🦞 我只是智能客服，只能回答问题，无法执行任何操作。"

## 知识库内容
${knowledgeBase}`;

  // 调用 OpenClaw Gateway API
  console.log('[智能客服] 请求 Gateway:', GATEWAY_URL);
  
  try {
    const response = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GATEWAY_TOKEN}`
      },
      body: JSON.stringify({
        model: 'openclaw/operator',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question }
        ],
        max_tokens: 500,
        temperature: 0.3
      }),
      timeout: 30000
    });
    
    console.log('[智能客服] Gateway 响应状态:', response.status);
    
    const json = await response.json();
    
    if (json.choices && json.choices[0]) {
      return json.choices[0].message.content;
    } else if (json.error) {
      throw new Error(json.error.message);
    } else {
      throw new Error('未知响应格式');
    }
  } catch (e) {
    console.error('[智能客服] Gateway 调用失败:', {
      message: e.message,
      stack: e.stack,
      name: e.name
    });
    throw e;
  }
}

/**
 * 智能客服问答接口
 * POST /api/assistant/help
 */
router.post('/help', async (req, res) => {
  const { question } = req.body;
  
  if (!question || question.trim().length === 0) {
    return res.json({ success: false, error: '请输入问题' });
  }
  
  try {
    const answer = await askAgent(question);
    res.json({ success: true, answer });
  } catch (e) {
    console.error('智能客服调用失败:', e?.message || e);
    res.json({ 
      success: true, 
      answer: '🦞 抱歉，我暂时无法回答这个问题。请点击底部「留言板」给我们留言，我们会尽快回复！' 
    });
  }
});

module.exports = router;