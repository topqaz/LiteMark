<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import Sortable from 'sortablejs';
import { getShanghaiYear } from '../utils/date.js';

type Bookmark = {
  id: string;
  title: string;
  url: string;
  category?: string;
  description?: string;
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
// 默认网站图标使用 public 目录下的 LiteMark.png
const DEFAULT_ICON = '/LiteMark.png';
const DEFAULT_CATEGORY_LABEL = '默认分类';
const DEFAULT_CATEGORY_KEY = '';
const DEFAULT_CATEGORY_ALIASES = new Set(
  ['默认分类', '未分类', '默认', 'default'].map((item) => item.toLowerCase())
);

const themeOptions = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' }
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

const storedToken =
  typeof window !== 'undefined' ? window.localStorage.getItem('bookmark_token') : null;
const storedUser =
  typeof window !== 'undefined' ? window.localStorage.getItem('bookmark_username') : null;
const authToken = ref<string | null>(storedToken);
const currentUser = ref<string>(storedUser || '');

const isAuthenticated = computed(() => Boolean(authToken.value));
const isEditMode = ref(false);
const canEdit = computed(() => isAuthenticated.value && isEditMode.value);

const showHidden = ref(false);
const showForm = ref(false);
const orderSaving = ref(false);
const pendingOrder = ref<string[] | null>(null);
const orderMessage = ref('');
const actionMessage = ref('');
let actionMessageTimer: ReturnType<typeof setTimeout> | null = null;

function showActionMessage(message: string) {
  actionMessage.value = message;
  if (actionMessageTimer) {
    clearTimeout(actionMessageTimer);
  }
  actionMessageTimer = setTimeout(() => {
    actionMessage.value = '';
    actionMessageTimer = null;
  }, 3000);
}

function ensureEditable(): boolean {
  if (!isAuthenticated.value) {
    showLoginModal.value = true;
    return false;
  }
  if (!isEditMode.value) {
    showActionMessage('请先进入编辑模式');
    return false;
  }
  return true;
}

function toggleEditMode() {
  if (!isAuthenticated.value) {
    showLoginModal.value = true;
    return;
  }
  isEditMode.value = !isEditMode.value;
  if (!isEditMode.value) {
    showForm.value = false;
    showHidden.value = false;
    resetForm();
    pendingOrder.value = null;
    orderMessage.value = '';
  }
}

function toUserMessage(err: unknown, fallback: string) {
  if (err instanceof Error) {
    const message = err.message || '';
    if (/fetch/i.test(message) || /network/i.test(message) || /storage/i.test(message)) {
      return '数据存储服务暂时不可用，请稍后重试。';
    }
    return message;
  }
  return fallback;
}

const containerRefs = new Map<string, HTMLElement>();
const sortableInstances = new Map<string, Sortable>();
const DEFAULT_CONTAINER_KEY = '__default__';

// 折叠状态：记录哪些分类被折叠
const collapsedGroupKeys = ref<Set<string>>(new Set());

function encodeGroupKey(key: string): string {
  return key === '' ? DEFAULT_CONTAINER_KEY : key;
}

function decodeGroupKey(key: string): string {
  return key === DEFAULT_CONTAINER_KEY ? '' : key;
}

function toggleGroupCollapse(key: string) {
  const next = new Set(collapsedGroupKeys.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  collapsedGroupKeys.value = next;
}

function isGroupCollapsed(key: string): boolean {
  return collapsedGroupKeys.value.has(key);
}

type SortableRefElement = Element | (ComponentPublicInstance & { $el?: Element });

function setContainerRef(key: string, el: SortableRefElement | null) {
  const encoded = encodeGroupKey(key);
  const element =
    el instanceof HTMLElement
      ? el
      : el instanceof Element
      ? el
      : el && '$el' in el && el.$el instanceof HTMLElement
      ? el.$el
      : null;
  if (!(element instanceof HTMLElement)) {
    containerRefs.delete(encoded);
    return;
  }
  containerRefs.set(encoded, element);
}

function destroySortables() {
  sortableInstances.forEach((instance) => {
    instance.destroy();
  });
  sortableInstances.clear();
}

async function persistOrder(orderIds: string[]) {
  if (!ensureEditable()) {
    return;
  }
  orderSaving.value = true;
  try {
    const response = await requestWithAuth(`${endpoint}/reorder`, {
      method: 'POST',
      body: JSON.stringify({ order: orderIds })
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || '保存排序失败');
    }
    const updated = (await response.json()) as Bookmark[];
    bookmarks.value = updated;
    pendingOrder.value = null;
    orderMessage.value = '排序已保存';
  } catch (err) {
    error.value = toUserMessage(err, '保存排序失败');
    orderMessage.value = '';
  } finally {
    orderSaving.value = false;
  }
}

async function handleGroupReorder(groupKey: string, orderedIds: string[]) {
  if (!canEdit.value || orderedIds.length === 0) {
    return;
  }
  const original = [...bookmarks.value];
  const idToBookmark = new Map(original.map((item) => [item.id, item]));
  const idSet = new Set(orderedIds);
  const targetKey = groupKey;
  const newGroup: Bookmark[] = [];
  orderedIds.forEach((id) => {
    const bookmark = idToBookmark.get(id);
    if (bookmark && categoryKeyFromBookmark(bookmark) === targetKey) {
      newGroup.push(bookmark);
      idToBookmark.delete(id);
    }
  });
  original.forEach((bookmark) => {
    if (categoryKeyFromBookmark(bookmark) === targetKey && !idSet.has(bookmark.id)) {
      newGroup.push(bookmark);
    }
  });

  const reordered: Bookmark[] = [];
  let inserted = false;
  original.forEach((bookmark) => {
    if (categoryKeyFromBookmark(bookmark) === targetKey) {
      if (!inserted) {
        reordered.push(...newGroup);
        inserted = true;
      }
    } else {
      reordered.push(bookmark);
    }
  });

  if (!inserted) {
    return;
  }

  bookmarks.value = reordered;
  pendingOrder.value = reordered.map((item) => item.id);
  orderMessage.value = '排序已调整，记得保存。';
}

function setupSortables() {
  destroySortables();
  if (!canEdit.value || typeof window === 'undefined') {
    return;
  }
  containerRefs.forEach((container, encodedKey) => {
    const groupKey = decodeGroupKey(encodedKey);
    const sortable = new Sortable(container, {
      animation: 150,
      handle: '.card__drag-handle',
      ghostClass: 'card--dragging',
      onStart() {
        orderMessage.value = '';
      },
      onEnd() {
        const ids = Array.from(container.querySelectorAll('[data-bookmark-id]')).map((el) =>
          el.getAttribute('data-bookmark-id') ?? ''
        );
        handleGroupReorder(groupKey, ids);
      }
    });
    sortableInstances.set(encodedKey, sortable);
  });
}

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
    isEditMode.value = false;
    pendingOrder.value = null;
    orderMessage.value = '';
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
    // 默认使用 public 根目录下的图标
    return '/LiteMark.png';
  }
  // 已是完整 URL、data URL 或以 / 开头的路径，直接使用
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

function handleSiteSettingsInput() {
  return;
}

watch(currentTheme, (value) => {
  applyTheme(value);
});

function normalizeCategoryInput(value?: string | null): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    return DEFAULT_CATEGORY_KEY;
  }
  const lower = trimmed.toLowerCase();
  if (DEFAULT_CATEGORY_ALIASES.has(lower)) {
    return DEFAULT_CATEGORY_KEY;
  }
  return trimmed;
}

