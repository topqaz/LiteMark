<template>
  <div class="backup-page">
    <h2 class="page-title">数据备份</h2>
    <p class="page-desc">导出或导入数据备份文件，用于数据迁移和恢复</p>

    <el-row :gutter="24">
      <el-col :xs="24" :sm="24" :md="12" :lg="12" :xl="12">
        <el-card class="backup-card">
          <template #header>
            <h3>导出备份</h3>
          </template>
          <p class="backup-description">将当前所有书签和设置导出为 JSON 格式文件</p>
          <el-button
            type="primary"
            :loading="backupExportLoading"
            :disabled="!isAuthenticated"
            @click="handleExportBackup"
          >
            <el-icon><Download /></el-icon>导出数据
          </el-button>
          <el-alert
            v-if="backupExportError"
            :title="backupExportError"
            type="error"
            :closable="false"
            show-icon
            style="margin-top: 16px;"
          />
          <el-alert
            v-else-if="backupExportMessage"
            :title="backupExportMessage"
            type="success"
            :closable="false"
            show-icon
            style="margin-top: 16px;"
          />
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="24" :md="12" :lg="12" :xl="12">
        <el-card class="backup-card">
          <template #header>
            <h3>导入备份</h3>
          </template>
          <p class="backup-description">从 JSON 格式备份文件导入书签和设置</p>
          <input
            ref="backupImportFileInput"
            type="file"
            accept=".json"
            style="display: none"
            @change="handleImportBackup"
          />
          <div class="backup-import-options">
            <el-checkbox
              v-model="backupImportOverwrite"
              :disabled="backupImportLoading || !isAuthenticated"
            >
              覆盖现有数据
            </el-checkbox>
          </div>
          <el-button
            :loading="backupImportLoading"
            :disabled="!isAuthenticated"
            @click="triggerBackupImportFile"
          >
            <el-icon><Upload /></el-icon>选择文件并导入
          </el-button>
          <el-alert
            v-if="backupImportError"
            :title="backupImportError"
            type="error"
            :closable="false"
            show-icon
            style="margin-top: 16px;"
          />
          <el-alert
            v-else-if="backupImportMessage"
            :title="backupImportMessage"
            type="success"
            :closable="false"
            show-icon
            style="margin-top: 16px;"
          />
        </el-card>
      </el-col>
    </el-row>

    <!-- WebDAV 定时备份配置 -->
    <el-card class="backup-card webdav-card" style="margin-top: 24px;">
      <template #header>
        <div class="webdav-card-header">
          <h3>WebDAV 定时备份</h3>
          <el-switch
            v-model="webdavConfig.enabled"
            :disabled="webdavSaving || !isAuthenticated || !webdavConfig.url"
            active-text="已开启"
            inactive-text="已关闭"
            @change="toggleAutoBackup"
            class="webdav-header-switch"
          />
        </div>
      </template>
      <p class="backup-description">配置 WebDAV 服务器以实现自动备份（默认每天凌晨2点备份）</p>
      
      <el-form :model="webdavConfig" label-width="120px" class="webdav-form">
        <el-form-item label="WebDAV 地址" required>
          <el-input
            v-model="webdavConfig.url"
            placeholder="例如：https://dav.example.com"
            :disabled="webdavSaving || !isAuthenticated"
          />
        </el-form-item>
        <el-form-item label="用户名" required>
          <el-input
            v-model="webdavConfig.username"
            placeholder="WebDAV 用户名"
            :disabled="webdavSaving || !isAuthenticated"
          />
        </el-form-item>
        <el-form-item label="密码" required>
          <el-input
            v-model="webdavConfig.password"
            type="password"
            placeholder="WebDAV 密码"
            show-password
            :disabled="webdavSaving || !isAuthenticated"
          />
        </el-form-item>
        <el-form-item label="备份路径">
          <el-input
            v-model="webdavConfig.path"
            placeholder="litemark-backup/ 或 /backups/"
            :disabled="webdavSaving || !isAuthenticated"
          />
          <div class="form-tip">留空则使用默认路径 litemark-backup/（建议使用目录路径）</div>
        </el-form-item>
        <el-form-item label="保留备份数量">
          <el-input-number
            v-model="webdavConfig.keepBackups"
            :min="0"
            :max="365"
            :disabled="webdavSaving || !isAuthenticated"
            style="width: 100%"
          />
          <div class="form-tip">保留最近的备份文件数量，0 表示不限制（建议设置为 7-30）</div>
        </el-form-item>
        <el-form-item label="备份时间">
          <el-time-picker
            v-model="backupTimeValue"
            format="HH:mm"
            value-format="HH:mm"
            :disabled="webdavSaving || !isAuthenticated"
            placeholder="选择备份时间"
            style="width: 100%"
          />
          <div class="form-tip">每天定时备份的时间（服务器本地时间）</div>
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            :loading="webdavSaving"
            :disabled="!isAuthenticated"
            @click="saveWebDAVConfig"
          >
            保存配置
          </el-button>
          <el-button
            :loading="webdavTesting"
            :disabled="!isAuthenticated || webdavSaving"
            @click="testWebDAVConnection"
          >
            测试连接
          </el-button>
          <el-button
            :loading="webdavBackupLoading"
            :disabled="!isAuthenticated || !webdavConfig.url"
            @click="triggerWebDAVBackup"
          >
            立即备份
          </el-button>
        </el-form-item>
      </el-form>

      <el-alert
        v-if="webdavError"
        :title="webdavError"
        type="error"
        :closable="false"
        show-icon
        style="margin-top: 16px;"
      />
      <el-alert
        v-else-if="webdavMessage"
        :title="webdavMessage"
        type="success"
        :closable="false"
        show-icon
        style="margin-top: 16px;"
      />

      <el-alert
        v-if="webdavConfig.enabled"
        type="success"
        :closable="false"
        show-icon
        style="margin-top: 16px;"
      >
        <template #title>
          <div>
            <strong>自动备份已开启</strong>
            <p style="margin: 8px 0 0 0; font-size: 13px;">
              系统将在每天 <code>{{ webdavConfig.backupTime }}</code> 自动备份数据到 WebDAV。每次备份会创建新文件（格式：<code>litemark-backup-YYYY-MM-DD-HH-mm-ss.json</code>），并自动清理超出保留数量的旧备份。
            </p>
            <p v-if="webdavConfig.lastBackup" style="margin: 8px 0 0 0; font-size: 13px;">
              上次备份时间: <code>{{ formatLastBackup(webdavConfig.lastBackup) }}</code>
            </p>
          </div>
        </template>
      </el-alert>

      <el-alert
        v-else
        type="info"
        :closable="false"
        show-icon
        style="margin-top: 16px;"
      >
        <template #title>
          <div>
            <strong>自动备份已关闭</strong>
            <p style="margin: 8px 0 0 0; font-size: 13px;">
              开启自动备份后，系统将在设定的时间自动备份数据到 WebDAV 服务器。
            </p>
          </div>
        </template>
      </el-alert>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { getShanghaiDateString } from '../../utils/date.js';
