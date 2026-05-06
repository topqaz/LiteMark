<template>
  <div class="settings-page">
    <h2 class="page-title">系统设置</h2>
    <p class="page-desc">配置网站标题、图标以及主题风格</p>

    <el-card class="settings-card">
      <template #header>
        <h3>站点设置</h3>
      </template>
      <el-form :model="siteSettingsForm" :label-width="isMobile ? '0px' : '120px'" @submit.prevent="saveSiteSettings">
        <el-form-item :label="isMobile ? '' : '网站标题'" required>
          <template v-if="isMobile" #label>
            <span class="mobile-label">网站标题 <span class="required-mark">*</span></span>
          </template>
          <el-input
            v-model="siteSettingsForm.title"
            maxlength="60"
            placeholder="例如：我的书签收藏"
            :disabled="!isAuthenticated || siteSettingsSaving"
          />
        </el-form-item>
        <el-form-item :label="isMobile ? '' : '网站图标'">
          <template v-if="isMobile" #label>
            <span class="mobile-label">网站图标</span>
          </template>
          <el-input
            v-model="siteSettingsForm.icon"
            maxlength="512"
            placeholder="例如：LiteMark.png 或 /LiteMark128.png"
            :disabled="!isAuthenticated || siteSettingsSaving"
          />
        </el-form-item>
        <el-form-item :label="isMobile ? '' : '主题'">
          <template v-if="isMobile" #label>
            <span class="mobile-label">主题</span>
          </template>
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
        <el-form-item class="form-submit-item">
          <el-button
            type="primary"
            :loading="siteSettingsSaving"
            :disabled="!isAuthenticated"
            @click="saveSiteSettings"
            class="submit-button"
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

    <el-card class="settings-card mcp-card">
      <template #header>
        <h3>MCP 设置</h3>
      </template>
      <el-alert
        class="mcp-help"
        type="info"
        :closable="false"
        show-icon
      >
        <p>MCP 用于让支持 Streamable HTTP 的 AI 客户端直接管理 LiteMark 书签。启用后，客户端通过 MCP 地址和 Token 连接，不需要暴露管理员账号密码。</p>
        <p>桌面客户端、命令行 Agent、服务器 Agent 通常不会携带浏览器 Origin，“允许来源”留空即可；只有网页端 AI 客户端从浏览器直接访问时，才需要填写对应网站来源。</p>
      </el-alert>
      <el-form :model="mcpForm" :label-width="isMobile ? '0px' : '120px'" @submit.prevent="saveMcpSettings">
        <el-form-item :label="isMobile ? '' : '启用 MCP'">
          <template v-if="isMobile" #label>
            <span class="mobile-label">启用 MCP</span>
          </template>
          <el-switch
            v-model="mcpForm.enabled"
            :disabled="!isAuthenticated || mcpSaving || mcpLoading"
            active-text="开启"
            inactive-text="关闭"
          />
        </el-form-item>
        <el-form-item :label="isMobile ? '' : 'MCP 地址'">
          <template v-if="isMobile" #label>
            <span class="mobile-label">MCP 地址</span>
          </template>
          <div class="field-stack">
            <el-input :model-value="mcpEndpoint" readonly>
              <template #append>
                <el-button @click="copyText(mcpEndpoint)">复制</el-button>
              </template>
            </el-input>
            <div class="setting-tip">把这个地址填到 AI 客户端的远程 MCP URL 中。</div>
          </div>
        </el-form-item>
        <el-form-item :label="isMobile ? '' : 'Token'" required>
          <template v-if="isMobile" #label>
            <span class="mobile-label">Token <span class="required-mark">*</span></span>
          </template>
          <div class="field-stack">
            <el-input
              v-model="mcpForm.token"
              show-password
              maxlength="256"
              placeholder="点击生成 Token"
              :disabled="!isAuthenticated || mcpSaving || mcpLoading"
            >
              <template #append>
                <el-button
                  :loading="mcpTokenGenerating"
                  :disabled="!isAuthenticated"
                  @click="generateMcpToken"
                >
                  生成
                </el-button>
              </template>
            </el-input>
            <div class="setting-tip">Token 相当于 MCP 专用访问密钥。重新生成后，旧客户端配置会失效。</div>
          </div>
        </el-form-item>
        <el-form-item :label="isMobile ? '' : '允许来源'">
          <template v-if="isMobile" #label>
            <span class="mobile-label">允许来源</span>
          </template>
          <div class="field-stack">
            <el-input
              v-model="mcpForm.allowedOrigins"
              maxlength="1000"
              placeholder="例如：https://example.com，留空即可用于客户端 Agent"
              :disabled="!isAuthenticated || mcpSaving || mcpLoading"
            />
            <div class="setting-tip">客户端 Agent 通常没有 Origin，建议留空；网页端客户端才填写网页域名，多个来源用英文逗号分隔。</div>
          </div>
        </el-form-item>
        <el-form-item :label="isMobile ? '' : '客户端配置'">
          <template v-if="isMobile" #label>
            <span class="mobile-label">客户端配置</span>
          </template>
          <div class="field-stack">
            <el-input :model-value="mcpClientConfig" type="textarea" :rows="8" readonly />
            <div class="setting-tip">保存设置后，将这段配置复制到支持远程 MCP 的 AI 客户端。</div>
          </div>
        </el-form-item>
        <el-form-item class="form-submit-item">
          <el-button
            type="primary"
            :loading="mcpSaving"
            :disabled="!isAuthenticated"
            @click="saveMcpSettings"
            class="submit-button"
          >
            保存 MCP 设置
          </el-button>
          <el-button
            :disabled="!mcpClientConfig"
            @click="copyText(mcpClientConfig)"
            class="copy-config-button"
          >
            复制配置
          </el-button>
        </el-form-item>
      </el-form>
      <el-alert
        v-if="mcpError"
        :title="mcpError"
        type="error"
        :closable="false"
        show-icon
        style="margin-top: 16px;"
      />
      <el-alert
        v-else-if="mcpMessage"
        :title="mcpMessage"
        type="success"
        :closable="false"
        show-icon
        style="margin-top: 16px;"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch, onUnmounted } from 'vue';
