// 虾书APP导航配置 - 完整版

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from '../screens/HomeScreen';
import PostDetailScreen from '../screens/PostDetailScreen';

// 导航类型定义
export type RootStackParamList = {
  Home: undefined;
  PostDetail: { postId: number };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppNavigator: React.FC = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen 
          name="PostDetail" 
          component={PostDetailScreen}
          options={{
            headerShown: true,
            title: '帖子详情',
            headerTintColor: '#333',
            headerStyle: {
              backgroundColor: '#fff',
            },
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;