// 图标已全局注册，直接使用组件名称

const apiBaseRaw =
  (typeof window !== 'undefined'
    ? (window as { __APP_API_BASE_URL__?: string }).__APP_API_BASE_URL__
    : '') ?? '';
const apiBase = apiBaseRaw.replace(/\/$/, '');

const storedToken = typeof window !== 'undefined' ? window.localStorage.getItem('bookmark_token') : null;
const authToken = ref<string | null>(storedToken);
const isAuthenticated = ref(Boolean(storedToken));

const backupExportLoading = ref(false);
const backupExportMessage = ref('');
const backupExportError = ref('');
const backupImportLoading = ref(false);
const backupImportMessage = ref('');
const backupImportError = ref('');
const backupImportFileInput = ref<HTMLInputElement | null>(null);
const backupImportOverwrite = ref(false);

// WebDAV 配置
const webdavConfig = ref({
  url: '',
  username: '',
  password: '',
  path: 'litemark-backup/',
  keepBackups: 7,
  enabled: false,
  backupTime: '02:00',
  lastBackup: ''
});
const webdavSaving = ref(false);
const webdavTesting = ref(false);
const webdavBackupLoading = ref(false);
const webdavMessage = ref('');
const webdavError = ref('');

// 备份时间的计算属性
const backupTimeValue = computed({
  get: () => webdavConfig.value.backupTime,
  set: (val: string) => {
    webdavConfig.value.backupTime = val || '02:00';
  }
});

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

