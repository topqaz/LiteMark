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

    <el-table
      v-loading="loading"
      :data="filteredBookmarks"
      style="width: 100%"
      empty-text="暂无书签或未匹配到搜索结果"
    >
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

    <!-- 编辑对话框 -->
    <el-dialog
      v-model="showEditor"
      :title="editorMode === 'create' ? '新增书签' : '编辑书签'"
      width="600px"
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
          <el-autocomplete
            v-model="editorForm.category"
            :fetch-suggestions="queryCategorySuggestions"
            placeholder="请输入分类"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="editorForm.description"
            type="textarea"
            :rows="3"
            placeholder="请输入描述"
          />
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
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Plus } from '@element-plus/icons-vue';

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

const storedToken = typeof window !== 'undefined' ? window.localStorage.getItem('bookmark_token') : null;
const authToken = ref<string | null>(storedToken);
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

async function persistOrder(list: Bookmark[]) {
  if (!isAuthenticated.value) {
    return;
  }
  orderSaving.value = true;
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
  await persistOrder(list);
}

onMounted(() => {
  if (isAuthenticated.value) {
    loadBookmarks();
  }
});
</script>

<style scoped>
.bookmarks-page {
  padding: 0;
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
}
</style>

