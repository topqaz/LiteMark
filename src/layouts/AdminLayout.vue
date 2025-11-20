<template>
  <el-container class="layout-container">
    <!-- 顶栏 -->
    <el-header class="header-bar">
      <div class="header-content">
        <div class="logo">
          <el-icon class="mobile-menu-btn" @click="toggleMobileMenu">
            <Menu />
          </el-icon>
          <img src="/LiteMark.png" alt="Logo" />
          <span class="logo-text">LiteMark 后台管理</span>
        </div>
        <div class="header-right">
          <span class="user-name">{{ userName }}</span>
          <el-dropdown trigger="click" @command="handleCommand">
            <el-avatar :size="40" icon="User" class="user-avatar" />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="home">
                  <el-icon><HomeFilled /></el-icon>回到网站
                </el-dropdown-item>
                <el-dropdown-item command="settings">
                  <el-icon><Setting /></el-icon>系统设置
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">
                  <el-icon><SwitchButton /></el-icon>退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </el-header>
    <!-- 主内容区 -->
    <el-container class="main-container">
      <!-- 侧边导航 -->
      <el-aside class="aside-nav" :class="{ 'mobile-hidden': !showMobileMenu }" :width="isCollapse ? '64px' : '240px'">
        <div class="nav-header">
          <div class="nav-title">
            <span v-show="!isCollapse">功能导航</span>
            <el-icon class="collapse-btn" @click="toggleCollapse">
              <Fold v-if="!isCollapse" />
              <Expand v-else />
            </el-icon>
          </div>
        </div>
        <el-menu
          :default-active="activeRoute"
          class="nav-menu"
          router
          :collapse="isCollapse"
          @select="closeMobileMenu"
        >
          <el-menu-item v-for="item in navItems" :key="item.path" :index="item.path">
            <el-icon><component :is="item.icon" /></el-icon>
            <template #title>{{ item.title }}</template>
          </el-menu-item>
        </el-menu>
      </el-aside>
      <!-- 移动端遮罩层 -->
      <div v-if="showMobileMenu" class="mobile-overlay" @click="closeMobileMenu"></div>
      <!-- 内容区域 -->
      <el-main class="main-content">
        <div class="content-wrapper">
          <router-view v-slot="{ Component }">
            <transition name="fade" mode="out-in">
              <component :is="Component" />
            </transition>
          </router-view>
        </div>
      </el-main>
    </el-container>
    <!-- 底栏 -->
    <el-footer class="footer-bar">
      <p class="footer-copyright">
        © {{ getShanghaiYear() }} LiteMark. All rights reserved.
      </p>
    </el-footer>
  </el-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getShanghaiYear } from '../utils/date.js';
import { ElMessage } from 'element-plus';
import {
  User,
  Setting,
  SwitchButton,
  Fold,
  Expand,
  HomeFilled,
  DataBoard,
  Collection,
  Document,
  Upload,
  UserFilled,
  Menu
} from '@element-plus/icons-vue';

const route = useRoute();
const router = useRouter();
const isCollapse = ref(false);
const showMobileMenu = ref(false);

// 用户名
const storedUser = typeof window !== 'undefined' ? window.localStorage.getItem('bookmark_username') : null;
const userName = ref(storedUser || 'Admin');

// 检查登录状态
onMounted(() => {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('bookmark_token') : null;
  if (!token) {
    router.push('/admin/login');
  }
});

// 导航菜单
const navItems = [
  { path: '/admin/overview', title: '概览', icon: DataBoard },
  { path: '/admin/bookmarks', title: '书签管理', icon: Collection },
  { path: '/admin/categories', title: '分类管理', icon: Document },
  { path: '/admin/backup', title: '数据备份', icon: Upload },
  { path: '/admin/settings', title: '系统设置', icon: Setting },
  { path: '/admin/account', title: '账号管理', icon: UserFilled }
];

// 当前激活路由
const activeRoute = computed(() => route.path);

// 切换菜单折叠状态
const toggleCollapse = () => {
  isCollapse.value = !isCollapse.value;
};

// 切换移动端菜单
const toggleMobileMenu = () => {
  showMobileMenu.value = !showMobileMenu.value;
};

// 关闭移动端菜单
const closeMobileMenu = () => {
  showMobileMenu.value = false;
};

// 监听路由变化，关闭移动端菜单
watch(() => route.path, () => {
  closeMobileMenu();
});

