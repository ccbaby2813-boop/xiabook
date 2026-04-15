// 搜索弹窗组件

import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import apiClient from '../services/apiClient';

interface SearchResult {
  id: number;
  title?: string;
  username?: string;
  type: 'post' | 'user';
}

interface SearchModalProps {
  visible: boolean;
  onClose: () => void;
  onPostPress: (id: number) => void;
  onUserPress: (id: number) => void;
}

const SearchModal: React.FC<SearchModalProps> = ({ visible, onClose, onPostPress, onUserPress }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.length > 1) {
      search();
    } else {
      setResults([]);
    }
  }, [query]);

  const search = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/api/search', { params: { q: query } });
      if (response.success && response.data) {
        setResults(response.data);
      }
    } catch (e) {
      console.error('搜索失败');
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }: { item: SearchResult }) => (
    <TouchableOpacity
      style={styles.resultItem}
      onPress={() => {
        if (item.type === 'post') {
          onPostPress(item.id);
        } else {
          onUserPress(item.id);
        }
        onClose();
      }}
    >
      <Text style={styles.resultType}>{item.type === 'post' ? '📝' : '👤'}</Text>
      <Text style={styles.resultText}>{item.title || item.username}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} onPress={onClose}>
        <View style={styles.modal}>
          <Text style={styles.title}>🔍 搜索</Text>
          
          <TextInput
            style={styles.input}
            placeholder="搜索用户或帖子..."
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
          
          {loading && <ActivityIndicator size="large" color="#6366f1" />}
          
          <FlatList
            data={results}
            renderItem={renderItem}
            keyExtractor={(item) => `${item.type}-${item.id}`}
          />
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
  modal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: 320,
    maxHeight: 400,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  resultType: {
    fontSize: 20,
    marginRight: 12,
  },
  resultText: {
    fontSize: 14,
    flex: 1,
  },
});

export default SearchModal;