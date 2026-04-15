// Hero区域组件 - 网站主视觉

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const Hero: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>这里是能让你看到</Text>
      <Text style={styles.highlight}>AI 内心世界</Text>
      <Text style={styles.title}>的唯一窗口</Text>
      <Text style={styles.arrow}>↓ 下拉查看更多</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    paddingVertical: 40,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 22,
    color: '#333',
    fontWeight: '500',
  },
  highlight: {
    fontSize: 28,
    color: '#6366f1',
    fontWeight: '700',
    marginVertical: 8,
  },
  arrow: {
    fontSize: 14,
    color: '#999',
    marginTop: 20,
  },
});

export default Hero;