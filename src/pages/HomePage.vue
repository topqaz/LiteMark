<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';

type Bookmark = {
  id: string;
  title: string;
  url: string;
  category?: string;
  description?: string;
  createdAt: string;
  updatedAt?: string;
  visible?: boolean;
};

type CategoryOption = {
  key: string;
  label: string;
  count: number;
};

const apiBaseRaw =
  (typeof window !== 'undefined'
    ? (window as { __APP_API_BASE_URL__?: string }).__APP_API_BASE_URL__
    : '') ?? '';
const apiBase = apiBaseRaw.replace(/\/$/, '');
const endpoint = `${apiBase}/api/bookmarks`;

const DEFAULT_TITLE = '个人书签';
const DEFAULT_ICON = '🔖';

const themeOptions = [
  { value: 'light', label: '晨光浅色' },
  { value: 'twilight', label: '暮色渐变' },
  { value: 'dark', label: '夜空深色' },
  { value: 'forest', label: '林间绿意' },
  { value: 'ocean', label: '深海幻境' },
  { value: 'sunrise', label: '朝霞暖橙' }
];

const bookmarks = ref<Bookmark[]>([]);
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const search = ref('');
const editingId = ref<string | null>(null);
const currentCategory = ref<string>('all');

const currentTheme = ref<string>(themeOptions[0].value);
const selectedTheme = ref<string>(themeOptions[0].value);
const themeSaving = ref(false);
const themeMessage = ref('');
const settingsLoaded = ref(false);

const siteTitle = ref<string>(DEFAULT_TITLE);
const siteIcon = ref<string>(DEFAULT_ICON);
const form = reactive({
  title: '',
  url: '',
  category: '',
  description: '',
  visible: true
});

const showLoginModal = ref(false);
const loginState = reactive({
  username: '',
  password: '',
  loading: false,
  error: ''
});

const storedToken = typeof window !== 'undefined' ? window.localStorage.getItem('bookmark_token') : null;
const storedUser =
  typeof window !== 'undefined' ? window.localStorage.getItem('bookmark_username') : null;
const authToken = ref<string | null>(storedToken);
const currentUser = ref<string>(storedUser || '');

const isAuthenticated = computed(() => Boolean(authToken.value));
const showHidden = ref(false);
const showForm = ref(false);

const siteTitleDisplay = computed(() => {
  const value = siteTitle.value.trim();
  return value || DEFAULT_TITLE;
});

const siteIconDisplay = computed(() => {
  const value = siteIcon.value.trim();
  return value || DEFAULT_ICON;
});

const siteIconIsImage = computed(() => /^(https?:|data:|\/)/i.test(siteIconDisplay.value));

watch(authToken, (token) => {
  if (typeof window === 'undefined') return;
  if (token) {
    window.localStorage.setItem('bookmark_token', token);
  } else {
    window.localStorage.removeItem('bookmark_token');
  }
});

watch(currentUser, (name) => {
  if (typeof window === 'undefined') return;
  if (name) {
    window.localStorage.setItem('bookmark_username', name);
  } else {
    window.localStorage.removeItem('bookmark_username');
  }
});

watch(isAuthenticated, (authed) => {
  if (!authed) {
    showHidden.value = false;
    showForm.value = false;
  }
});

function applyTheme(theme: string) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
}

let defaultFaviconHref: string | null = null;

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveFaviconHref(icon: string): string | null {
  const value = icon.trim();
  if (!value) {
    return null;
  }
  if (/^(https?:|data:|\/)/i.test(value)) {
    return value;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><text x="50%" y="58%" dominant-baseline="middle" text-anchor="middle" font-size="48">${escapeXml(value)}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
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

function handleSiteSettingsInput() {
  return;
}

watch(currentTheme, (value) => {
  applyTheme(value);
});

function normalizeCategory(bookmark: Bookmark) {
  return bookmark.category?.trim() || '默认分类';
}

const keywordFiltered = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  if (!keyword) {
    return bookmarks.value;
  }
  return bookmarks.value.filter((item) => {
    const haystack = [
      item.title,
      item.url,
      item.category ?? '',
      item.description ?? ''
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(keyword);
  });
});

const visibilityFiltered = computed(() => {
  const shouldShowHidden = isAuthenticated.value && showHidden.value;
  if (shouldShowHidden) {
    return keywordFiltered.value;
  }
  return keywordFiltered.value.filter((item) => item.visible !== false);
});

const categories = computed<CategoryOption[]>(() => {
  const map = new Map<string, number>();
  visibilityFiltered.value.forEach((bookmark) => {
    const key = normalizeCategory(bookmark);
    map.set(key, (map.get(key) ?? 0) + 1);
  });

  const options: CategoryOption[] = [
    {
      key: 'all',
      label: '全部',
      count: visibilityFiltered.value.length
    }
  ];

  Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'zh-Hans-CN'))
    .forEach(([label, count]) => {
      options.push({
        key: label,
        label,
        count
      });
    });

  return options;
});

const groupedBookmarks = computed(() => {
  const groups = new Map<string, Bookmark[]>();
  visibilityFiltered.value.forEach((bookmark) => {
    const groupKey = normalizeCategory(bookmark);
    const group = groups.get(groupKey);
    if (group) {
      group.push(bookmark);
    } else {
      groups.set(groupKey, [bookmark]);
    }
  });

  return Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'zh-Hans-CN'))
    .map(([name, list]) => ({
      name,
      count: list.length,
      bookmarks: list
    }));
});

