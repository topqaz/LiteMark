<template>
  <div class="account-page">
    <h2 class="page-title">账号管理</h2>
    <p class="page-desc">在这里修改后台登录的用户名和密码</p>

    <el-card class="account-card">
      <template #header>
        <h3>管理员账号</h3>
      </template>
      <el-form :model="adminSettingsForm" :label-width="isMobile ? '0px' : '140px'" @submit.prevent="saveAdminSettings">
        <el-form-item :label="isMobile ? '' : '管理员用户名'" required>
          <template v-if="isMobile" #label>
            <span class="mobile-label">管理员用户名 <span class="required-mark">*</span></span>
          </template>
          <el-input
            v-model="adminSettingsForm.username"
            maxlength="60"
            placeholder="例如：admin"
            :disabled="!isAuthenticated || adminSettingsSaving"
          />
        </el-form-item>
        <el-form-item :label="isMobile ? '' : '当前密码'" required>
          <template v-if="isMobile" #label>
            <span class="mobile-label">当前密码 <span class="required-mark">*</span></span>
          </template>
          <el-input
            v-model="adminSettingsForm.currentPassword"
            type="password"
            autocomplete="current-password"
            placeholder="输入当前密码以验证身份"
            :disabled="!isAuthenticated || adminSettingsSaving"
            show-password
          />
        </el-form-item>
        <el-form-item :label="isMobile ? '' : '新密码'" required>
          <template v-if="isMobile" #label>
            <span class="mobile-label">新密码 <span class="required-mark">*</span></span>
          </template>
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
        <el-form-item :label="isMobile ? '' : '确认新密码'" required>
          <template v-if="isMobile" #label>
            <span class="mobile-label">确认新密码 <span class="required-mark">*</span></span>
          </template>
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
        <el-form-item class="form-submit-item">
          <el-button
            type="primary"
            :loading="adminSettingsSaving"
            :disabled="!isAuthenticated"
            @click="saveAdminSettings"
            class="submit-button"
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
import { onMounted, reactive, ref, onUnmounted } from 'vue';
import { ElMessage } from 'element-plus';

const apiBaseRaw =
  (typeof window !== 'undefined'
    ? (window as { __APP_API_BASE_URL__?: string }).__APP_API_BASE_URL__
    : '') ?? '';
const apiBase = apiBaseRaw.replace(/\/$/, '');

// 管理员账号设置
const adminSettingsForm = reactive({
  username: 'admin',
  currentPassword: '',
  password: '',
  confirmPassword: ''
});
const adminSettingsSaving = ref(false);
const adminSettingsMessage = ref('');
const adminSettingsError = ref('');

const storedToken = typeof window !== 'undefined' ? window.localStorage.getItem('bookmark_token') : null;
const authToken = ref<string | null>(storedToken);
const isAuthenticated = ref(Boolean(storedToken));

// 移动端检测
const isMobile = ref(false);
function checkMobile() {
  isMobile.value = window.innerWidth <= 768;
}

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
    adminSettingsForm.currentPassword = '';
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
  const currentPassword = adminSettingsForm.currentPassword;
  const password = adminSettingsForm.password;
  const confirm = adminSettingsForm.confirmPassword;

  if (!username) {
    adminSettingsError.value = '管理员用户名不能为空';
    return;
  }
  if (!currentPassword) {
    adminSettingsError.value = '请输入当前密码';
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
      body: JSON.stringify({
        current_password: currentPassword,
        username,
        new_password: password
      })
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || '保存管理员账号失败');
    }
    const data = (await response.json()) as { username: string };
    adminSettingsForm.username = data.username || username;
    adminSettingsForm.currentPassword = '';
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
  checkMobile();
  window.addEventListener('resize', checkMobile);
});

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile);
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

.mobile-label {
  display: block;
  font-weight: 500;
  color: #374151;
  margin-bottom: 8px;
  font-size: 14px;
}

.required-mark {
  color: #f56565;
  margin-left: 2px;
}

@media (max-width: 768px) {
  .account-page {
    padding: 0;
  }

  .page-title {
    font-size: 20px;
    margin-bottom: 8px;
  }

  .page-desc {
    font-size: 13px;
    margin-bottom: 16px;
  }

  .account-card {
    margin-bottom: 16px;
    border-radius: 8px;
  }

  .account-card :deep(.el-card__header) {
    padding: 16px;
  }

  .account-card :deep(.el-card__body) {
    padding: 16px;
  }

  .account-card h3 {
    font-size: 16px;
  }

  .account-card :deep(.el-form-item) {
    margin-bottom: 20px;
    display: flex;
    flex-direction: column;
  }

  .account-card :deep(.el-form-item__label) {
    width: 100% !important;
    text-align: left !important;
    margin-bottom: 8px !important;
    padding: 0 !important;
    margin-right: 0 !important;
    line-height: 1.5;
    font-weight: 500;
    color: #374151;
    float: none !important;
  }

  .account-card :deep(.el-form-item__content) {
    margin-left: 0 !important;
    width: 100% !important;
    flex: 1;
  }

  .account-card :deep(.el-input),
  .account-card :deep(.el-input__wrapper) {
    width: 100% !important;
  }

  .form-submit-item {
    margin-top: 24px;
  }

  .form-submit-item :deep(.el-form-item__content) {
    margin-left: 0 !important;
  }

  .submit-button {
    width: 100%;
  }

  .account-card :deep(.el-alert) {
    margin-top: 12px;
  }
}
</style>

