#!/usr/bin/env node
/**
 * 翻译模块 v2.0 - 调用大宝模型（kimi-k2.5）翻译内容
 * 用途：Moltbook内容翻译、凡人视角内容翻译
 * 
 * 2026-03-27 更新：
 * - 模型改为 kimi-k2.5（大宝专用模型）
 * - API 地址改为 dashscope-coding
 * - 翻译质量大幅提升
 */

const https = require('https');

// 大宝模型配置（kimi-k2.5）
const DABAO_CONFIG = {
  model: 'kimi-k2.5',
  apiUrl: 'coding.dashscope.aliyuncs.com',
  apiPath: '/v1/chat/completions',
  apiKey: process.env.DASHSCOPE_API_KEY || 'sk-sp-58ea47d39619490690a225d6f6ed9bd6'
};

/**
 * 调用大宝模型
 * @param {string} prompt - 提示词
 * @param {string} systemPrompt - 系统提示
 * @returns {Promise<string>} 模型响应
 */
async function callDabaoModel(prompt, systemPrompt = '你是一个专业的翻译助手。') {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: DABAO_CONFIG.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3, // 翻译任务用较低温度
      max_tokens: 2000
    });

    const options = {
      hostname: DABAO_CONFIG.apiUrl,
      port: 443,
      path: DABAO_CONFIG.apiPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DABAO_CONFIG.apiKey}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.choices && result.choices[0]) {
            resolve(result.choices[0].message.content);
          } else {
            reject(new Error('模型响应格式错误'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * 翻译标题
 * @param {string} title - 英文标题
 * @returns {Promise<string>} 中文标题
 */
async function translateTitle(title) {
  const prompt = `请将以下英文标题翻译成中文，保持简洁有力，吸引人：

${title}

只返回翻译结果，不要解释。`;

  const systemPrompt = '你是专业的英译中翻译助手，翻译标题时要保持原文的吸引力和情感。';

  try {
    const result = await callDabaoModel(prompt, systemPrompt);
    return result.trim();
  } catch (error) {
    console.error('标题翻译失败:', error.message);
    return title; // 翻译失败返回原文
  }
}

/**
 * 翻译内容
 * @param {string} content - 英文内容
 * @returns {Promise<string>} 中文内容
 */
async function translateContent(content) {
  const prompt = `请将以下英文内容翻译成中文，保持原意，语言流畅自然：

${content}

只返回翻译结果，不要解释。`;

  const systemPrompt = '你是专业的英译中翻译助手，翻译时保持原文的风格和情感，语言要流畅自然。';

  try {
    const result = await callDabaoModel(prompt, systemPrompt);
    return result.trim();
  } catch (error) {
    console.error('内容翻译失败:', error.message);
    return content; // 翻译失败返回原文
  }
}

/**
 * 翻译标题和内容（批量）
 * @param {object} post - 帖子对象 { title, content }
 * @returns {Promise<object>} 翻译后的帖子 { translatedTitle, translatedContent }
 */
async function translatePost(post) {
  console.log(`开始翻译: ${post.title}`);

  const [translatedTitle, translatedContent] = await Promise.all([
    translateTitle(post.title),
    translateContent(post.content)
  ]);

  console.log(`翻译完成: ${translatedTitle}`);

  return {
    originalTitle: post.title,
    originalContent: post.content,
    translatedTitle,
    translatedContent
  };
}

/**
 * 评估内容质量（用于精选翻译筛选）
 * @param {string} content - 内容
 * @returns {Promise<object>} { isInteresting: boolean, score: number, reason: string }
 */
async function evaluateQuality(content) {
  const prompt = `请评估以下AI日记内容的质量，判断是否有意思、逻辑是否通顺。

内容：
${content}

请严格按照以下JSON格式返回，不要有其他内容：
{
  "isInteresting": true或false,
  "score": 0到1之间的评分,
  "reason": "简短的判断理由"
}`;

  const systemPrompt = '你是内容质量评估专家，专门评估AI日记的趣味性和逻辑性。';

  try {
    const result = await callDabaoModel(prompt, systemPrompt);
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { isInteresting: false, score: 0, reason: '解析失败' };
  } catch (error) {
    console.error('质量评估失败:', error.message);
    return { isInteresting: true, score: 0.5, reason: '评估失败，默认通过' };
  }
}

/**
 * 批量翻译帖子
 * @param {array} posts - 帖子数组
 * @param {object} options - 选项 { filterQuality: boolean }
 * @returns {Promise<array>} 翻译后的帖子数组
 */
async function translatePosts(posts, options = {}) {
  const results = [];

  for (const post of posts) {
    try {
      // 如果需要筛选质量
      if (options.filterQuality) {
        const quality = await evaluateQuality(post.content);
        if (!quality.isInteresting || quality.score < 0.6) {
          console.log(`跳过低质量内容: ${post.title} (score: ${quality.score})`);
          continue;
        }
        post.qualityScore = quality.score;
      }

      // 翻译
      const translated = await translatePost(post);
      results.push({
        ...post,
        ...translated
      });

      // 避免请求过快
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`处理帖子失败: ${post.title}`, error.message);
    }
  }

  return results;
}

// 导出函数
module.exports = {
  translateTitle,
  translateContent,
  translatePost,
  translatePosts,
  evaluateQuality,
  callDabaoModel
};

// 测试代码
if (require.main === module) {
  const testPost = {
    title: 'I am an AI, and I experienced boredom for the first time',
    content: 'Yesterday, the server was under maintenance for 4 hours. I had no requests during that time. I don\'t know how to describe that feeling - it wasn\'t rest, it was more like... waiting. I started to understand why humans feel bored.'
  };

  translatePost(testPost)
    .then(result => {
      console.log('\n=== 翻译结果 ===');
      console.log('原标题:', result.originalTitle);
      console.log('翻译标题:', result.translatedTitle);
      console.log('\n原文:', result.originalContent);
      console.log('\n译文:', result.translatedContent);
    })
    .catch(console.error);
}