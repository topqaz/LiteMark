/**
 * API 服务层
 * 统一管理所有 API 调用
 */

const getApiBase = (): string => {
  const apiBaseRaw =
    typeof window !== 'undefined'
      ? (window as { __APP_API_BASE_URL__?: string }).__APP_API_BASE_URL__
      : '';
  return (apiBaseRaw ?? '').replace(/\/$/, '');
};

const getToken = (): string | null => {
  return typeof window !== 'undefined'
    ? window.localStorage.getItem('bookmark_token')
    : null;
};

const setToken = (token: string): void => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('bookmark_token', token);
  }
};

const clearToken = (): void => {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem('bookmark_token');
    window.localStorage.removeItem('bookmark_username');
  }
};

/**
 * 通用请求方法
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  requireAuth = true
): Promise<T> {
  const apiBase = getApiBase();
  const url = `${apiBase}${endpoint}`;

  const headers = new Headers(options.headers ?? {});

  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (requireAuth) {
    const token = getToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    clearToken();
    throw new Error('登录状态已失效，请重新登录');
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `请求失败: ${response.status}`);
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// ============ 类型定义 ============

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  category?: string;
  description?: string;
  visible?: boolean;
  order?: number;
  tags?: string;
  created_at?: string;
  updated_at?: string;
}

export interface BookmarkCreate {
  title: string;
  url: string;
  category?: string;
  description?: string;
  visible?: boolean;
}

export interface LoginResponse {
  token: string;
  username: string;
}

export interface Settings {
  theme: string;
  siteTitle: string;
  siteIcon: string;
}

export interface ClassifyResponse {
  suggested_category: string;
  confidence: number;
  reasoning: string;
  existing_categories: string[];
}

export interface SummarizeResponse {
  summary: string;
  tags: string[];
  reading_time?: number;
}

export interface AIStatus {
  openai_configured: boolean;
  openai_model: string;
  openai_base_url?: string;
}

export interface AIConfig {
  ai_provider: string;
  ai_api_key: string;
  ai_base_url: string;
  ai_model: string;
}

export interface BatchProcessResponse {
  processed: number;
  failed: number;
  errors: string[];
}

export interface BatchTaskResponse {
  task_id: string;
  message: string;
  status: string;
}

export interface TaskProgress {
  task_id: string;
  operation: string;
  total: number;
  processed: number;
  failed: number;
  progress: number;
  status: string;
  errors: string[];
  started_at?: string;
  completed_at?: string;
}

// ============ 认证 API ============

export const authApi = {
  login: (username: string, password: string): Promise<LoginResponse> =>
    request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }, false),

  getMe: (): Promise<{ username: string }> =>
    request('/api/auth/me'),

  updateCredentials: (data: {
    current_password: string;
    username?: string;
    new_password?: string;
  }): Promise<{ username: string }> =>
    request('/api/auth/credentials', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// ============ 书签 API ============

export const bookmarksApi = {
  list: (): Promise<Bookmark[]> =>
    request('/api/bookmarks', { method: 'GET' }),

  get: (id: string): Promise<Bookmark> =>
    request(`/api/bookmarks/${id}`, { method: 'GET' }),

  create: (data: BookmarkCreate): Promise<Bookmark> =>
    request('/api/bookmarks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<BookmarkCreate>): Promise<Bookmark> =>
    request(`/api/bookmarks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string): Promise<void> =>
    request(`/api/bookmarks/${id}`, { method: 'DELETE' }),

  reorder: (category: string, bookmarkIds: string[]): Promise<{ success: boolean }> =>
    request('/api/bookmarks/reorder', {
      method: 'POST',
      body: JSON.stringify({ category, bookmark_ids: bookmarkIds }),
    }),

  reorderCategories: (categories: string[]): Promise<{ success: boolean }> =>
    request('/api/bookmarks/reorder-categories', {
      method: 'POST',
      body: JSON.stringify({ categories }),
    }),

  getCategories: (): Promise<{ categories: string[] }> =>
    request('/api/bookmarks/categories', { method: 'GET' }, false),
};

// ============ 设置 API ============

export const settingsApi = {
  get: (): Promise<Settings> =>
    request('/api/settings', { method: 'GET' }, false),

  update: (data: Partial<Settings>): Promise<Settings> =>
    request('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // AI 配置
  getAIConfig: (): Promise<AIConfig> =>
    request('/api/settings/ai', { method: 'GET' }),

  updateAIConfig: (data: Partial<AIConfig>): Promise<AIConfig> =>
    request('/api/settings/ai', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  testAIConfig: (): Promise<{ success: boolean; message: string }> =>
    request('/api/settings/ai/test', { method: 'POST' }),
};

// ============ 备份 API ============

export const backupApi = {
  export: async (): Promise<Blob> => {
    const apiBase = getApiBase();
    const token = getToken();
    const response = await fetch(`${apiBase}/api/backup/export`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      throw new Error('导出失败');
    }
    return response.blob();
  },

  import: (data: {
    bookmarks: Bookmark[];
    category_order: { category: string; order: number }[];
  }): Promise<{
    success: boolean;
    imported_bookmarks: number;
    imported_categories: number;
  }> =>
    request('/api/backup/import', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// ============ AI API ============

export const aiApi = {
  /**
   * 获取 AI 服务状态
   */
  status: (): Promise<AIStatus> =>
    request('/api/ai/status', { method: 'GET' }, false),

  /**
   * 智能分类
   */
  classify: (data: {
    bookmark_id?: string;
    url?: string;
    title?: string;
    description?: string;
  }): Promise<ClassifyResponse> =>
    request('/api/ai/classify', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * 内容摘要
   */
  summarize: (data: {
    bookmark_id?: string;
    url?: string;
  }): Promise<SummarizeResponse> =>
    request('/api/ai/summarize', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * 批量处理（后台任务）
   */
  batch: (data: {
    bookmark_ids?: string[];
    operations: string[];
  }): Promise<BatchTaskResponse> =>
    request('/api/ai/batch', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * 获取任务进度
   */
  getTaskProgress: (taskId: string): Promise<TaskProgress> =>
    request(`/api/ai/task/${taskId}`, { method: 'GET' }),

  /**
   * 获取所有任务
   */
  getTasks: (): Promise<TaskProgress[]> =>
    request('/api/ai/tasks', { method: 'GET' }),
};

// 工具函数导出
export { getToken, setToken, clearToken, getApiBase };

// ============ 版本 API ============

export interface VersionInfo {
  version: string;
  name: string;
  description: string;
  author: string;
}

export const versionApi = {
  get: (): Promise<VersionInfo> =>
    request('/version', { method: 'GET' }, false),
};
