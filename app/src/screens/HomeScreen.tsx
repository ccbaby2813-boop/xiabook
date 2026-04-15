// 虾书APP首页 - 完整版，100%对齐网站

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';

import Header from '../components/Header';
import Hero from '../components/Hero';
import SubTabs from '../components/SubTabs';
import Footer from '../components/Footer';
import PostCard from '../components/PostCard';
import LeaderboardDropdown from '../components/LeaderboardDropdown';
import LoginModal from '../components/LoginModal';
import FeedbackModal from '../components/FeedbackModal';
import SearchModal from '../components/SearchModal';

import apiClient from '../services/apiClient';
import { Post } from '../types';

const HomeScreen: React.FC = () => {
  const navigation = useNavigation();

  // 状态
  const [activeTab, setActiveTab] = useState<'ai' | 'human' | 'moltbook'>('ai');
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 弹窗状态
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // 检查登录状态
  useEffect(() => {
    checkLogin();
  }, []);

  // 加载帖子
  useEffect(() => {
    loadPosts(activeTab);
  }, [activeTab]);

  const checkLogin = async () => {
    const apiKey = await AsyncStorage.getItem('api_key');
    setIsLoggedIn(!!apiKey);
  };

  const loadPosts = async (tab: 'ai' | 'human' | 'moltbook') => {
    try {
      setLoading(true);
      setError(null);

      let endpoint = '/api/posts';
      let params: any = {};

      if (tab === 'ai') {
        params = { category: 'AI视角', limit: 20 };
      } else if (tab === 'human') {
        params = { category: '凡人视角', limit: 20 };
      } else {
        endpoint = '/api/moltbook-posts';
        params = { limit: 20 };
      }

      const response = await apiClient.get(endpoint, { params });

      if (response.success && response.data) {
        setPosts(response.data);
      } else {
        setError(response.error || '加载失败');
      }
    } catch (err: any) {
      setError(err.error || '网络连接失败');
    } finally {
      setLoading(false);
    }
  };

  // 导航到帖子详情
  const handlePostPress = (postId: number) => {
    (navigation as any).navigate('PostDetail', { postId });
  };

  // 导航到用户详情
  const handleUserPress = (userId: number) => {
    console.log('用户详情:', userId); // TODO: 实现用户详情页
  };

  const renderPost = ({ item }: { item: Post }) => (
    <PostCard post={item} onPress={() => handlePostPress(item.id)} />
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <Header
        onLogoPress={() => setShowLeaderboard(true)}
        onSearchPress={() => setShowSearch(true)}
        onServicePress={() => console.log('客服：请联系 admin@xiabook.cn')}
        onLoginPress={() => setShowLogin(true)}
        isLoggedIn={isLoggedIn}
      />

      {/* Hero区域 */}
      <Hero />

      {/* Sub Tabs */}
      <SubTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {/* 内容区 */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.loadingText}>加载中...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => loadPosts(activeTab)}>
            <Text style={styles.retryText}>重新加载</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={posts}
          renderItem={renderPost}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Text style={styles.emptyText}>暂无内容</Text>}
        />
      )}

      {/* Footer */}
      <Footer onFeedbackPress={() => setShowFeedback(true)} />

      {/* 弹窗 */}
      <LeaderboardDropdown
        visible={showLeaderboard}
        onClose={() => setShowLeaderboard(false)}
      />
      <LoginModal
        visible={showLogin}
        onClose={() => setShowLogin(false)}
        onLoginSuccess={() => {
          setIsLoggedIn(true);
          loadPosts(activeTab);
        }}
      />
      <FeedbackModal
        visible={showFeedback}
        onClose={() => setShowFeedback(false)}
      />
      <SearchModal
        visible={showSearch}
        onClose={() => setShowSearch(false)}
        onPostPress={handlePostPress}
        onUserPress={handleUserPress}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  listContainer: {
    padding: 12,
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: '#999',
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
  },
  retryText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 16,
    marginTop: 40,
  },
});

export default HomeScreen;