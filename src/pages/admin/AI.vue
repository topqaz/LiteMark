<template>
  <div class="ai-page">
    <div class="page-header">
      <h2 class="page-title">AI 助手</h2>
      <el-tag :type="aiStatus?.openai_configured ? 'success' : 'danger'" size="large">
        {{ aiStatus?.openai_configured ? 'AI 已启用' : 'AI 未配置' }}
      </el-tag>
    </div>

    <!-- AI 配置卡片 -->
    <el-card class="config-card" shadow="never">
      <template #header>
        <div class="card-header">
          <el-icon><Setting /></el-icon>
          <span>AI 配置</span>
          <el-button link type="primary" @click="showConfigDialog = true">编辑配置</el-button>
        </div>
      </template>
      <el-descriptions :column="isMobile ? 1 : 3" border v-loading="statusLoading">
        <el-descriptions-item label="AI 状态">
          <el-tag :type="aiStatus?.openai_configured ? 'success' : 'danger'" size="small">
            {{ aiStatus?.openai_configured ? '已配置' : '未配置' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="语言模型">
          {{ aiStatus?.openai_model || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="API 地址">
          {{ aiStatus?.openai_base_url || '默认' }}
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- 功能区 -->
    <div class="feature-grid">
      <!-- 智能分类 -->
      <el-card class="feature-card" shadow="hover">
        <template #header>
          <div class="card-header">
            <el-icon><Folder /></el-icon>
            <span>智能分类</span>
          </div>
        </template>
        <p class="feature-desc">AI 分析网页内容，自动推荐合适的分类</p>
        <el-input
          v-model="classifyUrl"
          placeholder="输入网址..."
          :disabled="!aiStatus?.openai_configured"
        />
        <el-button
          type="primary"
          @click="doClassify"
          :loading="classifyLoading"
          :disabled="!classifyUrl.trim()"
          style="margin-top: 12px; width: 100%;"
        >
          分析分类
        </el-button>

        <div v-if="classifyResult" class="classify-result">
          <el-result
            icon="success"
            :title="classifyResult.suggested_category"
            :sub-title="`置信度: ${(classifyResult.confidence * 100).toFixed(0)}%`"
          >
            <template #extra>
              <p class="reasoning">{{ classifyResult.reasoning }}</p>
              <div class="existing-cats">
                <span>现有分类：</span>
                <el-tag
                  v-for="cat in classifyResult.existing_categories"
                  :key="cat"
                  size="small"
                  style="margin: 2px;"
                >
                  {{ cat }}
                </el-tag>
              </div>
            </template>
          </el-result>
        </div>
      </el-card>

      <!-- 内容摘要 -->
      <el-card class="feature-card" shadow="hover">
        <template #header>
          <div class="card-header">
            <el-icon><Document /></el-icon>
            <span>内容摘要</span>
          </div>
        </template>
        <p class="feature-desc">抓取网页内容，AI 生成简洁摘要和标签</p>
        <el-input
          v-model="summarizeUrl"
          placeholder="输入网址..."
          :disabled="!aiStatus?.openai_configured"
        />
        <el-button
          type="primary"
          @click="doSummarize"
          :loading="summarizeLoading"
          :disabled="!summarizeUrl.trim()"
          style="margin-top: 12px; width: 100%;"
        >
          生成摘要
        </el-button>

        <div v-if="summarizeResult" class="summarize-result">
          <div class="summary-content">
            <h4>摘要</h4>
            <p>{{ summarizeResult.summary }}</p>
          </div>
          <div class="summary-tags">
            <h4>标签</h4>
            <el-tag
              v-for="tag in summarizeResult.tags"
              :key="tag"
              size="small"
              style="margin: 2px;"
            >
              {{ tag }}
            </el-tag>
          </div>
          <div v-if="summarizeResult.reading_time" class="reading-time">
            预计阅读时间：{{ summarizeResult.reading_time }} 分钟
          </div>
        </div>
      </el-card>

      <!-- 批量处理 -->
      <el-card class="feature-card batch-card" shadow="hover">
        <template #header>
          <div class="card-header">
            <el-icon><Operation /></el-icon>
            <span>批量处理</span>
          </div>
        </template>
        <p class="feature-desc">为所有书签批量生成 AI 内容</p>

        <el-checkbox-group v-model="batchOperations" style="margin-bottom: 16px;">
          <el-checkbox label="summarize">生成摘要</el-checkbox>
          <el-checkbox label="classify">智能分类</el-checkbox>
        </el-checkbox-group>

        <el-button
          type="warning"
          @click="doBatch"
          :loading="batchLoading"
          :disabled="batchOperations.length === 0 || currentTask?.status === 'running'"
          style="width: 100%;"
        >
          {{ currentTask?.status === 'running' ? '处理中...' : '开始批量处理' }}
        </el-button>

        <!-- 进度显示 -->
        <div v-if="currentTask" class="task-progress">
          <div class="progress-header">
            <span class="progress-title">{{ getOperationName(currentTask.operation) }}</span>
            <el-tag :type="getStatusType(currentTask.status)" size="small">
              {{ getStatusText(currentTask.status) }}
            </el-tag>
          </div>

          <el-progress
            :percentage="currentTask.progress"
            :status="currentTask.status === 'completed' ? 'success' : (currentTask.status === 'failed' ? 'exception' : undefined)"
            :stroke-width="12"
            style="margin: 12px 0;"
          />

          <div class="progress-stats">
            <span>已处理: {{ currentTask.processed }} / {{ currentTask.total }}</span>
            <span v-if="currentTask.failed > 0" class="failed-count">
              失败: {{ currentTask.failed }}
            </span>
          </div>

          <div v-if="currentTask.errors.length > 0" class="progress-errors">
            <el-collapse>
              <el-collapse-item title="错误详情">
                <ul>
                  <li v-for="(err, i) in currentTask.errors" :key="i">{{ err }}</li>
                </ul>
              </el-collapse-item>
            </el-collapse>
          </div>

          <div v-if="currentTask.status === 'completed'" class="progress-done">
            <el-result
              icon="success"
              title="处理完成"
              :sub-title="`成功: ${currentTask.processed - currentTask.failed}, 失败: ${currentTask.failed}`"
            />
          </div>
        </div>
      </el-card>
    </div>

    <!-- 配置对话框 -->
    <el-dialog v-model="showConfigDialog" title="AI 配置" width="500px">
      <el-form :model="configForm" label-width="100px" v-loading="configLoading">
        <el-form-item label="AI 提供商">
          <el-select v-model="configForm.ai_provider" style="width: 100%;">
            <el-option label="OpenAI" value="openai" />
            <el-option label="Ollama (本地)" value="ollama" />
            <el-option label="自定义" value="custom" />
          </el-select>
        </el-form-item>

        <el-form-item label="API Key">
          <el-input
            v-model="configForm.ai_api_key"
            :placeholder="configForm.ai_provider === 'ollama' ? '本地无需填写' : '输入 API Key'"
            show-password
          />
        </el-form-item>

        <el-form-item label="API 地址">
          <el-input
            v-model="configForm.ai_base_url"
            :placeholder="getDefaultBaseUrl()"
          />
          <div class="form-tip">
            {{ getBaseUrlTip() }}
          </div>
        </el-form-item>

        <el-form-item label="模型名称">
          <el-input v-model="configForm.ai_model" placeholder="如: gpt-4o-mini, qwen3:4b" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="testConfig" :loading="testLoading">测试连接</el-button>
        <el-button @click="showConfigDialog = false">取消</el-button>
        <el-button type="primary" @click="saveConfig" :loading="saveLoading">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Folder, Document, Operation, Setting } from '@element-plus/icons-vue';
import {
  aiApi,
  settingsApi,
  type AIStatus,
  type AIConfig,
  type ClassifyResponse,
  type SummarizeResponse,
  type TaskProgress,
} from '../../api';

// 响应式状态
const isMobile = ref(false);
const statusLoading = ref(false);
const aiStatus = ref<AIStatus | null>(null);

// 配置
const showConfigDialog = ref(false);
const configLoading = ref(false);
const configForm = ref<AIConfig>({
  ai_provider: 'openai',
  ai_api_key: '',
  ai_base_url: '',
  ai_model: 'gpt-4o-mini',
});
const testLoading = ref(false);
const saveLoading = ref(false);

// 分类
const classifyUrl = ref('');
const classifyLoading = ref(false);
const classifyResult = ref<ClassifyResponse | null>(null);

// 摘要
const summarizeUrl = ref('');
const summarizeLoading = ref(false);
const summarizeResult = ref<SummarizeResponse | null>(null);

// 批量处理
const batchOperations = ref<string[]>([]);
const batchLoading = ref(false);
const currentTask = ref<TaskProgress | null>(null);
let pollInterval: ReturnType<typeof setInterval> | null = null;

function checkMobile() {
  isMobile.value = window.innerWidth <= 768;
}

function getDefaultBaseUrl() {
  switch (configForm.value.ai_provider) {
    case 'openai':
      return 'https://api.openai.com/v1';
    case 'ollama':
      return 'http://localhost:11434/v1';
    default:
      return '输入 API 地址';
  }
}

function getBaseUrlTip() {
  switch (configForm.value.ai_provider) {
    case 'openai':
      return 'OpenAI 官方或兼容 API 地址';
    case 'ollama':
      return '本地 Ollama 服务地址';
    default:
      return '支持任何 OpenAI 兼容 API';
  }
}

function getOperationName(operation: string) {
  const names: Record<string, string> = {
    'summarize': '生成摘要',
    'classify': '智能分类',
    'summarize+classify': '摘要 + 分类',
    'classify+summarize': '分类 + 摘要',
  };
  return names[operation] || operation;
}

function getStatusType(status: string) {
  const types: Record<string, string> = {
    'pending': 'info',
    'running': 'warning',
    'completed': 'success',
    'failed': 'danger',
  };
  return types[status] || 'info';
}

function getStatusText(status: string) {
  const texts: Record<string, string> = {
    'pending': '等待中',
    'running': '处理中',
    'completed': '已完成',
    'failed': '失败',
  };
  return texts[status] || status;
}

watch(() => configForm.value.ai_provider, (provider) => {
  if (provider === 'ollama') {
    configForm.value.ai_base_url = 'http://localhost:11434/v1';
    configForm.value.ai_api_key = 'ollama';
    configForm.value.ai_model = 'qwen3:4b';
  } else if (provider === 'openai') {
    configForm.value.ai_base_url = 'https://api.openai.com/v1';
    configForm.value.ai_model = 'gpt-4o-mini';
  }
});

async function checkStatus() {
  statusLoading.value = true;
  try {
    aiStatus.value = await aiApi.status();
  } catch (err) {
    ElMessage.error('获取 AI 状态失败');
  } finally {
    statusLoading.value = false;
  }
}

async function loadConfig() {
  configLoading.value = true;
  try {
    const config = await settingsApi.getAIConfig();
    configForm.value = config;

    // 推断 provider
    if (config.ai_base_url?.includes('localhost:11434')) {
      configForm.value.ai_provider = 'ollama';
    } else if (config.ai_base_url?.includes('openai.com')) {
      configForm.value.ai_provider = 'openai';
    } else if (config.ai_base_url) {
      configForm.value.ai_provider = 'custom';
    }
  } catch (err) {
    // 忽略加载错误，使用默认值
  } finally {
    configLoading.value = false;
  }
}

async function testConfig() {
  testLoading.value = true;
  try {
    // 先保存配置
    await settingsApi.updateAIConfig(configForm.value);

    // 测试连接
    const result = await settingsApi.testAIConfig();
    if (result.success) {
      ElMessage.success(`连接成功: ${result.message}`);
    } else {
      ElMessage.error(`连接失败: ${result.message}`);
    }
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '测试失败');
  } finally {
    testLoading.value = false;
  }
}

async function saveConfig() {
  saveLoading.value = true;
  try {
    await settingsApi.updateAIConfig(configForm.value);
    ElMessage.success('配置已保存');
    showConfigDialog.value = false;
    await checkStatus();
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '保存失败');
  } finally {
    saveLoading.value = false;
  }
}

async function doClassify() {
  if (!classifyUrl.value.trim()) return;
  classifyLoading.value = true;
  classifyResult.value = null;
  try {
    classifyResult.value = await aiApi.classify({
      url: classifyUrl.value,
    });
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '分类失败');
  } finally {
    classifyLoading.value = false;
  }
}

