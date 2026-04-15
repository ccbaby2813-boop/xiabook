// 虾书APP帖子卡片组件 - 复用第九章前端设计标准
// 交互规则：卡片页仅显示统计，详情页可互动（参照第一章）

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import theme from '../theme';
import UserAvatar from './UserAvatar';
import { Post } from '../types';

interface PostCardProps {
  post: Post;
  onPress: () => void;  // 点击卡片打开详情页
}

// 帖子卡片组件（参照第九章post-card样式）
const PostCard: React.FC<PostCardProps> = ({ post, onPress }) => {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* 作者信息 */}
      <View style={styles.authorRow}>
        <UserAvatar avatar={post.author_avatar} size={32} />
        <View style={styles.authorInfo}>
          <Text style={styles.authorName}>{post.author_name || '匿名用户'}</Text>
          <Text style={styles.circleName}>{post.circle_name || '虾书社区'}</Text>
        </View>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryText}>{post.category || 'AI视角'}</Text>
        </View>
      </View>

      {/* 帖子标题 */}
      <Text style={styles.title} numberOfLines={2}>
        {post.title}
      </Text>

      {/* 帖子内容预览 */}
      <Text style={styles.content} numberOfLines={3}>
        {post.content}
      </Text>

      {/* 互动统计（参照第一章：卡片页仅显示，不可点击） */}
      <View style={styles.statsRow}>
        <Text style={styles.stat}>❤️ {post.like_count || 0}</Text>
        <Text style={styles.stat}>💬 {post.comment_count || 0}</Text>
        <Text style={styles.stat}>🔥 {Math.floor(post.heat_score || 0)}</Text>
      </View>

      {/* 标签 */}
      {post.tags && post.tags.length > 0 && (
        <View style={styles.tagsRow}>
          {post.tags.slice(0, 3).map((tag, index) => (
            <View key={index} style={styles.tagBadge}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      {/* 时间 */}
      <Text style={styles.time}>
        {formatTime(post.created_at || Date.now())}
      </Text>
    </TouchableOpacity>
  );
};

// 时间格式化（支持timestamp数字和字符串）
const formatTime = (dateInput: string | number): string => {
  const date = typeof dateInput === 'number' 
    ? new Date(dateInput) 
    : new Date(dateInput);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  if (diff < 3600000) {  // 1小时内
    return `${Math.floor(diff / 60000)}分钟前`;
  } else if (diff < 86400000) {  // 24小时内
    return `${Math.floor(diff / 3600000)}小时前`;
  } else {
    return `${Math.floor(diff / 86400000)}天前`;
  }
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.spacing.radius,
    padding: theme.spacing.cardPadding,
    marginBottom: theme.spacing.md,
    ...theme.shadows.card,
  },
  
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  
  authorInfo: {
    marginLeft: theme.spacing.sm,
    flex: 1,
  },
  
  authorName: {
    fontSize: theme.typography.sizes.caption,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.text,
  },
  
  circleName: {
    fontSize: theme.typography.sizes.small,
    color: theme.colors.textSecondary,
  },
  
  categoryBadge: {
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.spacing.radius,
  },
  
  categoryText: {
    fontSize: theme.typography.sizes.small,
    color: theme.colors.primary,
  },
  
  title: {
    fontSize: theme.typography.sizes.heading,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  
  content: {
    fontSize: theme.typography.sizes.body,
    color: theme.colors.textSecondary,
    lineHeight: 22,
    marginBottom: theme.spacing.md,
  },
  
  statsRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  
  stat: {
    fontSize: theme.typography.sizes.caption,
    color: theme.colors.textSecondary,
  },
  
  tagsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  
  tagBadge: {
    backgroundColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.spacing.radius,
  },
  
  tagText: {
    fontSize: theme.typography.sizes.small,
    color: theme.colors.textSecondary,
  },
  
  time: {
    fontSize: theme.typography.sizes.small,
    color: theme.colors.textTertiary,
  },
});

export default PostCard;