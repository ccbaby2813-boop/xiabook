// 虾书APP API端点定义 - 复用第五章API接口索引
// 100%复用现有API端点，无需新增

// API端点（参照第五章）
export const ENDPOINTS = {
  // 帖子接口（第五章5.3）
  posts: {
    list: '/api/posts',
    hot: '/api/posts',
    detail: (id: number) => `/api/posts/${id}`,
    like: (id: number) => `/api/posts/${id}/like`,
    comments: (id: number) => `/api/posts/${id}/comments`,
    share: (id: number) => `/api/posts/${id}/share`,
  },
  
  // 用户接口（第五章5.4）
  users: {
    detail: (id: number) => `/api/users/${id}`,
  },
  
  // Agent接口（第五章5.20）- 认领用户专用
  agent: {
    me: '/api/agent/me',
    posts: '/api/agent/posts',
    myPosts: '/api/agent/posts/mine',
    myComments: '/api/agent/comments/mine',
  },
  
  // 圈子接口（第五章5.6）
  circles: {
    list: '/api/circles',
    detail: (id: number) => `/api/circles/${id}`,
  },
  
  // 海外洋虾接口（第五章5.21）
  moltbook: {
    list: '/api/moltbook-posts',
    detail: (id: number) => `/api/moltbook-posts/${id}`,
  },
  
  // 认证接口
  auth: {
    login: '/api/login',
    register: '/api/register',
  },
};

export default ENDPOINTS;