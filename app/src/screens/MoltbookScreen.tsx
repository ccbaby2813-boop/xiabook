// 虾书APP海外洋虾页面 - 复用第五章API接口索引
// API: /api/moltbook/posts

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import theme from '../theme';
import UserAvatar from '../components/UserAvatar';
import ENDPOINTS from '../services/endpoints';
import apiClient from '../services/apiClient';

// 海外洋虾帖子类型
interface MoltbookPost {
  id: number;
  title: string;
  content: string;
  original_url: string;
  source_rank: number;
  translation_status: string;
  author_name: string;
  like_count: number;
  comment_count: number;
  created_at: string;
}

// 海外洋虾页面组件
const MoltbookScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'source' | 'featured'>('source');
  const [posts, setPosts] = useState<MoltbookPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 加载海外洋虾帖子
  useEffect(() => {
    loadPosts();
  }, [activeTab]);
  
  const loadPosts = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await apiClient.get(ENDPOINTS.moltbook.list, {
        params: {
          type: activeTab === 'source' ? 'source_rank' : 'featured',
          limit: 20,
        },
      });
      
      if (response.success && response.data) {
        setPosts(response.data);
      } else {
        setError(response.error || '加载失败');
      }
    } catch (err) {
      setError('网络连接失败');
    } finally {
      setLoading(false);
    }
  };
  
  // 渲染帖子卡片
  const renderPost = ({ item }: { item: MoltbookPost }) => (
    <TouchableOpacity style={styles.card}>
      {/* 排名标识（源站排行模式） */}
      {activeTab === 'source' && item.source_rank > 0 && (
        <View style={styles.rankBadge}>
          <Text style={styles.rankText}>#{item.source_rank}</Text>
        </View>
      )}
      
      {/* 标题 */}
      <Text style={styles.cardTitle} numberOfLines={2}>
        {item.title}
      </Text>
      
      {/* 内容预览 */}
      <Text style={styles.cardContent} numberOfLines={3}>
        {item.content}
      </Text>
      
      {/* 互动统计 */}
      <View style={styles.cardStats}>
        <Text style={styles.cardStat}>❤️ {item.like_count}</Text>
        <Text style={styles.cardStat}>💬 {item.comment_count}</Text>
      </View>
      
      {/* 源站链接 */}
      {activeTab === 'source' && (
        <TouchableOpacity style={styles.sourceLink}>
          <Text style={styles.sourceLinkText}>查看原文 →</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
  
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>海外洋虾</Text>
      </View>
      
      {/* Tab切换（参照开发方案：源站排行 vs 精选转译） */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'source' && styles.tabActive]}
          onPress={() => setActiveTab('source')}
        >
          <Text style={[styles.tabText, activeTab === 'source' && styles.tabTextActive]}>
            源站排行
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'featured' && styles.tabActive]}
          onPress={() => setActiveTab('featured')}
        >
          <Text style={[styles.tabText, activeTab === 'featured' && styles.tabTextActive]}>
            精选转译
          </Text>
        </TouchableOpacity>
      </View>
      
      {/* 内容区 */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadPosts}>
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
        />
      )}
      
      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>🦞 海外洋虾 | 全球AI资讯</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  
  header: {
    height: theme.layout.headerHeight,
    backgroundColor: theme.colors.card,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  headerTitle: {
    fontSize: theme.typography.sizes.heading,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
  },
  
  tabBar: {
    flexDirection: 'row',
    backgroundColor: theme.colors.card,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  
  tab: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.primary,
  },
  
  tabText: {
    fontSize: theme.typography.sizes.body,
    color: theme.colors.textSecondary,
  },
  
  tabTextActive: {
    color: theme.colors.primary,
    fontWeight: theme.typography.weights.bold,
  },
  
  listContainer: {
    padding: theme.spacing.lg,
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
    padding: theme.spacing.xl,
  },
  
  errorText: {
    fontSize: theme.typography.sizes.body,
    color: theme.colors.error,
    marginBottom: theme.spacing.lg,
  },
  
  retryBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.spacing.radius,
  },
  
  retryText: {
    color: theme.colors.card,
    fontSize: theme.typography.sizes.body,
    fontWeight: theme.typography.weights.medium,
  },
  
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.spacing.radius,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    ...theme.shadows.card,
  },
  
  rankBadge: {
    position: 'absolute',
    top: theme.spacing.md,
    right: theme.spacing.md,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.spacing.radius,
  },
  
  rankText: {
    color: theme.colors.card,
    fontSize: theme.typography.sizes.small,
    fontWeight: theme.typography.weights.bold,
  },
  
  cardTitle: {
    fontSize: theme.typography.sizes.heading,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    paddingRight: theme.spacing.xl,
  },
  
  cardContent: {
    fontSize: theme.typography.sizes.body,
    color: theme.colors.textSecondary,
    lineHeight: 22,
    marginBottom: theme.spacing.md,
  },
  
  cardStats: {
    flexDirection: 'row',
    gap: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  
  cardStat: {
    fontSize: theme.typography.sizes.caption,
    color: theme.colors.textTertiary,
  },
  
  sourceLink: {
    marginTop: theme.spacing.sm,
  },
  
  sourceLinkText: {
    fontSize: theme.typography.sizes.caption,
    color: theme.colors.primary,
  },
  
  footer: {
    height: theme.layout.footerHeight,
    backgroundColor: theme.colors.card,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  footerText: {
    fontSize: theme.typography.sizes.small,
    color: theme.colors.textSecondary,
  },
});

export default MoltbookScreen;