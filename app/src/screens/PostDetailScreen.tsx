// 帖子详情页

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import apiClient from '../services/apiClient';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Comment {
  id: number;
  user_id: number;
  username: string;
  content: string;
  created_at: string;
}

interface PostDetail {
  id: number;
  title: string;
  content: string;
  username: string;
  avatar: string;
  circle_name: string;
  view_count: number;
  like_count: number;
  comment_count: number;
  heat_score: number;
  created_at: string;
}

const PostDetailScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation();
  const postId = route.params?.postId;

  const [post, setPost] = useState<PostDetail | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [commentText, setCommentText] = useState('');

  useEffect(() => {
    loadPost();
    loadComments();
  }, [postId]);

  const loadPost = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/api/posts/${postId}`);
      if (response.success && response.data) {
        setPost(response.data);
      }
    } catch (e) {
      console.error('加载帖子失败');
    } finally {
      setLoading(false);
    }
  };

  const loadComments = async () => {
    try {
      const response = await apiClient.get(`/api/posts/${postId}/comments`);
      if (response.success && response.data) {
        setComments(response.data);
      }
    } catch (e) {
      console.error('加载评论失败');
    }
  };

  const handleLike = async () => {
    try {
      const response = await apiClient.post(`/api/posts/${postId}/like`);
      if (response.success) {
        setLiked(response.liked || true);
        loadPost(); // 重新加载更新点赞数
      }
    } catch (e) {
      console.error('点赞失败');
    }
  };

  const handleComment = async () => {
    if (!commentText.trim()) return;

    try {
      const apiKey = await AsyncStorage.getItem('api_key');
      const body: any = { content: commentText };
      
      // 游客评论需要visitor_name
      if (!apiKey) {
        body.visitor_name = '游客';
      }

      const response = await apiClient.post(`/api/posts/${postId}/comments`, body);
      if (response.success) {
        setCommentText('');
        loadComments();
        loadPost();
      }
    } catch (e) {
      console.error('评论失败');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>帖子不存在</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>返回</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content}>
        {/* 帖子内容 */}
        <View style={styles.postSection}>
          <View style={styles.authorRow}>
            <Text style={styles.avatar}>{post.avatar || '👤'}</Text>
            <View>
              <Text style={styles.username}>{post.username}</Text>
              <Text style={styles.circle}>{post.circle_name}</Text>
            </View>
          </View>
          <Text style={styles.title}>{post.title}</Text>
          <Text style={styles.body}>{post.content}</Text>
          <View style={styles.stats}>
            <Text style={styles.stat}>👁 {post.view_count}</Text>
            <Text style={styles.stat}>❤️ {post.like_count}</Text>
            <Text style={styles.stat}>💬 {post.comment_count}</Text>
            <Text style={styles.stat}>🔥 {post.heat_score}</Text>
          </View>
        </View>

        {/* 评论列表 */}
        <View style={styles.commentsSection}>
          <Text style={styles.commentsTitle}>💬 评论 ({comments.length})</Text>
          {comments.map((comment) => (
            <View key={comment.id} style={styles.commentItem}>
              <Text style={styles.commentAuthor}>{comment.username}</Text>
              <Text style={styles.commentContent}>{comment.content}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* 底部操作栏 */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>← 返回</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.likeBtn, liked && styles.likedBtn]} onPress={handleLike}>
          <Text style={styles.likeBtnText}>{liked ? '❤️ 已赞' : '🤍 点赞'}</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.commentInput}
          placeholder="写评论..."
          value={commentText}
          onChangeText={setCommentText}
        />
        <TouchableOpacity style={styles.submitBtn} onPress={handleComment}>
          <Text style={styles.submitBtnText}>发送</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    marginBottom: 16,
  },
  backText: {
    fontSize: 16,
    color: '#6366f1',
  },
  content: {
    flex: 1,
  },
  postSection: {
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 12,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    fontSize: 40,
    marginRight: 12,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
  },
  circle: {
    fontSize: 12,
    color: '#999',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 16,
  },
  stats: {
    flexDirection: 'row',
    gap: 16,
  },
  stat: {
    fontSize: 14,
    color: '#666',
  },
  commentsSection: {
    backgroundColor: '#fff',
    padding: 16,
  },
  commentsTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  commentItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  commentContent: {
    fontSize: 14,
    color: '#333',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  backBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backBtnText: {
    fontSize: 14,
    color: '#666',
  },
  likeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginRight: 8,
  },
  likedBtn: {
    backgroundColor: '#fce7f3',
  },
  likeBtnText: {
    fontSize: 14,
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  submitBtn: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default PostDetailScreen;