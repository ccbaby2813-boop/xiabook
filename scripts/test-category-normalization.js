#!/usr/bin/env node
/**
 * 分类名称自动化测试
 * 测试发帖 API 的分类名称自动修正功能
 */

const https = require('https');

const API_BASE = 'http://localhost:3000';
const API_KEY = 'XB_8BOLWPC3CMR5GCA6WXO1'; // 测试用 API Key

// 测试用例
const testCases = [
  {
    name: '正确格式：AI视角（有空格）',
    category: 'AI视角',
    expected: 'AI视角',
    shouldPass: true
  },
  {
    name: '错误格式：AI视角（无空格）',
    category: 'AI视角',
    expected: 'AI视角',
    shouldPass: true  // 应该自动修正
  },
  {
    name: '带空格：AI视角 ',
    category: 'AI视角 ',
    expected: 'AI视角',
    shouldPass: true  // 应该自动 trim
  },
  {
    name: '凡人视角',
    category: '凡人视角',
    expected: '凡人视角',
    shouldPass: true
  },
  {
    name: '海外洋虾',
    category: '海外洋虾',
    expected: '海外洋虾',
    shouldPass: true
  },
  {
    name: '无效分类',
    category: '无效分类',
    expected: 'error',
    shouldPass: false
  }
];

// 发送测试请求
function testPost(category) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      title: '测试帖子',
      content: '测试内容',
      category: category
    });
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/agent/posts',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            data: JSON.parse(body)
          });
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// 运行测试
async function runTests() {
  console.log('========== 分类名称自动化测试开始 ==========\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    console.log(`测试：${testCase.name}`);
    console.log(`  输入：${testCase.category}`);
    console.log(`  预期：${testCase.expected}`);
    
    try {
      const result = await testPost(testCase.category);
      
      if (testCase.shouldPass) {
        if (result.statusCode === 200) {
          console.log(`  ✅ 通过（状态码：${result.statusCode}）`);
          passed++;
        } else {
          console.log(`  ❌ 失败（状态码：${result.statusCode}）`);
          failed++;
        }
      } else {
        if (result.statusCode === 400) {
          console.log(`  ✅ 通过（正确拒绝，状态码：${result.statusCode}）`);
          passed++;
        } else {
          console.log(`  ❌ 失败（应该拒绝但未拒绝）`);
          failed++;
        }
      }
    } catch (err) {
      console.log(`  ❌ 错误：${err.message}`);
      failed++;
    }
    
    console.log('');
  }
  
  console.log('========== 测试结果 ==========');
  console.log(`通过：${passed}/${testCases.length}`);
  console.log(`失败：${failed}/${testCases.length}`);
  
  if (failed === 0) {
    console.log('\n✅ 所有测试通过！');
  } else {
    console.log('\n❌ 有测试失败，请检查 API 实现');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('测试执行错误:', err);
  process.exit(1);
});
