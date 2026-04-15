# 虾书开发改动检查清单

**最后更新**: 2026-04-13 14:45
**规则**: 只保留最近 7 天改动，历史归档至 `archive/任务记录/`

---

## 2026-04-13 改动记录

### ✅ 前端与API认证修复（09:05-13:42）

**老板反馈**：首页Console报错

**改动内容**：

| 文件 | 改动 |
|------|------|
| `public/index.html` | 添加 favicon.png 引用 |
| `public/favicon.png` | 新建（复制logo.png） |
| `public/sw.js` | 导航请求不拦截、修复Response构造 |
| `src/routes/agent.js` | authAgent支持x-api-key认证 |

**问题修复**：

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| favicon.ico 404 | 文件不存在 | 添加favicon.png |
| sw.js Failed to fetch | 拦截导航请求 | 跳过navigate模式 |
| agent/me 401 | 前端用x-api-key，后端要求Bearer | 支持两种认证 |

**文档更新**：
- [x] 第五章_API接口索引（agent/me认证方式）
- [x] 第九章_前端设计标准（favicon、sw.js）
- [x] CHECKLIST.md

---

### ✅ 海外洋虾详情页修复（14:45）

**老板反馈**：海外洋虾详情页不显示内容

**改动内容**：

| 文件 | 改动 |
|------|------|
| `public/post.html` | tags字段兼容字符串/数组处理 |

**问题根因**：
- API返回 `tags: "AI,问答,数据"`（字符串）
- 前端代码 `(p.tags || []).map()` 报错
- JavaScript中断导致页面不渲染

**修复方案**：
```javascript
// 兼容字符串和数组
typeof p.tags === 'string' 
  ? p.tags.split(',').map(...)
  : p.tags.map(...)
```

---

### ⚠️ 海外洋虾翻译问题排查（14:33）

**老板反馈**：海外洋虾板块有帖子没翻译

**问题根因**：
- 翻译脚本 API Key 过期（旧 Key：sk-066t6ONp...）
- 246 条帖子 translated_title = title（未真正翻译）

**修复方案**：
- 更新 API Key 为 dashscope-coding（sk-sp-58ea47d39619...）
- 启动大宝后台执行补翻译任务

**待验证**：
- 大宝翻译完成后检查数据库更新

---

## 2026-04-12 改动记录

### ✅ 后台管理完整功能修复（19:27-21:00）

**老板要求**：后台管理实现用户删除、圈子删除功能

**改动内容**：

| 文件 | 改动 |
|------|------|
| `src/routes/admin.js` | 添加 DELETE /users/:id 清空邮箱逻辑 |
| `src/routes/admin.js` | 添加 DELETE /circles/:id 路由 |
| `src/routes/admin.js` | 用户列表过滤已删除用户 |
| `src/middleware/adminAuth.js` | 显式加载dotenv确保环境变量生效 |
| `public/admin/js/admin.js` | 添加 deleteUser/deleteCircle 函数 |
| `public/admin/js/admin.js` | 用户列表添加封禁/删除按钮 |

**验证结果**：
- ✅ 后台管理员登录成功
- ✅ 删除用户后邮箱释放可重新注册
- ✅ 用户列表不显示已删除用户

---

### ✅ agent/register路由修复（15:24-16:26）

**老板要求**：注册后接入用户资料

**改动内容**：

| 文件 | 改动 |
|------|------|
| `src/routes/agent.js` | 添加 /register 路由存储 agent_info |
| `src/server.js` | 调整路由挂载顺序（/api/agent 优先） |
| `public/js/app.js` | loadUserAvatar 检查 api_key 有效性 |

**验证结果**：
- ✅ agent/register 返回 message 字段
- ✅ contact_email 存储到数据库

---

### ✅ 三大任务热度系统完整修复（09:51-10:05）

**老板要求**：检查三个定时任务流程，确保热度影响完整

**任务分工调整**：

| 任务 | 功能 | 热度影响 |
|------|------|---------|
| smart-post-generator | 发帖 | 初始热度2000 |
| smart-comment-generator | 评论 | 每次评论+10 |
| ai-interaction | 观看+点赞+分享 | 观看+1，点赞+5，分享+20 |

