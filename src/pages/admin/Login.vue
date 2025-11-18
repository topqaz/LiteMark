<template>
  <div class="login-page">
    <div class="login-background">
      <div class="background-shapes">
        <div class="shape shape-1"></div>
        <div class="shape shape-2"></div>
        <div class="shape shape-3"></div>
      </div>
    </div>
    <div class="login-container">
      <el-card class="login-card" shadow="always">
        <div class="login-header">
          <div class="logo-section">
            <img src="/LiteMark.png" alt="LiteMark Logo" class="logo-img" />
            <h1 class="logo-title">LiteMark</h1>
            <p class="logo-subtitle">后台管理系统</p>
          </div>
        </div>
        <el-form :model="loginState" @submit.prevent="login" class="login-form">
          <el-form-item>
            <el-input
              v-model="loginState.username"
              placeholder="请输入用户名"
              size="large"
              :prefix-icon="User"
              clearable
            />
          </el-form-item>
          <el-form-item>
            <el-input
              v-model="loginState.password"
              type="password"
              placeholder="请输入密码"
              size="large"
              :prefix-icon="LockIcon"
              show-password
              clearable
              @keyup.enter="login"
            />
          </el-form-item>
          <el-alert
            v-if="loginState.error"
            :title="loginState.error"
            type="error"
            :closable="false"
            show-icon
            class="error-alert"
          />
          <el-form-item>
            <el-button
              type="primary"
              :loading="loginState.loading"
              @click="login"
              size="large"
              class="login-button"
            >
              <el-icon v-if="!loginState.loading"><ArrowRight /></el-icon>
              {{ loginState.loading ? '登录中...' : '登录' }}
            </el-button>
          </el-form-item>
        </el-form>
        <div class="login-footer">
          <el-divider>
            <span class="divider-text">提示信息</span>
          </el-divider>
          <p class="footer-tip">
            <el-icon><InfoFilled /></el-icon>
            默认账号：<strong>admin</strong> / <strong>admin123</strong>
          </p>
          <p class="footer-note">可在「账号管理」中修改管理员账号</p>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { User, Lock as LockIcon, Right, InfoFilled } from '@element-plus/icons-vue';

const router = useRouter();

const apiBaseRaw =
  (typeof window !== 'undefined'
    ? (window as { __APP_API_BASE_URL__?: string }).__APP_API_BASE_URL__
    : '') ?? '';
const apiBase = apiBaseRaw.replace(/\/$/, '');

const loginState = reactive({
  username: '',
  password: '',
  loading: false,
  error: ''
});

async function login() {
  loginState.loading = true;
  loginState.error = '';
  try {
    const response = await fetch(`${apiBase}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: loginState.username.trim(),
        password: loginState.password
      })
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || '登录失败');
    }
    const result = (await response.json()) as { token: string; username: string };
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('bookmark_token', result.token);
      window.localStorage.setItem('bookmark_username', result.username);
    }
    ElMessage.success('登录成功');
    router.push('/admin');
  } catch (err) {
    loginState.error = err instanceof Error ? err.message : '登录失败';
  } finally {
    loginState.loading = false;
  }
}
</script>

<style scoped>
.login-page {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 20px;
  overflow: hidden;
}

.login-background {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  z-index: 0;
}

.background-shapes {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.shape {
  position: absolute;
  border-radius: 50%;
  opacity: 0.1;
  animation: float 20s infinite ease-in-out;
}

.shape-1 {
  width: 300px;
  height: 300px;
  background: #fff;
  top: -100px;
  left: -100px;
  animation-delay: 0s;
}

.shape-2 {
  width: 200px;
  height: 200px;
  background: #fff;
  bottom: -50px;
  right: 10%;
  animation-delay: 5s;
}

.shape-3 {
  width: 150px;
  height: 150px;
  background: #fff;
  top: 50%;
  right: -50px;
  animation-delay: 10s;
}

@keyframes float {
  0%, 100% {
    transform: translate(0, 0) rotate(0deg);
  }
  33% {
    transform: translate(30px, -30px) rotate(120deg);
  }
  66% {
    transform: translate(-20px, 20px) rotate(240deg);
  }
}

.login-container {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 440px;
}

.login-card {
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.3);
  overflow: hidden;
}

.login-card :deep(.el-card__body) {
  padding: 40px;
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.logo-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.logo-img {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transition: transform 0.3s ease;
}

.logo-img:hover {
  transform: scale(1.05) rotate(5deg);
}

.logo-title {
  margin: 0;
  font-size: 32px;
  font-weight: 700;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: 1px;
}

.logo-subtitle {
  margin: 0;
  font-size: 14px;
  color: #6b7280;
  font-weight: 500;
}

.login-form {
  margin-top: 8px;
}

.login-form :deep(.el-form-item) {
  margin-bottom: 20px;
}

.login-form :deep(.el-input__wrapper) {
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
}

.login-form :deep(.el-input__wrapper:hover) {
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
}

.login-form :deep(.el-input.is-focus .el-input__wrapper) {
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.3);
}

.error-alert {
  margin-bottom: 20px;
  border-radius: 8px;
}

.login-button {
  width: 100%;
  height: 48px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
  transition: all 0.3s ease;
}

.login-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
}

.login-button:active {
  transform: translateY(0);
}

.login-footer {
  margin-top: 24px;
}

.divider-text {
  font-size: 12px;
  color: #9ca3af;
  padding: 0 12px;
}

.footer-tip {
  margin: 16px 0 8px;
  text-align: center;
  font-size: 13px;
  color: #6b7280;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.footer-tip strong {
  color: #667eea;
  font-weight: 600;
}

.footer-note {
  margin: 0;
  text-align: center;
  font-size: 12px;
  color: #9ca3af;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .login-card :deep(.el-card__body) {
    padding: 32px 24px;
  }

  .logo-title {
    font-size: 28px;
  }

  .logo-img {
    width: 56px;
    height: 56px;
  }
}

@media (max-width: 480px) {
  .login-page {
    padding: 16px;
  }

  .login-card :deep(.el-card__body) {
    padding: 24px 20px;
  }

  .logo-title {
    font-size: 24px;
  }

  .logo-subtitle {
    font-size: 12px;
  }
}

/* 加载动画 */
.login-button.is-loading {
  position: relative;
}

.login-button.is-loading::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  opacity: 0.8;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 0.8;
  }
  50% {
    opacity: 1;
  }
}
</style>

