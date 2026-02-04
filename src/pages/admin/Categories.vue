<template>
  <div class="categories-page">
    <h2 class="page-title">分类管理</h2>
    <p class="page-desc">拖动分类调整展示顺序，自动保存</p>

    <!-- 添加分类 -->
    <div class="add-category-form">
      <el-input
        v-model="newCategoryName"
        placeholder="输入新分类名称"
        :disabled="addingCategory"
        @keyup.enter="addCategory"
        style="width: 300px;"
      />
      <el-button
        type="primary"
        :loading="addingCategory"
        :disabled="!newCategoryName.trim()"
        @click="addCategory"
      >
        添加分类
      </el-button>
    </div>

    <div v-if="categoryOrderDraft.length" class="category-list" ref="categoryListRef">
      <div
        v-for="(key, index) in categoryOrderDraft"
        :key="key || '__default__'"
        class="category-item"
        :data-key="key"
      >
        <span class="drag-handle" title="拖动排序">⠿</span>
        <span class="category-index">{{ index + 1 }}</span>
        <span class="category-label">{{ categoryLabelFromKey(key) }}</span>
        <div class="category-actions">
          <el-button
            v-if="key && !hasBookmarks(key)"
            link
            type="danger"
            size="small"
            :disabled="categoryOrderSaving"
            @click="removeCategory(key)"
          >
            删除
          </el-button>
          <el-tag v-if="key && hasBookmarks(key)" size="small" type="info">
            {{ getBookmarkCount(key) }} 个书签
          </el-tag>
        </div>
      </div>
    </div>
    <el-empty v-else description="当前暂无分类" />

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
import { computed, onMounted, onUnmounted, ref, nextTick } from 'vue';
import { ElMessage } from 'element-plus';
import Sortable from 'sortablejs';

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
const newCategoryName = ref('');
const addingCategory = ref(false);
const categoryOrderSaving = ref(false);
const categoryOrderMessage = ref('');
const categoryOrderError = ref('');

const categoryListRef = ref<HTMLElement | null>(null);
let sortableInstance: Sortable | null = null;

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

async function saveCategoryOrder() {
  if (!authToken.value) {
    ElMessage.warning('请先登录');
    return;
  }
  categoryOrderSaving.value = true;
  categoryOrderMessage.value = '';
  categoryOrderError.value = '';
  try {
    const response = await requestWithAuth(`${apiBase}/api/bookmarks/reorder-categories`, {
      method: 'POST',
      body: JSON.stringify({ categories: categoryOrderDraft.value })
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || '保存分类顺序失败');
    }
    // 更新本地状态
    categoryOrder.value = [...categoryOrderDraft.value];
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

// 判断分类是否有书签
function hasBookmarks(category: string): boolean {
  return bookmarks.value.some(b => (b.category || '') === category);
}

// 获取分类下的书签数量
function getBookmarkCount(category: string): number {
  return bookmarks.value.filter(b => (b.category || '') === category).length;
}

// 添加新分类
async function addCategory() {
  const name = newCategoryName.value.trim();
  if (!name) {
    ElMessage.warning('请输入分类名称');
    return;
  }
  if (categoryOrderDraft.value.includes(name)) {
    ElMessage.warning('分类已存在');
    return;
  }
  addingCategory.value = true;
  try {
    const response = await requestWithAuth(`${apiBase}/api/bookmarks/categories`, {
      method: 'POST',
      body: JSON.stringify({ category: name })
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || '添加分类失败');
    }
    // 添加到本地列表
    categoryOrderDraft.value.push(name);
    categoryOrder.value.push(name);
    newCategoryName.value = '';
    ElMessage.success('分类已添加');
    // 重新初始化拖拽
    initSortable();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '添加分类失败');
  } finally {
    addingCategory.value = false;
  }
}

// 删除分类
async function removeCategory(category: string) {
  if (hasBookmarks(category)) {
    ElMessage.warning('该分类下还有书签，无法删除');
    return;
  }
  try {
    const response = await requestWithAuth(`${apiBase}/api/bookmarks/categories/${encodeURIComponent(category)}`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || '删除分类失败');
    }
    // 从本地列表移除
    categoryOrderDraft.value = categoryOrderDraft.value.filter(k => k !== category);
    categoryOrder.value = categoryOrder.value.filter(k => k !== category);
    ElMessage.success('分类已删除');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除分类失败');
  }
}

function initSortable() {
  if (sortableInstance) {
    sortableInstance.destroy();
    sortableInstance = null;
  }

  nextTick(() => {
    if (!categoryListRef.value) return;

    sortableInstance = Sortable.create(categoryListRef.value, {
      animation: 150,
      handle: '.drag-handle',
      ghostClass: 'sortable-ghost',
      draggable: '.category-item',
      onEnd: async (evt) => {
        const { oldIndex, newIndex } = evt;
        if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) {
          return;
        }

        const list = [...categoryOrderDraft.value];
        const [item] = list.splice(oldIndex, 1);
        list.splice(newIndex, 0, item);
        categoryOrderDraft.value = list;

        await saveCategoryOrder();
      }
    });
  });
}

onMounted(() => {
  if (authToken.value) {
    loadBookmarks().then(() => {
      initSortable();
    });
  }
});

onUnmounted(() => {
  if (sortableInstance) {
    sortableInstance.destroy();
    sortableInstance = null;
  }
});
</script>

<style scoped>
.categories-page {
  padding: 0;
}

.add-category-form {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
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
  grid-template-columns: 40px 48px 1fr auto;
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

.category-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.drag-handle {
  cursor: grab;
  font-size: 18px;
  color: #9ca3af;
  user-select: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.drag-handle:hover {
  color: #1a73e8;
  background: rgba(26, 115, 232, 0.1);
}

.drag-handle:active {
  cursor: grabbing;
}

.sortable-ghost {
  opacity: 0.4;
  background: #e3f2fd !important;
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

@media (max-width: 768px) {
  .add-category-form {
    flex-direction: column;
  }

  .add-category-form .el-input {
    width: 100% !important;
  }

  .category-item {
    grid-template-columns: 32px 32px 1fr;
    gap: 8px;
    padding: 12px;
  }

  .category-actions {
    grid-column: 1 / -1;
    margin-top: 8px;
  }

  .drag-handle {
    font-size: 16px;
  }

  .category-index {
    font-size: 14px;
  }

  .category-label {
    font-size: 14px;
  }
}
</style>