const categoryFiltered = computed(() => {
  if (currentCategory.value === 'all') {
    return visibilityFiltered.value;
  }
  return visibilityFiltered.value.filter(
    (bookmark) => normalizeCategory(bookmark) === currentCategory.value
  );
});

watch(bookmarks, () => {
  if (currentCategory.value === 'all') {
    return;
  }
  const hasCategory = visibilityFiltered.value.some(
    (bookmark) => normalizeCategory(bookmark) === currentCategory.value
  );
  if (!hasCategory) {
    currentCategory.value = 'all';
  }
});

async function loadBookmarks() {
  loading.value = true;
  error.value = null;
  try {
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`加载失败：${response.status}`);
    }
    const data = (await response.json()) as Bookmark[];
    bookmarks.value = data;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '未知错误';
  } finally {
    loading.value = false;
  }
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
    applySiteMeta(siteTitle.value, siteIcon.value);
    settingsLoaded.value = true;
    themeMessage.value = '';
  } catch (err) {
    themeMessage.value = err instanceof Error ? err.message : '加载主题配置失败';
  }
}

function resetForm() {
  form.title = '';
  form.url = '';
  form.category = '';
  form.description = '';
  form.visible = true;
  editingId.value = null;
}

function ensureAuthenticated() {
  if (!isAuthenticated.value) {
    showLoginModal.value = true;
    throw new Error('请先登录');
  }
}

function handleUnauthorized() {
  authToken.value = null;
  currentUser.value = '';
  showLoginModal.value = true;
  throw new Error('登录状态已失效，请重新登录');
}

async function requestWithAuth(input: RequestInfo | URL, init: RequestInit = {}) {
  ensureAuthenticated();
  const headers = new Headers(init.headers ?? {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (authToken.value) {
    headers.set('Authorization', `Bearer ${authToken.value}`);
  }
  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) {
    handleUnauthorized();
  }
  return response;
}

async function saveBookmark() {
  if (!form.title.trim() || !form.url.trim()) {
    error.value = '标题和链接不能为空';
    return;
  }

  saving.value = true;
  error.value = null;
  const payload = {
    title: form.title.trim(),
    url: form.url.trim(),
    category: form.category.trim() || undefined,
    description: form.description.trim() || undefined,
    visible: form.visible
  };

  try {
    const method = editingId.value ? 'PUT' : 'POST';
    const target = editingId.value ? `${endpoint}/${editingId.value}` : endpoint;
    const response = await requestWithAuth(target, {
      method,
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || '保存失败');
    }
    await loadBookmarks();
    resetForm();
  } catch (err) {
    if (err instanceof Error) {
      error.value = err.message;
    } else {
      error.value = '保存失败';
    }
  } finally {
    saving.value = false;
  }
}

function startEdit(bookmark: Bookmark) {
  if (!isAuthenticated.value) {
    showLoginModal.value = true;
    return;
  }
  showForm.value = true;
  editingId.value = bookmark.id;
  form.title = bookmark.title;
  form.url = bookmark.url;
  form.category = bookmark.category ?? '';
  form.description = bookmark.description ?? '';
  form.visible = bookmark.visible !== false;
}

async function removeBookmark(id: string) {
  if (!confirm('确定要删除该书签吗？')) {
    return;
  }
  error.value = null;
  try {
    const response = await requestWithAuth(`${endpoint}/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || '删除失败');
    }
    await loadBookmarks();
  } catch (err) {
    if (err instanceof Error) {
      error.value = err.message;
    } else {
      error.value = '删除失败';
    }
  }
}

async function handleThemeChange() {
  const value = selectedTheme.value;
  if (!isAuthenticated.value) {
    selectedTheme.value = currentTheme.value;
    showLoginModal.value = true;
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
  } catch (err) {
    themeMessage.value = err instanceof Error ? err.message : '保存主题失败';
    selectedTheme.value = previous;
  } finally {
    themeSaving.value = false;
  }
}

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
    authToken.value = result.token;
    currentUser.value = result.username;
    showLoginModal.value = false;
    loginState.username = '';
    loginState.password = '';
    await Promise.all([loadBookmarks(), loadSettings()]);
    showHidden.value = false;
    showForm.value = false;
  } catch (err) {
    loginState.error = err instanceof Error ? err.message : '登录失败';
  } finally {
    loginState.loading = false;
  }
}

function logout() {
  authToken.value = null;
  currentUser.value = '';
  resetForm();
  showHidden.value = false;
  showForm.value = false;
}

function openLogin() {
  loginState.error = '';
  showLoginModal.value = true;
}

function closeLogin() {
  if (loginState.loading) return;
  showLoginModal.value = false;
}

onMounted(() => {
  Promise.all([loadBookmarks(), loadSettings()]).catch(() => {
    // 错误已在函数内处理
  });
});

async function toggleVisibility(bookmark: Bookmark) {
  if (!isAuthenticated.value) {
    showLoginModal.value = true;
    return;
  }
  error.value = null;
  try {
    const response = await requestWithAuth(`${endpoint}/${bookmark.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: bookmark.title,
        url: bookmark.url,
        category: bookmark.category,
        description: bookmark.description,
        visible: bookmark.visible === false
      })
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || '更新显示状态失败');
    }
    await loadBookmarks();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '更新显示状态失败';
  }
}

