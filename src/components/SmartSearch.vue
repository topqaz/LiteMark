<template>
  <div class="smart-search">
    <div class="search-input-wrapper">
      <el-input
        v-model="query"
        :placeholder="placeholder"
        size="large"
        clearable
        @keyup.enter="doSearch"
        @clear="clearResults"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
        <template #append>
          <el-button @click="doSearch" :loading="loading" :disabled="!query.trim()">
            <el-icon><MagicStick /></el-icon>
            智能搜索
          </el-button>
        </template>
      </el-input>
    </div>

    <!-- AI 理解 -->
    <div v-if="result && result.query_understood" class="query-understood">
      <el-tag type="info" size="small">AI 理解</el-tag>
      <span>{{ result.query_understood }}</span>
    </div>

    <!-- 搜索结果 -->
    <div v-if="result && result.results.length > 0" class="search-results">
      <div
        v-for="item in result.results"
        :key="item.id"
        class="result-item"
        @click="openUrl(item.url)"
      >
        <div class="result-header">
          <a :href="item.url" target="_blank" class="result-title" @click.stop>
            {{ item.title }}
          </a>
          <el-tag size="small" type="success">
            {{ (item.score * 100).toFixed(0) }}% 匹配
          </el-tag>
        </div>
        <div v-if="item.category" class="result-category">
          <el-tag size="small">{{ item.category }}</el-tag>
        </div>
        <div v-if="item.ai_summary" class="result-summary">
          {{ item.ai_summary }}
        </div>
        <div v-else-if="item.description" class="result-summary">
          {{ item.description }}
        </div>
        <div class="result-url">{{ item.url }}</div>
      </div>
    </div>

    <!-- 无结果 -->
    <div v-else-if="result && result.results.length === 0" class="no-results">
      <el-empty description="未找到相关书签" :image-size="80" />
    </div>

    <!-- 错误提示 -->
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      :closable="true"
      @close="error = ''"
      style="margin-top: 12px;"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { aiApi, type SearchResponse } from '../api';

defineProps<{
  placeholder?: string;
}>();

const emit = defineEmits<{
  (e: 'result', data: SearchResponse): void;
  (e: 'select', item: { id: string; url: string }): void;
}>();

const query = ref('');
const loading = ref(false);
const error = ref('');
const result = ref<SearchResponse | null>(null);

async function doSearch() {
  if (!query.value.trim()) return;

  loading.value = true;
  error.value = '';

  try {
    result.value = await aiApi.search({
      query: query.value,
      limit: 10,
    });
    emit('result', result.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : '搜索失败';
    result.value = null;
  } finally {
    loading.value = false;
  }
}

function clearResults() {
  result.value = null;
  error.value = '';
}

function openUrl(url: string) {
  window.open(url, '_blank');
}
</script>

<style scoped>
.smart-search {
  width: 100%;
}

.search-input-wrapper {
  margin-bottom: 12px;
}

.query-understood {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 14px;
  color: #0369a1;
}

.search-results {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.result-item {
  padding: 16px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.result-item:hover {
  border-color: #1a73e8;
  box-shadow: 0 4px 12px rgba(26, 115, 232, 0.15);
  transform: translateY(-2px);
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.result-title {
  font-size: 16px;
  font-weight: 600;
  color: #1a73e8;
  text-decoration: none;
}

.result-title:hover {
  text-decoration: underline;
}

.result-category {
  margin-bottom: 8px;
}

.result-summary {
  font-size: 14px;
  color: #4b5563;
  line-height: 1.6;
  margin-bottom: 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.result-url {
  font-size: 12px;
  color: #9ca3af;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.no-results {
  padding: 40px 0;
}
</style>