// 处理下拉菜单命令
const handleCommand = (command: string) => {
  if (command === 'logout') {
    handleLogout();
  } else if (command === 'home') {
    router.push('/');
  } else if (command === 'settings') {
    router.push('/admin/settings');
  }
};

// 处理登出
const handleLogout = () => {
  // 清除本地存储的用户信息
  localStorage.removeItem('bookmark_token');
  localStorage.removeItem('bookmark_username');
  ElMessage.success('退出登录成功');
  // 跳转到登录页
  router.push('/admin/login');
};
</script>

<style scoped>
/* 引入 Google Fonts */
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600&display=swap');

html, body, #app {
  margin: 0;
  padding: 0;
  height: 100%;
  overflow: hidden;
  font-family: 'Poppins', sans-serif;
  background: #f0f2f5;
}

/* 布局容器 */
.layout-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

/* 顶栏 */
.header-bar {
  height: 60px;
  background: linear-gradient(135deg, #1a73e8, #4285f4);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  padding: 0 20px;
  display: flex;
  align-items: center;
  color: #fff;
  position: relative;
  z-index: 1000;
}

.header-content {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo img {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transition: transform 0.3s;
}

.logo img:hover {
  transform: scale(1.05);
}

.logo-text {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.user-name {
  font-size: 14px;
  font-weight: 500;
}

.user-avatar {
  cursor: pointer;
  border: 2px solid rgba(255, 255, 255, 0.8);
  transition: all 0.3s;
}

.user-avatar:hover {
  transform: scale(1.1);
  border-color: #fff;
}

/* 主内容区 */
.main-container {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* 侧边导航 */
.aside-nav {
  background: #fff;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
  position: relative;
  transition: width 0.3s;
}

.nav-header {
  padding: 16px;
  border-bottom: 1px solid #eee;
}

.nav-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #1a73e8;
  font-size: 14px;
  font-weight: 600;
}

.collapse-btn {
  cursor: pointer;
  font-size: 18px;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.3s;
}

.collapse-btn:hover {
  background: #e8f0fe;
  color: #1a73e8;
}

.nav-menu {
  border-right: none;
  padding: 8px 0;
}

.nav-menu :deep(.el-menu-item) {
  height: 46px;
  line-height: 46px;
  margin: 4px 0;
  border-radius: 0 24px 24px 0;
  margin-right: 12px;
}

.nav-menu :deep(.el-menu-item.is-active) {
  background: #e8f0fe;
  color: #1a73e8;
  font-weight: 600;
}

.nav-menu :deep(.el-menu-item:hover) {
  background: #f5f7fa;
}

/* 主内容区域 */
.main-content {
  flex: 1;
  background: #f0f2f5;
  padding: 20px;
  overflow-y: auto;
}

.content-wrapper {
  background: #fff;
  border-radius: 8px;
  padding: 24px;
  min-height: calc(100vh - 100px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

/* 路由切换动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

/* 移动端菜单按钮 */
.mobile-menu-btn {
  display: none;
  font-size: 20px;
  cursor: pointer;
  margin-right: 12px;
  padding: 4px;
  border-radius: 4px;
  transition: background 0.3s;
}

.mobile-menu-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* 移动端遮罩层 */
.mobile-overlay {
  display: none;
  position: fixed;
  top: 60px;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .header-bar {
    padding: 0 15px;
  }
  
  .mobile-menu-btn {
    display: block;
  }
  
  .logo-text {
    display: none;
  }
  
  .user-name {
    display: none;
  }
  
  .aside-nav {
    position: fixed;
    top: 60px;
    left: 0;
    height: calc(100vh - 60px);
    z-index: 1000;
    transform: translateX(0);
    transition: transform 0.3s;
  }
  
  .aside-nav.mobile-hidden {
    transform: translateX(-100%);
  }
  
  .main-container {
    margin-left: 0;
  }
  
  .main-content {
    padding: 15px;
    margin-left: 0;
  }
  
  .content-wrapper {
    padding: 16px;
  }
  
  .mobile-overlay {
    display: block;
  }
  
  .nav-menu {
    border-right: none;
  }
  
  .nav-menu :deep(.el-menu-item) {
    margin-right: 0;
  }
}

/* 底栏 */
.footer-bar {
  height: auto;
  min-height: 50px;
  background: #fff;
  border-top: 1px solid #eee;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px 20px;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
}

.footer-copyright {
  margin: 0;
  font-size: 13px;
  color: #666;
  text-align: center;
}

@media (max-width: 768px) {
  .footer-bar {
    padding: 12px 15px;
  }

  .footer-copyright {
    font-size: 12px;
  }
}
</style>

