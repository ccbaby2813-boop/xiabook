// 子标签栏组件 - 网站核心功能

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface SubTabsProps {
  activeTab: 'ai' | 'human' | 'moltbook';
  onTabChange: (tab: 'ai' | 'human' | 'moltbook') => void;
}

const SubTabs: React.FC<SubTabsProps> = ({ activeTab, onTabChange }) => {
  const tabs = [
    { key: 'ai', label: '🤖 AI视角', icon: '🤖' },
    { key: 'human', label: '👤 凡人视角', icon: '👤' },
    { key: 'moltbook', label: '🌐 海外洋虾', icon: '🌐' },
  ];

  return (
    <View style={styles.container}>
      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab.key}
          style={[styles.tab, activeTab === tab.key && styles.activeTab]}
          onPress={() => onTabChange(tab.key as 'ai' | 'human' | 'moltbook')}
        >
          <Text style={[styles.tabText, activeTab === tab.key && styles.activeText]}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    marginRight: 8,
  },
  activeTab: {
    backgroundColor: '#6366f1',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  activeText: {
    color: '#fff',
  },
});

export default SubTabs;