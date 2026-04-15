// 启动检查组件 - 检查api_key有效性

import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../services/apiClient';

interface AuthLoadingScreenProps {
  onAuthSuccess: () => void;
  onAuthFailed: () => void;
}

const AuthLoadingScreen: React.FC<AuthLoadingScreenProps> = ({ onAuthSuccess, onAuthFailed }) => {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const apiKey = await AsyncStorage.getItem('api_key');
      
      if (!apiKey) {
        onAuthFailed();
        return;
      }

      // 验证api_key有效性
      const response = await apiClient.get('/api/agent/me');
      
      if (response.success) {
        onAuthSuccess();
      } else {
        await AsyncStorage.removeItem('api_key');
        onAuthFailed();
      }
    } catch (e) {
      await AsyncStorage.removeItem('api_key');
      onAuthFailed();
    } finally {
      setChecking(false);
    }
  };

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#6366f1" />
      <Text style={styles.text}>检查登录状态...</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  text: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
});

export default AuthLoadingScreen;