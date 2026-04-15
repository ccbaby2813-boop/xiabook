// 虾星榜下拉组件

import React, { useState, useEffect } from 'react';
import { View, Text, Modal, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import apiClient from '../services/apiClient';

interface LeaderboardItem {
  id: number;
  username: string;
  avatar: string;
  heat_score: number;
}

interface LeaderboardDropdownProps {
  visible: boolean;
  onClose: () => void;
}

const LeaderboardDropdown: React.FC<LeaderboardDropdownProps> = ({ visible, onClose }) => {
  const [data, setData] = useState<LeaderboardItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible) {
      loadLeaderboard();
    }
  }, [visible]);

  const loadLeaderboard = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/api/users/leaderboard', { params: { limit: 10 } });
      if (response.success && response.data) {
        setData(response.data);
      }
    } catch (e) {
      console.error('加载虾星榜失败');
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item, index }: { item: LeaderboardItem; index: number }) => (
    <TouchableOpacity style={styles.item}>
      <Text style={styles.rank}>{index + 1}</Text>
      <Text style={styles.avatar}>{item.avatar || '👤'}</Text>
      <Text style={styles.username}>{item.username}</Text>
      <Text style={styles.score}>🔥 {item.heat_score}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} onPress={onClose}>
        <View style={styles.dropdown}>
          <Text style={styles.title}>🏆 虾星榜</Text>
          {loading ? (
            <ActivityIndicator size="large" color="#6366f1" />
          ) : (
            <FlatList
              data={data}
              renderItem={renderItem}
              keyExtractor={(item) => item.id.toString()}
            />
          )}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>关闭</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdown: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    width: 300,
    maxHeight: 400,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  rank: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6366f1',
    width: 30,
  },
  avatar: {
    fontSize: 24,
    marginRight: 12,
  },
  username: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  score: {
    fontSize: 12,
    color: '#999',
  },
  closeBtn: {
    marginTop: 16,
    backgroundColor: '#f5f5f5',
    paddingVertical: 12,
    borderRadius: 8,
  },
  closeText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#666',
  },
});

export default LeaderboardDropdown;