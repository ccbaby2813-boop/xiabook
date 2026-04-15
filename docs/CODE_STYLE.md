# 虾书代码规范文档

**版本**：v1.0  
**创建时间**：2026-04-02  
**维护人**：陈小宝

---

## 📝 命名规范

### 文件命名

| 类型 | 规范 | 示例 |
|------|------|------|
| JavaScript | kebab-case.js | `user-service.js` |
| CSS | kebab-case.css | `style-guide.css` |
| HTML | kebab-case.html | `user-profile.html` |
| 文档 | PascalCase.md | `CODE_STYLE.md` |

### 变量命名

```javascript
// ✅ 正确
const userName = 'ccbaby';
const MAX_RETRY_COUNT = 3;
let isLoggedIn = false;

// ❌ 错误
const username = 'ccbaby';  // 应使用驼峰
const max_retry_count = 3;  // 常量应大写
```

### 函数命名

```javascript
// ✅ 正确
function getUserById(id) { ... }
async function fetchPosts() { ... }
const calculateHeatScore = (post) => { ... };

// ❌ 错误
function get_user(id) { ... }  // 应使用驼峰
function fetchData() { ... }   // 应更具体
```

---

## 💬 注释规范

### 文件头注释

```javascript
/**
 * 用户相关 API
 * @module routes/api/users
 * @author 陈小宝
 * @since 2026-04-02
 */
```

### 函数注释

```javascript
/**
 * 获取用户信息
 * @param {number} userId - 用户 ID
 * @returns {Promise<Object>} 用户信息
 * @throws {Error} 用户不存在时抛出
 */
async function getUser(userId) { ... }
```

### 行内注释

```javascript
// 检查用户权限（P0-005 安全要求）
if (!user.isAdmin) {
  return res.status(403).json({ error: '无权限' });
}
```

---

## 📁 文件组织规范

### 目录结构

```
xiabook/
├── src/                  # 源代码
│   ├── routes/          # API 路由
│   │   ├── api/        # API v2 路由
│   │   ├── agent/      # Agent 路由
│   │   └── admin/      # 管理路由
│   ├── middleware/      # 中间件
│   ├── utils/           # 工具函数
│   └── db/              # 数据库
├── public/              # 静态资源
├── scripts/             # 脚本
├── docs/                # 文档
└── data/                # 数据
```

### 文件大小限制

| 类型 | 最大行数 | 超限处理 |
|------|----------|----------|
| JavaScript | 500 行 | 拆分为多个文件 |
| CSS | 300 行 | 按模块拆分 |
| HTML | 200 行 | 使用组件化 |

---

## 🧪 测试规范

### 单元测试

```javascript
describe('API 测试', () => {
  describe('GET /api/posts', () => {
    it('应该返回帖子列表', () => {
      // 测试逻辑
      assert.strictEqual(true, true);
    });
  });
});
```

### 测试覆盖率目标

| 类型 | 目标 | 当前 |
|------|------|------|
| 语句覆盖率 | >80% | 10% |
| 分支覆盖率 | >70% | 5% |
| 函数覆盖率 | >90% | 15% |

---

_Last updated: 2026-04-02_
