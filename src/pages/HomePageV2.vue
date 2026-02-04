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
  tags?: string;
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
  tags: [] as string[],
  visible: true
});

// AI 生成状态
const aiGenerating = ref(false);
const fetchingTitle = ref(false);

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
      body: JSON.stringify({ bookmark_ids: orderIds })
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
  // 立即保存排序
  await persistOrder(newGroup.map((item) => item.id));
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
  form.tags = [];
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
    tags: form.tags.length > 0 ? JSON.stringify(form.tags) : undefined,
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
  form.tags = parseTags(bookmark.tags);
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

function parseTags(tagsJson: string | undefined): string[] {
  if (!tagsJson) return [];
  try {
    const parsed = JSON.parse(tagsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function openAdmin() {
  if (typeof window !== 'undefined') {
    window.location.href = '/admin';
  }
}

// 获取网页标题
async function fetchTitle() {
  if (!form.url.trim()) {
    showActionMessage('请先输入链接');
    return;
  }
  fetchingTitle.value = true;
  try {
    const response = await requestWithAuth(`${apiBase}/api/ai/fetch-page-info`, {
      method: 'POST',
      body: JSON.stringify({ url: form.url.trim() })
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || '获取标题失败');
    }
    const result = await response.json() as { title: string; description: string; favicon: string };
    if (result.title) {
      form.title = result.title;
      showActionMessage('已获取网页标题');
    } else {
      showActionMessage('未能获取到标题');
    }
  } catch (err) {
    error.value = toUserMessage(err, '获取标题失败');
  } finally {
    fetchingTitle.value = false;
  }
}

// AI 生成摘要和标签
async function aiGenerate() {
  if (!form.url.trim()) {
    showActionMessage('请先输入链接');
    return;
  }
  aiGenerating.value = true;
  try {
    const response = await requestWithAuth(`${apiBase}/api/ai/summarize`, {
      method: 'POST',
      body: JSON.stringify({ url: form.url.trim() })
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || 'AI 生成失败');
    }
    const result = await response.json() as { summary: string; tags: string[]; reading_time?: number };
    if (result.summary) {
      form.description = result.summary;
    }
    if (result.tags && result.tags.length > 0) {
      form.tags = result.tags;
    }
    showActionMessage('AI 已生成摘要和标签');
  } catch (err) {
    error.value = toUserMessage(err, 'AI 生成失败');
  } finally {
    aiGenerating.value = false;
  }
}

// 添加标签
function addTag(event: Event) {
  const input = event.target as HTMLInputElement;
  const tag = input.value.trim();
  if (tag && !form.tags.includes(tag)) {
    form.tags.push(tag);
  }
  input.value = '';
}

// 删除标签
function removeTag(index: number) {
  form.tags.splice(index, 1);
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
        <div v-if="canEdit" class="icon-btn-wrapper">
          <button
            class="icon-btn"
            type="button"
            @click="selectedTheme = selectedTheme === 'light' ? 'dark' : 'light'; handleThemeChange()"
            :disabled="themeSaving"
          >
            {{ selectedTheme === 'light' ? '🌙' : '☀️' }}
          </button>
          <span class="icon-btn-tooltip">{{ selectedTheme === 'light' ? '切换深色模式' : '切换浅色模式' }}</span>
        </div>
        <div v-if="isAuthenticated" class="icon-btn-wrapper">
          <button
            class="icon-btn"
            type="button"
            @click="openAdmin"
          >
            ⚙️
          </button>
          <span class="icon-btn-tooltip">后台管理</span>
        </div>
        <div v-if="isAuthenticated" class="icon-btn-wrapper">
          <button
            class="icon-btn"
            :class="{ 'icon-btn--active': isEditMode }"
            type="button"
            @click="toggleEditMode"
          >
            {{ isEditMode ? '✓' : '✏️' }}
          </button>
          <span class="icon-btn-tooltip">{{ isEditMode ? '退出编辑模式' : '进入编辑模式' }}</span>
        </div>
        <div v-if="canEdit" class="icon-btn-wrapper">
          <button
            class="icon-btn icon-btn--accent"
            type="button"
            @click="toggleForm"
          >
            {{ showForm ? '−' : '+' }}
          </button>
          <span class="icon-btn-tooltip">{{ showForm ? '收起表单' : '添加新书签' }}</span>
        </div>
        <div v-if="canEdit" class="icon-btn-wrapper">
          <button
            class="icon-btn"
            :class="{ 'icon-btn--active': showHidden }"
            type="button"
            @click="showHidden = !showHidden"
          >
            {{ showHidden ? '👁' : '👁‍🗨' }}
          </button>
          <span class="icon-btn-tooltip">{{ showHidden ? '隐藏私密书签' : '显示私密书签' }}</span>
        </div>
        <div v-if="!isAuthenticated" class="icon-btn-wrapper">
          <button class="icon-btn" @click="openLogin">
            👤
          </button>
          <span class="icon-btn-tooltip">登录账号</span>
        </div>
        <div v-else class="profile">
          <span class="profile__name">{{ currentUser }}</span>
          <div class="icon-btn-wrapper">
            <button class="icon-btn" @click="logout">↪</button>
            <span class="icon-btn-tooltip">退出登录</span>
          </div>
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
          <div class="form-compact">
            <!-- 第一行：链接 -->
            <div class="form-row">
              <label class="field field--url">
                <span>链接 *</span>
                <input v-model="form.url" type="url" placeholder="https://example.com" required />
              </label>
            </div>
            <!-- 第二行：标题 + 分类 -->
            <div class="form-row form-row--2col">
              <label class="field">
                <span>标题 *</span>
                <input v-model="form.title" type="text" placeholder="网站标题" required />
              </label>
              <label class="field">
                <span>分类</span>
                <input
                  v-model="form.category"
                  type="text"
                  placeholder="选择或输入分类"
                  list="home-category-options"
                />
                <datalist id="home-category-options">
                  <option v-for="name in categorySuggestions" :key="name" :value="name" />
                </datalist>
              </label>
            </div>
            <!-- 第三行：描述 + 标签 -->
            <div class="form-row form-row--2col">
              <label class="field">
                <span>描述</span>
                <input v-model="form.description" type="text" placeholder="简短描述（可选）" />
              </label>
              <div class="field">
                <span>标签</span>
                <div class="tags-input">
                  <span
                    v-for="(tag, index) in form.tags"
                    :key="index"
                    class="tags-input__tag"
                  >
                    {{ tag }}
                    <button type="button" class="tags-input__remove" @click="removeTag(index)">×</button>
                  </span>
                  <input
                    type="text"
                    placeholder="回车添加"
                    @keydown.enter.prevent="addTag"
                    class="tags-input__input"
                  />
                </div>
              </div>
            </div>
            <!-- 第四行：可见性 + AI按钮 + 操作按钮 -->
            <div class="form-row form-row--footer">
              <div class="footer-left">
                <label class="toggle-field">
                  <input v-model="form.visible" type="checkbox" class="toggle-checkbox" />
                  <span class="toggle-label">{{ form.visible ? '显示' : '隐藏' }}</span>
                </label>
                <div class="ai-btn-group">
                  <div class="ai-btn-wrapper">
                    <button
                      type="button"
                      class="ai-btn ai-btn--fetch"
                      :disabled="!form.url.trim() || fetchingTitle"
                      @click="fetchTitle"
                    >
                      <span v-if="fetchingTitle" class="spinner-sm"></span>
                      <span v-else>🔗</span>
                    </button>
                    <span class="ai-btn-tooltip">从网页获取标题</span>
                  </div>
                  <div class="ai-btn-wrapper">
                    <button
                      type="button"
                      class="ai-btn ai-btn--ai"
                      :disabled="!form.url.trim() || aiGenerating"
                      @click="aiGenerate"
                    >
                      <span v-if="aiGenerating" class="spinner-sm"></span>
                      <span v-else>✨</span>
                    </button>
                    <span class="ai-btn-tooltip">AI 智能生成标签</span>
                  </div>
                </div>
              </div>
              <div class="form-buttons">
                <button
                  v-if="editingId"
                  class="button button--ghost"
                  type="button"
                  @click="resetForm"
                  :disabled="saving"
                >
                  取消
                </button>
                <button class="button button--primary" type="submit" :disabled="saving">
                  {{ saving ? '保存中...' : editingId ? '保存' : '添加' }}
                </button>
              </div>
            </div>
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
                  <div v-if="canEdit" class="card-btn-wrapper">
                    <span
                      class="card__drag-handle"
                      @click.stop
                    >
                      ⠿
                    </span>
                    <span class="card-btn-tooltip">拖动排序</span>
                  </div>
                  <div v-if="canEdit" class="card-btn-wrapper">
                    <button
                      class="card__action-button"
                      type="button"
                      @click.stop="startEdit(bookmark)"
                    >
                      ✎
                    </button>
                    <span class="card-btn-tooltip">编辑书签</span>
                  </div>
                  <div v-if="canEdit" class="card-btn-wrapper">
                    <button
                      class="card__action-button"
                      type="button"
                      @click.stop="toggleVisibility(bookmark)"
                    >
                      {{ bookmark.visible === false ? '👁' : '🙈' }}
                    </button>
                    <span class="card-btn-tooltip">{{ bookmark.visible === false ? '设为可见' : '设为隐藏' }}</span>
                  </div>
                  <div v-if="canEdit" class="card-btn-wrapper">
                    <button
                      class="card__action-button"
                      type="button"
                      @click.stop="removeBookmark(bookmark.id)"
                    >
                      ×
                    </button>
                    <span class="card-btn-tooltip">删除书签</span>
                  </div>
                </div>
              </header>
              <p v-if="bookmark.description" class="card__description">{{ bookmark.description }}</p>
              <div v-if="parseTags(bookmark.tags).length > 0" class="card__tags">
                <span
                  v-for="tag in parseTags(bookmark.tags).slice(0, 3)"
                  :key="tag"
                  class="card__tag"
                >
                  {{ tag }}
                </span>
                <span v-if="parseTags(bookmark.tags).length > 3" class="card__tag card__tag--more">
                  +{{ parseTags(bookmark.tags).length - 3 }}
                </span>
              </div>
              <p class="card__url">{{ bookmark.url }}</p>
              <!-- 悬停详情提示 -->
              <div class="card__tooltip">
                <div class="card__tooltip-title">{{ bookmark.title }}</div>
                <div v-if="bookmark.description" class="card__tooltip-desc">{{ bookmark.description }}</div>
                <div v-if="parseTags(bookmark.tags).length > 0" class="card__tooltip-tags">
                  <span v-for="tag in parseTags(bookmark.tags)" :key="tag" class="card__tooltip-tag">{{ tag }}</span>
                </div>
                <div class="card__tooltip-url">{{ bookmark.url }}</div>
              </div>
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
                <div v-if="canEdit" class="card-btn-wrapper">
                  <span
                    class="card__drag-handle"
                    @click.stop
                  >
                    ⠿
                  </span>
                  <span class="card-btn-tooltip">拖动排序</span>
                </div>
                <div v-if="canEdit" class="card-btn-wrapper">
                  <button
                    class="card__action-button"
                    type="button"
                    @click.stop="startEdit(bookmark)"
                  >
                    ✎
                  </button>
                  <span class="card-btn-tooltip">编辑书签</span>
                </div>
                <div v-if="canEdit" class="card-btn-wrapper">
                  <button
                    class="card__action-button"
                    type="button"
                    @click.stop="toggleVisibility(bookmark)"
                  >
                    {{ bookmark.visible === false ? '👁' : '🙈' }}
                  </button>
                  <span class="card-btn-tooltip">{{ bookmark.visible === false ? '设为可见' : '设为隐藏' }}</span>
                </div>
                <div v-if="canEdit" class="card-btn-wrapper">
                  <button
                    class="card__action-button"
                    type="button"
                    @click.stop="removeBookmark(bookmark.id)"
                  >
                    ×
                  </button>
                  <span class="card-btn-tooltip">删除书签</span>
                </div>
              </div>
            </header>
            <p v-if="bookmark.description" class="card__description">{{ bookmark.description }}</p>
            <div v-if="parseTags(bookmark.tags).length > 0" class="card__tags">
              <span
                v-for="tag in parseTags(bookmark.tags).slice(0, 3)"
                :key="tag"
                class="card__tag"
              >
                {{ tag }}
              </span>
              <span v-if="parseTags(bookmark.tags).length > 3" class="card__tag card__tag--more">
                +{{ parseTags(bookmark.tags).length - 3 }}
              </span>
            </div>
            <p class="card__url">{{ bookmark.url }}</p>
            <!-- 悬停详情提示 -->
            <div class="card__tooltip">
              <div class="card__tooltip-title">{{ bookmark.title }}</div>
              <div v-if="bookmark.description" class="card__tooltip-desc">{{ bookmark.description }}</div>
              <div v-if="parseTags(bookmark.tags).length > 0" class="card__tooltip-tags">
                <span v-for="tag in parseTags(bookmark.tags)" :key="tag" class="card__tooltip-tag">{{ tag }}</span>
              </div>
              <div class="card__tooltip-url">{{ bookmark.url }}</div>
            </div>
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
  /* 灰色金属质感配色 */
  --bg-gradient-start: #f8f9fa;
  --bg-gradient-end: #e9ecef;
  --text-primary: #212529;
  --text-secondary: #495057;
  --text-muted: #868e96;
  --surface-glass: rgba(255, 255, 255, 0.85);
  --surface-strong: rgba(255, 255, 255, 0.95);
  --surface-soft: rgba(248, 249, 250, 0.9);
  --surface-card: rgba(255, 255, 255, 0.92);
  --surface-border: rgba(134, 142, 150, 0.18);
  --surface-shadow: rgba(0, 0, 0, 0.06);
  --shadow-strong: rgba(0, 0, 0, 0.12);
  --search-bg: rgba(233, 236, 239, 0.8);
  --accent-start: #495057;
  --accent-end: #6c757d;
  --accent-text: #495057;
  --accent-shadow: rgba(73, 80, 87, 0.2);
  --ghost-bg: rgba(248, 249, 250, 0.9);
  --ghost-border: rgba(134, 142, 150, 0.25);
  --ghost-text: #495057;
  --danger-bg: rgba(220, 53, 69, 0.1);
  --danger-border: rgba(220, 53, 69, 0.2);
  --danger-text: #dc3545;
  --tag-bg: rgba(134, 142, 150, 0.15);
  --tag-text: #495057;
  --badge-bg: rgba(134, 142, 150, 0.18);
  --badge-text: #495057;
  --tab-bg: rgba(255, 255, 255, 0.9);
  --tab-text: #495057;
  --tab-active-bg-start: #343a40;
  --tab-active-bg-end: #495057;
  --tab-active-text: #ffffff;
  --tab-badge-bg: rgba(255, 255, 255, 0.25);
  --alert-error-bg: rgba(220, 53, 69, 0.1);
  --alert-error-text: #dc3545;
  --overlay-bg: rgba(33, 37, 41, 0.5);
  --dialog-bg: #ffffff;
  --input-bg: rgba(248, 249, 250, 0.95);
  --input-border: rgba(134, 142, 150, 0.2);
  --input-border-focus: rgba(73, 80, 87, 0.4);
  --input-shadow-focus: rgba(73, 80, 87, 0.12);
  /* 金属质感 */
  --metal-gradient: linear-gradient(145deg, #f8f9fa 0%, #e9ecef 50%, #dee2e6 100%);
  --metal-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8);
  --metal-border: rgba(134, 142, 150, 0.3);
}

:global(:root[data-theme='dark']) {
  /* 深色金属质感配色 */
  --bg-gradient-start: #1a1d21;
  --bg-gradient-end: #212529;
  --text-primary: #f8f9fa;
  --text-secondary: #ced4da;
  --text-muted: #868e96;
  --surface-glass: rgba(33, 37, 41, 0.9);
  --surface-strong: rgba(43, 48, 53, 0.95);
  --surface-soft: rgba(33, 37, 41, 0.85);
  --surface-card: rgba(43, 48, 53, 0.9);
  --surface-border: rgba(134, 142, 150, 0.25);
  --surface-shadow: rgba(0, 0, 0, 0.3);
  --shadow-strong: rgba(0, 0, 0, 0.4);
  --search-bg: rgba(43, 48, 53, 0.8);
  --accent-start: #adb5bd;
  --accent-end: #ced4da;
  --accent-text: #ced4da;
  --accent-shadow: rgba(173, 181, 189, 0.2);
  --ghost-bg: rgba(43, 48, 53, 0.8);
  --ghost-border: rgba(134, 142, 150, 0.35);
  --ghost-text: #ced4da;
  --danger-bg: rgba(220, 53, 69, 0.15);
  --danger-border: rgba(220, 53, 69, 0.3);
  --danger-text: #f8d7da;
  --tag-bg: rgba(134, 142, 150, 0.25);
  --tag-text: #ced4da;
  --badge-bg: rgba(134, 142, 150, 0.25);
  --badge-text: #ced4da;
  --tab-bg: rgba(43, 48, 53, 0.85);
  --tab-text: #ced4da;
  --tab-active-bg-start: #495057;
  --tab-active-bg-end: #6c757d;
  --tab-active-text: #ffffff;
  --tab-badge-bg: rgba(0, 0, 0, 0.3);
  --alert-error-bg: rgba(220, 53, 69, 0.2);
  --alert-error-text: #f8d7da;
  --overlay-bg: rgba(0, 0, 0, 0.6);
  --dialog-bg: #2b3035;
  --input-bg: rgba(43, 48, 53, 0.9);
  --input-border: rgba(134, 142, 150, 0.3);
  --input-border-focus: rgba(173, 181, 189, 0.5);
  --input-shadow-focus: rgba(173, 181, 189, 0.15);
  --metal-gradient: linear-gradient(145deg, #343a40 0%, #2b3035 50%, #212529 100%);
  --metal-shadow: 0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  --metal-border: rgba(134, 142, 150, 0.4);
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
  padding: 16px 32px;
  background: var(--surface-glass);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--surface-border);
  box-shadow: 0 2px 12px var(--surface-shadow);
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
  gap: 10px;
  background: var(--search-bg);
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  padding: 8px 14px;
  flex: 1;
  max-width: 360px;
  transition: all 0.2s ease;
}

.brand__search:focus-within {
  border-color: var(--metal-border);
  box-shadow: 0 0 0 3px var(--input-shadow-focus);
}

.brand__search .search-input__icon {
  font-size: 16px;
  opacity: 0.6;
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
  gap: 8px;
}

/* 图标按钮 - 金属质感 */
.icon-btn {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 1px solid var(--metal-border);
  background: var(--metal-gradient);
  box-shadow: var(--metal-shadow);
  color: var(--text-secondary);
  font-size: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.icon-btn:hover:not(:disabled) {
  background: var(--surface-strong);
  box-shadow: 0 4px 12px var(--surface-shadow);
  transform: translateY(-1px);
}

.icon-btn:active {
  transform: translateY(0);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
}

.icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.icon-btn--active {
  background: linear-gradient(145deg, var(--accent-start), var(--accent-end));
  color: #fff;
  border-color: var(--accent-start);
}

.icon-btn--accent {
  background: linear-gradient(145deg, #343a40, #495057);
  color: #fff;
  border-color: #343a40;
  font-size: 22px;
  font-weight: 300;
}

.icon-btn--accent:hover:not(:disabled) {
  background: linear-gradient(145deg, #495057, #6c757d);
}

/* 按钮工具提示 */
.icon-btn-wrapper {
  position: relative;
}

.icon-btn-tooltip {
  position: absolute;
  bottom: -36px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(52, 58, 64, 0.95);
  color: #fff;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  transition: all 0.2s ease;
  pointer-events: none;
  z-index: 100;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.icon-btn-tooltip::before {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-bottom-color: rgba(52, 58, 64, 0.95);
}

.icon-btn-wrapper:hover .icon-btn-tooltip {
  opacity: 1;
  visibility: visible;
  bottom: -40px;
}

.profile {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text-secondary);
}

.profile__name {
  font-weight: 600;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  gap: 8px;
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--surface-border);
  background: var(--surface-soft);
  color: var(--text-secondary);
  font-weight: 500;
  font-size: 13px;
  transition: all 0.2s ease;
  cursor: pointer;
  box-shadow: 0 2px 4px var(--surface-shadow);
}

.tab:hover {
  background: var(--surface-strong);
  border-color: var(--metal-border);
}

.tab--active {
  background: linear-gradient(145deg, #343a40, #495057);
  color: #fff;
  border-color: #343a40;
  box-shadow: 0 4px 12px rgba(52, 58, 64, 0.25);
}

.tab__badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.2);
}

.form-card {
  background: var(--surface-strong);
  border-radius: 8px;
  padding: 16px 20px;
  border: 1px solid var(--metal-border);
  box-shadow: var(--metal-shadow);
}

.form-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--surface-border);
}

.form-card__header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.spinner-sm {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.form-compact {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-row {
  display: flex;
  gap: 12px;
}

.form-row--2col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.form-row--footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 12px;
  border-top: 1px solid var(--surface-border);
  margin-top: 4px;
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.ai-btn-group {
  display: flex;
  gap: 6px;
}

.ai-btn-wrapper {
  position: relative;
}

.ai-btn {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  border: 1px solid var(--metal-border);
  background: var(--metal-gradient);
  box-shadow: var(--metal-shadow);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  font-size: 13px;
}

.ai-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.ai-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ai-btn--fetch {
  background: linear-gradient(145deg, #495057, #6c757d);
  border-color: #495057;
}

.ai-btn--fetch:hover:not(:disabled) {
  background: linear-gradient(145deg, #6c757d, #868e96);
}

.ai-btn--ai {
  background: linear-gradient(145deg, #343a40, #495057);
  border-color: #343a40;
}

.ai-btn--ai:hover:not(:disabled) {
  background: linear-gradient(145deg, #495057, #6c757d);
}

.ai-btn-tooltip {
  position: absolute;
  bottom: -32px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(52, 58, 64, 0.95);
  color: #fff;
  padding: 5px 8px;
  border-radius: 4px;
  font-size: 11px;
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  transition: all 0.2s ease;
  pointer-events: none;
  z-index: 100;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.ai-btn-tooltip::before {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 4px solid transparent;
  border-bottom-color: rgba(52, 58, 64, 0.95);
}

.ai-btn-wrapper:hover .ai-btn-tooltip {
  opacity: 1;
  visibility: visible;
  bottom: -36px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  flex: 1;
}

.field > span {
  font-weight: 600;
  color: var(--text-secondary);
  font-size: 12px;
}

.field--url {
  flex: 1;
}

.field input,
.field textarea {
  border: 1px solid var(--input-border);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 13px;
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
  box-shadow: 0 0 0 2px var(--input-shadow-focus);
}

.toggle-field {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.toggle-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.toggle-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.form-buttons {
  display: flex;
  gap: 8px;
}

.tags-input {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 10px;
  border: 1px solid var(--input-border);
  border-radius: 6px;
  background: var(--input-bg);
  min-height: 34px;
  align-items: center;
}

.tags-input:focus-within {
  border-color: var(--input-border-focus);
  box-shadow: 0 0 0 2px var(--input-shadow-focus);
}

.tags-input__tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: var(--surface-soft);
  color: var(--text-secondary);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 500;
  border: 1px solid var(--surface-border);
}

.tags-input__remove {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.tags-input__remove:hover {
  color: var(--danger-text);
}

.tags-input__input {
  flex: 1;
  min-width: 80px;
  border: none;
  background: transparent;
  font-size: 13px;
  outline: none;
  padding: 2px 0;
  color: var(--text-primary);
}

.button {
  border: 1px solid var(--metal-border);
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--text-primary);
  background: var(--metal-gradient);
  box-shadow: var(--metal-shadow);
}

.button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.button:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px var(--surface-shadow);
}

.button--primary {
  background: linear-gradient(145deg, #343a40, #495057);
  color: #fff;
  border-color: #343a40;
  box-shadow: 0 4px 12px rgba(52, 58, 64, 0.3);
}

.button--primary:hover:not(:disabled) {
  background: linear-gradient(145deg, #495057, #6c757d);
}

.button--ghost {
  background: var(--surface-soft);
  color: var(--text-secondary);
  border: 1px solid var(--surface-border);
}

.button--ghost-alt {
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--surface-border);
}

.button--danger {
  background: var(--danger-bg);
  color: var(--danger-text);
  border: 1px solid var(--danger-border);
}

.alert {
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
}

.alert--error {
  background: var(--alert-error-bg);
  color: var(--alert-error-text);
  border: 1px solid var(--danger-border);
}

.alert--success {
  background: rgba(206, 212, 218, 0.3);
  color: var(--text-secondary);
  border: 1px solid var(--surface-border);
}

.empty {
  text-align: center;
  color: var(--text-muted);
  background: var(--surface-soft);
  border-radius: 12px;
  padding: 40px 20px;
  font-size: 15px;
  border: 1px solid var(--surface-border);
}

.category-group {
  background: var(--surface-glass);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid var(--surface-border);
  box-shadow: 0 4px 16px var(--surface-shadow);
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
  background: var(--surface-soft);
  color: var(--text-secondary);
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid var(--surface-border);
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
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid var(--surface-border);
  box-shadow: 0 2px 8px var(--surface-shadow);
  transition: all 0.2s ease;
  cursor: pointer;
  position: relative;
  height: 100%;
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px var(--shadow-strong);
  border-color: var(--metal-border);
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
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid var(--metal-border);
  background: var(--metal-gradient);
  box-shadow: var(--metal-shadow);
  color: var(--text-muted);
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.card__action-button:hover {
  background: var(--surface-strong);
  color: var(--text-primary);
  transform: translateY(-1px);
}

/* 卡片按钮提示 */
.card-btn-wrapper {
  position: relative;
  display: inline-flex;
}

.card-btn-tooltip {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(52, 58, 64, 0.95);
  color: #fff;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  transition: all 0.2s ease;
  pointer-events: none;
  z-index: 100;
  margin-top: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.card-btn-tooltip::before {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 4px solid transparent;
  border-bottom-color: rgba(52, 58, 64, 0.95);
}

.card-btn-wrapper:hover .card-btn-tooltip {
  opacity: 1;
  visibility: visible;
  margin-top: 6px;
}

.card--hidden {
  opacity: 0.65;
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.25);
}

.card__time {
  white-space: nowrap;
}

.hidden-chip {
  background: var(--surface-soft);
  color: var(--text-muted);
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  border: 1px solid var(--surface-border);
}

.overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-bg);
  display: grid;
  place-items: center;
  z-index: 100;
  padding: 16px;
  backdrop-filter: blur(4px);
}

.dialog {
  background: var(--dialog-bg);
  border-radius: 12px;
  width: min(380px, 100%);
  padding: 24px;
  border: 1px solid var(--surface-border);
  box-shadow: 0 16px 48px var(--shadow-strong);
  display: flex;
  flex-direction: column;
  gap: 16px;
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

/* 标签样式 */
.card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}

.card__tag {
  background: var(--tag-bg);
  color: var(--tag-text);
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  border: 1px solid var(--metal-border);
}

.card__tag--more {
  background: var(--accent-shadow);
  color: var(--accent-text);
  border-color: var(--accent-text);
}

/* 悬停提示样式 */
.card__tooltip {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%) translateY(-8px);
  background: var(--dialog-bg);
  border: 1px solid var(--metal-border);
  border-radius: 8px;
  padding: 14px 16px;
  min-width: 280px;
  max-width: 360px;
  box-shadow: var(--metal-shadow), 0 12px 40px var(--shadow-strong);
  z-index: 50;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.2s ease, visibility 0.2s ease, transform 0.2s ease;
  pointer-events: none;
}

.card:hover .card__tooltip {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(-12px);
}

.card__tooltip-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
  line-height: 1.4;
}

.card__tooltip-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 10px;
}

.card__tooltip-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.card__tooltip-tag {
  background: var(--tag-bg);
  color: var(--tag-text);
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid var(--metal-border);
}

.card__tooltip-url {
  font-size: 12px;
  color: var(--accent-text);
  word-break: break-all;
  line-height: 1.4;
}

/* 提示框箭头 */
.card__tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 8px solid transparent;
  border-top-color: var(--dialog-bg);
}

.card__tooltip::before {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 9px solid transparent;
  border-top-color: var(--metal-border);
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

  /* 移动端隐藏悬停提示 */
  .card__tooltip {
    display: none;
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

  .form-row--2col {
    grid-template-columns: 1fr;
  }

  .form-row--footer {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }

  .footer-left {
    justify-content: space-between;
  }

  .ai-btn-tooltip,
  .icon-btn-tooltip,
  .card-btn-tooltip {
    display: none;
  }

  .form-buttons {
    display: flex;
    gap: 8px;
  }

  .form-buttons .button {
    flex: 1;
  }

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