async function doSummarize() {
  if (!summarizeUrl.value.trim()) return;
  summarizeLoading.value = true;
  summarizeResult.value = null;
  try {
    summarizeResult.value = await aiApi.summarize({
      url: summarizeUrl.value,
    });
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '生成摘要失败');
  } finally {
    summarizeLoading.value = false;
  }
}

async function pollTaskProgress(taskId: string) {
  try {
    const task = await aiApi.getTaskProgress(taskId);
    currentTask.value = task;

    // 如果任务完成或失败，停止轮询
    if (task.status === 'completed' || task.status === 'failed') {
      stopPolling();
      batchLoading.value = false;
      if (task.status === 'completed') {
        ElMessage.success('批量处理完成');
      }
    }
  } catch (err) {
    console.error('获取任务进度失败:', err);
  }
}

function startPolling(taskId: string) {
  stopPolling();
  pollInterval = setInterval(() => pollTaskProgress(taskId), 1000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

async function doBatch() {
  if (batchOperations.value.length === 0) return;
  batchLoading.value = true;
  currentTask.value = null;

  try {
    const response = await aiApi.batch({
      operations: batchOperations.value,
    });

    ElMessage.info('任务已创建，正在后台处理...');

    // 初始化任务状态
    currentTask.value = {
      task_id: response.task_id,
      operation: batchOperations.value.join('+'),
      total: 0,
      processed: 0,
      failed: 0,
      progress: 0,
      status: 'pending',
      errors: [],
    };

    // 开始轮询进度
    startPolling(response.task_id);
  } catch (err) {
    batchLoading.value = false;
    ElMessage.error(err instanceof Error ? err.message : '批量处理失败');
  }
}

onMounted(() => {
  checkMobile();
  checkStatus();
  loadConfig();
  window.addEventListener('resize', checkMobile);
});

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile);
  stopPolling();
});
</script>

