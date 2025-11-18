<template>
  <div class="account-page">
    <h2 class="page-title">账号管理</h2>
    <p class="page-desc">在这里修改后台登录的用户名和密码</p>

    <el-card class="account-card">
      <template #header>
        <h3>管理员账号</h3>
      </template>
      <el-form :model="adminSettingsForm" label-width="140px" @submit.prevent="saveAdminSettings">
        <el-form-item label="管理员用户名" required>
          <el-input
            v-model="adminSettingsForm.username"
            maxlength="60"
            placeholder="例如：admin"
            :disabled="!isAuthenticated || adminSettingsSaving"
          />
        </el-form-item>
        <el-form-item label="新密码" required>
          <el-input
            v-model="adminSettingsForm.password"
            type="password"
            minlength="6"
            autocomplete="new-password"
            placeholder="至少 6 位"
            :disabled="!isAuthenticated || adminSettingsSaving"
            show-password
          />
        </el-form-item>
        <el-form-item label="确认新密码" required>
          <el-input
            v-model="adminSettingsForm.confirmPassword"
            type="password"
            minlength="6"
            autocomplete="new-password"
            placeholder="再次输入新密码"
            :disabled="!isAuthenticated || adminSettingsSaving"
            show-password
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            :loading="adminSettingsSaving"
            :disabled="!isAuthenticated"
            @click="saveAdminSettings"
          >
            保存管理员账号
          </el-button>
        </el-form-item>
      </el-form>
      <el-alert
        v-if="adminSettingsError"
        :title="adminSettingsError"
        type="error"
        :closable="false"
        show-icon
        style="margin-top: 16px;"
      />
      <el-alert
        v-else-if="adminSettingsMessage"
        :title="adminSettingsMessage"
        type="success"
        :closable="false"
        show-icon
        style="margin-top: 16px;"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';

const apiBaseRaw =
  (typeof window !== 'undefined'
    ? (window as { __APP_API_BASE_URL__?: string }).__APP_API_BASE_URL__
    : '') ?? '';
const apiBase = apiBaseRaw.replace(/\/$/, '');

// 管理员账号设置
const adminSettingsForm = reactive({
  username: 'admin',
  password: '',
  confirmPassword: ''
});
const adminSettingsSaving = ref(false);
const adminSettingsMessage = ref('');
const adminSettingsError = ref('');

const storedToken = typeof window !== 'undefined' ? window.localStorage.getItem('bookmark_token') : null;
const authToken = ref<string | null>(storedToken);
const isAuthenticated = ref(Boolean(storedToken));

async function requestWithAuth(input: RequestInfo | URL, init: RequestInit = {}) {
  if (!authToken.value) {
    throw new Error('请先登录');
  }
  const headers = new Headers(init.headers ?? {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (authToken.value) {
    headers.set('Authorization', `Bearer ${authToken.value}`);
  }
  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) {
    authToken.value = null;
    isAuthenticated.value = false;
    throw new Error('登录状态已失效，请重新登录');
  }
  return response;
}

async function loadAdminSettings() {
  try {
    const response = await requestWithAuth(`${apiBase}/api/admin/credentials`, {
      method: 'GET'
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || '获取管理员账号失败');
    }
    const data = (await response.json()) as { username: string };
    adminSettingsForm.username = data.username || 'admin';
    adminSettingsForm.password = '';
    adminSettingsForm.confirmPassword = '';
    adminSettingsMessage.value = '';
    adminSettingsError.value = '';
  } catch (err) {
    adminSettingsError.value = err instanceof Error ? err.message : '获取管理员账号失败';
  }
}

async function saveAdminSettings() {
  if (!isAuthenticated.value) {
    ElMessage.warning('请先登录');
    return;
  }
  const username = adminSettingsForm.username.trim();
  const password = adminSettingsForm.password;
  const confirm = adminSettingsForm.confirmPassword;

  if (!username) {
    adminSettingsError.value = '管理员用户名不能为空';
    return;
  }
  if (!password) {
    adminSettingsError.value = '管理员密码不能为空';
    return;
  }
  if (password.length < 6) {
    adminSettingsError.value = '管理员密码长度至少为 6 位';
    return;
  }
  if (password !== confirm) {
    adminSettingsError.value = '两次输入的密码不一致';
    return;
  }

  adminSettingsSaving.value = true;
  adminSettingsMessage.value = '';
  adminSettingsError.value = '';

  try {
    const response = await requestWithAuth(`${apiBase}/api/admin/credentials`, {
      method: 'PUT',
      body: JSON.stringify({ username, password })
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || '保存管理员账号失败');
    }
    const data = (await response.json()) as { username: string };
    adminSettingsForm.username = data.username || username;
    adminSettingsForm.password = '';
    adminSettingsForm.confirmPassword = '';
    adminSettingsMessage.value = '管理员账号已保存';
    ElMessage.success('管理员账号已保存');
  } catch (err) {
    adminSettingsError.value = err instanceof Error ? err.message : '保存管理员账号失败';
    ElMessage.error(adminSettingsError.value);
  } finally {
    adminSettingsSaving.value = false;
  }
}

onMounted(() => {
  if (isAuthenticated.value) {
    loadAdminSettings();
  }
});
</script>

<style scoped>
.account-page {
  padding: 0;
}

.page-title {
  margin: 0 0 8px 0;
  font-size: 24px;
  font-weight: 600;
  color: #1f2933;
}

.page-desc {
  margin: 0 0 24px 0;
  color: #6b7280;
  font-size: 14px;
}

.account-card {
  margin-bottom: 24px;
}

.account-card h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2933;
}
</style>