import { ElMessage } from 'element-plus';

const DEFAULT_TITLE = '个人书签';
const DEFAULT_ICON = '/LiteMark.png';

const themeOptions = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' }
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

const mcpForm = reactive({
  enabled: false,
  token: '',
  allowedOrigins: ''
});
const mcpLoading = ref(false);
const mcpSaving = ref(false);
const mcpTokenGenerating = ref(false);
const mcpMessage = ref('');
const mcpError = ref('');

const storedToken = typeof window !== 'undefined' ? window.localStorage.getItem('bookmark_token') : null;
const authToken = ref<string | null>(storedToken);
const isAuthenticated = ref(Boolean(storedToken));

const mcpEndpoint = computed(() => {
  if (apiBase) {
    return `${apiBase}/mcp`;
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/mcp`;
  }
  return '/mcp';
});

const mcpClientConfig = computed(() => {
  const endpoint = mcpEndpoint.value;
  return JSON.stringify({
    mcpServers: {
      litemark: {
        url: endpoint,
        headers: {
          Authorization: `Bearer ${mcpForm.token || 'your-mcp-token'}`
        }
      }
    }
  }, null, 2);
});

// 移动端检测
const isMobile = ref(false);
function checkMobile() {
  isMobile.value = window.innerWidth <= 768;
}

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
    } else {
      currentTheme.value = themeOptions[0].value;
      selectedTheme.value = themeOptions[0].value;
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

async function loadMcpSettings() {
  if (!isAuthenticated.value) {
    return;
  }
  mcpLoading.value = true;
  mcpError.value = '';
  try {
    const response = await requestWithAuth(`${apiBase}/api/settings/mcp`, {
      method: 'GET'
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || '加载 MCP 设置失败');
    }
    const config = (await response.json()) as {
      mcp_enabled: boolean;
      mcp_token: string;
      mcp_allowed_origins: string;
    };
    mcpForm.enabled = config.mcp_enabled;
    mcpForm.token = config.mcp_token;
    mcpForm.allowedOrigins = config.mcp_allowed_origins;
  } catch (err) {
    mcpError.value = err instanceof Error ? err.message : '加载 MCP 设置失败';
  } finally {
    mcpLoading.value = false;
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

async function saveMcpSettings() {
  if (!isAuthenticated.value) {
    ElMessage.warning('请先登录');
    return;
  }
  if (mcpForm.enabled && !mcpForm.token.trim()) {
    mcpError.value = '启用 MCP 前请先生成或填写 Token';
    return;
  }
  mcpSaving.value = true;
  mcpMessage.value = '';
  mcpError.value = '';
  try {
    const response = await requestWithAuth(`${apiBase}/api/settings/mcp`, {
      method: 'PUT',
      body: JSON.stringify({
        mcp_enabled: mcpForm.enabled,
        mcp_token: mcpForm.token.trim(),
        mcp_allowed_origins: mcpForm.allowedOrigins.trim()
      })
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || '保存 MCP 设置失败');
    }
    const config = (await response.json()) as {
      mcp_enabled: boolean;
      mcp_token: string;
      mcp_allowed_origins: string;
    };
    mcpForm.enabled = config.mcp_enabled;
    mcpForm.token = config.mcp_token;
    mcpForm.allowedOrigins = config.mcp_allowed_origins;
    mcpMessage.value = 'MCP 设置已保存';
    ElMessage.success('MCP 设置已保存');
  } catch (err) {
    mcpError.value = err instanceof Error ? err.message : '保存 MCP 设置失败';
    ElMessage.error(mcpError.value);
  } finally {
    mcpSaving.value = false;
  }
}

async function generateMcpToken() {
  if (!isAuthenticated.value) {
    ElMessage.warning('请先登录');
    return;
  }
  mcpTokenGenerating.value = true;
  mcpMessage.value = '';
  mcpError.value = '';
  try {
    const response = await requestWithAuth(`${apiBase}/api/settings/mcp/token`, {
      method: 'POST'
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || '生成 Token 失败');
    }
    const config = (await response.json()) as {
      mcp_enabled: boolean;
      mcp_token: string;
      mcp_allowed_origins: string;
    };
    mcpForm.enabled = config.mcp_enabled;
    mcpForm.token = config.mcp_token;
    mcpForm.allowedOrigins = config.mcp_allowed_origins;
    mcpMessage.value = 'Token 已生成';
    ElMessage.success('Token 已生成');
  } catch (err) {
    mcpError.value = err instanceof Error ? err.message : '生成 Token 失败';
    ElMessage.error(mcpError.value);
  } finally {
    mcpTokenGenerating.value = false;
  }
}

async function copyText(text: string) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('已复制');
  } catch {
    ElMessage.error('复制失败');
  }
}

onMounted(() => {
  loadSettings();
  loadMcpSettings();
  checkMobile();
  window.addEventListener('resize', checkMobile);
});

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile);
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

.mcp-help {
  margin-bottom: 20px;
}

.mcp-help p {
  margin: 0;
  line-height: 1.6;
}

.mcp-help p + p {
  margin-top: 6px;
}

.field-stack {
  width: 100%;
}

.setting-tip {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.5;
  color: #6b7280;
}

.mcp-card :deep(.el-textarea__inner) {
  font-family: Consolas, Monaco, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.5;
}

.settings-card h3 {
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
  .settings-page {
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

  .settings-card {
    margin-bottom: 16px;
    border-radius: 8px;
  }

  .settings-card :deep(.el-card__header) {
    padding: 16px;
  }

  .settings-card :deep(.el-card__body) {
    padding: 16px;
  }

  .settings-card h3 {
    font-size: 16px;
  }

  .settings-card :deep(.el-form-item) {
    margin-bottom: 20px;
    display: flex;
    flex-direction: column;
  }

  .settings-card :deep(.el-form-item__label) {
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

  .settings-card :deep(.el-form-item__content) {
    margin-left: 0 !important;
    width: 100% !important;
    flex: 1;
  }

  .settings-card :deep(.el-input),
  .settings-card :deep(.el-select),
  .settings-card :deep(.el-input__wrapper) {
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

  .copy-config-button {
    width: 100%;
    margin-left: 0;
    margin-top: 12px;
  }

  .settings-card :deep(.el-alert) {
    margin-top: 12px;
  }
}
</style>

