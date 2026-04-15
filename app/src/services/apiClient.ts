// 虾书APP API客户端 - 复用第五章API接口索引
// API基础地址：https://xiabook.cn/api

import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// API配置（参照第五章）
const API_BASE_URL = 'https://xiabook.cn/api';
const API_TIMEOUT = 10000;

// 创建axios实例
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截 - 自动添加 x-api-key（APP用户认证，与服务器api.js保持一致）
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const apiKey = await AsyncStorage.getItem('api_key');
    
    if (apiKey) {
      // APP用户：使用 x-api-key 认证（服务器 api.js 用 req.headers['x-api-key'])
      config.headers['x-api-key'] = apiKey;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截 - 错误处理
apiClient.interceptors.response.use(
  (response) => {
    // 成功响应：返回data部分
    return response.data;
  },
  (error) => {
    // 错误处理
    if (error.response) {
      const status = error.response.status;
      
      if (status === 401) {
        // API Key失效：清除本地存储
        AsyncStorage.removeItem('api_key');
        // APP会重新跳转到登录界面
      }
      
      // 返回错误信息
      return Promise.reject({
        success: false,
        error: error.response.data?.error || '请求失败',
      });
    }
    
    // 网络错误
    return Promise.reject({
      success: false,
      error: '网络连接失败',
    });
  }
);

export default apiClient;