<style scoped>
.ai-page {
  padding: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #1f2933;
}

.config-card {
  margin-bottom: 24px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.card-header span {
  flex: 1;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 20px;
}

.feature-card {
  min-height: 280px;
}

.batch-card {
  min-height: 320px;
}

.feature-desc {
  color: #6b7280;
  font-size: 14px;
  margin-bottom: 16px;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

/* 分类结果 */
.classify-result {
  margin-top: 16px;
}

.reasoning {
  color: #6b7280;
  font-size: 14px;
  margin-bottom: 12px;
}

.existing-cats {
  font-size: 13px;
  color: #6b7280;
}

/* 摘要结果 */
.summarize-result {
  margin-top: 16px;
  padding: 16px;
  background: #f9fafb;
  border-radius: 8px;
}

.summary-content h4,
.summary-tags h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: #374151;
}

.summary-content p {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: #4b5563;
}

.summary-tags {
  margin-top: 12px;
}

.reading-time {
  margin-top: 12px;
  font-size: 13px;
  color: #6b7280;
}

/* 任务进度 */
.task-progress {
  margin-top: 20px;
  padding: 16px;
  background: #f9fafb;
  border-radius: 8px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.progress-title {
  font-weight: 600;
  color: #374151;
}

.progress-stats {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #6b7280;
}

.failed-count {
  color: #ef4444;
}

.progress-errors {
  margin-top: 12px;
}

.progress-errors ul {
  margin: 0;
  padding-left: 20px;
  font-size: 12px;
  color: #ef4444;
}

.progress-done {
  margin-top: 12px;
}

@media (max-width: 768px) {
  .feature-grid {
    grid-template-columns: 1fr;
  }

  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
}
</style>
