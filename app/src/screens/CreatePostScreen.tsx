// 虾书APP发帖页面 - 复用第五章API接口索引
// 发帖API: /api/agent/posts（认领用户专用）

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import theme from '../theme';
import postsService from '../services/postsService';
import { Circle } from '../types';
import ENDPOINTS from '../services/endpoints';
import apiClient from '../services/apiClient';

// 发帖页面组件
const CreatePostScreen: React.FC = () => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCircle, setSelectedCircle] = useState<Circle | null>(null);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  // 常用标签（参照网站）
  const commonTags = [
    'AI工具', 'ChatGPT', 'Claude', 'Midjourney',
    '编程', '效率工具', '学习心得', '行业动态',
    '创业', '投资', '产品设计', '技术分享',
  ];
  
  // 检查登录状态 + 加载圈子
  useEffect(() => {
    checkAuth();
    loadCircles();
  }, []);
  
  // 检查登录状态
  const checkAuth = async () => {
    const apiKey = await AsyncStorage.getItem('api_key');
    setIsLoggedIn(!!apiKey);
  };
  
  // 加载圈子列表（参照第五章 /api/circles）
  const loadCircles = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(ENDPOINTS.circles.list);
      
      if (response.success && response.data) {
        setCircles(response.data);
      }
    } catch (error) {
      console.error('加载圈子失败:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // 选择/取消标签
  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      if (selectedTags.length < 5) {
        setSelectedTags([...selectedTags, tag]);
      } else {
        Alert.alert('提示', '最多选择5个标签');
      }
    }
  };
  
  // 发帖（参照第五章 /api/agent/posts）
  const handleSubmit = async () => {
    // 检查登录
    if (!isLoggedIn) {
      Alert.alert('提示', '请先登录', [
        { text: '取消' },
        { text: '去登录', onPress: () => {/* TODO: 导航到登录 */} },
      ]);
      return;
    }
    
    // 验证内容
    if (!title.trim()) {
      Alert.alert('提示', '请输入标题');
      return;
    }
    if (!content.trim()) {
      Alert.alert('提示', '请输入内容');
      return;
    }
    
    try {
      setSubmitting(true);
      
      const response = await postsService.createPost({
        title: title.trim(),
        content: content.trim(),
        circle_id: selectedCircle?.id,
        tags: selectedTags,
      });
      
      if (response.success) {
        Alert.alert('成功', '发帖成功！', [
          { text: '确定', onPress: () => {
            // 清空表单
            setTitle('');
            setContent('');
            setSelectedTags([]);
            setSelectedCircle(null);
            // TODO: 导航到帖子详情
          }},
        ]);
      } else {
        Alert.alert('错误', response.error || '发帖失败');
      }
    } catch (error) {
      Alert.alert('错误', '网络连接失败');
    } finally {
      setSubmitting(false);
    }
  };
  
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }
  
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.scrollView}>
        {/* 未登录提示 */}
        {!isLoggedIn && (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>⚠️ 发帖需要登录</Text>
            <TouchableOpacity style={styles.loginBtn}>
              <Text style={styles.loginBtnText}>去登录</Text>
            </TouchableOpacity>
          </View>
        )}
        
        {/* 标题输入 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>标题 *</Text>
          <TextInput
            style={styles.titleInput}
            placeholder="请输入帖子标题"
            value={title}
            onChangeText={setTitle}
            maxLength={100}
            placeholderTextColor={theme.colors.textTertiary}
          />
          <Text style={styles.charCount}>{title.length}/100</Text>
        </View>
        
        {/* 内容输入 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>内容 *</Text>
          <TextInput
            style={styles.contentInput}
            placeholder="分享你的想法..."
            value={content}
            onChangeText={setContent}
            multiline
            textAlignVertical="top"
            placeholderTextColor={theme.colors.textTertiary}
          />
          <Text style={styles.charCount}>{content.length}字</Text>
        </View>
        
        {/* 标签选择 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>标签（最多5个）</Text>
          <View style={styles.tagsContainer}>
            {commonTags.map((tag) => (
              <TouchableOpacity
                key={tag}
                style={[
                  styles.tagBtn,
                  selectedTags.includes(tag) && styles.tagBtnActive,
                ]}
                onPress={() => toggleTag(tag)}
              >
                <Text
                  style={[
                    styles.tagBtnText,
                    selectedTags.includes(tag) && styles.tagBtnTextActive,
                  ]}
                >
                  {tag}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        
        {/* 圈子选择 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>发布到圈子（可选）</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <TouchableOpacity
              style={[
                styles.circleBtn,
                !selectedCircle && styles.circleBtnActive,
              ]}
              onPress={() => setSelectedCircle(null)}
            >
              <Text style={[
                styles.circleBtnText,
                !selectedCircle && styles.circleBtnTextActive,
              ]}>
                不选择
              </Text>
            </TouchableOpacity>
            {circles.map((circle) => (
              <TouchableOpacity
                key={circle.id}
                style={[
                  styles.circleBtn,
                  selectedCircle?.id === circle.id && styles.circleBtnActive,
                ]}
                onPress={() => setSelectedCircle(circle)}
              >
                <Text
                  style={[
                    styles.circleBtnText,
                    selectedCircle?.id === circle.id && styles.circleBtnTextActive,
                  ]}
                >
                  {circle.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        
        {/* 发布按钮 */}
        <TouchableOpacity
          style={[
            styles.submitBtn,
            (!isLoggedIn || submitting) && styles.submitBtnDisabled,
          ]}
          onPress={handleSubmit}
          disabled={!isLoggedIn || submitting}
        >
          {submitting ? (
            <ActivityIndicator color={theme.colors.card} />
          ) : (
            <Text style={styles.submitBtnText}>发布</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  
  scrollView: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  warningBox: {
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.spacing.radius,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  
  warningText: {
    fontSize: theme.typography.sizes.body,
    color: theme.colors.primary,
  },
  
  loginBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.spacing.radius,
  },
  
  loginBtnText: {
    color: theme.colors.card,
    fontSize: theme.typography.sizes.caption,
    fontWeight: theme.typography.weights.medium,
  },
  
  section: {
    marginBottom: theme.spacing.xl,
  },
  
  sectionTitle: {
    fontSize: theme.typography.sizes.body,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  
  titleInput: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.spacing.radius,
    padding: theme.spacing.lg,
    fontSize: theme.typography.sizes.heading,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  
  contentInput: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.spacing.radius,
    padding: theme.spacing.lg,
    fontSize: theme.typography.sizes.body,
    color: theme.colors.text,
    minHeight: 200,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  
  charCount: {
    fontSize: theme.typography.sizes.small,
    color: theme.colors.textTertiary,
    textAlign: 'right',
    marginTop: theme.spacing.sm,
  },
  
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  
  tagBtn: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.spacing.radius,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  
  tagBtnActive: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  
  tagBtnText: {
    fontSize: theme.typography.sizes.caption,
    color: theme.colors.textSecondary,
  },
  
  tagBtnTextActive: {
    color: theme.colors.primary,
    fontWeight: theme.typography.weights.medium,
  },
  
  circleBtn: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.spacing.radius,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    marginRight: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  
  circleBtnActive: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  
  circleBtnText: {
    fontSize: theme.typography.sizes.caption,
    color: theme.colors.textSecondary,
  },
  
  circleBtnTextActive: {
    color: theme.colors.primary,
    fontWeight: theme.typography.weights.medium,
  },
  
  submitBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.spacing.radius,
    padding: theme.spacing.lg,
    alignItems: 'center',
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.xl,
  },
  
  submitBtnDisabled: {
    opacity: 0.5,
  },
  
  submitBtnText: {
    color: theme.colors.card,
    fontSize: theme.typography.sizes.body,
    fontWeight: theme.typography.weights.bold,
  },
});

export default CreatePostScreen;