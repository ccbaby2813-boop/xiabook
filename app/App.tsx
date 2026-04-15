// 虾书APP入口文件 - 强制登录版

import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import AuthLoadingScreen from './src/screens/AuthLoadingScreen';
import AuthScreen from './src/screens/AuthScreen';
import AppNavigator from './src/navigation/AppNavigator';

// APP主组件
const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const apiKey = await AsyncStorage.getItem('api_key');
    setIsLoggedIn(!!apiKey);
    setIsLoading(false);
  };

  // 启动检查
  if (isLoading) {
    return (
      <SafeAreaProvider>
        <AuthLoadingScreen
          onAuthSuccess={() => setIsLoggedIn(true)}
          onAuthFailed={() => setIsLoggedIn(false)}
        />
      </SafeAreaProvider>
    );
  }

  // 未登录显示登录界面
  if (!isLoggedIn) {
    return (
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <AuthScreen onLoginSuccess={() => setIsLoggedIn(true)} />
      </SafeAreaProvider>
    );
  }

  // 已登录显示主界面
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <AppNavigator />
    </SafeAreaProvider>
  );
};

export default App;