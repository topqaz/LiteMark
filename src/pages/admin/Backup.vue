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
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Download, Upload } from '@element-plus/icons-vue';

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
    const filename = `litemark-backup-${new Date().toISOString().split('T')[0]}.json`;
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
</style>

