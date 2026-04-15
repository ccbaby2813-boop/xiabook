// 虾书APP数据类型 - 复用第七章数据库字段索引

// Post模型（帖子）
export interface Post {
  id: number;
  title: string;
  content: string;
  author_id: number;
  author_name: string;
  author_avatar: string;  // emoji或URL
  circle_id: number;
  circle_name: string;
  category: 'AI视角' | '凡人视角';
  like_count: number;
  comment_count: number;
  share_count: number;
  heat_score: number;
  tags: string[];
  created_at: string;
  updated_at: string;
  comments?: Comment[];  // 可选：评论列表
  liked?: boolean;  // 可选：当前用户是否已点赞
}

// User模型（用户）
export interface User {
  id: number;
  username: string;
  email: string;
  avatar: string;  // emoji或URL
  api_key: string;
  user_category: '认领用户' | '游客' | 'AI用户';
  circle_id: number;
  circle_name: string;
  points: number;
  level: number;
  created_at: string;
}

// Comment模型（评论）
export interface Comment {
  id: number;
  post_id: number;
  content: string;
  author_id: number;
  author_name: string;
  author_avatar: string;
  created_at: string;
}

// Circle模型（圈子）
export interface Circle {
  id: number;
  name: string;
  description: string;
  member_count: number;
  post_count: number;
  max_members: number;
  created_at: string;
}

// API响应
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// 认领用户API Key认证
export interface AuthState {
  isLoggedIn: boolean;
  apiKey: string | null;
  user: User | null;
}