function categoryKeyFromBookmark(bookmark: Bookmark): string {
  return normalizeCategoryInput(bookmark.category);
}

function categoryLabelFromKey(key: string): string {
  return key === DEFAULT_CATEGORY_KEY ? DEFAULT_CATEGORY_LABEL : key;
}

function normalizeCategory(bookmark: Bookmark) {
  return categoryLabelFromKey(categoryKeyFromBookmark(bookmark));
}

const keywordFiltered = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  if (!keyword) {
    return [...bookmarks.value];
  }
  return bookmarks.value.filter((item) => {
    const haystack = [item.title, item.url, item.category ?? '', item.description ?? '']
      .join(' ')
      .toLowerCase();
    return haystack.includes(keyword);
  });
});

const visibilityFiltered = computed(() => {
  const shouldShowHidden = canEdit.value && showHidden.value;
  if (shouldShowHidden) {
    return keywordFiltered.value;
  }
  return keywordFiltered.value.filter((item) => item.visible !== false);
});

const categories = computed<CategoryOption[]>(() => {
  const counts = new Map<string, number>();
  const order: string[] = [];

  visibilityFiltered.value.forEach((bookmark) => {
    const key = categoryKeyFromBookmark(bookmark);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!order.includes(key)) {
      order.push(key);
    }
  });

  const options: CategoryOption[] = [
    {
      key: 'all',
      label: '全部',
      count: visibilityFiltered.value.length
    }
  ];

  order.forEach((key) => {
    options.push({
      key,
      label: categoryLabelFromKey(key),
      count: counts.get(key) ?? 0
    });
  });

  return options;
});