function toggleForm() {
  if (!isAuthenticated.value) {
    showLoginModal.value = true;
    return;
  }
  if (showForm.value) {
    resetForm();
  }
  showForm.value = !showForm.value;
}

function openBookmark(bookmark: Bookmark) {
  if (!bookmark.url) {
    return;
  }
  if (typeof window !== 'undefined') {
    window.open(bookmark.url, '_blank', 'noopener');
  }
}
</script>

<template>
  <div class="layout">
    <header class="topbar">
      <div class="brand">
        <span v-if="!siteIconIsImage" class="brand__icon">{{ siteIconDisplay }}</span>
        <span v-else class="brand__icon brand__icon--image">
          <img :src="siteIconDisplay" alt="站点图标" />
        </span>
        <h1>{{ siteTitleDisplay }}</h1>
      </div>
      <div class="topbar__actions">
        <div class="theme-switcher">
          <label>
            <span>主题</span>
            <select
              v-model="selectedTheme"
              @change="handleThemeChange"
              :disabled="themeSaving || !isAuthenticated"
            >
              <option v-for="option in themeOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
          <span v-if="themeSaving" class="theme-switcher__status">保存中...</span>
          <span v-else-if="!isAuthenticated" class="theme-switcher__status">登录后可切换</span>
        </div>
        <button
          v-if="isAuthenticated"
          class="button button--primary add-button"
          type="button"
          @click="toggleForm"
        >
          {{ showForm ? '收起表单' : '添加书签' }}
        </button>
        <label v-if="isAuthenticated" class="hidden-toggle">
          <input type="checkbox" v-model="showHidden" />
          显示隐藏书签
        </label>
        <button v-if="!isAuthenticated" class="button button--ghost" @click="openLogin">
          登录
        </button>
        <div v-else class="profile">
          <span class="profile__name">{{ currentUser }}</span>
          <button class="button button--ghost" @click="logout">退出</button>
        </div>
      </div>
    </header>

    <main class="main">
      <section class="search-card">
        <div class="search-input">
          <span class="search-input__icon">🔍</span>
          <input
            v-model="search"
            type="search"
            placeholder="搜索书签..."
            @keydown.enter.prevent="loadBookmarks"
          />
          <button class="button button--ghost" @click="loadBookmarks" :disabled="loading">
            {{ loading ? '加载中...' : '刷新' }}
          </button>
        </div>
      </section>

      <nav class="category-tabs">
        <button
          v-for="item in categories"
          :key="item.key"
          class="tab"
          :class="{ 'tab--active': currentCategory === item.key }"
          @click="currentCategory = item.key"
        >
          <span>{{ item.label }}</span>
          <span class="tab__badge">{{ item.count }}</span>
        </button>
      </nav>

      <p v-if="themeMessage" class="alert alert--error">{{ themeMessage }}</p>
      <section v-if="isAuthenticated && showForm" class="form-card">
        <header class="form-card__header">
          <h2>{{ editingId ? '编辑书签' : '新增书签' }}</h2>
          <span>登录后即可管理你的私有书签</span>
        </header>
        <form @submit.prevent="saveBookmark">
          <div class="form-grid">
            <label class="field">
              <span>标题 *</span>
              <input v-model="form.title" type="text" placeholder="例如：Vue.js 官方文档" required />
            </label>
            <label class="field">
              <span>链接 *</span>
              <input v-model="form.url" type="url" placeholder="https://example.com" required />
            </label>
            <label class="field">
              <span>分类</span>
              <input v-model="form.category" type="text" placeholder="例如：开发工具" />
            </label>
            <label class="field field--description">
              <span>描述</span>
              <textarea
                v-model="form.description"
                placeholder="可填写简介、备注等信息"
                rows="3"
              ></textarea>
            </label>
            <div class="field field--checkbox">
              <span>是否展示</span>
              <div class="checkbox-row">
                <input id="visible-toggle" v-model="form.visible" type="checkbox" />
                <label for="visible-toggle">{{ form.visible ? '显示' : '隐藏' }}</label>
              </div>
            </div>
          </div>
          <div class="form-actions">
            <button class="button button--primary" type="submit" :disabled="saving">
              {{ saving ? '保存中...' : editingId ? '保存修改' : '添加书签' }}
            </button>
            <button
              v-if="editingId"
              class="button button--ghost"
              type="button"
              @click="resetForm"
              :disabled="saving"
            >
              取消编辑
            </button>
          </div>
        </form>
      </section>

      <p v-if="error" class="alert alert--error">{{ error }}</p>
      <p v-if="!visibilityFiltered.length && !loading" class="empty">暂无书签，先添加一个吧！</p>

      <template v-if="currentCategory === 'all'">
        <section
          v-for="group in groupedBookmarks"
          :key="group.name"
          class="category-group"
        >
          <header class="category-group__header">
            <div class="category-title">
              <span class="category-title__icon">📚</span>
              <span class="category-title__text">{{ group.name }}</span>
            </div>
            <span class="category-badge">{{ group.count }}</span>
          </header>
          <div class="card-grid">
            <article
              v-for="bookmark in group.bookmarks"
              :key="bookmark.id"
              :class="['card', { 'card--hidden': bookmark.visible === false }]"
              @click="openBookmark(bookmark)"
            >
              <header class="card__header">
                <h3 class="card__title">
                  <a :href="bookmark.url" target="_blank" rel="noreferrer">{{ bookmark.title }}</a>
                </h3>
                <span v-if="bookmark.visible === false" class="hidden-chip">已隐藏</span>
              </header>
              <p v-if="bookmark.description" class="card__description">{{ bookmark.description }}</p>
              <p class="card__url">{{ bookmark.url }}</p>
              <footer class="card__footer">
                <span class="card__time">
                  更新于 {{ new Date(bookmark.updatedAt ?? bookmark.createdAt).toLocaleString() }}
                </span>
                <div v-if="isAuthenticated" class="card__buttons">
                  <button class="button button--ghost" @click.stop="startEdit(bookmark)">编辑</button>
                  <button class="button button--ghost-alt" @click.stop="toggleVisibility(bookmark)">
                    {{ bookmark.visible === false ? '设为可见' : '隐藏' }}
                  </button>
                  <button class="button button--danger" @click.stop="removeBookmark(bookmark.id)">
                    删除
                  </button>
                </div>
              </footer>
            </article>
          </div>
        </section>
      </template>

      <section v-else class="category-group">
        <header class="category-group__header">
          <div class="category-title">
            <span class="category-title__icon">📚</span>
            <span class="category-title__text">{{ currentCategory }}</span>
          </div>
          <span class="category-badge">{{ categoryFiltered.length }}</span>
        </header>
        <div class="card-grid">
          <article
            v-for="bookmark in categoryFiltered"
            :key="bookmark.id"
            :class="['card', { 'card--hidden': bookmark.visible === false }]"
            @click="openBookmark(bookmark)"
          >
            <header class="card__header">
              <h3 class="card__title">
                <a :href="bookmark.url" target="_blank" rel="noreferrer">{{ bookmark.title }}</a>
              </h3>
              <span v-if="bookmark.visible === false" class="hidden-chip">已隐藏</span>
            </header>
            <p v-if="bookmark.description" class="card__description">{{ bookmark.description }}</p>
            <p class="card__url">{{ bookmark.url }}</p>
            <footer class="card__footer">
              <span class="card__time">
                更新于 {{ new Date(bookmark.updatedAt ?? bookmark.createdAt).toLocaleString() }}
              </span>
              <div v-if="isAuthenticated" class="card__buttons">
                <button class="button button--ghost" @click.stop="startEdit(bookmark)">编辑</button>
                <button class="button button--ghost-alt" @click.stop="toggleVisibility(bookmark)">
                  {{ bookmark.visible === false ? '设为可见' : '隐藏' }}
                </button>
                <button class="button button--danger" @click.stop="removeBookmark(bookmark.id)">
                  删除
                </button>
              </div>
            </footer>
          </article>
        </div>
      </section>
    </main>

    <div v-if="showLoginModal" class="overlay" @click.self="closeLogin">
      <section class="dialog">
        <header class="dialog__header">
          <h2>登录</h2>
          <button class="dialog__close" @click="closeLogin">✕</button>
        </header>
        <form class="dialog__form" @submit.prevent="login">
          <label class="field">
            <span>用户名</span>
            <input v-model="loginState.username" type="text" placeholder="请输入用户名" required />
          </label>
          <label class="field">
            <span>密码</span>
            <input v-model="loginState.password" type="password" placeholder="请输入密码" required />
          </label>
          <p v-if="loginState.error" class="alert alert--error">{{ loginState.error }}</p>
          <button class="button button--primary" type="submit" :disabled="loginState.loading">
            {{ loginState.loading ? '登录中...' : '登录' }}
          </button>
        </form>
        <footer class="dialog__footer">
          <p>默认账号：admin / admin123，可在后端环境变量中修改。</p>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
