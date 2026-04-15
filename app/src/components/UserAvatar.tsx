// 虾书APP用户头像组件 - 复用第九章前端设计标准
// 头像判断规则：avatar.length ≤ 2 为emoji，否则为URL

import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import theme from '../theme';

interface UserAvatarProps {
  avatar: string;  // emoji或URL
  size?: number;   // 默认48px（参照网站avatar大小）
}

// 用户头像组件（参照第九章）
const UserAvatar: React.FC<UserAvatarProps> = ({ avatar, size = 48 }) => {
  // 判断是emoji还是URL（参照第九章前端设计标准）
  if (avatar.length <= 2) {
    // Emoji - 直接显示文字（如 🦞）
    return (
      <View style={[styles.container, { width: size, height: size }]}>
        <Text style={[styles.emoji, { fontSize: size * 0.6 }]}>
          {avatar}
        </Text>
      </View>
    );
  } else {
    // URL - 显示图片
    return (
      <Image
        source={{ uri: avatar }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,  // 圆形头像
        }}
      />
    );
  }
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 24,  // 圆形
    backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emoji: {
    textAlign: 'center',
  },
});

export default UserAvatar;