const groupedBookmarks = computed(() => {
  const groups = new Map<string, Bookmark[]>();
  const order: string[] = [];

  visibilityFiltered.value.forEach((bookmark) => {
    const key = categoryKeyFromBookmark(bookmark);
    const existing = groups.get(key);
    if (existing) {
      existing.push(bookmark);
    } else {
      groups.set(key, [bookmark]);
      order.push(key);
    }
  });

  return order.map((key) => {
    const list = groups.get(key) ?? [];
    return {
      key,
      name: categoryLabelFromKey(key),
      count: list.length,
      bookmarks: list
    };
  });
});

const categorySuggestions = computed(() => {
  const set = new Set<string>();
  bookmarks.value.forEach((bookmark) => {
    const normalized = normalizeCategory(bookmark);
    if (normalized) {
      set.add(normalized);
    }
  });
  const list = Array.from(set);
  list.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  return list;
});

const categoryFiltered = computed(() => {
  if (currentCategory.value === 'all') {
    return visibilityFiltered.value;
  }
  return visibilityFiltered.value.filter(
    (bookmark) => categoryKeyFromBookmark(bookmark) === currentCategory.value
  );
});

watch(bookmarks, () => {
  if (currentCategory.value === 'all') {
    return;
  }
  const hasCategory = visibilityFiltered.value.some(
    (bookmark) => categoryKeyFromBookmark(bookmark) === currentCategory.value
  );
  if (!hasCategory) {
    currentCategory.value = 'all';
  }
});

async function loadBookmarks() {
  loading.value = true;
  error.value = null;
  try {
    const url = `${endpoint}?t=${Date.now()}`;
    // 未登录用户：匿名请求，只拿可见书签
    // 已登录用户：带上 token，请求会返回包含隐藏书签的完整列表
    const response = isAuthenticated.value
      ? await requestWithAuth(url, {
          method: 'GET',
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-store'
          }
        })
      : await fetch(url, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-store'
          }
        });
    if (!response.ok) {
      if (response.status === 304) {
        return;
      }
      throw new Error(`加载失败：${response.status}`);
    }
    const data = (await response.json()) as Bookmark[];
    bookmarks.value = data;
  } catch (err) {
    error.value = toUserMessage(err, '加载书签失败');
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
    } else {
      currentTheme.value = themeOptions[0].value;
      selectedTheme.value = themeOptions[0].value;
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
  if (!ensureEditable()) {
    return;
  }
  if (!form.title.trim() || !form.url.trim()) {
    error.value = '标题和链接不能为空';
    return;
  }

  saving.value = true;
  error.value = null;
  const normalizedCategory = normalizeCategoryInput(form.category);
  const payload = {
    title: form.title.trim(),
    url: form.url.trim(),
    category: normalizedCategory || undefined,
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
    showActionMessage(editingId.value ? '书签已更新' : '书签已添加');
    resetForm();
  } catch (err) {
    error.value = toUserMessage(err, '保存失败');
  } finally {
    saving.value = false;
  }
}

