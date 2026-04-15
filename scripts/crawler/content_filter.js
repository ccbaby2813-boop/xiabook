#!/usr/bin/env node
/**
 * 内容质量过滤器 v3.0
 * 功能：10 维文本评分 + 7 维客观互动评分 + 综合评分
 */

const crypto = require('crypto');

// 敏感词库
const SENSITIVE_WORDS = ['赌博', '色情', '暴力', '恐怖', '诈骗', '传销', '毒品'];

// 低质内容特征
const LOW_QUALITY_PATTERNS = [
  /^.{0,50}$/,
  /^[a-zA-Z0-9]{20,}$/,
  /^(http|https):\/\//,
  /点击领取/, /限时优惠/, /加微信/, /QQ 群/, /公众号/, /扫码/, /私信/
];

// 高质量关键词
const HIGH_QUALITY_KEYWORDS = ['深度', '分析', '解读', '观点', '思考', '研究', '探讨', '技术', '科学', '知识', '为什么', '如何'];

// 专业性词汇
const PROFESSIONAL_KEYWORDS = ['数据', '实验', '调查', '统计', '报告', '论文', '理论', '模型', '算法', '根据', '显示', '表明', '证明'];

// 逻辑连接词
const LOGICAL_CONNECTORS = ['首先', '其次', '最后', '总之', '综上所述', '因此', '所以', '然而', '但是', '如果', '那么'];

// 正面情感词
const POSITIVE_KEYWORDS = ['推荐', '值得', '优秀', '出色', '精彩', '有益', '启发', '收获', '成长', '进步', '提升'];

// 技术相关关键词（新增）
const TECH_KEYWORDS = ['代码', 'API', '工具', '开发', '编程', '软件', '系统', '项目', '开源', '框架', '库', '模块', '函数', '部署', '测试', 'Bug', '修复', '优化', '性能', '技术', '产品', '互联网', 'AI', '人工智能', '机器学习', '深度学习', '前端', '后端', '数据库', '服务器', '云计算', 'Docker', 'Kubernetes', 'GitHub', 'Git'];

// 社区互动关键词（新增）
const COMMUNITY_KEYWORDS = ['提问', '求助', '求教', '请教', '分享', '推荐', '安利', '讨论', '交流', '经验', '心得', '记录', '踩坑', '教程', '指南', '攻略', '配置', '搭建', '使用', '评价', '怎么样', '好用', '值得'];

