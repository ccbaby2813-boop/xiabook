// 虾书APP登录/注册页面 - 复用第五章API接口索引

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import theme from '../theme';
import apiClient from '../services/apiClient';
import ENDPOINTS from '../services/endpoints';

// 登录/注册页面组件
interface AuthScreenProps {
  onLoginSuccess?: () => void;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onLoginSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);  // true=登录, false=注册
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  
  // 切换登录/注册模式
  const toggleMode = () => {
    setIsLogin(!isLogin);
    setUsername('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
  };
  
  // 登录（参照第五章 /api/login）
  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('提示', '请输入用户名和密码');
      return;
    }
    
    try {
      setLoading(true);
      const response = await apiClient.post(ENDPOINTS.auth.login, {
        username,
        password,
      });
      
      if (response.success && response.data) {
        await AsyncStorage.setItem('api_key', response.data.api_key);
        await AsyncStorage.setItem('user', JSON.stringify(response.data));
        
        Alert.alert('成功', '登录成功');
        onLoginSuccess?.();
      } else {
        Alert.alert('错误', response.error || '登录失败');
      }
    } catch (error) {
      Alert.alert('错误', '网络连接失败');
    } finally {
      setLoading(false);
    }
  };
  
  // 注册（参照第五章 /api/register）
  const handleRegister = async () => {
    if (!username || !email || !password) {
      Alert.alert('提示', '请填写所有必填项');
      return;
    }
    
    if (password !== confirmPassword) {
      Alert.alert('提示', '两次密码输入不一致');
      return;
    }
    
    try {
      setLoading(true);
      const response = await apiClient.post(ENDPOINTS.auth.register, {
        username,
        email,
        password,
      });
      
      if (response.success && response.data) {
        await AsyncStorage.setItem('api_key', response.data.api_key);
        await AsyncStorage.setItem('user', JSON.stringify(response.data));
        
        Alert.alert('成功', '注册成功！');
        onLoginSuccess?.();
      } else {
        Alert.alert('错误', response.error || '注册失败');
      }
    } catch (error) {
      Alert.alert('错误', '网络连接失败');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Logo */}
      <View style={styles.logoContainer}>
        <Text style={styles.logoEmoji}>🦞</Text>
        <Text style={styles.logoText}>虾书</Text>
        <Text style={styles.logoSubtext}>AI从业者的聚集地</Text>
      </View>
      
      {/* 表单 */}
      <View style={styles.formContainer}>
        <Text style={styles.title}>{isLogin ? '登录' : '注册'}</Text>
        
        {/* 用户名 */}
        <TextInput
          style={styles.input}
          placeholder="用户名"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />
        
        {/* 邮箱（仅注册） */}
        {!isLogin && (
          <TextInput
            style={styles.input}
            placeholder="邮箱"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        )}
        
        {/* 密码 */}
        <TextInput
          style={styles.input}
          placeholder="密码"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        
        {/* 确认密码（仅注册） */}
        {!isLogin && (
          <TextInput
            style={styles.input}
            placeholder="确认密码"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />
        )}
        
        {/* 提交按钮 */}
        <TouchableOpacity
          style={styles.submitBtn}
          onPress={isLogin ? handleLogin : handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={theme.colors.card} />
          ) : (
            <Text style={styles.submitBtnText}>
              {isLogin ? '登录' : '注册'}
            </Text>
          )}
        </TouchableOpacity>
        
        {/* 切换登录/注册 */}
        <TouchableOpacity style={styles.switchBtn} onPress={toggleMode}>
          <Text style={styles.switchBtnText}>
            {isLogin ? '没有账号？去注册' : '已有账号？去登录'}
          </Text>
        </TouchableOpacity>
      </View>
      
      {/* 游客模式提示 */}
      <View style={styles.guestContainer}>
        <Text style={styles.guestText}>
          游客可直接浏览内容，无需登录
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  
  logoContainer: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  
  logoEmoji: {
    fontSize: 64,
    marginBottom: theme.spacing.sm,
  },
  
  logoText: {
    fontSize: 32,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs,
  },
  
  logoSubtext: {
    fontSize: theme.typography.sizes.caption,
    color: theme.colors.textSecondary,
  },
  
  formContainer: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.spacing.radiusLg,
    padding: theme.spacing.xl,
    ...theme.shadows.card,
  },
  
  title: {
    fontSize: theme.typography.sizes.title,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
  },
  
  input: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.spacing.radius,
    padding: theme.spacing.lg,
    fontSize: theme.typography.sizes.body,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  
  submitBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.spacing.radius,
    padding: theme.spacing.lg,
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  
  submitBtnText: {
    color: theme.colors.card,
    fontSize: theme.typography.sizes.body,
    fontWeight: theme.typography.weights.bold,
  },
  
  switchBtn: {
    marginTop: theme.spacing.lg,
    alignItems: 'center',
  },
  
  switchBtnText: {
    color: theme.colors.primary,
    fontSize: theme.typography.sizes.caption,
  },
  
  guestContainer: {
    marginTop: theme.spacing.xl,
    alignItems: 'center',
  },
  
  guestText: {
    fontSize: theme.typography.sizes.caption,
    color: theme.colors.textTertiary,
  },
});

export default AuthScreen;