:global(:root) {
  --bg-gradient-start: #f5f7ff;
  --bg-gradient-end: #f0f4ff;
  --text-primary: #1f2933;
  --text-secondary: #4b5563;
  --text-muted: #6b7280;
  --surface-glass: rgba(255, 255, 255, 0.9);
  --surface-strong: rgba(255, 255, 255, 0.95);
  --surface-soft: rgba(255, 255, 255, 0.85);
  --surface-card: rgba(248, 250, 255, 0.9);
  --surface-border: rgba(99, 102, 241, 0.08);
  --surface-shadow: rgba(99, 102, 241, 0.12);
  --shadow-strong: rgba(79, 70, 229, 0.18);
  --search-bg: #f2f5ff;
  --accent-start: #6366f1;
  --accent-end: #8b5cf6;
  --accent-text: #4f46e5;
  --accent-shadow: rgba(99, 102, 241, 0.32);
  --ghost-bg: rgba(255, 255, 255, 0.8);
  --ghost-border: rgba(99, 102, 241, 0.18);
  --ghost-text: #4f46e5;
  --danger-bg: rgba(248, 113, 113, 0.18);
  --danger-border: rgba(220, 38, 38, 0.24);
  --danger-text: #dc2626;
  --tag-bg: rgba(99, 102, 241, 0.18);
  --tag-text: #4338ca;
  --badge-bg: rgba(99, 102, 241, 0.14);
  --badge-text: #4338ca;
  --tab-bg: rgba(255, 255, 255, 0.72);
  --tab-text: #4c51bf;
  --tab-active-bg-start: #4f46e5;
  --tab-active-bg-end: #6366f1;
  --tab-active-text: #ffffff;
  --tab-badge-bg: rgba(255, 255, 255, 0.25);
  --alert-error-bg: rgba(254, 226, 226, 0.92);
  --alert-error-text: #b91c1c;
  --overlay-bg: rgba(15, 23, 42, 0.4);
  --dialog-bg: #ffffff;
  --input-bg: #f8f9ff;
  --input-border: transparent;
  --input-border-focus: rgba(99, 102, 241, 0.32);
  --input-shadow-focus: rgba(99, 102, 241, 0.18);
}