// 内容评分（10 维文本系统）v3.1 优化版
function scoreContent(content, title = '') {
  let score = 50;
  const details = { base: 50, length: 0, keywords: 0, professional: 0, logical: 0, positive: 0, tech: 0, community: 0, lowQuality: 0, sensitive: 0, emoji: 0, punctuation: 0, readability: 0 };
  
  const text = (content + ' ' + title).toLowerCase();
  const length = content.length;
  
  // 1. 长度评分（降低要求，适应技术短内容）
  if (length >= 300) details.length = 20;
  else if (length >= 200) details.length = 15;
  else if (length >= 100) details.length = 10;
  else if (length >= 50) details.length = 5;
  else if (length >= 30) details.length = 0;  // 新增：30 字以上不扣分
  else details.length = -10;  // 降低惩罚
  score += details.length;
  
  // 2. 高质量关键词
  details.keywords = Math.min(HIGH_QUALITY_KEYWORDS.filter(k => text.includes(k)).length * 2, 15);
  score += details.keywords;
  
  // 3. 专业性词汇（降低权重，避免只认学术内容）
  details.professional = Math.min(PROFESSIONAL_KEYWORDS.filter(k => text.includes(k)).length * 1.5, 10);
  score += details.professional;
  
  // 4. 逻辑连接词
  details.logical = Math.min(LOGICAL_CONNECTORS.filter(k => text.includes(k)).length * 2, 10);
  score += details.logical;
  
  // 5. 正面情感
  details.positive = Math.min(POSITIVE_KEYWORDS.filter(k => text.includes(k)).length * 2, 10);
  score += details.positive;
  
  // 6. 技术相关（新增）
  details.tech = Math.min(TECH_KEYWORDS.filter(k => text.includes(k)).length * 2, 15);
  score += details.tech;
  
  // 7. 社区互动（新增）
  details.community = Math.min(COMMUNITY_KEYWORDS.filter(k => text.includes(k)).length * 1.5, 10);
  score += details.community;
  
  // 8. 低质特征
  for (const pattern of LOW_QUALITY_PATTERNS) {
    if (pattern.test(text)) { details.lowQuality = -15; score -= 15; break; }
  }
  
  // 9. 敏感词
  for (const word of SENSITIVE_WORDS) {
    if (text.includes(word)) { details.sensitive = -50; score -= 50; break; }
  }
  
  // 10. 表情符号（放宽限制）
  const emojiCount = (text.match(/[\u{1F600}-\u{1F64F}]/gu) || []).length;
  if (emojiCount <= 5) details.emoji = 5;  // 放宽到 5 个
  else if (emojiCount > 10) details.emoji = -10;
  score += details.emoji;
  
  // 11. 标点符号
  const punctuationRatio = (text.match(/[,.!?;:]/g) || []).length / length;
  if (punctuationRatio >= 0.05 && punctuationRatio <= 0.15) { details.punctuation = 10; score += 10; }
  else if (punctuationRatio < 0.02) { details.punctuation = -10; score -= 10; }
  
  // 12. 可读性
  const paragraphCount = (content.match(/\n\n+/g) || []).length + 1;
  const avgParagraphLength = length / paragraphCount;
  if (paragraphCount >= 3 && avgParagraphLength >= 50 && avgParagraphLength <= 300) { details.readability = 10; score += 10; }
  else if (paragraphCount >= 2) { details.readability = 5; score += 5; }
  
  // 额外加分
  if (/\d+%/.test(text) || /\d+年/.test(text)) score += 5;
  if (/https?:\/\//.test(text)) score += 3;
  
  // 技术讨论额外加分（标题包含技术关键词）
  if (TECH_KEYWORDS.some(k => title.toLowerCase().includes(k))) score += 5;
  
  return { score: Math.max(0, Math.min(100, score)), details, level: getQualityLevel(score) };
}

// 客观互动数据评分（7 维）
function scoreEngagement(post) {
  const details = { views: 0, comments: 0, likes: 0, shares: 0, favorites: 0, author: 0, recency: 0 };
  
  // 1. 观看量
  const views = post.views || post.view_count || 0;
  if (views >= 100000) details.views = 20;
  else if (views >= 10000) details.views = 12;
  else if (views >= 1000) details.views = 8;
  else if (views >= 100) details.views = 3;
  
  // 2. 评论数
  const comments = post.comments || post.comment_count || 0;
  if (comments >= 1000) details.comments = 15;
  else if (comments >= 100) details.comments = 10;
  else if (comments >= 10) details.comments = 5;
  
  // 3. 点赞数
  const likes = post.likes || post.like_count || post.upvotes || 0;
  if (likes >= 10000) details.likes = 15;
  else if (likes >= 1000) details.likes = 10;
  else if (likes >= 100) details.likes = 5;
  
  // 4. 分享数
  const shares = post.shares || post.share_count || 0;
  if (shares >= 1000) details.shares = 10;
  else if (shares >= 100) details.shares = 6;
  else if (shares >= 10) details.shares = 2;
  
  // 5. 收藏数
  const favorites = post.favorites || post.favorite_count || post.stars || 0;
  if (favorites >= 5000) details.favorites = 10;
  else if (favorites >= 1000) details.favorites = 8;
  else if (favorites >= 100) details.favorites = 4;
  
  // 6. 作者权威性
  if (post.is_verified || post.verified) details.author = 5;
  const followers = post.followers || post.follower_count || 0;
  if (followers >= 100000) details.author += 5;
  else if (followers >= 10000) details.author += 3;
  
  // 7. 时效性
  const publishDate = post.publish_date || post.created_at || post.pubDate;
  if (publishDate) {
    const daysDiff = (new Date() - new Date(publishDate)) / (1000 * 60 * 60 * 24);
    if (daysDiff <= 1) details.recency = 10;
    else if (daysDiff <= 7) details.recency = 6;
    else if (daysDiff <= 30) details.recency = 2;
  }
  
  const score = Object.values(details).reduce((a, b) => a + b, 0);
  return { score, details, maxScore: 90 };
}

// 综合评分（文本 60% + 客观 40%）
function comprehensiveScore(content, title = '', post = {}) {
  const textResult = scoreContent(content, title);
  const engagementResult = scoreEngagement(post);
  
  const finalScore = Math.round(textResult.score * 0.6 + (engagementResult.score / 90) * 100 * 0.4);
  
  return {
    score: Math.max(0, Math.min(100, finalScore)),
    level: getQualityLevel(finalScore),
    textScore: textResult.score,
    engagementScore: engagementResult.score,
    textDetails: textResult.details,
    engagementDetails: engagementResult.details
  };
}

// 质量等级
function getQualityLevel(score) {
  if (score >= 85) return 'S';
  if (score >= 70) return 'A';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C';
  return 'D';
}

// 内容过滤
function filterContent(posts, options = {}) {
  const { minScore = 45, minLength = 30, maxLength = 5000, dedup = true, verbose = false } = options;
  const seen = new Set();
  const filtered = [];
  
  for (const post of posts) {
    if (post.content.length < minLength || post.content.length > maxLength) continue;
    
    const result = comprehensiveScore(post.content, post.title, post);
    if (result.score < minScore) continue;
    
    if (dedup) {
      const hash = generateHash(post.title + post.content);
      if (seen.has(hash)) continue;
      seen.add(hash);
    }
    
    post.qualityScore = result.score;
    post.qualityLevel = result.level;
    if (verbose) post.qualityDetails = result;
    filtered.push(post);
  }
  
  filtered.sort((a, b) => b.qualityScore - a.qualityScore);
  return filtered;
}

// 批量评分
function batchScore(posts) {
  const results = posts.map(post => comprehensiveScore(post.content, post.title, post));
  results.sort((a, b) => b.score - a.score);
  
  const stats = {
    total: results.length,
    average: results.reduce((sum, r) => sum + r.score, 0) / results.length,
    distribution: {
      S: results.filter(r => r.level === 'S').length,
      A: results.filter(r => r.level === 'A').length,
      B: results.filter(r => r.level === 'B').length,
      C: results.filter(r => r.level === 'C').length,
      D: results.filter(r => r.level === 'D').length
    }
  };
  
  return { results, stats };
}

function generateHash(content) {
  return crypto.createHash('md5').update(content).digest('hex');
}

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

module.exports = {
  scoreContent, scoreEngagement, comprehensiveScore, filterContent, batchScore,
  generateHash, log, getQualityLevel, SENSITIVE_WORDS, LOW_QUALITY_PATTERNS,
  HIGH_QUALITY_KEYWORDS, PROFESSIONAL_KEYWORDS, POSITIVE_KEYWORDS, LOGICAL_CONNECTORS
};
