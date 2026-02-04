<template>
  <div class="bookmarks-page">
    <div class="page-header">
      <h2 class="page-title">书签管理</h2>
      <div class="page-actions">
        <el-input
          v-model="search"
          placeholder="搜索标题、链接或分类..."
          style="width: 300px; margin-right: 12px;"
          clearable
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button type="primary" @click="openCreate" :disabled="!isAuthenticated">
          <el-icon><Plus /></el-icon>新建书签
        </el-button>
      </div>
    </div>

    <el-alert
      v-if="error"
      :title="error"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 16px;"
    />

    <!-- 桌面端表格 -->
    <el-table
      ref="tableRef"
      v-loading="loading"
      :data="filteredBookmarks"
      style="width: 100%"
      empty-text="暂无书签或未匹配到搜索结果"
      class="desktop-table"
      row-key="id"
    >
      <el-table-column width="50" align="center">
        <template #header>
          <el-icon><Rank /></el-icon>
        </template>
        <template #default>
          <span class="drag-handle" title="拖动排序">⠿</span>
        </template>
      </el-table-column>
      <el-table-column prop="title" label="标题" min-width="200">
        <template #default="{ row }">
          <div class="table-title">{{ row.title }}</div>
          <div v-if="row.description" class="table-desc">{{ row.description }}</div>
        </template>
      </el-table-column>
      <el-table-column prop="category" label="分类" width="120">
        <template #default="{ row }">
          {{ normalizeCategory(row) }}
        </template>
      </el-table-column>
      <el-table-column prop="url" label="链接" min-width="250">
        <template #default="{ row }">
          <a :href="row.url" target="_blank" rel="noreferrer" class="link-text">{{ row.url }}</a>
        </template>
      </el-table-column>
      <el-table-column prop="visible" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.visible === false ? 'info' : 'success'">
            {{ row.visible === false ? '隐藏' : '可见' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row, $index }">
          <el-button
            link
            type="primary"
            size="small"
            :disabled="orderSaving || $index === 0"
            @click="moveBookmark(row, -1)"
          >
            上移
          </el-button>
          <el-button
            link
            type="primary"
            size="small"
            :disabled="orderSaving || $index === filteredBookmarks.length - 1"
            @click="moveBookmark(row, 1)"
          >
            下移
          </el-button>
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-button
            link
            type="primary"
            size="small"
            @click="toggleVisibility(row)"
          >
            {{ row.visible === false ? '设为可见' : '设为隐藏' }}
          </el-button>
          <el-button link type="danger" size="small" @click="deleteBookmark(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 移动端卡片列表 -->
    <div v-loading="loading" class="mobile-card-list" ref="mobileListRef">
      <div v-if="filteredBookmarks.length === 0" class="empty-state">
        暂无书签或未匹配到搜索结果
      </div>
      <div
        v-for="(row, index) in filteredBookmarks"
        :key="row.id"
        class="bookmark-card"
        :data-id="row.id"
      >
        <div class="card-header">
          <div class="card-title-section">
            <span class="drag-handle mobile-drag" title="拖动排序">⠿</span>
            <div class="card-title">{{ row.title }}</div>
            <el-tag :type="row.visible === false ? 'info' : 'success'" class="card-tag">
              {{ row.visible === false ? '隐藏' : '可见' }}
            </el-tag>
          </div>
          <div v-if="row.description" class="card-desc">{{ row.description }}</div>
        </div>
        <div class="card-content">
          <div class="card-info-item">
            <span class="info-label">分类：</span>
            <span class="info-value">{{ normalizeCategory(row) }}</span>
          </div>
          <div class="card-info-item">
            <span class="info-label">链接：</span>
            <a :href="row.url" target="_blank" rel="noreferrer" class="link-text">{{ row.url }}</a>
          </div>
        </div>
        <div class="card-actions">
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-button
            link
            type="primary"
            size="small"
            @click="toggleVisibility(row)"
          >
            {{ row.visible === false ? '可见' : '隐藏' }}
          </el-button>
          <el-button link type="danger" size="small" @click="deleteBookmark(row.id)">删除</el-button>
        </div>
      </div>
    </div>

    <!-- 编辑对话框 -->
    <el-dialog
      v-model="showEditor"
      :title="editorMode === 'create' ? '新增书签' : '编辑书签'"
      :width="isMobile ? '90%' : '600px'"
      @close="closeEditor"
    >
      <el-form :model="editorForm" label-width="80px">
        <el-form-item label="标题" required>
          <el-input v-model="editorForm.title" placeholder="请输入标题" />
        </el-form-item>
        <el-form-item label="链接" required>
          <el-input v-model="editorForm.url" placeholder="请输入链接" />
        </el-form-item>
        <el-form-item label="分类">
          <div style="display: flex; gap: 8px; width: 100%;">
            <el-autocomplete
              v-model="editorForm.category"
              :fetch-suggestions="queryCategorySuggestions"
              placeholder="请输入分类"
              style="flex: 1;"
            />
            <el-button
              type="success"
              :loading="aiClassifying"
              :disabled="!editorForm.url"
              @click="aiClassify"
              title="AI 智能分类"
            >
              <el-icon><MagicStick /></el-icon>
            </el-button>
          </div>
        </el-form-item>
        <el-form-item label="描述">
          <div style="width: 100%;">
            <el-input
              v-model="editorForm.description"
              type="textarea"
              :rows="3"
              placeholder="请输入描述"
            />
            <el-button
              type="success"
              size="small"
              :loading="aiSummarizing"
              :disabled="!editorForm.url"
              @click="aiSummarize"
              style="margin-top: 8px;"
            >
              <el-icon><MagicStick /></el-icon> AI 生成摘要
            </el-button>
          </div>
        </el-form-item>
        <el-form-item label="显示状态">
          <el-switch v-model="editorForm.visible" />
          <span style="margin-left: 8px;">{{ editorForm.visible ? '可见' : '隐藏' }}</span>
        </el-form-item>
      </el-form>
      <el-alert
        v-if="editorError"
        :title="editorError"
        type="error"
        :closable="false"
        show-icon
        style="margin-bottom: 16px;"
      />
      <template #footer>
        <el-button @click="closeEditor" :disabled="editorSaving">取消</el-button>
        <el-button type="primary" @click="submitEditor" :loading="editorSaving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch, onUnmounted, nextTick } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { aiApi, type ClassifyResponse, type SummarizeResponse } from '../../api';
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
const loading = ref(false);
const error = ref<string | null>(null);
const search = ref('');

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

const orderSaving = ref(false);

// AI 功能状态
const aiClassifying = ref(false);
const aiSummarizing = ref(false);

const storedToken = typeof window !== 'undefined' ? window.localStorage.getItem('bookmark_token') : null;
const authToken = ref<string | null>(storedToken);
const isAuthenticated = computed(() => Boolean(authToken.value));

// 移动端检测
const isMobile = ref(false);
function checkMobile() {
  isMobile.value = window.innerWidth <= 768;
}

// 表格引用和拖拽排序
const tableRef = ref<InstanceType<typeof import('element-plus')['ElTable']> | null>(null);
const mobileListRef = ref<HTMLElement | null>(null);
let sortableInstance: Sortable | null = null;
let mobileSortableInstance: Sortable | null = null;

function initSortable() {
  // 销毁旧实例
  if (sortableInstance) {
    sortableInstance.destroy();
    sortableInstance = null;
  }
  if (mobileSortableInstance) {
    mobileSortableInstance.destroy();
    mobileSortableInstance = null;
  }

  nextTick(() => {
    // 桌面端表格排序
    const tableEl = document.querySelector('.desktop-table .el-table__body-wrapper tbody');
    if (tableEl) {
      sortableInstance = Sortable.create(tableEl as HTMLElement, {
        animation: 150,
        handle: '.drag-handle',
        ghostClass: 'sortable-ghost',
        onEnd: async (evt) => {
          const { oldIndex, newIndex } = evt;
          if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) {
            return;
          }

          const list = [...bookmarks.value];
          const [item] = list.splice(oldIndex, 1);
          list.splice(newIndex, 0, item);
          bookmarks.value = list;

          const category = item.category || '';
          const categoryBookmarks = list.filter(b => (b.category || '') === category);
          await persistOrder(categoryBookmarks, category);
        }
      });
    }

    // 移动端卡片排序
    if (mobileListRef.value) {
      mobileSortableInstance = Sortable.create(mobileListRef.value, {
        animation: 150,
        handle: '.mobile-drag',
        ghostClass: 'sortable-ghost',
        draggable: '.bookmark-card',
        onEnd: async (evt) => {
          const { oldIndex, newIndex } = evt;
          if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) {
            return;
          }

          const list = [...bookmarks.value];
          const [item] = list.splice(oldIndex, 1);
          list.splice(newIndex, 0, item);
          bookmarks.value = list;

          const category = item.category || '';
          const categoryBookmarks = list.filter(b => (b.category || '') === category);
          await persistOrder(categoryBookmarks, category);
        }
      });
    }
  });
}

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