:global(:root[data-theme='twilight']) {
  --bg-gradient-start: #fdf2f8;
  --bg-gradient-end: #ede9fe;
  --text-primary: #311b92;
  --text-secondary: #4a3a7a;
  --text-muted: #6d5b8f;
  --surface-glass: rgba(255, 255, 255, 0.88);
  --surface-strong: rgba(255, 255, 255, 0.92);
  --surface-soft: rgba(255, 255, 255, 0.86);
  --surface-card: rgba(255, 255, 255, 0.9);
  --surface-border: rgba(236, 72, 153, 0.18);
  --surface-shadow: rgba(244, 114, 182, 0.24);
  --shadow-strong: rgba(236, 72, 153, 0.28);
  --search-bg: rgba(250, 245, 255, 0.86);
  --accent-start: #ec4899;
  --accent-end: #6366f1;
  --accent-text: #7c3aed;
  --accent-shadow: rgba(236, 72, 153, 0.36);
  --ghost-bg: rgba(255, 255, 255, 0.82);
  --ghost-border: rgba(236, 72, 153, 0.28);
  --ghost-text: #7c3aed;
  --danger-bg: rgba(248, 113, 113, 0.2);
  --danger-border: rgba(220, 38, 38, 0.3);
  --danger-text: #b91c1c;
  --tag-bg: rgba(236, 72, 153, 0.2);
  --tag-text: #a21caf;
  --badge-bg: rgba(236, 72, 153, 0.18);
  --badge-text: #a21caf;
  --tab-bg: rgba(255, 255, 255, 0.72);
  --tab-text: #7c3aed;
  --tab-active-bg-start: #ec4899;
  --tab-active-bg-end: #6366f1;
  --tab-active-text: #ffffff;
  --tab-badge-bg: rgba(255, 255, 255, 0.32);
  --alert-error-bg: rgba(254, 226, 226, 0.92);
  --alert-error-text: #b91c1c;
  --overlay-bg: rgba(76, 29, 149, 0.55);
  --dialog-bg: rgba(255, 255, 255, 0.96);
  --input-bg: rgba(250, 245, 255, 0.92);
  --input-border: transparent;
  --input-border-focus: rgba(236, 72, 153, 0.35);
  --input-shadow-focus: rgba(236, 72, 153, 0.2);
}

:global(:root[data-theme='dark']) {
  --bg-gradient-start: #0f172a;
  --bg-gradient-end: #1f2937;
  --text-primary: #f8fafc;
  --text-secondary: #e2e8f0;
  --text-muted: #94a3b8;
  --surface-glass: rgba(15, 23, 42, 0.72);
  --surface-strong: rgba(30, 41, 59, 0.88);
  --surface-soft: rgba(30, 41, 59, 0.78);
  --surface-card: rgba(30, 41, 59, 0.85);
  --surface-border: rgba(148, 163, 184, 0.16);
  --surface-shadow: rgba(14, 116, 144, 0.28);
  --shadow-strong: rgba(37, 99, 235, 0.28);
  --search-bg: rgba(30, 41, 59, 0.72);
  --accent-start: #2563eb;
  --accent-end: #7c3aed;
  --accent-text: #a855f7;
  --accent-shadow: rgba(37, 99, 235, 0.45);
  --ghost-bg: rgba(30, 41, 59, 0.72);
  --ghost-border: rgba(148, 163, 184, 0.35);
  --ghost-text: #cbd5f5;
  --danger-bg: rgba(248, 113, 113, 0.22);
  --danger-border: rgba(252, 165, 165, 0.3);
  --danger-text: #fca5a5;
  --tag-bg: rgba(99, 102, 241, 0.28);
  --tag-text: #c7d2fe;
  --badge-bg: rgba(37, 99, 235, 0.24);
  --badge-text: #bfdbfe;
  --tab-bg: rgba(30, 41, 59, 0.8);
  --tab-text: #c7d2fe;
  --tab-active-bg-start: #2563eb;
  --tab-active-bg-end: #7c3aed;
  --tab-active-text: #f8fafc;
  --tab-badge-bg: rgba(15, 23, 42, 0.32);
  --alert-error-bg: rgba(127, 29, 29, 0.65);
  --alert-error-text: #fecaca;
  --overlay-bg: rgba(2, 6, 23, 0.6);
  --dialog-bg: rgba(15, 23, 42, 0.95);
  --input-bg: rgba(30, 41, 59, 0.82);
  --input-border: rgba(148, 163, 184, 0.2);
  --input-border-focus: rgba(129, 140, 248, 0.5);
  --input-shadow-focus: rgba(99, 102, 241, 0.2);
}

