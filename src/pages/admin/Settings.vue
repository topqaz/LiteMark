<template>
  <div class="settings-page">
    <h2 class="page-title">系统设置</h2>
    <p class="page-desc">配置网站标题、图标以及主题风格</p>

    <el-card class="settings-card">
      <template #header>
        <h3>站点设置</h3>
      </template>
      <el-form :model="siteSettingsForm" label-width="120px" @submit.prevent="saveSiteSettings">
        <el-form-item label="网站标题" required>
          <el-input
            v-model="siteSettingsForm.title"
            maxlength="60"
            placeholder="例如：我的书签收藏"
            :disabled="!isAuthenticated || siteSettingsSaving"
          />
        </el-form-item>
        <el-form-item label="网站图标">
          <el-input
            v-model="siteSettingsForm.icon"
            maxlength="512"
            placeholder="例如：LiteMark.png 或 /LiteMark128.png"
            :disabled="!isAuthenticated || siteSettingsSaving"
          />
        </el-form-item>
        <el-form-item label="主题">
          <el-select
            v-model="selectedTheme"
            @change="handleThemeChange"
            :disabled="themeSaving || !isAuthenticated"
            style="width: 100%"
          >
            <el-option
              v-for="option in themeOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            :loading="siteSettingsSaving"
            :disabled="!isAuthenticated"
            @click="saveSiteSettings"
          >
            保存设置
          </el-button>
        </el-form-item>
      </el-form>
      <el-alert
        v-if="siteSettingsError"
        :title="siteSettingsError"
        type="error"
        :closable="false"
        show-icon
        style="margin-top: 16px;"
      />
      <el-alert
        v-else-if="siteSettingsMessage"
        :title="siteSettingsMessage"
        type="success"
        :closable="false"
        show-icon
        style="margin-top: 16px;"
      />
      <el-alert
        v-if="themeMessage"
        :title="themeMessage"
        type="error"
        :closable="false"
        show-icon
        style="margin-top: 16px;"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

const DEFAULT_TITLE = '个人书签';
const DEFAULT_ICON = '/LiteMark.png';

const themeOptions = [
  { value: 'light', label: '晨光浅色' },
  { value: 'twilight', label: '暮色渐变' },
  { value: 'dark', label: '夜空深色' },
  { value: 'forest', label: '林间绿意' },
  { value: 'ocean', label: '深海幻境' },
  { value: 'sunrise', label: '朝霞暖橙' }
];

const apiBaseRaw =
  (typeof window !== 'undefined'
    ? (window as { __APP_API_BASE_URL__?: string }).__APP_API_BASE_URL__
    : '') ?? '';
const apiBase = apiBaseRaw.replace(/\/$/, '');

const currentTheme = ref<string>('light');
const selectedTheme = ref<string>('light');
const themeSaving = ref(false);
const themeMessage = ref('');

const siteTitle = ref<string>(DEFAULT_TITLE);
const siteIcon = ref<string>(DEFAULT_ICON);
const siteSettingsForm = reactive({
  title: DEFAULT_TITLE,
  icon: DEFAULT_ICON
});
const siteSettingsSaving = ref(false);
const siteSettingsMessage = ref('');
const siteSettingsError = ref('');

const storedToken = typeof window !== 'undefined' ? window.localStorage.getItem('bookmark_token') : null;
const authToken = ref<string | null>(storedToken);
const isAuthenticated = ref(Boolean(storedToken));

function applyTheme(theme: string) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
}

let defaultFaviconHref: string | null = null;

function resolveFaviconHref(icon: string): string | null {
  const value = icon.trim();
  if (!value) {
    return '/LiteMark.png';
  }
  if (/^(https?:|data:|\/)/i.test(value)) {
    return value;
  }
  return `/${value}`;
}

function updateFavicon(icon: string) {
  if (typeof document === 'undefined') return;
  let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  if (defaultFaviconHref === null) {
    defaultFaviconHref = link.href || '';
  }
  const href = resolveFaviconHref(icon);
  if (href) {
    link.href = href;
    if (href.startsWith('data:image/svg+xml')) {
      link.type = 'image/svg+xml';
    } else {
      link.removeAttribute('type');
    }
  } else if (defaultFaviconHref) {
    link.href = defaultFaviconHref;
  } else {
    link.remove();
  }
}

