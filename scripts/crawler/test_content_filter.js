#!/usr/bin/env node
/**
 * 内容评分系统测试 v2.0（含客观互动数据）
 */

const { scoreContent, scoreEngagement, comprehensiveScore, batchScore, getQualityLevel } = require('./content_filter');

// 测试内容
const testPosts = [
  {
    title: '深度分析：AI 如何改变我们的生活',
    content: `人工智能正在深刻地改变着我们的生活方式。根据最新数据显示，2026 年全球 AI 市场规模已达到 5000 亿美元。

首先，在医疗领域，AI 辅助诊断系统已经能够帮助医生更准确地识别疾病。研究表明，AI 系统在某些癌症早期筛查中的准确率甚至超过了人类专家。

其次，在教育领域，个性化学习系统正在 revolutionizing 传统教育模式。通过分析学生的学习行为和偏好，系统能够为每个学生定制专属的学习路径。

最后，在交通领域，自动驾驶技术的发展将彻底改变我们的出行方式。预计未来 5 年内，L4 级自动驾驶汽车将大规模商用。

综上所述，AI 技术正在各个领域发挥着越来越重要的作用，我们需要积极拥抱这一变革。`,
    // 客观互动数据
    views: 150000,
    comments: 800,
    likes: 12000,
    shares: 3000,
    favorites: 5000,
    is_verified: true,
    followers: 500000,
    created_at: new Date().toISOString()
  },
  {
    title: '今天天气不错',
    content: '今天天气真好，出去玩了。',
    views: 50,
    comments: 2,
    likes: 5,
    shares: 0,
    favorites: 0
  },
  {
    title: '技术分享：如何优化数据库查询性能',
    content: `在数据库优化过程中，我们需要关注以下几个关键点。

首先，索引的设计至关重要。根据经验，合理的索引可以将查询速度提升 10 倍以上。我们建议对经常用于 WHERE 条件的字段建立索引。

其次，查询语句的优化也不容忽视。避免使用 SELECT *，只查询需要的字段。使用 EXPLAIN 分析查询计划，找出性能瓶颈。

最后，数据库参数的调优也很关键。根据实际业务场景调整 buffer pool 大小、连接数等参数。

通过上述优化措施，我们的系统查询性能提升了 300%。`,
    views: 80000,
    comments: 500,
    likes: 8000,
    shares: 2000,
    favorites: 3000,
    is_verified: true,
    followers: 100000,
    created_at: new Date(Date.now() - 86400000).toISOString() // 1 天前
  }
];

console.log('========== 内容评分系统测试 v2.0 ==========\n');
console.log('包含：文本质量评分 + 客观互动数据评分\n');

// 综合评分测试
console.log('【综合评分测试】（文本 60% + 客观 40%）\n');
for (const post of testPosts) {
  const result = comprehensiveScore(post.content, post.title, post);
  console.log(`标题：${post.title}`);
  console.log(`综合评分：${result.score} (${result.level}级)`);
  console.log(`  - 文本质量分：${result.textScore}`);
  console.log(`  - 客观互动分：${result.engagementScore}`);
  console.log(`  - 观看量：${post.views || 0}`);
  console.log(`  - 评论数：${post.comments || 0}`);
  console.log(`  - 点赞数：${post.likes || 0}`);
  console.log(`  - 分享数：${post.shares || 0}`);
  console.log(`  - 收藏数：${post.favorites || 0}`);
  console.log(`  - 作者认证：${post.is_verified ? '是' : '否'}`);
  console.log(`  - 粉丝数：${post.followers || 0}`);
  console.log('---\n');
}

// 纯客观数据评分测试
console.log('\n【纯客观数据评分测试】\n');
const engagementTest = {
  views: 500000,
  comments: 2000,
  likes: 50000,
  shares: 10000,
  favorites: 20000,
  is_verified: true,
  followers: 1000000
};
const engagementResult = scoreEngagement(engagementTest);
console.log(`客观互动评分：${engagementResult.score}/${engagementResult.maxScore}`);
console.log('详细评分：', JSON.stringify(engagementResult.details, null, 2));

console.log('\n========== 测试完成 ==========');