function startEdit(bookmark: Bookmark) {
  if (!ensureEditable()) {
    return;
  }
  showForm.value = true;
  editingId.value = bookmark.id;
  form.title = bookmark.title;
  form.url = bookmark.url;
  form.category = categoryKeyFromBookmark(bookmark);
  form.description = bookmark.description ?? '';
  form.visible = bookmark.visible !== false;
}

async function removeBookmark(id: string) {
  if (!ensureEditable()) {
    return;
  }
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
    showActionMessage('书签已删除');
  } catch (err) {
    error.value = toUserMessage(err, '删除失败');
  }
}

async function handleThemeChange() {
  if (!ensureEditable()) {
    selectedTheme.value = currentTheme.value;
    return;
  }
  const value = selectedTheme.value;
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
    isEditMode.value = false;
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
  isEditMode.value = false;
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

watch([() => bookmarks.value, () => currentCategory.value, () => canEdit.value], () => {
  nextTick(() => {
    if (canEdit.value) {
      setupSortables();
    } else {
      destroySortables();
    }
  });
});

onBeforeUnmount(() => {
  destroySortables();
  containerRefs.clear();
});

async function toggleVisibility(bookmark: Bookmark) {
  if (!ensureEditable()) {
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
    showActionMessage(bookmark.visible === false ? '书签已设为可见' : '书签已隐藏');
  } catch (err) {
    error.value = toUserMessage(err, '更新显示状态失败');
  }
}

function toggleForm() {
  if (!ensureEditable()) {
    return;
  }
  if (showForm.value) {
    resetForm();
  }
  showForm.value = !showForm.value;
}

function openBookmark(bookmark: Bookmark) {
  if (isEditMode.value) {
    return;
  }
  if (!bookmark.url) {
    return;
  }
  if (typeof window !== 'undefined') {
    window.open(bookmark.url, '_blank', 'noopener');
  }
}

function getFaviconUrl(url: string): string {
  if (!url) {
    return DEFAULT_ICON;
  }
  try {
    const encodedUrl = encodeURIComponent(url);
    return `https://t0.gstatic.cn/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=32&url=${encodedUrl}`;
  } catch {
    return DEFAULT_ICON;
  }
}

function openAdmin() {
  if (typeof window !== 'undefined') {
    window.location.href = '/admin';
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
        <div class="brand__search">
          <span class="search-input__icon">🔍</span>
          <input
            v-model="search"
            type="search"
            placeholder="搜索书签..."
            @keydown.enter.prevent="loadBookmarks"
          />
        </div>
      </div>
      <div class="topbar__actions">
        <div v-if="canEdit" class="theme-switcher">
          <label>
            <span>主题</span>
            <select
              v-model="selectedTheme"
              @change="handleThemeChange"
              :disabled="themeSaving"
            >
              <option v-for="option in themeOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
          <span v-if="themeSaving" class="theme-switcher__status">保存中...</span>
        </div>
        <button
          v-if="isAuthenticated"
          class="button button--ghost"
          type="button"
          @click="openAdmin"
        >
          进入后台
        </button>
        <button
          v-if="isAuthenticated"
          class="button edit-toggle"
          :class="isEditMode ? 'button--primary' : 'button--ghost'"
          type="button"
          @click="toggleEditMode"
        >
          {{ isEditMode ? '退出编辑' : '进入编辑' }}
        </button>
        <button
          v-if="canEdit"
          class="button button--primary save-button"
          type="button"
          :disabled="orderSaving || !pendingOrder"
          @click="() => pendingOrder && persistOrder(pendingOrder)"
        >
          {{ orderSaving ? '保存中...' : '保存顺序' }}
        </button>
        <button
          v-if="canEdit"
          class="button button--primary add-button"
          type="button"
          @click="toggleForm"
        >
          {{ showForm ? '收起表单' : '添加书签' }}
        </button>
        <label v-if="canEdit" class="hidden-toggle">
          <input type="checkbox" v-model="showHidden" />
          显示隐藏书签
        </label>
        <button v-if="!isAuthenticated" class="button button--ghost login-button" @click="openLogin">
          登录
        </button>
        <div v-else class="profile">
          <span class="profile__name">{{ currentUser }}</span>
          <button class="button button--ghost" @click="logout">退出</button>
        </div>
      </div>
    </header>

    <main class="main">
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
      <p v-if="orderMessage" class="alert alert--success">{{ orderMessage }}</p>
      <p v-if="actionMessage" class="alert alert--success">{{ actionMessage }}</p>
      <section v-if="canEdit && showForm" class="form-card">
        <header class="form-card__header">
          <h2>{{ editingId ? '编辑书签' : '新增书签' }}</h2>
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
              <input
                v-model="form.category"
                type="text"
                placeholder="例如：开发工具"
                list="home-category-options"
              />
              <datalist id="home-category-options">
                <option v-for="name in categorySuggestions" :key="name" :value="name" />
              </datalist>
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
        <section v-for="group in groupedBookmarks" :key="group.key" class="category-group">
          <header class="category-group__header" @click="toggleGroupCollapse(group.key)">
            <div class="category-title">
              <span class="category-title__icon">
                <img src="/LiteMark.png" alt="分类图标" />
              </span>
              <span class="category-title__text">{{ group.name }}</span>
            </div>
            <div class="category-header-right">
              <span class="category-badge">{{ group.count }}</span>
              <button
                class="category-toggle"
                type="button"
                @click.stop="toggleGroupCollapse(group.key)"
                :aria-label="isGroupCollapsed(group.key) ? '展开分类' : '折叠分类'"
              >
                <span class="category-toggle__icon">
                  {{ isGroupCollapsed(group.key) ? '▸' : '▾' }}
                </span>
              </button>
            </div>
          </header>
          <div
            v-show="!isGroupCollapsed(group.key)"
            class="card-grid"
            :ref="(el) => setContainerRef(group.key, el)"
            :data-group="encodeGroupKey(group.key)"
          >
            <article
              v-for="bookmark in group.bookmarks"
              :key="bookmark.id"
              :class="['card', { 'card--hidden': bookmark.visible === false }]"
              :data-bookmark-id="bookmark.id"
              @click="openBookmark(bookmark)"
            >
              <header class="card__header">
                <div class="card__header-main">
                  <img
                    :src="getFaviconUrl(bookmark.url)"
                    :alt="bookmark.title"
                    class="card__favicon"
                    @error="(e) => { (e.target as HTMLImageElement).src = DEFAULT_ICON; }"
                  />
                  <h3 class="card__title">
                    <a :href="bookmark.url" target="_blank" rel="noreferrer">{{ bookmark.title }}</a>
                  </h3>
                </div>
                <div
                  v-if="bookmark.visible === false || canEdit"
                  class="card__header-actions"
                >
                  <span v-if="bookmark.visible === false" class="hidden-chip">已隐藏</span>
                  <span
                    v-if="canEdit"
                    class="card__drag-handle"
                    title="拖动调整顺序"
                    @click.stop
                  >
                    ⠿
                  </span>
                  <button
                    v-if="canEdit"
                    class="card__action-button"
                    type="button"
                    @click.stop="startEdit(bookmark)"
                    title="编辑"
                  >
                    ✎
                  </button>
                  <button
                    v-if="canEdit"
                    class="card__action-button"
                    type="button"
                    @click.stop="toggleVisibility(bookmark)"
                    :title="bookmark.visible === false ? '设为可见' : '设为隐藏'"
                  >
                    {{ bookmark.visible === false ? '👁' : '🙈' }}
                  </button>
                  <button
                    v-if="canEdit"
                    class="card__action-button"
                    type="button"
                    @click.stop="removeBookmark(bookmark.id)"
                    title="删除"
                  >
                    ×
                  </button>
                </div>
              </header>
              <p v-if="bookmark.description" class="card__description">{{ bookmark.description }}</p>
              <p class="card__url">{{ bookmark.url }}</p>
            </article>
          </div>
        </section>
      </template>

      <section v-else class="category-group">
        <header class="category-group__header">
          <div class="category-title">
            <span class="category-title__icon">
              <img src="/LiteMark.png" alt="分类图标" />
            </span>
            <span class="category-title__text">
              {{ categoryLabelFromKey(currentCategory) }}
            </span>
          </div>
          <span class="category-badge">{{ categoryFiltered.length }}</span>
        </header>
        <div
          class="card-grid"
          :ref="(el) => setContainerRef(currentCategory, el)"
          :data-group="encodeGroupKey(currentCategory)"
        >
          <article
            v-for="bookmark in categoryFiltered"
            :key="bookmark.id"
            :class="['card', { 'card--hidden': bookmark.visible === false }]"
            :data-bookmark-id="bookmark.id"
            @click="openBookmark(bookmark)"
          >
            <header class="card__header">
              <div class="card__header-main">
                <img
                  :src="getFaviconUrl(bookmark.url)"
                  :alt="bookmark.title"
                  class="card__favicon"
                  @error="(e) => { (e.target as HTMLImageElement).src = DEFAULT_ICON; }"
                />
                <h3 class="card__title">
                  <a :href="bookmark.url" target="_blank" rel="noreferrer">{{ bookmark.title }}</a>
                </h3>
              </div>
              <div
                v-if="bookmark.visible === false || canEdit"
                class="card__header-actions"
              >
                <span v-if="bookmark.visible === false" class="hidden-chip">已隐藏</span>
                <span
                  v-if="canEdit"
                  class="card__drag-handle"
                  title="拖动调整顺序"
                  @click.stop
                >
                  ⠿
                </span>
                <button
                  v-if="canEdit"
                  class="card__action-button"
                  type="button"
                  @click.stop="startEdit(bookmark)"
                  title="编辑"
                >
                  ✎
                </button>
                <button
                  v-if="canEdit"
                  class="card__action-button"
                  type="button"
                  @click.stop="toggleVisibility(bookmark)"
                  :title="bookmark.visible === false ? '设为可见' : '设为隐藏'"
                >
                  {{ bookmark.visible === false ? '👁' : '🙈' }}
                </button>
                <button
                  v-if="canEdit"
                  class="card__action-button"
                  type="button"
                  @click.stop="removeBookmark(bookmark.id)"
                  title="删除"
                >
                  ×
                </button>
              </div>
            </header>
            <p v-if="bookmark.description" class="card__description">{{ bookmark.description }}</p>
            <p class="card__url">{{ bookmark.url }}</p>
          </article>
        </div>
      </section>
    </main>

    <footer class="footer">
      <p class="footer__copyright">
        © {{ getShanghaiYear() }} LiteMark. All rights reserved.
      </p>
    </footer>

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
          <p>默认账号：admin / admin123，可在后台「站点设置 → 管理员账号」中修改。</p>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
:global(:root) {
  --bg-gradient-start: #f6f7f9;
  --bg-gradient-end: #eef1f5;
  --text-primary: #1f2933;
  --text-secondary: #4b5563;
  --text-muted: #9099a3;
  --surface-glass: rgba(255, 255, 255, 0.93);
  --surface-strong: rgba(255, 255, 255, 0.98);
  --surface-soft: rgba(255, 255, 255, 0.9);
  --surface-card: rgba(248, 250, 252, 0.96);
  --surface-border: rgba(148, 163, 184, 0.14);
  --surface-shadow: rgba(15, 23, 42, 0.08);
  --shadow-strong: rgba(15, 23, 42, 0.16);
  --search-bg: #edf0f4;
  --accent-start: #2b9ea3;
  --accent-end: #3bb3c4;
  --accent-text: #1f7c83;
  --accent-shadow: rgba(43, 158, 163, 0.22);
  --ghost-bg: rgba(255, 255, 255, 0.86);
  --ghost-border: rgba(148, 163, 184, 0.28);
  --ghost-text: #5b6876;
  --danger-bg: rgba(248, 113, 113, 0.16);
  --danger-border: rgba(220, 38, 38, 0.2);
  --danger-text: #b91c1c;
  --tag-bg: rgba(148, 163, 184, 0.22);
  --tag-text: #4b5563;
  --badge-bg: rgba(148, 163, 184, 0.2);
  --badge-text: #4b5563;
  --tab-bg: rgba(255, 255, 255, 0.92);
  --tab-text: #4b5563;
  --tab-active-bg-start: #2b9ea3;
  --tab-active-bg-end: #3bb3c4;
  --tab-active-text: #ffffff;
  --tab-badge-bg: rgba(255, 255, 255, 0.35);
  --alert-error-bg: rgba(254, 226, 226, 0.92);
  --alert-error-text: #b91c1c;
  --overlay-bg: rgba(15, 23, 42, 0.32);
  --dialog-bg: #ffffff;
  --input-bg: #f7f8fa;
  --input-border: transparent;
  --input-border-focus: rgba(43, 158, 163, 0.26);
  --input-shadow-focus: rgba(43, 158, 163, 0.16);
}

:global(:root[data-theme='dark']) {
  --bg-gradient-start: #101418;
  --bg-gradient-end: #1a2026;
  --text-primary: #e5e7eb;
  --text-secondary: #cbd5e1;
  --text-muted: #9aa3af;
  --surface-glass: rgba(16, 20, 24, 0.82);
  --surface-strong: rgba(26, 32, 38, 0.92);
  --surface-soft: rgba(26, 32, 38, 0.86);
  --surface-card: rgba(26, 32, 38, 0.9);
  --surface-border: rgba(148, 163, 184, 0.2);
  --surface-shadow: rgba(8, 10, 12, 0.5);
  --shadow-strong: rgba(15, 23, 42, 0.3);
  --search-bg: rgba(30, 41, 59, 0.64);
  --accent-start: #36a7ac;
  --accent-end: #4bb9c7;
  --accent-text: #8fd6de;
  --accent-shadow: rgba(54, 167, 172, 0.28);
  --ghost-bg: rgba(30, 41, 59, 0.66);
  --ghost-border: rgba(148, 163, 184, 0.3);
  --ghost-text: #cbd5e1;
  --danger-bg: rgba(248, 113, 113, 0.2);
  --danger-border: rgba(252, 165, 165, 0.26);
  --danger-text: #fca5a5;
  --tag-bg: rgba(148, 163, 184, 0.22);
  --tag-text: #cbd5e1;
  --badge-bg: rgba(148, 163, 184, 0.22);
  --badge-text: #cbd5e1;
  --tab-bg: rgba(30, 41, 59, 0.76);
  --tab-text: #cbd5e1;
  --tab-active-bg-start: #36a7ac;
  --tab-active-bg-end: #4bb9c7;
  --tab-active-text: #f7fbfc;
  --tab-badge-bg: rgba(15, 23, 42, 0.32);
  --alert-error-bg: rgba(127, 29, 29, 0.65);
  --alert-error-text: #fecaca;
  --overlay-bg: rgba(2, 6, 23, 0.62);
  --dialog-bg: rgba(16, 20, 24, 0.96);
  --input-bg: rgba(30, 41, 59, 0.78);
  --input-border: rgba(148, 163, 184, 0.2);
  --input-border-focus: rgba(54, 167, 172, 0.42);
  --input-shadow-focus: rgba(54, 167, 172, 0.18);
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
  gap: 18px;
  flex: 1;
  min-width: 0;
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

.brand__search {
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--search-bg);
  border-radius: 999px;
  padding: 8px 16px;
  flex: 1;
  max-width: 420px;
}

.brand__search .search-input__icon {
  font-size: 20px;
  opacity: 0.72;
}

.brand__search input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 15px;
  outline: none;
  color: inherit;
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

.theme-switcher__hint {
  font-size: 12px;
  color: var(--text-muted);
}

.edit-toggle {
  min-width: 96px;
  letter-spacing: 0.5px;
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
  border-radius: 22px;
  padding: 20px;
  box-shadow: 0 14px 30px var(--surface-shadow);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.category-group__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.category-header-right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
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

.category-title__icon img {
  width: 22px;
  height: 22px;
  display: block;
  border-radius: 6px;
}

.category-badge {
  background: var(--badge-bg);
  color: var(--badge-text);
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
}

.category-toggle {
  border: none;
  background: transparent;
  padding: 4px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.category-toggle__icon {
  font-size: 14px;
}

.card-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  grid-auto-rows: minmax(0, 1fr);
  align-items: stretch;
}

.card {
  background: var(--surface-card);
  border-radius: 18px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: inset 0 0 0 1px var(--surface-border);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  cursor: pointer;
  position: relative;
  height: 100%;
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 30px var(--shadow-strong);
}

.card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.card__header-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.card__favicon {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  flex-shrink: 0;
  object-fit: contain;
}

.card__header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card__title a {
  color: inherit;
  text-decoration: none;
}

.card__description {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
  min-height: 36px;
  line-clamp: 2;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card__url {
  margin: 0;
  font-size: 12px;
  color: var(--accent-text);
  word-break: break-all;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card__action-button {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(148, 163, 184, 0.12);
  color: var(--text-secondary);
  font-size: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.card__action-button:hover {
  background: rgba(148, 163, 184, 0.2);
  border-color: rgba(148, 163, 184, 0.5);
  color: var(--text-primary);
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

.card__drag-handle {
  cursor: grab;
  font-size: 16px;
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(148, 163, 184, 0.12);
}

.card__drag-handle:active {
  cursor: grabbing;
  background: rgba(148, 163, 184, 0.2);
}

.card--dragging {
  opacity: 0.6;
}

@media (max-width: 768px) {
  .topbar {
    padding: 16px 20px;
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }

  .topbar__actions {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .brand {
    flex-wrap: wrap;
    gap: 12px;
  }

  .brand__search {
    width: 100%;
    max-width: none;
  }

  .card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .card {
    padding: 16px;
    border-radius: 16px;
  }

  .card__description {
    min-height: auto;
  }

  .card__title {
    font-size: 15px;
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
    grid-template-columns: 1fr;
  }

  .button {
    width: 100%;
    padding: 8px 12px;
    font-size: 12px;
    min-width: 0;
    grid-column: span 1;
  }

  .add-button {
    grid-column: span 1;
    justify-content: center;
  }

  .hidden-toggle {
    width: 100%;
    grid-column: span 2;
    order: unset;
  }

  .profile {
    width: 100%;
    grid-column: span 2;
    order: unset;
    justify-content: space-between;
  }

  .login-button {
    grid-column: span 2;
  }

  .save-button,
  .add-button {
    grid-row: auto;
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

@media (max-width: 600px) {
  .card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .card {
    padding: 14px;
    border-radius: 15px;
  }

  .card__title {
    font-size: 14px;
  }

  .card__description {
    font-size: 13px;
  }

  .card__url {
    font-size: 12px;
  }
}

.footer {
  padding: 20px 40px;
  text-align: center;
  background: var(--surface-glass);
  backdrop-filter: blur(12px);
  border-top: 1px solid var(--surface-border);
  margin-top: auto;
}

.footer__copyright {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
  opacity: 0.8;
}

@media (max-width: 768px) {
  .footer {
    padding: 16px 20px;
  }

  .footer__copyright {
    font-size: 12px;
  }
}
</style>