function applySiteMeta(title: string, icon: string) {
  if (typeof document === 'undefined') return;
  const resolvedTitle = title.trim() || DEFAULT_TITLE;
  const resolvedIcon = icon.trim() || DEFAULT_ICON;
  document.title = resolvedTitle;
  updateFavicon(resolvedIcon);
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

async function loadSettings() {
  try {
    const response = await fetch(`${apiBase}/api/settings`);
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const settings = (await response.json()) as {
      theme?: string;
      siteTitle?: string;
      siteIcon?: string;
    };
    if (settings.theme && themeOptions.some((item) => item.value === settings.theme)) {
      currentTheme.value = settings.theme;
      selectedTheme.value = settings.theme;
    }
    siteTitle.value = settings.siteTitle ?? DEFAULT_TITLE;
    siteIcon.value = settings.siteIcon ?? DEFAULT_ICON;
    siteSettingsForm.title = siteTitle.value;
    siteSettingsForm.icon = siteIcon.value;
    applySiteMeta(siteTitle.value, siteIcon.value);
    siteSettingsMessage.value = '';
    siteSettingsError.value = '';
    themeMessage.value = '';
  } catch (err) {
    const message = err instanceof Error ? err.message : '加载站点设置失败';
    siteSettingsError.value = message;
    themeMessage.value = message;
  }
}

watch(currentTheme, (value) => {
  applyTheme(value);
});

async function handleThemeChange() {
  const value = selectedTheme.value;
  if (!isAuthenticated.value) {
    ElMessage.warning('请先登录');
    selectedTheme.value = currentTheme.value;
    return;
  }
  if (value === currentTheme.value) {
    return;
  }
  themeSaving.value = true;
  themeMessage.value = '';
  const previous = currentTheme.value;
  try {
    const response = await requestWithAuth(`${apiBase}/api/settings`, {
      method: 'PUT',
      body: JSON.stringify({ theme: value })
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || '保存主题失败');
    }
    const result = (await response.json()) as { theme: string; siteTitle?: string; siteIcon?: string };
    currentTheme.value = result.theme;
    selectedTheme.value = result.theme;
    if (result.siteTitle !== undefined) {
      siteTitle.value = result.siteTitle || DEFAULT_TITLE;
    }
    if (result.siteIcon !== undefined) {
      siteIcon.value = result.siteIcon || DEFAULT_ICON;
    }
    ElMessage.success('主题已保存');
  } catch (err) {
    themeMessage.value = err instanceof Error ? err.message : '保存主题失败';
    selectedTheme.value = previous;
    ElMessage.error(themeMessage.value);
  } finally {
    themeSaving.value = false;
  }
}

async function saveSiteSettings() {
  if (!isAuthenticated.value) {
    ElMessage.warning('请先登录');
    return;
  }
  const payload = {
    siteTitle: siteSettingsForm.title.trim(),
    siteIcon: siteSettingsForm.icon.trim()
  };
  if (!payload.siteTitle) {
    siteSettingsError.value = '站点标题不能为空';
    return;
  }
  siteSettingsSaving.value = true;
  siteSettingsMessage.value = '';
  siteSettingsError.value = '';
  try {
    const response = await requestWithAuth(`${apiBase}/api/settings`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || '保存站点设置失败');
    }
    const result = (await response.json()) as {
      siteTitle: string;
      siteIcon: string;
      theme: string;
    };
    siteTitle.value = result.siteTitle ?? DEFAULT_TITLE;
    siteIcon.value = result.siteIcon ?? DEFAULT_ICON;
    applySiteMeta(siteTitle.value, siteIcon.value);
    siteSettingsMessage.value = '站点信息已保存';
    ElMessage.success('站点信息已保存');
  } catch (err) {
    siteSettingsError.value = err instanceof Error ? err.message : '保存站点设置失败';
    ElMessage.error(siteSettingsError.value);
  } finally {
    siteSettingsSaving.value = false;
  }
}

onMounted(() => {
  loadSettings();
});
</script>

<style scoped>
.settings-page {
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

.settings-card {
  margin-bottom: 24px;
}

.settings-card h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2933;
}
</style>

