// 虾书APP色彩主题 - 复用网站CSS变量（第九章前端设计标准）
// 网站CSS变量：https://xiabook.cn/css/style.css

export const theme = {
  colors: {
    // 主色系（来自网站 --primary）
    primary: '#ff6b35',
    primaryDark: '#e55a2b',
    primaryLight: '#fff3ef',
    
    // 背景（来自网站 --bg, --card-bg）
    background: '#f7f8fa',
    card: '#fff',
    
    // 文字（来自网站 --text, --text-2, --text-3）
    text: '#1a1a1a',
    textSecondary: '#666',
    textTertiary: '#999',
    
    // 边框（来自网站 --border）
    border: '#eee',
    
    // 状态色
    success: '#27ae60',
    error: '#e74c3c',
    warning: '#f39c12',
  },
  
  spacing: {
    // 圆角（来自网站 --radius, --radius-lg）
    radius: 12,
    radiusLg: 16,
    
    // 间距（来自网站卡片padding）
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    
    // 卡片内边距
    cardPadding: 16,
  },
  
  shadows: {
    // 卡片阴影（来自网站 --shadow）
    card: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 3,
    },
    // 大阴影（来自网站 --shadow-lg）
    cardLg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 32,
      elevation: 8,
    },
  },
  
  typography: {
    // 字体（来自网站 --font-main）
    fontFamily: 'DM Sans',
    
    // 字号
    sizes: {
      title: 24,
      heading: 18,
      body: 16,
      caption: 14,
      small: 12,
    },
    
    // 字重
    weights: {
      regular: '400',
      medium: '500',
      bold: '700',
    },
  },
  
  layout: {
    // Header高度（来自网站 --header-h）
    headerHeight: 60,
    
    // Footer高度
    footerHeight: 72,
    
    // TabBar高度
    tabBarHeight: 56,
    
    // 头像大小
    avatarSize: {
      sm: 32,
      md: 48,
      lg: 64,
    },
    
    // 卡片最小高度
    cardMinHeight: 120,
  },
};

export default theme;