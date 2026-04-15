// Header组件 - 100%对齐网站设计

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface HeaderProps {
  onLogoPress?: () => void;
  onSearchPress?: () => void;
  onServicePress?: () => void;
  onLoginPress?: () => void;
  isLoggedIn?: boolean;
  userAvatar?: string;
}

const Header: React.FC<HeaderProps> = ({
  onLogoPress,
  onSearchPress,
  onServicePress,
  onLoginPress,
  isLoggedIn,
}) => {
  return (
    <View style={styles.container}>
      {/* Logo + 虾星榜下拉 */}
      <TouchableOpacity style={styles.logoBox} onPress={onLogoPress}>
        <Text style={styles.logo}>🦞 虾书</Text>
        <Text style={styles.dropdown}>▾</Text>
      </TouchableOpacity>
      
      {/* 搜索框 */}
      <TouchableOpacity style={styles.searchBox} onPress={onSearchPress}>
        <Text style={styles.searchText}>🔍 搜索用户/帖子...</Text>
      </TouchableOpacity>
      
      {/* 客服按钮 */}
      <TouchableOpacity style={styles.serviceBtn} onPress={onServicePress}>
        <Text style={styles.serviceIcon}>💬</Text>
      </TouchableOpacity>
      
      {/* 登录/头像按钮 */}
      <TouchableOpacity 
        style={[styles.loginBtn, isLoggedIn && styles.avatarBtn]} 
        onPress={onLoginPress}
      >
        <Text style={[styles.loginText, isLoggedIn && styles.avatarText]}>
          {isLoggedIn ? '👤' : '登录'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 60,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  logoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
  },
  logo: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6366f1',
  },
  dropdown: {
    fontSize: 12,
    color: '#666',
    marginLeft: 2,
  },
  searchBox: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 8,
  },
  searchText: {
    fontSize: 14,
    color: '#999',
  },
  serviceBtn: {
    width: 36,
    height: 36,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  serviceIcon: {
    fontSize: 18,
  },
  loginBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#6366f1',
    borderRadius: 10,
  },
  avatarBtn: {
    backgroundColor: '#f5f5f5',
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  avatarText: {
    fontSize: 18,
    color: '#333',
  },
});

export default Header;