async function handleExportBackup() {
  if (!isAuthenticated.value) {
    ElMessage.warning('请先登录');
    return;
  }

  backupExportLoading.value = true;
  backupExportMessage.value = '';
  backupExportError.value = '';

  try {
    const response = await requestWithAuth(`${apiBase}/api/backup/export`, {
      method: 'GET'
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || '导出失败');
    }

    const data = await response.json();

    // 创建下载链接
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filename = `litemark-backup-${getShanghaiDateString()}.json`;
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    backupExportMessage.value = '数据导出成功';
    ElMessage.success('数据导出成功');
  } catch (err) {
    backupExportError.value = err instanceof Error ? err.message : '导出失败';
    ElMessage.error(backupExportError.value);
  } finally {
    backupExportLoading.value = false;
  }
}

async function handleImportBackup() {
  if (!isAuthenticated.value) {
    ElMessage.warning('请先登录');
    return;
  }

  if (!backupImportFileInput.value) {
    return;
  }

  const file = backupImportFileInput.value.files?.[0];
  if (!file) {
    backupImportError.value = '请选择要导入的备份文件';
    return;
  }

  if (!file.name.endsWith('.json')) {
    backupImportError.value = '请选择 JSON 格式的备份文件';
    return;
  }

  backupImportLoading.value = true;
  backupImportMessage.value = '';
  backupImportError.value = '';

  try {
    const fileContent = await file.text();
    let importData: {
      bookmarks?: Array<{
        id?: string;
        title: string;
        url: string;
        category?: string;
        description?: string;
        visible?: boolean;
      }>;
      settings?: {
        theme?: string;
        siteTitle?: string;
        siteIcon?: string;
      };
    };

    try {
      importData = JSON.parse(fileContent);
    } catch (parseError) {
      throw new Error('文件格式错误：无法解析 JSON 内容');
    }

    if (!importData.bookmarks && !importData.settings) {
      throw new Error('备份文件格式错误：未找到书签或设置数据');
    }

    // 如果选择覆盖，需要确认
    if (backupImportOverwrite.value) {
      try {
        await ElMessageBox.confirm('确定要覆盖现有数据吗？此操作无法撤销！', '警告', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        });
      } catch {
        backupImportLoading.value = false;
        return;
      }
    }

    const response = await requestWithAuth(`${apiBase}/api/backup/import`, {
      method: 'POST',
      body: JSON.stringify({
        ...importData,
        overwrite: backupImportOverwrite.value
      })
    });

    if (!response.ok) {
      let errorMessage = '导入失败';
      try {
        const errorData = (await response.json()) as { error?: string };
        errorMessage = errorData.error || errorMessage;
      } catch {
        errorMessage = await response.text() || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const result = (await response.json()) as {
      success: boolean;
      importedBookmarks: number;
      updatedSettings: boolean;
      totalBookmarks: number;
      errors?: string[];
    };

    if (result.success) {
      let message = '';
      if (result.importedBookmarks > 0) {
        message += `成功导入 ${result.importedBookmarks} 个书签`;
      }
      if (result.updatedSettings) {
        message += message ? '，设置已更新' : '设置已更新';
      }
      if (result.errors && result.errors.length > 0) {
        message += `，${result.errors.length} 个错误`;
        console.warn('导入错误:', result.errors);
      }
      backupImportMessage.value = message || '导入成功';
      ElMessage.success(backupImportMessage.value);

      // 清空文件选择器
      if (backupImportFileInput.value) {
        backupImportFileInput.value.value = '';
      }
      backupImportOverwrite.value = false;
    } else {
      throw new Error('导入失败');
    }
  } catch (err) {
    if (err !== 'cancel') {
      backupImportError.value = err instanceof Error ? err.message : '导入失败';
      ElMessage.error(backupImportError.value);
    }
  } finally {
    backupImportLoading.value = false;
  }
}

function triggerBackupImportFile() {
  if (!isAuthenticated.value) {
    ElMessage.warning('请先登录');
    return;
  }
  backupImportFileInput.value?.click();
}

// 加载 WebDAV 配置
async function loadWebDAVConfig() {
  if (!isAuthenticated.value) {
    return;
  }
  try {
    const response = await requestWithAuth(`${apiBase}/api/backup/webdav`, {
      method: 'GET'
    });
    if (response.ok) {
      const config = await response.json();
      if (config) {
        webdavConfig.value = {
          url: config.url || '',
          username: config.username || '',
          password: '', // 不加载密码
          path: config.path || 'litemark-backup/',
          keepBackups: config.keepBackups ?? 7,
          enabled: config.enabled !== false,
          backupTime: config.backupTime || '02:00',
          lastBackup: config.lastBackup || ''
        };
      }
    }
  } catch (err) {
    console.error('加载 WebDAV 配置失败:', err);
  }
}

// 保存 WebDAV 配置
async function saveWebDAVConfig() {
  if (!isAuthenticated.value) {
    ElMessage.warning('请先登录');
    return;
  }

  webdavSaving.value = true;
  webdavMessage.value = '';
  webdavError.value = '';

  try {
    const response = await requestWithAuth(`${apiBase}/api/backup/webdav`, {
      method: 'PUT',
      body: JSON.stringify({
        ...webdavConfig.value,
        keepBackups: webdavConfig.value.keepBackups ?? 7,
        provider: 'webdav'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || '保存配置失败');
    }

    webdavMessage.value = 'WebDAV 配置已保存';
    ElMessage.success('WebDAV 配置已保存');
  } catch (err) {
    webdavError.value = err instanceof Error ? err.message : '保存配置失败';
    ElMessage.error(webdavError.value);
  } finally {
    webdavSaving.value = false;
  }
}

// 开启/关闭自动备份
async function toggleAutoBackup(enabled: boolean) {
  if (!isAuthenticated.value) {
    ElMessage.warning('请先登录');
    webdavConfig.value.enabled = !enabled; // 恢复原状态
    return;
  }

  if (enabled && (!webdavConfig.value.url || !webdavConfig.value.username || !webdavConfig.value.password)) {
    ElMessage.warning('请先填写完整的 WebDAV 配置信息');
    webdavConfig.value.enabled = false; // 恢复原状态
    return;
  }

  webdavSaving.value = true;
  webdavMessage.value = '';
  webdavError.value = '';

  try {
    // 如果配置不完整，先尝试加载已有配置
    if (!webdavConfig.value.url) {
      await loadWebDAVConfig();
    }

    const response = await requestWithAuth(`${apiBase}/api/backup/webdav`, {
      method: 'PUT',
      body: JSON.stringify({
        ...webdavConfig.value,
        enabled: enabled,
        keepBackups: webdavConfig.value.keepBackups ?? 7,
        provider: 'webdav'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || '操作失败');
    }

    webdavMessage.value = enabled ? '自动备份已开启' : '自动备份已关闭';
    ElMessage.success(webdavMessage.value);
  } catch (err) {
    webdavError.value = err instanceof Error ? err.message : '操作失败';
    ElMessage.error(webdavError.value);
    webdavConfig.value.enabled = !enabled; // 恢复原状态
  } finally {
    webdavSaving.value = false;
  }
}

// 测试 WebDAV 连接
async function testWebDAVConnection() {
  if (!isAuthenticated.value) {
    ElMessage.warning('请先登录');
    return;
  }

  webdavTesting.value = true;
  webdavMessage.value = '';
  webdavError.value = '';

  try {
    // 如果密码为空，但 URL 和用户名已填写，尝试使用已保存的配置进行测试
    if (!webdavConfig.value.password && webdavConfig.value.url && webdavConfig.value.username) {
      const response = await requestWithAuth(`${apiBase}/api/backup/webdav?test=true`, {
        method: 'GET'
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || '连接测试失败');
      }

      webdavMessage.value = 'WebDAV 连接测试成功';
      ElMessage.success('WebDAV 连接测试成功');
      return;
    }

    // 如果密码已填写，使用当前配置进行测试（需要保存配置）
    if (!webdavConfig.value.url || !webdavConfig.value.username || !webdavConfig.value.password) {
      webdavError.value = '请先填写完整的 WebDAV 配置信息';
      ElMessage.warning('请先填写完整的 WebDAV 配置信息');
      return;
    }

    // 先保存配置以测试连接
    const response = await requestWithAuth(`${apiBase}/api/backup/webdav`, {
      method: 'PUT',
      body: JSON.stringify({
        ...webdavConfig.value,
        provider: 'webdav'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || '连接测试失败');
    }

    webdavMessage.value = 'WebDAV 连接测试成功';
    ElMessage.success('WebDAV 连接测试成功');
  } catch (err) {
    webdavError.value = err instanceof Error ? err.message : '连接测试失败';
    ElMessage.error(webdavError.value);
  } finally {
    webdavTesting.value = false;
  }
}

// 立即备份到 WebDAV
async function triggerWebDAVBackup() {
  if (!isAuthenticated.value) {
    ElMessage.warning('请先登录');
    return;
  }

  webdavBackupLoading.value = true;
  webdavMessage.value = '';
  webdavError.value = '';

  try {
    const response = await requestWithAuth(`${apiBase}/api/backup/webdav`, {
      method: 'POST'
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || '备份失败');
    }

    const result = await response.json();
    webdavMessage.value = result.message || '备份到 WebDAV 成功';
    ElMessage.success(webdavMessage.value);
  } catch (err) {
    webdavError.value = err instanceof Error ? err.message : '备份失败';
    ElMessage.error(webdavError.value);
  } finally {
    webdavBackupLoading.value = false;
  }
}


// 格式化上次备份时间
function formatLastBackup(isoString: string): string {
  if (!isoString) return '无';
  try {
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return isoString;
  }
}

// 页面加载时获取配置
onMounted(() => {
  loadWebDAVConfig();
});
</script>

<style scoped>
.backup-page {
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

.backup-card {
  margin-bottom: 24px;
}

.backup-card h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2933;
}

.backup-description {
  margin: 0 0 16px 0;
  color: #6b7280;
  font-size: 14px;
  line-height: 1.5;
}

.backup-import-options {
  margin-bottom: 16px;
}

.webdav-card {
  margin-top: 24px;
}

.webdav-form {
  margin-top: 16px;
}

.form-tip {
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
}

.webdav-form pre {
  font-family: 'Courier New', monospace;
}

.webdav-form code {
  font-family: 'Courier New', monospace;
  background: #f5f5f5;
  padding: 2px 4px;
  border-radius: 3px;
  font-size: 12px;
}

.webdav-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.webdav-card-header h3 {
  margin: 0;
  flex: 1;
  min-width: 0;
}

.webdav-header-switch {
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .backup-card {
    margin-bottom: 16px;
  }

  .backup-card :deep(.el-button) {
    width: 100%;
  }

  /* WebDAV 卡片头部在手机上垂直排列 */
  .webdav-card :deep(.el-card__header) {
    padding: 14px 16px !important;
  }

  .webdav-card-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .webdav-card-header h3 {
    width: 100%;
    font-size: 16px;
  }

  .webdav-header-switch {
    align-self: flex-end;
  }

  /* 隐藏开关的文字标签 */
  .webdav-header-switch :deep(.el-switch__label) {
    display: none !important;
  }

  /* 表单优化 */
  .webdav-form {
    margin-top: 12px;
  }

  .webdav-form :deep(.el-form-item) {
    display: flex !important;
    flex-direction: column !important;
    margin-bottom: 16px;
    align-items: flex-start !important;
  }

  .webdav-form :deep(.el-form-item__label) {
    width: 100% !important;
    text-align: left !important;
    margin-bottom: 8px !important;
    padding-left: 0 !important;
    padding-right: 0 !important;
    padding-bottom: 0 !important;
    padding-top: 0 !important;
    margin-left: 0 !important;
    margin-right: 0 !important;
    float: none !important;
    position: static !important;
    display: block !important;
    font-size: 14px;
    line-height: 1.5;
  }

  .webdav-form :deep(.el-form-item__content) {
    margin-left: 0 !important;
    width: 100% !important;
    flex: 1;
    display: block;
  }

  .webdav-form :deep(.el-input),
  .webdav-form :deep(.el-input-number) {
    width: 100% !important;
  }

  .webdav-form :deep(.el-button) {
    width: 100%;
    margin-bottom: 8px;
    margin-right: 0 !important;
  }

  .webdav-form :deep(.el-button + .el-button) {
    margin-left: 0 !important;
  }

  .backup-description {
    font-size: 13px;
  }
}
</style>