function normalizeCategory(bookmark: Bookmark) {
  return categoryLabelFromKey(categoryKeyFromBookmark(bookmark));
}

function queryCategorySuggestions(queryString: string, cb: (suggestions: Array<{ value: string }>) => void) {
  const suggestions = categorySuggestions.value
    .filter((name) => name.toLowerCase().includes(queryString.toLowerCase()))
    .map((name) => ({ value: name }));
  cb(suggestions);
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
    throw new Error('登录状态已失效，请重新登录');
  }
  return response;
}

async function loadBookmarks() {
  loading.value = true;
  error.value = null;
  try {
    const response = await requestWithAuth(bookmarksEndpoint, { method: 'GET' });
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
    ElMessage.success('保存成功');
  } catch (err) {
    editorError.value = err instanceof Error ? err.message : '保存失败';
  } finally {
    editorSaving.value = false;
  }
}

async function deleteBookmark(id: string) {
  try {
    await ElMessageBox.confirm('确定要删除该书签吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    });
    const response = await requestWithAuth(`${bookmarksEndpoint}/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || '删除失败');
    }
    await loadBookmarks();
    ElMessage.success('删除成功');
  } catch (err) {
    if (err !== 'cancel') {
      error.value = err instanceof Error ? err.message : '删除失败';
    }
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
    ElMessage.success('更新成功');
  } catch (err) {
    error.value = err instanceof Error ? err.message : '更新显示状态失败';
  }
}

async function persistOrder(list: Bookmark[], category: string) {
  if (!isAuthenticated.value) {
    return;
  }
  orderSaving.value = true;
  try {
    const response = await requestWithAuth(`${apiBase}/api/bookmarks/reorder`, {
      method: 'POST',
      body: JSON.stringify({ category, bookmark_ids: list.map((item) => item.id) })
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || '保存排序失败');
    }
    ElMessage.success('书签排序已更新');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存排序失败');
  } finally {
    orderSaving.value = false;
  }
}

async function moveBookmark(bookmark: Bookmark, direction: number) {
  if (!isAuthenticated.value) {
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

  // 只重新排序同一分类的书签
  const category = bookmark.category || '';
  const categoryBookmarks = list.filter(b => (b.category || '') === category);
  await persistOrder(categoryBookmarks, category);
}

// AI 智能分类
async function aiClassify() {
  if (!editorForm.url) {
    ElMessage.warning('请先输入链接');
    return;
  }
  aiClassifying.value = true;
  try {
    const result = await aiApi.classify({
      url: editorForm.url,
      title: editorForm.title,
      description: editorForm.description,
    });
    editorForm.category = result.suggested_category;
    ElMessage.success(`AI 推荐分类: ${result.suggested_category} (置信度: ${(result.confidence * 100).toFixed(0)}%)`);
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : 'AI 分类失败');
  } finally {
    aiClassifying.value = false;
  }
}

// AI 生成摘要
async function aiSummarize() {
  if (!editorForm.url) {
    ElMessage.warning('请先输入链接');
    return;
  }
  aiSummarizing.value = true;
  try {
    const result = await aiApi.summarize({
      url: editorForm.url,
    });
    editorForm.description = result.summary;
    if (result.tags && result.tags.length > 0) {
      ElMessage.success(`摘要已生成，标签: ${result.tags.join(', ')}`);
    } else {
      ElMessage.success('摘要已生成');
    }
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : 'AI 生成摘要失败');
  } finally {
    aiSummarizing.value = false;
  }
}

onMounted(() => {
  if (isAuthenticated.value) {
    loadBookmarks().then(() => {
      initSortable();
    });
  }
  checkMobile();
  window.addEventListener('resize', checkMobile);
});

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile);
  if (sortableInstance) {
    sortableInstance.destroy();
    sortableInstance = null;
  }
  if (mobileSortableInstance) {
    mobileSortableInstance.destroy();
    mobileSortableInstance = null;
  }
});
</script>

<style scoped>
.bookmarks-page {
  padding: 0;
}

/* 拖拽排序样式 */
.drag-handle {
  cursor: grab;
  font-size: 18px;
  color: #9ca3af;
  user-select: none;
  display: inline-block;
  padding: 4px 8px;
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

.mobile-drag {
  margin-right: 8px;
  flex-shrink: 0;
}

:deep(.sortable-ghost) {
  opacity: 0.4;
  background: #e3f2fd !important;
}

:deep(.sortable-chosen) {
  background: #f5f5f5;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #1f2933;
}

.page-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.table-title {
  font-weight: 600;
  color: #1f2933;
}

.table-desc {
  margin-top: 4px;
  color: #6b7280;
  font-size: 12px;
}

.link-text {
  color: #1a73e8;
  text-decoration: none;
}

.link-text:hover {
  text-decoration: underline;
}

/* 桌面端表格 */
.desktop-table {
  display: block;
}

/* 移动端卡片列表 */
.mobile-card-list {
  display: none;
}

.bookmark-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  transition: all 0.3s;
}

.bookmark-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.card-header {
  margin-bottom: 12px;
}

.card-title-section {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  gap: 8px;
}

.card-title {
  font-weight: 600;
  color: #1f2933;
  font-size: 16px;
  flex: 1;
  word-break: break-word;
}

.card-tag {
  flex-shrink: 0;
}

.card-desc {
  color: #6b7280;
  font-size: 14px;
  margin-top: 4px;
  line-height: 1.5;
}

.card-content {
  margin-bottom: 12px;
}

.card-info-item {
  display: flex;
  align-items: flex-start;
  margin-bottom: 8px;
  font-size: 14px;
}

.info-label {
  color: #6b7280;
  min-width: 50px;
  flex-shrink: 0;
}

.info-value {
  color: #1f2933;
  word-break: break-all;
}

.card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #6b7280;
  font-size: 14px;
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }

  .page-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .page-actions .el-input {
    width: 100% !important;
    margin-right: 0 !important;
    margin-bottom: 12px;
  }

  .page-actions .el-button {
    width: 100%;
  }

  /* 隐藏桌面端表格 */
  .desktop-table {
    display: none;
  }

  /* 显示移动端卡片列表 */
  .mobile-card-list {
    display: block;
  }

  .card-actions {
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 4px;
  }

  .card-actions .el-button {
    flex-shrink: 0;
    white-space: nowrap;
    font-size: 13px;
    padding: 8px 12px;
  }

  /* 隐藏滚动条但保持滚动功能 */
  .card-actions::-webkit-scrollbar {
    display: none;
  }

  .card-actions {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
}
</style>

