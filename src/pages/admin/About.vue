<template>
  <div class="about-page">
    <h2 class="page-title">关于 LiteMark</h2>
    <p class="page-desc">一款简洁优雅的个人书签管理应用</p>

    <el-card class="about-card">
      <template #header>
        <h3>项目简介</h3>
      </template>
      <p>
    LiteMark 是一款基于 <strong>Vue 3 + Vite + FastAPI</strong> 的个人书签管理应用，提供响应式双端体验、后台管理面板。</p>
      <p>支持 AI 智能分类、内容摘要生成等功能。</p>
      <p>支持定时备份到 WebDAV 服务器。</p>
      <p>支持浏览器插件。</p>

    </el-card>



    <el-card class="about-card">
      <template #header>
        <h3>相关链接</h3>
      </template>
      <ul class="link-list">
        <li>
          <el-link href="https://github.com/topqaz/LiteMark" target="_blank" type="primary" :underline="false">
            GitHub 仓库
          </el-link>
        </li>
        <li>
          <el-link href="https://github.com/topqaz/LiteMark-extension-browser" target="_blank" type="primary" :underline="false">
            浏览器插件
          </el-link>
        </li>
      </ul>
    </el-card>

    <el-card class="about-card">
      <template #header>
        <h3>版本信息</h3>
      </template>
      <p>当前版本：<strong>{{ versionInfo?.version || '加载中...' }}</strong></p>
      <p v-if="versionInfo?.author" class="author">作者：{{ versionInfo.author }}</p>
      <p v-if="updateInfo">
        最新版本：<strong>{{ updateInfo.latest_version || '无法获取' }}</strong>
        <el-tag type="success" v-if="updateInfo.update_available">可更新</el-tag>
        <el-tag type="info" v-else>已是最新</el-tag>
      </p>
      <p v-if="updateInfo && updateInfo.latest_version">
        <el-link :href="updateInfo.github_url" target="_blank" type="primary" :underline="false">
          查看 GitHub 最新发布
        </el-link>
      </p>
      <p class="copyright">© {{ getShanghaiYear() }} LiteMark by {{ versionInfo?.author || 'topqaz' }}. All rights reserved.</p>

    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getShanghaiYear } from '../../utils/date.js';
import { versionApi, type VersionInfo, type UpdateCheckResponse } from '../../api';

const versionInfo = ref<VersionInfo | null>(null);
const updateInfo = ref<UpdateCheckResponse | null>(null);

onMounted(async () => {
  try {
    versionInfo.value = await versionApi.get();
  } catch (err) {
    console.error('获取版本信息失败', err);
  }

  try {
    updateInfo.value = await versionApi.checkLatest();
  } catch (err) {
    console.error('获取最新版本失败', err);
  }
});
</script>

<style scoped>
.about-page {
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

.about-card {
  margin-bottom: 24px;
}

.about-card h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2933;
}

.about-card p {
  margin: 0;
  line-height: 1.8;
  color: #4b5563;
  font-size: 14px;
}

.link-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.link-list li {
  padding: 12px 0;
  border-bottom: 1px solid #e5e7eb;
}

.link-list li:last-child {
  border-bottom: none;
}

.link-list .el-link {
  font-size: 14px;
}

.copyright {
  margin-top: 16px;
  color: #6b7280;
  font-size: 13px;
}

@media (max-width: 768px) {
  .about-card {
    margin-bottom: 16px;
  }
}
</style>