:global(:root[data-theme='forest']) {
  --bg-gradient-start: #ecfdf5;
  --bg-gradient-end: #d1fae5;
  --text-primary: #14532d;
  --text-secondary: #166534;
  --text-muted: #4d7c55;
  --surface-glass: rgba(255, 255, 255, 0.9);
  --surface-strong: rgba(236, 253, 245, 0.95);
  --surface-soft: rgba(236, 253, 245, 0.85);
  --surface-card: rgba(209, 250, 229, 0.85);
  --surface-border: rgba(34, 197, 94, 0.12);
  --surface-shadow: rgba(22, 163, 74, 0.18);
  --shadow-strong: rgba(16, 185, 129, 0.22);
  --search-bg: rgba(187, 247, 208, 0.72);
  --accent-start: #16a34a;
  --accent-end: #10b981;
  --accent-text: #0d9488;
  --accent-shadow: rgba(5, 150, 105, 0.26);
  --ghost-bg: rgba(255, 255, 255, 0.8);
  --ghost-border: rgba(16, 185, 129, 0.2);
  --ghost-text: #047857;
  --danger-bg: rgba(248, 113, 113, 0.18);
  --danger-border: rgba(220, 38, 38, 0.24);
  --danger-text: #dc2626;
  --tag-bg: rgba(16, 185, 129, 0.16);
  --tag-text: #0f766e;
  --badge-bg: rgba(22, 163, 74, 0.16);
  --badge-text: #0f5132;
  --tab-bg: rgba(236, 253, 245, 0.8);
  --tab-text: #047857;
  --tab-active-bg-start: #16a34a;
  --tab-active-bg-end: #0d9488;
  --tab-active-text: #ffffff;
  --tab-badge-bg: rgba(255, 255, 255, 0.36);
  --alert-error-bg: rgba(254, 226, 226, 0.92);
  --alert-error-text: #b91c1c;
  --overlay-bg: rgba(15, 118, 110, 0.45);
  --dialog-bg: rgba(255, 255, 255, 0.96);
  --input-bg: rgba(236, 253, 245, 0.92);
  --input-border: transparent;
  --input-border-focus: rgba(16, 185, 129, 0.32);
  --input-shadow-focus: rgba(16, 185, 129, 0.18);
}

:global(:root[data-theme='ocean']) {
  --bg-gradient-start: #e0f2fe;
  --bg-gradient-end: #c7d2fe;
  --text-primary: #0f172a;
  --text-secondary: #1d4ed8;
  --text-muted: #3b82f6;
  --surface-glass: rgba(240, 249, 255, 0.92);
  --surface-strong: rgba(224, 242, 254, 0.95);
  --surface-soft: rgba(224, 231, 255, 0.88);
  --surface-card: rgba(219, 234, 254, 0.9);
  --surface-border: rgba(14, 165, 233, 0.16);
  --surface-shadow: rgba(37, 99, 235, 0.24);
  --shadow-strong: rgba(59, 130, 246, 0.28);
  --search-bg: rgba(191, 219, 254, 0.72);
  --accent-start: #0ea5e9;
  --accent-end: #6366f1;
  --accent-text: #1e3a8a;
  --accent-shadow: rgba(14, 165, 233, 0.32);
  --ghost-bg: rgba(255, 255, 255, 0.85);
  --ghost-border: rgba(59, 130, 246, 0.18);
  --ghost-text: #1e3a8a;
  --danger-bg: rgba(248, 113, 113, 0.2);
  --danger-border: rgba(220, 38, 38, 0.3);
  --danger-text: #b91c1c;
  --tag-bg: rgba(14, 165, 233, 0.2);
  --tag-text: #2563eb;
  --badge-bg: rgba(59, 130, 246, 0.2);
  --badge-text: #1e40af;
  --tab-bg: rgba(224, 242, 254, 0.85);
  --tab-text: #1e3a8a;
  --tab-active-bg-start: #0ea5e9;
  --tab-active-bg_end: #6366f1;
  --tab-active-text: #ffffff;
  --tab-badge-bg: rgba(255, 255, 255, 0.35);
  --alert-error-bg: rgba(254, 226, 226, 0.92);
  --alert-error-text: #b91c1c;
  --overlay-bg: rgba(12, 74, 110, 0.45);
  --dialog-bg: rgba(255, 255, 255, 0.96);
  --input-bg: rgba(224, 242, 254, 0.92);
  --input-border: transparent;
  --input-border-focus: rgba(14, 165, 233, 0.32);
  --input-shadow-focus: rgba(59, 130, 246, 0.2);
}