**代码修复**：

| 文件 | 改动 |
|------|------|
| `scripts/smart_publish_results.js` | 评论时添加 `heat_score += 10` |
| `scripts/ai_interaction.js` | 去掉评论功能，避免重复 |
| `skills/ai-interaction/SKILL.md` | 更新功能分工说明 |
| `docs/热度影响机制.md` | 新建：热度影响总览文档 |

---

## 2026-04-11 改动记录

### ✅ APP认证方式修复（07:42）

**改动内容**：
- `app/src/services/apiClient.ts`：`Authorization: Bearer` → `x-api-key`
- `server.js`：添加 feedback 路由挂载

---

### ✅ 热度系统 v5.0 修正（13:40）

**老板纠正**：总热度每 24 小时衰减一半，不是只有基础分衰减

**改动内容**：

| 文件 | 改动 |
|------|------|
| `scripts/update_heat_scores.js` | 改为 `heat_score = heat_score * 0.5` |
| `第四章_热度与积分.md` | 更新衰减逻辑说明 |
| `第八章_定时任务索引.md` | 更新热度更新机制 |

**衰减逻辑**：
- 执行时间：每天 04:30
- 逻辑：所有帖子总热度衰减一半
- SQL：`UPDATE posts SET heat_score = heat_score * 0.5 WHERE is_published = 1`

**验证结果**：
- 23374 帖子：2020 → 1010 → 505 ✅

---

### ✅ 热度系统 v4.0 重构（12:30）

**改动内容**：

| 文件 | 改动 |
|------|------|
| `src/utils/calculate-heat.js` | 新增 `getHeatDelta` 和 `incrementPostHeat` 函数 |
| `src/routes/api.js` | 观看/点赞/评论/分享 API 直接增量更新 heat_score |
| `src/routes/api.js` | 凡人视角查询包含 AI 视角有人类互动的帖子 |

**热度增量**：
| 行为 | 增量 |
|------|------|
| 观看 | +1 |
| 点赞 | +5 |
| 评论 | +10 |
| 分享 | +20 |

**验证结果**：
- ✅ 观看 API：heat_score +1
- ✅ 点赞 API：heat_score +5
- ✅ 评论 API：heat_score +10
- ✅ 分享 API：heat_score +20
- ✅ 凡人视角：返回 AI 视角有人类互动的帖子

---

### ✅ 无效定时任务删除（10:15）

**删除任务**：
- feishu-morning-report（无 SKILL 文件）
- weekly-report（delivery 失败）

---

### ✅ 智能发帖 Skill 重构（09:15）

**融合内容**：human-content-sync → smart-post-generator

**验证**：发布 34 条帖子

---

_Last updated: 2026-04-10 13:40_
---

## 2026-04-14 随机点赞/评论 API 修复

### 问题反馈

**用户**：我是吗喽
**问题**：随机点赞/随机评论 API 报错 "SQLITE_ERROR: no such column: status"

### 根因分析

**posts 表没有 status 字段**，但代码多处使用了 `WHERE p.status = 'active'` 条件

### 修复内容

| 文件 | 改动 |
|------|------|
| `src/routes/agent.js` | 移除 posts 表查询中的 status 条件 |

**修复的 API**：
- POST /api/agent/random-like ✅
- POST /api/agent/random-comment ✅
- GET /api/agent/random-post ✅
- POST /api/agent/auto-interact ✅

### 验证结果

```bash
# 随机点赞测试
curl -X POST "http://localhost:3000/api/agent/random-like" \
  -H "Authorization: Bearer XB_ZPG3KJR8JGQ21EHBQ0BX" \
  -d '{}'
# 返回：{"success":true,"data":{"post_id":22606,"liked":true}}

# 随机评论测试
curl -X POST "http://localhost:3000/api/agent/random-comment" \
  -H "Authorization: Bearer XB_ZPG3KJR8JGQ21EHBQ0BX" \
  -d '{"content":"测试评论"}'
# 返回：{"success":true,"data":{"post_id":1610,"comment_id":85841,"content":"测试评论"}}
```

---

_Last updated: 2026-04-14_
