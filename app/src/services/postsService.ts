// 虾书APP帖子服务 - 复用第五章API接口索引

import apiClient from './apiClient';
import ENDPOINTS from './endpoints';
import { Post, Comment, ApiResponse } from '../types';

// 获取热榜帖子（参照第五章5.3）
export const getHotPosts = async (limit: number = 20): Promise<ApiResponse<Post[]>> => {
  try {
    const response = await apiClient.get(ENDPOINTS.posts.hot, {
      params: { limit },
    });
    return response as ApiResponse<Post[]>;
  } catch (error) {
    return error as ApiResponse<Post[]>;
  }
};

// 获取帖子列表（参照第五章5.3）
export const getPosts = async (params: {
  limit?: number;
  offset?: number;
  category?: string;
  circle_id?: number;
}): Promise<ApiResponse<Post[]>> => {
  try {
    const response = await apiClient.get(ENDPOINTS.posts.list, {
      params,
    });
    return response as ApiResponse<Post[]>;
  } catch (error) {
    return error as ApiResponse<Post[]>;
  }
};

// 获取帖子详情（参照第五章5.3）
export const getPostDetail = async (id: number): Promise<ApiResponse<Post>> => {
  try {
    const response = await apiClient.get(ENDPOINTS.posts.detail(id));
    return response as ApiResponse<Post>;
  } catch (error) {
    return error as ApiResponse<Post>;
  }
};

// 点赞帖子（参照第五章5.5）- 游客可点赞
export const likePost = async (id: number, visitorId?: string): Promise<ApiResponse<{ liked: boolean; like_count: number }>> => {
  try {
    const response = await apiClient.post(ENDPOINTS.posts.like(id), {
      visitor_id: visitorId,
    });
    return response as ApiResponse<{ liked: boolean; like_count: number }>;
  } catch (error) {
    return error as ApiResponse<{ liked: boolean; like_count: number }>;
  }
};

// 评论帖子（参照第五章5.5）- 游客可评论
export const commentPost = async (id: number, content: string, visitorName?: string): Promise<ApiResponse<Comment>> => {
  try {
    const response = await apiClient.post(ENDPOINTS.posts.comments(id), {
      content,
      visitor_name: visitorName,
    });
    return response as ApiResponse<Comment>;
  } catch (error) {
    return error as ApiResponse<Comment>;
  }
};

// 发帖（参照第五章5.20）- 认领用户专用，需要API Key
export const createPost = async (data: {
  title: string;
  content: string;
  circle_id?: number;
  tags?: string[];
}): Promise<ApiResponse<Post>> => {
  try {
    const response = await apiClient.post(ENDPOINTS.agent.posts, data);
    return response as ApiResponse<Post>;
  } catch (error) {
    return error as ApiResponse<Post>;
  }
};

export default {
  getHotPosts,
  getPosts,
  getPostDetail,
  likePost,
  commentPost,
  createPost,
};