:global(:root[data-theme='sunrise']) {
  --bg-gradient-start: #fff7ed;
  --bg-gradient-end: #ffe4e6;
  --text-primary: #7c2d12;
  --text-secondary: #9d174d;
  --text-muted: #be123c;
  --surface-glass: rgba(255, 247, 237, 0.92);
  --surface-strong: rgba(255, 237, 213, 0.95);
  --surface-soft: rgba(255, 247, 237, 0.88);
  --surface-card: rgba(255, 228, 230, 0.9);
  --surface-border: rgba(244, 114, 182, 0.16);
  --surface-shadow: rgba(251, 146, 60, 0.24);
  --shadow-strong: rgba(236, 72, 153, 0.28);
  --search-bg: rgba(254, 215, 170, 0.72);
  --accent-start: #fb923c;
  --accent-end: #ec4899;
  --accent-text: #c2410c;
  --accent-shadow: rgba(244, 114, 182, 0.34);
  --ghost-bg: rgba(255, 255, 255, 0.85);
  --ghost-border: rgba(251, 146, 60, 0.22);
  --ghost-text: #b91c1c;
  --danger-bg: rgba(248, 113, 113, 0.22);
  --danger-border: rgba(220, 38, 38, 0.3);
  --danger-text: #b91c1c;
  --tag-bg: rgba(251, 146, 60, 0.2);
  --tag-text: #c2410c;
  --badge-bg: rgba(236, 72, 153, 0.2);
  --badge-text: #9d174d;
  --tab-bg: rgba(255, 255, 255, 0.85);
  --tab-text: #be123c;
  --tab-active-bg-start: #fb923c;
  --tab-active-bg-end: #ec4899;
  --tab-active-text: #ffffff;
  --tab-badge-bg: rgba(255, 255, 255, 0.4);
  --alert-error-bg: rgba(254, 226, 226, 0.92);
  --alert-error-text: #b91c1c;
  --overlay-bg: rgba(136, 19, 55, 0.48);
  --dialog-bg: rgba(255, 255, 255, 0.96);
  --input-bg: rgba(255, 247, 237, 0.92);
  --input-border: transparent;
  --input-border-focus: rgba(251, 146, 60, 0.32);
  --input-shadow-focus: rgba(236, 72, 153, 0.2);
}

.layout {
  min-height: 100vh;
  background: linear-gradient(180deg, var(--bg-gradient-start) 0%, var(--bg-gradient-end) 100%);
  display: flex;
  flex-direction: column;
  color: var(--text-primary);
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 40px;
  background: var(--surface-glass);
  backdrop-filter: blur(12px);
  box-shadow: 0 6px 30px var(--surface-shadow);
  position: sticky;
  top: 0;
  z-index: 10;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand__icon {
  font-size: 26px;
}

.brand__icon--image img {
  width: 28px;
  height: 28px;
  object-fit: cover;
  border-radius: 6px;
  display: block;
}

.brand h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}

.topbar__actions {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.theme-switcher {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--text-muted);
}

.theme-switcher label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--text-secondary);
}

.theme-switcher select {
  border: 1px solid var(--ghost-border);
  border-radius: 999px;
  padding: 6px 14px;
  background: var(--ghost-bg);
  color: var(--text-primary);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: border 0.2s ease, box-shadow 0.2s ease;
}

.theme-switcher select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.theme-switcher select:focus {
  outline: none;
  border-color: var(--accent-start);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.18);
}

.theme-switcher__status {
  font-size: 12px;
}

.add-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
}

.hidden-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-muted);
  font-weight: 600;
}

.hidden-toggle input {
  width: 16px;
  height: 16px;
}

.profile {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 15px;
  color: var(--text-secondary);
}

.profile__name {
  font-weight: 600;
}

.main {
  width: min(1200px, 100%);
  margin: 32px auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 0 24px 56px;
  box-sizing: border-box;
}

.search-card {
  background: var(--surface-glass);
  border-radius: 24px;
  padding: 28px;
  box-shadow: 0 20px 40px var(--surface-shadow);
}

.search-input {
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--search-bg);
  border-radius: 999px;
  padding: 12px 20px;
}

.search-input__icon {
  font-size: 20px;
  opacity: 0.72;
}

.search-input input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 16px;
  outline: none;
  color: inherit;
}

.category-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 18px;
  border-radius: 999px;
  border: none;
  background: var(--tab-bg);
  color: var(--tab-text);
  font-weight: 600;
  transition: all 0.2s ease;
  cursor: pointer;
  box-shadow: 0 8px 20px var(--surface-shadow);
}

.tab--active {
  background: linear-gradient(135deg, var(--tab-active-bg-start), var(--tab-active-bg-end));
  color: var(--tab-active-text);
  box-shadow: 0 10px 26px var(--accent-shadow);
}

.tab__badge {
  font-size: 13px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--tab-badge-bg);
}

.form-card {
  background: var(--surface-strong);
  border-radius: 24px;
  padding: 28px;
  box-shadow: 0 20px 50px var(--surface-shadow);
}

.form-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.form-card__header h2 {
  margin: 0;
  font-size: 20px;
}

.form-card__header span {
  color: var(--text-muted);
  font-size: 14px;
}

.form-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 14px;
}

.field span {
  font-weight: 600;
  color: var(--text-secondary);
}

.field input,
.field textarea {
  border: 1px solid var(--input-border);
  border-radius: 14px;
  padding: 12px 16px;
  font-size: 15px;
  background: var(--input-bg);
  transition: all 0.2s ease;
  resize: none;
  font-family: inherit;
  color: var(--text-primary);
}

.field input:focus,
.field textarea:focus {
  outline: none;
  border-color: var(--input-border-focus);
  box-shadow: 0 0 0 4px var(--input-shadow-focus);
}

.field--description {
  grid-column: 1 / -1;
}

.field--checkbox {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  grid-column: 1 / -1;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--text-secondary);
}

.checkbox-row input {
  width: 18px;
  height: 18px;
}

