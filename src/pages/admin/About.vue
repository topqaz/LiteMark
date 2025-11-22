<template>
  <div class="about-page">
    <h2 class="page-title">关于 LiteMark</h2>
    <p class="page-desc">一款简洁优雅的个人书签管理应用</p>

    <el-card class="about-card">
      <template #header>
        <h3>项目简介</h3>
      </template>
      <p>
    LiteMark 是一款基于 <strong>Vue 3 + Vite</strong> 的个人书签管理应用，提供响应式双端体验、后台管理面板。</p>
    <p>当前前端和后端（Vercel Functions + Vercel Postgres）已深度集成，只需少量配置即可Vercel 上快速运行,无需服务器。 </p>
       <p>支持定时备份到WebDAV服务器。</p>
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
      <p>当前版本：<strong>1.1.0</strong></p>
      <p class="copyright">© {{ getShanghaiYear() }} LiteMark. All rights reserved.</p>

    </el-card>
  </div>
</template>

<script setup lang="ts">
import { getShanghaiYear } from '../../utils/date.js';
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

