<template>
  <div class="categories-page">
    <h2 class="page-title">分类管理</h2>
    <p class="page-desc">拖动分类行或使用按钮调整展示顺序，点击保存后生效</p>

    <div v-if="categoryOrderDraft.length" class="category-list">
      <div
        v-for="(key, index) in categoryOrderDraft"
        :key="key || '__default__'"
        class="category-item"
      >
        <span class="category-index">{{ index + 1 }}</span>
        <span class="category-label">{{ categoryLabelFromKey(key) }}</span>
        <div class="category-actions">
          <el-button
            link
            type="primary"
            size="small"
            :disabled="index === 0 || categoryOrderSaving"
            @click="moveCategory(key, -1)"
          >
            上移
          </el-button>
          <el-button
            link
            type="primary"
            size="small"
            :disabled="index === categoryOrderDraft.length - 1 || categoryOrderSaving"
            @click="moveCategory(key, 1)"
          >
            下移
          </el-button>
        </div>
      </div>
    </div>
    <el-empty v-else description="当前暂无分类" />

    <div class="category-actions-footer">
      <el-button
        type="primary"
        :disabled="categoryOrderSaving || !categoryOrderDirty"
        :loading="categoryOrderSaving"
        @click="saveCategoryOrder"
      >
        保存分类顺序
      </el-button>
      <el-button
        :disabled="categoryOrderSaving || !categoryOrderDirty"
        @click="resetCategoryOrder"
      >
        取消更改
      </el-button>
    </div>

    <el-alert
      v-if="categoryOrderError"
      :title="categoryOrderError"
      type="error"
      :closable="false"
      show-icon
      style="margin-top: 16px;"
    />
    <el-alert
      v-else-if="categoryOrderMessage"
      :title="categoryOrderMessage"
      type="success"
      :closable="false"
      show-icon
      style="margin-top: 16px;"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

type Bookmark = {
  id: string;
  title: string;
  url: string;
  category?: string;
  description?: string;
  visible?: boolean;
};

function categoryKeyFromBookmark(bookmark: Bookmark): string {
  return bookmark.category?.trim() ?? '';
}

function categoryLabelFromKey(key: string): string {
  return key || '默认分类';
}

const apiBaseRaw =
  (typeof window !== 'undefined'
    ? (window as { __APP_API_BASE_URL__?: string }).__APP_API_BASE_URL__
    : '') ?? '';
const apiBase = apiBaseRaw.replace(/\/$/, '');
const bookmarksEndpoint = `${apiBase}/api/bookmarks`;

const bookmarks = ref<Bookmark[]>([]);
const categoryOrder = ref<string[]>([]);
const categoryOrderDraft = ref<string[]>([]);
const categoryOrderSaving = ref(false);
const categoryOrderMessage = ref('');
const categoryOrderError = ref('');

const categoryOrderDirty = computed(() => {
  if (categoryOrderDraft.value.length !== categoryOrder.value.length) {
    return true;
  }
  return categoryOrderDraft.value.some((key, index) => key !== categoryOrder.value[index]);
});

const storedToken = typeof window !== 'undefined' ? window.localStorage.getItem('bookmark_token') : null;
const authToken = ref<string | null>(storedToken);

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
    throw new Error('登录状态已失效，请重新登录');
  }
  return response;
}

function deriveCategoryOrder(list: Bookmark[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  list.forEach((bookmark) => {
    const key = categoryKeyFromBookmark(bookmark);
    if (!seen.has(key)) {
      seen.add(key);
      order.push(key);
    }
  });
  return order;
}

function syncCategoryOrderFromBookmarks(list: Bookmark[], preserveDraft = false) {
  const order = deriveCategoryOrder(list);
  categoryOrder.value = order;
  if (preserveDraft && categoryOrderDraft.value.length) {
    const filtered = categoryOrderDraft.value.filter((key) => order.includes(key));
    order.forEach((key) => {
      if (!filtered.includes(key)) {
        filtered.push(key);
      }
    });
    categoryOrderDraft.value = filtered;
  } else {
    categoryOrderDraft.value = [...order];
  }
}

async function loadBookmarks() {
  try {
    const response = await requestWithAuth(bookmarksEndpoint, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`加载失败：${response.status}`);
    }
    const data = (await response.json()) as Bookmark[];
    bookmarks.value = data;
    syncCategoryOrderFromBookmarks(data);
  } catch (err) {
    console.error('加载书签失败:', err);
  }
}

function moveCategory(key: string, direction: number) {
  const list = [...categoryOrderDraft.value];
  const currentIndex = list.indexOf(key);
  const targetIndex = currentIndex + direction;
  if (currentIndex === -1 || targetIndex < 0 || targetIndex >= list.length) {
    return;
  }
  list.splice(currentIndex, 1);
  list.splice(targetIndex, 0, key);
  categoryOrderDraft.value = list;
  categoryOrderMessage.value = '';
  categoryOrderError.value = '';
}

function resetCategoryOrder() {
  categoryOrderDraft.value = [...categoryOrder.value];
  categoryOrderMessage.value = '';
  categoryOrderError.value = '';
}

async function saveCategoryOrder() {
  if (!authToken.value) {
    ElMessage.warning('请先登录');
    return;
  }
  if (!categoryOrderDirty.value) {
    categoryOrderMessage.value = '分类顺序未发生变化';
    categoryOrderError.value = '';
    return;
  }
  categoryOrderSaving.value = true;
  categoryOrderMessage.value = '';
  categoryOrderError.value = '';
  try {
    const response = await requestWithAuth(`${apiBase}/api/bookmarks/reorder-categories`, {
      method: 'POST',
      body: JSON.stringify({ order: categoryOrderDraft.value })
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || '保存分类顺序失败');
    }
    const updated = (await response.json()) as Bookmark[];
    bookmarks.value = updated;
    syncCategoryOrderFromBookmarks(updated);
    categoryOrderMessage.value = '分类顺序已保存';
    ElMessage.success('分类顺序已保存');
  } catch (error) {
    categoryOrderError.value =
      error instanceof Error ? error.message : '保存分类顺序失败';
    ElMessage.error(categoryOrderError.value);
  } finally {
    categoryOrderSaving.value = false;
  }
}

onMounted(() => {
  if (authToken.value) {
    loadBookmarks();
  }
});
</script>

<style scoped>
.categories-page {
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

.category-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.category-item {
  display: grid;
  grid-template-columns: 48px 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: 12px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  transition: all 0.3s;
}

.category-item:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
}

.category-index {
  font-weight: 600;
  color: #1a73e8;
  font-size: 16px;
}

.category-label {
  font-weight: 600;
  color: #1f2933;
  font-size: 15px;
}

.category-actions {
  display: flex;
  gap: 8px;
}

.category-actions-footer {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}
</style>