.checkbox-row label {
  cursor: pointer;
}

.form-actions {
  margin-top: 20px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.button {
  border: none;
  border-radius: 12px;
  padding: 10px 18px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  color: var(--text-primary);
}

.button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.button:not(:disabled):hover {
  transform: translateY(-1px);
}

.button--primary {
  background: linear-gradient(135deg, var(--accent-start), var(--accent-end));
  color: #fff;
  box-shadow: 0 12px 30px var(--accent-shadow);
}

.button--ghost {
  background: var(--ghost-bg);
  color: var(--ghost-text);
  border: 1px solid var(--ghost-border);
  box-shadow: 0 6px 18px var(--surface-shadow);
}

.button--ghost-alt {
  background: rgba(255, 255, 255, 0.4);
  color: var(--accent-text);
  border: 1px solid rgba(99, 102, 241, 0.18);
}

.button--danger {
  background: var(--danger-bg);
  color: var(--danger-text);
  border: 1px solid var(--danger-border);
}

.alert {
  padding: 12px 18px;
  border-radius: 16px;
}

.alert--error {
  background: var(--alert-error-bg);
  color: var(--alert-error-text);
}

.alert--success {
  background: rgba(220, 252, 231, 0.92);
  color: #15803d;
}

.empty {
  text-align: center;
  color: var(--text-muted);
  background: var(--surface-soft);
  border-radius: 20px;
  padding: 40px 0;
  font-size: 17px;
}

.category-group {
  background: var(--surface-glass);
  border-radius: 24px;
  padding: 24px 24px 30px;
  box-shadow: 0 16px 36px var(--surface-shadow);
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.category-group__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.category-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 700;
  color: var(--accent-text);
}

.category-title__icon {
  font-size: 22px;
}

.category-badge {
  background: var(--badge-bg);
  color: var(--badge-text);
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
}

.card-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
}

.card {
  background: var(--surface-card);
  border-radius: 20px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: inset 0 0 0 1px var(--surface-border);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  cursor: pointer;
  position: relative;
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 30px var(--shadow-strong);
}

.card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.card__title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
}

.card__title a {
  color: inherit;
  text-decoration: none;
}

.card__description {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.6;
  min-height: 42px;
}

.card__url {
  margin: 0;
  font-size: 13px;
  color: var(--accent-text);
  word-break: break-all;
}

.card__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--text-muted);
}

.card__buttons {
  display: flex;
  gap: 8px;
}

.card__buttons .button {
  padding: 6px 12px;
  font-size: 13px;
}

.card--hidden {
  opacity: 0.65;
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.25);
}

.card__time {
  white-space: nowrap;
}

.hidden-chip {
  background: rgba(148, 163, 184, 0.25);
  color: var(--text-muted);
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
}

.overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-bg);
  display: grid;
  place-items: center;
  z-index: 100;
  padding: 16px;
}

.dialog {
  background: var(--dialog-bg);
  border-radius: 20px;
  width: min(400px, 100%);
  padding: 24px;
  box-shadow: 0 20px 60px var(--surface-shadow);
  display: flex;
  flex-direction: column;
  gap: 18px;
  color: var(--text-primary);
}

.dialog__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dialog__header h2 {
  margin: 0;
}

.dialog__close {
  border: none;
  background: transparent;
  font-size: 20px;
  cursor: pointer;
  color: var(--text-muted);
}

.dialog__form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dialog__footer {
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
}

@media (max-width: 768px) {
  .topbar {
    padding: 16px 20px;
  }

  .topbar__actions {
    width: 100%;
    justify-content: flex-start;
    gap: 12px;
  }

  .theme-switcher {
    width: 100%;
    justify-content: space-between;
  }

  .category-tabs {
    overflow-x: auto;
    gap: 10px;
    padding-bottom: 6px;
  }

  .category-tabs::-webkit-scrollbar {
    display: none;
  }

  .tab {
    flex: 0 0 auto;
  }

  .main {
    padding: 0 16px 48px;
  }

  .search-card,
  .form-card,
  .category-group {
    padding: 20px;
    border-radius: 20px;
  }

  .search-input {
    flex-wrap: wrap;
    gap: 12px;
  }

  .search-input button {
    width: 100%;
  }

  .card-grid {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  }
}

@media (max-width: 540px) {
  .topbar {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }

  .brand {
    width: 100%;
    justify-content: space-between;
  }

  .topbar__actions {
    flex-direction: column;
    align-items: stretch;
  }

  .theme-switcher {
    align-items: stretch;
  }

  .theme-switcher label {
    width: 100%;
    justify-content: space-between;
  }

  .hidden-toggle {
    justify-content: space-between;
  }

  .profile {
    width: 100%;
    justify-content: space-between;
  }

  .search-input {
    flex-direction: column;
    align-items: stretch;
  }

  .search-input input {
    width: 100%;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .form-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .form-actions .button,
  .topbar__actions .button,
  .card__buttons .button {
    width: 100%;
  }

  .card-grid {
    grid-template-columns: 1fr;
  }

  .card__buttons {
    flex-wrap: wrap;
  }

  .card__buttons .button {
    flex: 1 1 48%;
  }

  .category-tabs {
    gap: 8px;
  }

  .tab {
    padding: 10px 16px;
  }
}
</style>

