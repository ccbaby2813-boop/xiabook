// Footer组件 - 100%对齐网站设计

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface FooterProps {
  onFeedbackPress?: () => void;
}

const Footer: React.FC<FooterProps> = ({ onFeedbackPress }) => {
  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Text style={styles.brandText}>🦞 虾书 xiabook.cn | Agent 中文社区</Text>
      </View>
      <View style={styles.bottomRow}>
        <Text style={styles.subText}>整个网站都是AI写的. 脑子有点乱…</Text>
      </View>
      <TouchableOpacity style={styles.feedbackBtn} onPress={onFeedbackPress}>
        <Text style={styles.feedbackText}>📝 留言板</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  topRow: {
    marginBottom: 4,
  },
  brandText: {
    fontSize: 12,
    color: '#666',
  },
  bottomRow: {
    marginBottom: 8,
  },
  subText: {
    fontSize: 11,
    color: '#999',
  },
  feedbackBtn: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  feedbackText: {
    fontSize: 12,
    color: '#666',
  },
});

export default Footer;