<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

type Bookmark = {
  id: string;
  title: string;
  url: string;
  category?: string;
  description?: string;
  visible?: boolean;
  createdAt: string;
  updatedAt?: string;
  weight?: number;
};

const router = useRouter();

const apiBaseRaw =
  (typeof window !== 'undefined'
    ? (window as { __APP_API_BASE_URL__?: string }).__APP_API_BASE_URL__
    : '') ?? '';
const apiBase = apiBaseRaw.replace(/\/$/, '');
const bookmarksEndpoint = `${apiBase}/api/bookmarks`;

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
const error = ref<string | null>(null);
const search = ref('');

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

const showEditor = ref(false);
const editorMode = ref<'create' | 'edit'>('create');
const editorSaving = ref(false);
const editorError = ref('');
const editorForm = reactive({
  id: '',
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

const filteredBookmarks = computed(() => {
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

const totalCount = computed(() => bookmarks.value.length);
const hiddenCount = computed(() => bookmarks.value.filter((item) => item.visible === false).length);
const visibleCount = computed(() => totalCount.value - hiddenCount.value);
const categoryCount = computed(() => {
  const set = new Set<string>();
  bookmarks.value.forEach((bookmark) => {
    set.add(normalizeCategory(bookmark));
  });
  return set.size;
});

const recentBookmarks = computed(() => {
  return [...bookmarks.value]
    .sort(
      (a, b) =>
        new Date(b.updatedAt ?? b.createdAt).getTime() -
        new Date(a.updatedAt ?? a.createdAt).getTime()
    )
    .slice(0, 5);
});

const categorySuggestions = computed(() => {
  const set = new Set<string>();
  bookmarks.value.forEach((bookmark) => {
    const name = normalizeCategory(bookmark);
    if (name) {
      set.add(name);
    }
  });
  const list = Array.from(set);
  list.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  return list;
});

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
    showEditor.value = false;
    showLoginModal.value = true;
  }
});

watch(currentTheme, (value) => {
  applyTheme(value);
});

function normalizeCategory(bookmark: Bookmark) {
  return bookmark.category?.trim() || '默认分类';
}

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

async function loadBookmarks() {
  loading.value = true;
  error.value = null;
  try {
    const response = await fetch(bookmarksEndpoint);
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

function openCreate() {
  editorMode.value = 'create';
  editorForm.id = '';
  editorForm.title = '';
  editorForm.url = '';
  editorForm.category = '';
  editorForm.description = '';
  editorForm.visible = true;
  editorError.value = '';
  showEditor.value = true;
}

function openEdit(bookmark: Bookmark) {
  editorMode.value = 'edit';
  editorForm.id = bookmark.id;
  editorForm.title = bookmark.title;
  editorForm.url = bookmark.url;
  editorForm.category = bookmark.category ?? '';
  editorForm.description = bookmark.description ?? '';
  editorForm.visible = bookmark.visible !== false;
  editorError.value = '';
  showEditor.value = true;
}

function closeEditor() {
  if (editorSaving.value) return;
  showEditor.value = false;
}

async function submitEditor() {
  if (!editorForm.title.trim() || !editorForm.url.trim()) {
    editorError.value = '标题和链接不能为空';
    return;
  }
  editorSaving.value = true;
  editorError.value = '';
  const payload = {
    title: editorForm.title.trim(),
    url: editorForm.url.trim(),
    category: editorForm.category.trim() || undefined,
    description: editorForm.description.trim() || undefined,
    visible: editorForm.visible
  };
  try {
    const method = editorMode.value === 'edit' ? 'PUT' : 'POST';
    const target =
      editorMode.value === 'edit'
        ? `${bookmarksEndpoint}/${editorForm.id}`
        : bookmarksEndpoint;
    const response = await requestWithAuth(target, {
      method,
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || '保存失败');
    }
    await loadBookmarks();
    showEditor.value = false;
  } catch (err) {
    editorError.value = err instanceof Error ? err.message : '保存失败';
  } finally {
    editorSaving.value = false;
  }
}

async function deleteBookmark(id: string) {
  if (!confirm('确定要删除该书签吗？')) {
    return;
  }
  try {
    const response = await requestWithAuth(`${bookmarksEndpoint}/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || '删除失败');
    }
    await loadBookmarks();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '删除失败';
  }
}

async function toggleVisibility(bookmark: Bookmark) {
  try {
    const response = await requestWithAuth(`${bookmarksEndpoint}/${bookmark.id}`, {
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

async function handleThemeChange() {
  const value = selectedTheme.value;
  if (!isAuthenticated.value) {
    showLoginModal.value = true;
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
  } catch (err) {
    themeMessage.value = err instanceof Error ? err.message : '保存主题失败';
    selectedTheme.value = previous;
  } finally {
    themeSaving.value = false;
  }
}

async function saveSiteSettings() {
  if (!isAuthenticated.value) {
    showLoginModal.value = true;
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
  } catch (err) {
    siteSettingsError.value = err instanceof Error ? err.message : '保存站点设置失败';
  } finally {
    siteSettingsSaving.value = false;
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
  } catch (err) {
    loginState.error = err instanceof Error ? err.message : '登录失败';
  } finally {
    loginState.loading = false;
  }
}

function logout() {
  authToken.value = null;
  currentUser.value = '';
  showEditor.value = false;
}

function openLogin() {
  loginState.error = '';
  showLoginModal.value = true;
}

function closeLogin() {
  if (loginState.loading) return;
  showLoginModal.value = false;
}

function goHome() {
  router.push({ name: 'home' });
}

const cacheRefreshing = ref(false);
const cacheMessage = ref('');
const orderSaving = ref(false);
const orderMessage = ref('');

async function refreshData() {
  if (!isAuthenticated.value || cacheRefreshing.value) {
    if (!isAuthenticated.value) {
      showLoginModal.value = true;
    }
    return;
  }
  cacheRefreshing.value = true;
  cacheMessage.value = '';
  try {
    const [settingsResponse, bookmarksResponse] = await Promise.all([
      requestWithAuth(`${apiBase}/api/settings/refresh`, { method: 'POST' }),
      requestWithAuth(`${apiBase}/api/bookmarks/refresh`, { method: 'POST' })
    ]);
    if (!settingsResponse.ok) {
      const message = await settingsResponse.text();
      throw new Error(message || '刷新站点设置缓存失败');
    }
    if (!bookmarksResponse.ok) {
      const message = await bookmarksResponse.text();
      throw new Error(message || '刷新书签缓存失败');
    }
    await Promise.all([loadSettings(), loadBookmarks()]);
    cacheMessage.value = '数据已刷新';
  } catch (error) {
    cacheMessage.value = error instanceof Error ? error.message : '刷新失败';
  } finally {
    cacheRefreshing.value = false;
  }
}

async function persistOrder(list: Bookmark[]) {
  if (!isAuthenticated.value) {
    showLoginModal.value = true;
    return;
  }
  orderSaving.value = true;
  orderMessage.value = '';
  try {
    const response = await requestWithAuth(`${apiBase}/api/bookmarks/reorder`, {
      method: 'POST',
      body: JSON.stringify({ order: list.map((item) => item.id) })
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || '保存排序失败');
    }
    const updated = (await response.json()) as Bookmark[];
    bookmarks.value = updated;
    orderMessage.value = '书签排序已更新';
  } catch (error) {
    orderMessage.value = error instanceof Error ? error.message : '保存排序失败';
  } finally {
    orderSaving.value = false;
  }
}

async function moveBookmark(bookmark: Bookmark, direction: number) {
  if (!isAuthenticated.value) {
    showLoginModal.value = true;
    return;
  }
  const currentIndex = bookmarks.value.findIndex((item) => item.id === bookmark.id);
  const targetIndex = currentIndex + direction;
  if (currentIndex === -1 || targetIndex < 0 || targetIndex >= bookmarks.value.length) {
    return;
  }
  const list = [...bookmarks.value];
  const [item] = list.splice(currentIndex, 1);
  list.splice(targetIndex, 0, item);
  bookmarks.value = list;
  await persistOrder(list);
}

onMounted(() => {
  if (!isAuthenticated.value) {
    showLoginModal.value = true;
    return;
  }
  Promise.all([loadBookmarks(), loadSettings()]).catch((err) => {
    console.error(err);
  });
});
</script>

<template>
  <div class="admin-layout">
    <template v-if="isAuthenticated">
      <header class="admin-header">
        <div class="admin-header__left">
          <h1>LiteMark 后台管理</h1>
          <p>管理站点展示、主题与书签数据</p>
        </div>
        <div class="admin-header__right">
          <button class="button button--ghost" type="button" @click="goHome">回到网站</button>
          <button class="button button--ghost" type="button" @click="logout">
            退出登录
          </button>
        </div>
      </header>

      <main class="admin-main">
        <section class="card stats-card">
          <header class="card__header">
            <h2>站点概况</h2>
            <span v-if="currentUser" class="chip">当前账号：{{ currentUser }}</span>
          </header>
          <div class="stats-grid">
            <div class="stat">
              <span class="stat__label">书签总数</span>
              <strong class="stat__value">{{ totalCount }}</strong>
            </div>
            <div class="stat">
              <span class="stat__label">可见书签</span>
              <strong class="stat__value">{{ visibleCount }}</strong>
            </div>
            <div class="stat">
              <span class="stat__label">已隐藏</span>
              <strong class="stat__value">{{ hiddenCount }}</strong>
            </div>
            <div class="stat">
              <span class="stat__label">分类数量</span>
              <strong class="stat__value">{{ categoryCount }}</strong>
            </div>
          </div>
          <div class="recent-list" v-if="recentBookmarks.length">
            <h3>最近更新</h3>
            <ul>
              <li v-for="bookmark in recentBookmarks" :key="bookmark.id">
                <span class="recent__title">{{ bookmark.title }}</span>
                <span class="recent__time">
                  {{ new Date(bookmark.updatedAt ?? bookmark.createdAt).toLocaleString() }}
                </span>
              </li>
            </ul>
          </div>
        </section>

        <section class="card settings-card">
          <header class="card__header">
            <h2>站点设置</h2>
            <p>配置网站标题、图标以及主题风格</p>
          </header>
          <form class="form-grid" @submit.prevent="saveSiteSettings">
            <label class="field">
              <span>网站标题 *</span>
              <input
                v-model="siteSettingsForm.title"
                type="text"
                maxlength="60"
                placeholder="例如：我的书签收藏"
                required
                :disabled="!isAuthenticated || siteSettingsSaving"
              />
            </label>
            <label class="field">
              <span>网站图标</span>
              <input
                v-model="siteSettingsForm.icon"
                type="text"
                maxlength="512"
                placeholder="Emoji、链接或 data URL"
                :disabled="!isAuthenticated || siteSettingsSaving"
              />
            </label>
            <label class="field">
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
            <div class="settings-actions">
              <button class="button button--primary" type="submit" :disabled="siteSettingsSaving || !isAuthenticated">
                {{ siteSettingsSaving ? '保存中...' : '保存设置' }}
              </button>
              <button
                class="button button--ghost"
                type="button"
                :disabled="cacheRefreshing || !isAuthenticated"
                @click="refreshData"
              >
                {{ cacheRefreshing ? '刷新中...' : '刷新数据' }}
              </button>
            </div>
          </form>
          <p v-if="siteSettingsError" class="alert alert--error">{{ siteSettingsError }}</p>
          <p v-else-if="siteSettingsMessage" class="alert alert--success">{{ siteSettingsMessage }}</p>
          <p
            v-if="cacheMessage"
            class="alert"
            :class="cacheMessage.includes('失败') ? 'alert--error' : 'alert--success'"
          >
            {{ cacheMessage }}
          </p>
          <p
            v-if="orderMessage"
            class="alert"
            :class="orderMessage.includes('失败') ? 'alert--error' : 'alert--success'"
          >
            {{ orderMessage }}
          </p>
          <p v-if="themeMessage" class="alert alert--error">{{ themeMessage }}</p>
        </section>

        <section class="card bookmarks-card">
          <header class="card__header">
            <div>
              <h2>书签管理</h2>
              <p>查看、筛选并维护所有书签条目</p>
            </div>
            <div class="bookmarks-actions">
              <div class="search-box">
                <input
                  v-model="search"
                  type="search"
                  placeholder="搜索标题、链接或分类..."
                />
              </div>
              <button
                class="button button--primary"
                type="button"
                :disabled="!isAuthenticated"
                @click="openCreate"
              >
                新建书签
              </button>
              <button class="button button--ghost" type="button" @click="loadBookmarks" :disabled="loading">
                {{ loading ? '加载中...' : '刷新数据' }}
              </button>
            </div>
          </header>
          <p v-if="error" class="alert alert--error">{{ error }}</p>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>标题</th>
                  <th>分类</th>
                  <th>链接</th>
                  <th>状态</th>
                  <th>权重</th>
                  <th class="table-actions">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="bookmark in filteredBookmarks" :key="bookmark.id">
                  <td>
                    <div class="table-title">{{ bookmark.title }}</div>
                    <div v-if="bookmark.description" class="table-desc">{{ bookmark.description }}</div>
                  </td>
                  <td>{{ normalizeCategory(bookmark) }}</td>
                  <td>
                    <a :href="bookmark.url" target="_blank" rel="noreferrer">{{ bookmark.url }}</a>
                  </td>
                  <td>
                    <span class="chip" :class="{ 'chip--muted': bookmark.visible === false }">
                      {{ bookmark.visible === false ? '隐藏' : '可见' }}
                    </span>
                  </td>
                  <td>{{ bookmark.weight ?? 0 }}</td>
                  <td class="table-actions">
                    <button
                      class="link-button"
                      type="button"
                      :disabled="orderSaving"
                      @click="moveBookmark(bookmark, -1)"
                    >
                      上移
                    </button>
                    <button
                      class="link-button"
                      type="button"
                      :disabled="orderSaving"
                      @click="moveBookmark(bookmark, 1)"
                    >
                      下移
                    </button>
                    <button class="link-button" type="button" @click="openEdit(bookmark)">编辑</button>
                    <button class="link-button" type="button" @click="toggleVisibility(bookmark)">
                      {{ bookmark.visible === false ? '设为可见' : '设为隐藏' }}
                    </button>
                    <button class="link-button link-button--danger" type="button" @click="deleteBookmark(bookmark.id)">
                      删除
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-if="!filteredBookmarks.length && !loading" class="empty-placeholder">
              暂无书签或未匹配到搜索结果
            </p>
          </div>
        </section>
      </main>
    </template>

    <div v-if="isAuthenticated && showEditor" class="overlay" @click.self="closeEditor">
      <section class="drawer">
        <header class="drawer__header">
          <div>
            <h2>{{ editorMode === 'create' ? '新增书签' : '编辑书签' }}</h2>
            <p>{{ editorMode === 'create' ? '添加一个新的书签条目' : '更新书签内容' }}</p>
          </div>
          <button class="drawer__close" type="button" @click="closeEditor">✕</button>
        </header>
        <form class="drawer__form" @submit.prevent="submitEditor">
          <label class="field">
            <span>标题 *</span>
            <input v-model="editorForm.title" type="text" required />
          </label>
          <label class="field">
            <span>链接 *</span>
            <input v-model="editorForm.url" type="url" required />
          </label>
          <label class="field">
            <span>分类</span>
            <input v-model="editorForm.category" type="text" list="admin-category-options" />
            <datalist id="admin-category-options">
              <option v-for="name in categorySuggestions" :key="name" :value="name" />
            </datalist>
          </label>
          <label class="field">
            <span>描述</span>
            <textarea v-model="editorForm.description" rows="3"></textarea>
          </label>
          <label class="field field--toggle">
            <span>显示状态</span>
            <div class="toggle">
              <input id="editor-visible" v-model="editorForm.visible" type="checkbox" />
              <label for="editor-visible">{{ editorForm.visible ? '可见' : '隐藏' }}</label>
            </div>
          </label>
          <p v-if="editorError" class="alert alert--error">{{ editorError }}</p>
          <div class="drawer__actions">
            <button class="button button--primary" type="submit" :disabled="editorSaving">
              {{ editorSaving ? '保存中...' : '保存' }}
            </button>
            <button class="button button--ghost" type="button" :disabled="editorSaving" @click="closeEditor">
              取消
            </button>
          </div>
        </form>
      </section>
    </div>

    <div v-if="showLoginModal" class="overlay" @click.self="closeLogin">
      <section class="dialog">
        <header class="dialog__header">
          <h2>管理员登录</h2>
          <button class="dialog__close" @click="closeLogin">✕</button>
        </header>
        <form class="dialog__form" @submit.prevent="login">
          <label class="field">
            <span>用户名</span>
            <input v-model="loginState.username" type="text" required />
          </label>
          <label class="field">
            <span>密码</span>
            <input v-model="loginState.password" type="password" required />
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
.admin-layout {
  min-height: 100vh;
  background: linear-gradient(180deg, var(--bg-gradient-start) 0%, var(--bg-gradient-end) 100%);
  display: flex;
  flex-direction: column;
  color: var(--text-primary);
}

.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 40px;
  background: var(--surface-glass);
  backdrop-filter: blur(16px);
  box-shadow: 0 6px 30px var(--surface-shadow);
  position: sticky;
  top: 0;
  z-index: 20;
}

.admin-header__left h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
}

.admin-header__left p {
  margin: 6px 0 0;
  color: var(--text-muted);
}

.admin-header__right {
  display: flex;
  gap: 12px;
}

.admin-main {
  width: min(1200px, 100%);
  margin: 32px auto;
  padding: 0 24px 64px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.card {
  background: var(--surface-strong);
  border-radius: 24px;
  padding: 28px;
  box-shadow: 0 20px 50px var(--surface-shadow);
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.card__header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}

.card__header p {
  margin: 4px 0 0;
  color: var(--text-muted);
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  background: var(--badge-bg);
  color: var(--badge-text);
  font-weight: 600;
}

.chip--muted {
  background: rgba(148, 163, 184, 0.18);
  color: var(--text-muted);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
}

.stat {
  background: var(--surface-card);
  border-radius: 18px;
  padding: 18px;
  box-shadow: inset 0 0 0 1px var(--surface-border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat__label {
  font-size: 13px;
  color: var(--text-muted);
}

.stat__value {
  font-size: 26px;
  font-weight: 700;
  color: var(--accent-text);
}

.recent-list h3 {
  margin: 12px 0 10px;
  font-size: 15px;
  color: var(--text-secondary);
}

.recent-list ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.recent-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--surface-card);
  box-shadow: inset 0 0 0 1px var(--surface-border);
}

.recent__title {
  font-weight: 600;
}

.recent__time {
  font-size: 12px;
  color: var(--text-muted);
}

.settings-card .form-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
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
.field select,
.field textarea {
  border: 1px solid var(--input-border);
  border-radius: 14px;
  padding: 12px 16px;
  font-size: 15px;
  background: var(--input-bg);
  transition: all 0.2s ease;
  resize: none;
  color: var(--text-primary);
  font-family: inherit;
}

.field input:focus,
.field select:focus,
.field textarea:focus {
  outline: none;
  border-color: var(--input-border-focus);
  box-shadow: 0 0 0 4px var(--input-shadow-focus);
}

.field--toggle {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--text-secondary);
}

.settings-actions {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
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

.button:not(:disabled):hover {
  transform: translateY(-1px);
}

.button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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

.bookmarks-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: flex-end;
}

.search-box input {
  min-width: 220px;
}

.table-wrapper {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

th,
td {
  padding: 12px 14px;
  text-align: left;
  border-bottom: 1px solid var(--surface-border);
}

th {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

tbody tr:hover {
  background: rgba(99, 102, 241, 0.06);
}

.table-title {
  font-weight: 600;
}

.table-desc {
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 12px;
}

.table-actions {
  text-align: right;
  white-space: nowrap;
}

.link-button {
  background: none;
  border: none;
  color: var(--accent-text);
  font-weight: 600;
  cursor: pointer;
  padding: 0 8px;
}

.link-button--danger {
  color: var(--danger-text);
}

.empty-placeholder {
  margin: 16px 0 0;
  text-align: center;
  color: var(--text-muted);
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

.drawer {
  width: min(520px, 100%);
  max-height: 90vh;
  background: var(--dialog-bg);
  border-radius: 18px;
  padding: 24px;
  box-shadow: 0 20px 60px var(--surface-shadow);
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.drawer__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.drawer__header h2 {
  margin: 0;
}

.drawer__close {
  border: none;
  background: transparent;
  font-size: 22px;
  cursor: pointer;
  color: var(--text-muted);
}

.drawer__form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.drawer__actions {
  display: flex;
  gap: 12px;
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
}

.dialog__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
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

.link-button + .link-button {
  margin-left: 4px;
}

@media (max-width: 960px) {
  .admin-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }

  .admin-header__right {
    width: 100%;
    flex-wrap: wrap;
    justify-content: flex-start;
  }

  .card__header {
    flex-direction: column;
  }

  .bookmarks-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 640px) {
  .admin-main {
    padding: 0 16px 48px;
  }

  .stats-grid {
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }

  .settings-card .form-grid {
    grid-template-columns: 1fr;
  }

  th,
  td {
    padding: 10px 12px;
  }

  .drawer {
    width: min(420px, 100%);
  }

  .drawer__actions {
    flex-direction: column;
  }

  .drawer__actions .button {
    width: 100%;
  }

  .bookmarks-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .bookmarks-actions .button,
  .search-box input {
    width: 100%;
  }
}
</style>

