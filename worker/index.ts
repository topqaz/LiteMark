interface Env {
  DB: D1Database;
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  JWT_SECRET?: string;
  DEFAULT_ADMIN_USERNAME?: string;
  DEFAULT_ADMIN_PASSWORD?: string;
}

interface Bookmark {
  id: string;
  title: string;
  url: string;
  category: string | null;
  description: string | null;
  visible: number;
  order_value: number;
  tags: string | null;
  created_at: string;
  updated_at: string;
}

interface BookmarkInput {
  title?: string;
  url?: string;
  category?: string | null;
  description?: string | null;
  visible?: boolean;
  order?: number;
  order_value?: number;
  tags?: string | null;
}

const VERSION = '2.1.4';
const DEFAULT_SETTINGS = {
  theme: 'light',
  siteTitle: 'LiteMark',
  siteIcon: '',
};
const DEFAULT_AI_CONFIG = {
  ai_provider: 'openai',
  ai_api_key: '',
  ai_base_url: 'https://api.openai.com/v1',
  ai_model: 'gpt-4o-mini',
};
const DEFAULT_MCP_CONFIG = {
  mcp_enabled: false,
  mcp_token: '',
  mcp_allowed_origins: '',
};
const MCP_SCOPE = 'bookmarks:read bookmarks:write';
const DEFAULT_WEBDAV_CONFIG = {
  url: '',
  username: '',
  password: '',
  path: 'litemark-backup/',
  keepBackups: 7,
  enabled: false,
  backupTime: '02:00',
  lastBackup: '',
};

const textEncoder = new TextEncoder();

const json = (data: unknown, init: ResponseInit = {}): Response => {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { ...init, headers });
};

const error = (message: string, status = 400): Response => {
  return json({ detail: message }, { status });
};

const now = (): string => new Date().toISOString();

const uuid = (): string => crypto.randomUUID();

const getJwtSecret = (env: Env): string => {
  return env.JWT_SECRET || 'change-this-to-a-secure-random-string';
};

const base64UrlEncode = (input: ArrayBuffer | string): string => {
  const bytes = typeof input === 'string' ? textEncoder.encode(input) : new Uint8Array(input);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const base64UrlDecode = (input: string): Uint8Array => {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const hmacKey = (secret: string): Promise<CryptoKey> => {
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
};

const signToken = async (payload: Record<string, unknown>, secret: string): Promise<string> => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), textEncoder.encode(data));
  return `${data}.${base64UrlEncode(signature)}`;
};

const verifyToken = async (token: string, secret: string): Promise<Record<string, unknown> | null> => {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;
  const expected = await crypto.subtle.sign('HMAC', await hmacKey(secret), textEncoder.encode(data));
  if (base64UrlEncode(expected) !== encodedSignature) {
    return null;
  }

  try {
    const payloadText = new TextDecoder().decode(base64UrlDecode(encodedPayload));
    const payload = JSON.parse(payloadText) as Record<string, unknown>;
    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
};

const sha256 = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const getBearer = (request: Request): string | null => {
  const auth = request.headers.get('Authorization') || '';
  const [scheme, token] = auth.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
};

const requireUser = async (request: Request, env: Env): Promise<string | Response> => {
  const token = getBearer(request);
  if (!token) {
    return error('未登录', 401);
  }

  const payload = await verifyToken(token, getJwtSecret(env));
  if (!payload || typeof payload.sub !== 'string') {
    return error('登录状态已失效，请重新登录', 401);
  }

  return payload.sub;
};

const optionalUser = async (request: Request, env: Env): Promise<string | null> => {
  const token = getBearer(request);
  if (!token) {
    return null;
  }
  const payload = await verifyToken(token, getJwtSecret(env));
  return typeof payload?.sub === 'string' ? payload.sub : null;
};

const readJson = async <T>(request: Request): Promise<T> => {
  return request.json() as Promise<T>;
};

const stripHtml = (value: string): string => {
  return value.replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const escapeHtml = (value: unknown): string => {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

const jsonFromModelText = <T>(text: string, fallback: T): T => {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || trimmed;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return fallback;
  }
};

const getPageInfo = async (url: string): Promise<{ title: string; description: string; text: string }> => {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'LiteMark-Cloudflare-Worker/1.0',
    },
  });
  if (!response.ok) {
    throw new Error(`网页请求失败: ${response.status}`);
  }
  const html = await response.text();
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? '';
  const description =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1]?.trim() ??
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)?.[1]?.trim() ??
    '';
  return {
    title,
    description,
    text: stripHtml(html).slice(0, 12000),
  };
};

const toBookmarkResponse = (bookmark: Bookmark) => ({
  id: bookmark.id,
  title: bookmark.title,
  url: bookmark.url,
  category: bookmark.category,
  description: bookmark.description,
  visible: Boolean(bookmark.visible),
  order: bookmark.order_value,
  tags: bookmark.tags,
  created_at: bookmark.created_at,
  updated_at: bookmark.updated_at,
});

const getSettingsMap = async (env: Env): Promise<Record<string, string>> => {
  const rows = await env.DB.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  return Object.fromEntries((rows.results ?? []).map((row) => [row.key, row.value]));
};

const getAiConfig = async (env: Env) => {
  const settings = await getSettingsMap(env);
  return {
    ai_provider: settings.ai_provider || DEFAULT_AI_CONFIG.ai_provider,
    ai_api_key: settings.ai_api_key || DEFAULT_AI_CONFIG.ai_api_key,
    ai_base_url: (settings.ai_base_url || DEFAULT_AI_CONFIG.ai_base_url).replace(/\/$/, ''),
    ai_model: settings.ai_model || DEFAULT_AI_CONFIG.ai_model,
  };
};

const chatCompletion = async (env: Env, messages: Array<{ role: string; content: string }>, maxTokens = 800): Promise<string> => {
  const config = await getAiConfig(env);
  if (!config.ai_api_key) {
    throw new Error('AI 未配置。请在后台设置中配置 AI API');
  }
  const response = await fetch(`${config.ai_base_url}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.ai_api_key}`,
    },
    body: JSON.stringify({
      model: config.ai_model,
      messages,
      temperature: 0.2,
      max_tokens: maxTokens,
    }),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return payload.choices?.[0]?.message?.content?.trim() || '';
};

const upsertSetting = async (env: Env, key: string, value: string): Promise<void> => {
  await env.DB.prepare(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
  )
    .bind(key, value, now())
    .run();
};

const ensureAdmin = async (env: Env): Promise<void> => {
  const existing = await env.DB.prepare('SELECT username FROM users LIMIT 1').first<{ username: string }>();
  if (existing) {
    return;
  }

  const username = env.DEFAULT_ADMIN_USERNAME || 'admin';
  const password = env.DEFAULT_ADMIN_PASSWORD || 'admin123';
  await env.DB.prepare('INSERT INTO users (username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .bind(username, await sha256(password), now(), now())
    .run();
};

const getCategories = async (env: Env): Promise<string[]> => {
  const categoryRows = await env.DB.prepare(
    `SELECT DISTINCT category FROM bookmarks WHERE category IS NOT NULL AND category != ''`,
  ).all<{ category: string }>();
  const orderRows = await env.DB.prepare('SELECT category, order_value FROM category_order').all<{
    category: string;
    order_value: number;
  }>();

  const categories = new Set<string>();
  for (const row of categoryRows.results ?? []) {
    categories.add(row.category);
  }
  for (const row of orderRows.results ?? []) {
    categories.add(row.category);
  }

  const orderMap = new Map((orderRows.results ?? []).map((row) => [row.category, row.order_value]));
  return Array.from(categories).sort((a, b) => (orderMap.get(a) ?? 999999) - (orderMap.get(b) ?? 999999));
};

const ensureCategory = async (env: Env, category?: string | null): Promise<void> => {
  const name = category?.trim();
  if (!name) {
    return;
  }
  const max = await env.DB.prepare('SELECT COALESCE(MAX(order_value), -1) AS max_order FROM category_order').first<{
    max_order: number;
  }>();
  await env.DB.prepare(
    'INSERT OR IGNORE INTO category_order (category, order_value) VALUES (?, ?)',
  )
    .bind(name, (max?.max_order ?? -1) + 1)
    .run();
};

const unsupported = (feature: string): Response => {
  return error(`${feature} 在 Cloudflare Workers 部署模式下暂不支持`, 501);
};

const getMcpConfig = async (env: Env) => {
  const settings = await getSettingsMap(env);
  return {
    mcp_enabled: (settings.mcp_enabled || String(DEFAULT_MCP_CONFIG.mcp_enabled)) === 'true',
    mcp_token: settings.mcp_token || DEFAULT_MCP_CONFIG.mcp_token,
    mcp_allowed_origins: settings.mcp_allowed_origins || DEFAULT_MCP_CONFIG.mcp_allowed_origins,
  };
};

const tokenHash = async (token: string): Promise<string> => sha256(token);

const externalBaseUrl = (request: Request): string => {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
};

const mcpCorsHeaders = (request: Request, config: { mcp_allowed_origins: string }) => {
  const headers = new Headers();
  const origin = request.headers.get('Origin');
  const allowed = config.mcp_allowed_origins.split(',').map((item) => item.trim()).filter(Boolean);
  if (origin && (allowed.includes('*') || allowed.includes(origin))) {
    headers.set('Access-Control-Allow-Origin', origin);
  }
  headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id');
  headers.set('Access-Control-Expose-Headers', 'mcp-session-id');
  return headers;
};

const requireMcpAuth = async (request: Request, env: Env) => {
  const config = await getMcpConfig(env);
  if (!config.mcp_enabled || !config.mcp_token) {
    return { config, response: error('MCP 未启用', 404) };
  }
  const token = getBearer(request);
  if (token === config.mcp_token) {
    return { config, response: null };
  }
  if (token) {
    const payload = await verifyToken(token, getJwtSecret(env));
    if (
      payload?.typ === 'mcp_oauth' &&
      payload.sub === 'litemark-mcp' &&
      payload.scope === MCP_SCOPE &&
      payload.mcp_token_hash === await tokenHash(config.mcp_token)
    ) {
      return { config, response: null };
    }
  }
  const response = error('MCP Token 无效或缺失', 401);
  response.headers.set('WWW-Authenticate', `Bearer resource_metadata="${externalBaseUrl(request)}/.well-known/oauth-protected-resource"`);
  return { config, response };
};

const handleAuth = async (request: Request, env: Env, path: string): Promise<Response | null> => {
  await ensureAdmin(env);

  if (path === '/api/auth/login' && request.method === 'POST') {
    const body = await readJson<{ username?: string; password?: string }>(request);
    const user = await env.DB.prepare('SELECT username, password_hash FROM users WHERE username = ?')
      .bind(body.username || '')
      .first<{ username: string; password_hash: string }>();

    if (!user || user.password_hash !== (await sha256(body.password || ''))) {
      return error('用户名或密码错误', 401);
    }

    const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
    const token = await signToken({ sub: user.username, exp }, getJwtSecret(env));
    return json({ token, username: user.username });
  }

  if ((path === '/api/auth/me' || path === '/api/auth/credentials' || path === '/api/admin/credentials') && request.method === 'GET') {
    const user = await requireUser(request, env);
    if (user instanceof Response) {
      return user;
    }
    return json({ username: user });
  }

  if ((path === '/api/auth/credentials' || path === '/api/admin/credentials') && request.method === 'PUT') {
    const currentUser = await requireUser(request, env);
    if (currentUser instanceof Response) {
      return currentUser;
    }

    const body = await readJson<{ current_password?: string; username?: string; new_password?: string }>(request);
    const user = await env.DB.prepare('SELECT username, password_hash FROM users WHERE username = ?')
      .bind(currentUser)
      .first<{ username: string; password_hash: string }>();
    if (!user || user.password_hash !== (await sha256(body.current_password || ''))) {
      return error('当前密码错误', 400);
    }

    const username = body.username?.trim() || currentUser;
    const passwordHash = body.new_password ? await sha256(body.new_password) : user.password_hash;
    await env.DB.prepare('UPDATE users SET username = ?, password_hash = ?, updated_at = ? WHERE username = ?')
      .bind(username, passwordHash, now(), currentUser)
      .run();
    return json({ username });
  }

  return null;
};

const handleBookmarks = async (request: Request, env: Env, path: string): Promise<Response | null> => {
  if (path === '/api/bookmarks' && request.method === 'GET') {
    const user = await optionalUser(request, env);
    const query = user
      ? 'SELECT * FROM bookmarks ORDER BY order_value ASC, created_at DESC'
      : 'SELECT * FROM bookmarks WHERE visible = 1 ORDER BY order_value ASC, created_at DESC';
    const rows = await env.DB.prepare(query).all<Bookmark>();
    return json((rows.results ?? []).map(toBookmarkResponse));
  }

  if (path === '/api/bookmarks/categories' && request.method === 'GET') {
    return json({ categories: await getCategories(env) });
  }

  if (path === '/api/bookmarks' && request.method === 'POST') {
    const user = await requireUser(request, env);
    if (user instanceof Response) {
      return user;
    }
    const body = await readJson<BookmarkInput>(request);
    if (!body.title || !body.url) {
      return error('标题和 URL 不能为空');
    }

    const max = await env.DB.prepare('SELECT COALESCE(MAX(order_value), -1) AS max_order FROM bookmarks WHERE COALESCE(category, "") = COALESCE(?, "")')
      .bind(body.category ?? null)
      .first<{ max_order: number }>();
    const createdAt = now();
    const id = uuid();
    await ensureCategory(env, body.category);
    await env.DB.prepare(
      `INSERT INTO bookmarks (id, title, url, category, description, visible, order_value, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        body.title,
        body.url,
        body.category ?? null,
        body.description ?? null,
        body.visible === false ? 0 : 1,
        body.order ?? (max?.max_order ?? -1) + 1,
        body.tags ?? null,
        createdAt,
        createdAt,
      )
      .run();

    const bookmark = await env.DB.prepare('SELECT * FROM bookmarks WHERE id = ?').bind(id).first<Bookmark>();
    return json(toBookmarkResponse(bookmark as Bookmark), { status: 201 });
  }

  if (path === '/api/bookmarks/reorder' && request.method === 'POST') {
    const user = await requireUser(request, env);
    if (user instanceof Response) {
      return user;
    }
    const body = await readJson<{ category?: string; bookmark_ids?: string[]; order?: string[] }>(request);
    const ids = body.bookmark_ids ?? body.order ?? [];
    await Promise.all(
      ids.map((id, index) =>
        env.DB.prepare('UPDATE bookmarks SET order_value = ?, updated_at = ? WHERE id = ?').bind(index, now(), id).run(),
      ),
    );
    return json({ success: true });
  }

  if (path === '/api/bookmarks/reorder-categories' && request.method === 'POST') {
    const user = await requireUser(request, env);
    if (user instanceof Response) {
      return user;
    }
    const body = await readJson<{ categories?: string[]; order?: string[] }>(request);
    const categories = body.categories ?? body.order ?? [];
    await Promise.all(
      categories.map((category, index) =>
        env.DB.prepare(
          'INSERT INTO category_order (category, order_value) VALUES (?, ?) ON CONFLICT(category) DO UPDATE SET order_value = excluded.order_value',
        )
          .bind(category, index)
          .run(),
      ),
    );
    return json({ success: true });
  }

  if (path === '/api/bookmarks/categories' && request.method === 'POST') {
    const user = await requireUser(request, env);
    if (user instanceof Response) {
      return user;
    }
    const body = await readJson<{ category?: string }>(request);
    const category = body.category?.trim();
    if (!category) {
      return error('分类名称不能为空');
    }
    await ensureCategory(env, category);
    const row = await env.DB.prepare('SELECT order_value FROM category_order WHERE category = ?')
      .bind(category)
      .first<{ order_value: number }>();
    return json({ success: true, category, order: row?.order_value ?? 0 });
  }

  const categoryMatch = path.match(/^\/api\/bookmarks\/categories\/(.+)$/);
  if (categoryMatch && request.method === 'PUT') {
    const user = await requireUser(request, env);
    if (user instanceof Response) {
      return user;
    }
    const oldName = decodeURIComponent(categoryMatch[1]);
    const body = await readJson<{ new_name?: string }>(request);
    const newName = body.new_name?.trim();
    if (!newName) {
      return error('新分类名称不能为空');
    }
    await env.DB.batch([
      env.DB.prepare('UPDATE bookmarks SET category = ?, updated_at = ? WHERE category = ?').bind(newName, now(), oldName),
      env.DB.prepare('UPDATE category_order SET category = ? WHERE category = ?').bind(newName, oldName),
    ]);
    return json({ success: true, category: newName });
  }

  if (categoryMatch && request.method === 'DELETE') {
    const user = await requireUser(request, env);
    if (user instanceof Response) {
      return user;
    }
    const category = decodeURIComponent(categoryMatch[1]);
    await env.DB.batch([
      env.DB.prepare('UPDATE bookmarks SET category = NULL, updated_at = ? WHERE category = ?').bind(now(), category),
      env.DB.prepare('DELETE FROM category_order WHERE category = ?').bind(category),
    ]);
    return json({ success: true });
  }

  const bookmarkMatch = path.match(/^\/api\/bookmarks\/([^/]+)$/);
  if (bookmarkMatch && request.method === 'GET') {
    const bookmark = await env.DB.prepare('SELECT * FROM bookmarks WHERE id = ?').bind(bookmarkMatch[1]).first<Bookmark>();
    return bookmark ? json(toBookmarkResponse(bookmark)) : error('书签不存在', 404);
  }

  if (bookmarkMatch && request.method === 'PUT') {
    const user = await requireUser(request, env);
    if (user instanceof Response) {
      return user;
    }
    const id = bookmarkMatch[1];
    const current = await env.DB.prepare('SELECT * FROM bookmarks WHERE id = ?').bind(id).first<Bookmark>();
    if (!current) {
      return error('书签不存在', 404);
    }
    const body = await readJson<BookmarkInput>(request);
    const category = body.category !== undefined ? body.category : current.category;
    await ensureCategory(env, category);
    await env.DB.prepare(
      `UPDATE bookmarks
       SET title = ?, url = ?, category = ?, description = ?, visible = ?, order_value = ?, tags = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(
        body.title ?? current.title,
        body.url ?? current.url,
        category ?? null,
        body.description !== undefined ? body.description : current.description,
        body.visible === undefined ? current.visible : body.visible ? 1 : 0,
        body.order ?? body.order_value ?? current.order_value,
        body.tags !== undefined ? body.tags : current.tags,
        now(),
        id,
      )
      .run();
    const updated = await env.DB.prepare('SELECT * FROM bookmarks WHERE id = ?').bind(id).first<Bookmark>();
    return json(toBookmarkResponse(updated as Bookmark));
  }

  if (bookmarkMatch && request.method === 'DELETE') {
    const user = await requireUser(request, env);
    if (user instanceof Response) {
      return user;
    }
    await env.DB.prepare('DELETE FROM bookmarks WHERE id = ?').bind(bookmarkMatch[1]).run();
    return new Response(null, { status: 204 });
  }

  return null;
};

const handleSettings = async (request: Request, env: Env, path: string): Promise<Response | null> => {
  if (path === '/api/settings' && request.method === 'GET') {
    const settings = await getSettingsMap(env);
    return json({ ...DEFAULT_SETTINGS, ...settings });
  }

  if (path === '/api/settings' && request.method === 'PUT') {
    const user = await requireUser(request, env);
    if (user instanceof Response) {
      return user;
    }
    const body = await readJson<Record<string, unknown>>(request);
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (body[key] !== undefined && body[key] !== null) {
        await upsertSetting(env, key, String(body[key]));
      }
    }
    const settings = await getSettingsMap(env);
    return json({ ...DEFAULT_SETTINGS, ...settings });
  }

  if (path === '/api/settings/ai' && request.method === 'GET') {
    const user = await requireUser(request, env);
    if (user instanceof Response) {
      return user;
    }
    const settings = await getSettingsMap(env);
    return json({ ...DEFAULT_AI_CONFIG, ...settings });
  }

  if (path === '/api/settings/ai' && request.method === 'PUT') {
    const user = await requireUser(request, env);
    if (user instanceof Response) {
      return user;
    }
    const body = await readJson<Record<string, unknown>>(request);
    for (const key of Object.keys(DEFAULT_AI_CONFIG)) {
      if (body[key] !== undefined && body[key] !== null) {
        await upsertSetting(env, key, String(body[key]));
      }
    }
    const settings = await getSettingsMap(env);
    return json({ ...DEFAULT_AI_CONFIG, ...settings });
  }

  if (path === '/api/settings/ai/test' && request.method === 'POST') {
    const user = await requireUser(request, env);
    if (user instanceof Response) {
      return user;
    }
    try {
      const message = await chatCompletion(env, [
        { role: 'user', content: "请只回复'连接成功'四个字" },
      ], 50);
      return json({ success: true, message: message || '连接成功' });
    } catch (err) {
      return json({ success: false, message: err instanceof Error ? err.message : '连接失败' });
    }
  }

  if (path === '/api/settings/mcp' && request.method === 'GET') {
    const user = await requireUser(request, env);
    if (user instanceof Response) {
      return user;
    }
    return json(await getMcpConfig(env));
  }

  if (path === '/api/settings/mcp' && request.method === 'PUT') {
    const user = await requireUser(request, env);
    if (user instanceof Response) {
      return user;
    }
    const body = await readJson<{ mcp_enabled?: boolean; mcp_token?: string; mcp_allowed_origins?: string }>(request);
    if (body.mcp_enabled !== undefined) {
      await upsertSetting(env, 'mcp_enabled', body.mcp_enabled ? 'true' : 'false');
    }
    if (body.mcp_token !== undefined) {
      await upsertSetting(env, 'mcp_token', body.mcp_token.trim());
    }
    if (body.mcp_allowed_origins !== undefined) {
      await upsertSetting(env, 'mcp_allowed_origins', body.mcp_allowed_origins.trim());
    }
    return json(await getMcpConfig(env));
  }

  if (path === '/api/settings/mcp/token' && request.method === 'POST') {
    const user = await requireUser(request, env);
    if (user instanceof Response) {
      return user;
    }
    await upsertSetting(env, 'mcp_token', `lmcp_${base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)).buffer)}`);
    return json(await getMcpConfig(env));
  }

  if (path === '/api/settings/version' && request.method === 'GET') {
    const user = await requireUser(request, env);
    if (user instanceof Response) {
      return user;
    }
    let latest: string | null = null;
    try {
      const response = await fetch('https://api.github.com/repos/topqaz/LiteMark/releases/latest', {
        headers: { 'User-Agent': 'LiteMark-Cloudflare-Worker/1.0' },
      });
      const payload = await response.json() as { tag_name?: string; name?: string };
      latest = payload.tag_name || payload.name || null;
    } catch {
      latest = null;
    }
    return json({
      current_version: VERSION,
      latest_version: latest,
      update_available: Boolean(latest && latest.replace(/^v/, '') !== VERSION.replace(/^v/, '')),
      github_url: 'https://github.com/topqaz/LiteMark/releases/latest',
    });
  }

  return null;
};

const bookmarksForBackup = async (env: Env) => {
  const rows = await env.DB.prepare('SELECT * FROM bookmarks ORDER BY order_value ASC, created_at DESC').all<Bookmark>();
  return (rows.results ?? []).map(toBookmarkResponse);
};

const bookmarksToHtml = (bookmarks: Array<ReturnType<typeof toBookmarkResponse>>): string => {
  return [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>LiteMark Bookmarks</TITLE>',
    '<H1>LiteMark 书签导出</H1>',
    '<DL><p>',
    ...bookmarks.map((bookmark) => {
      const attrs = [
        `HREF="${escapeHtml(bookmark.url)}"`,
        bookmark.created_at ? `ADD_DATE="${escapeHtml(bookmark.created_at)}"` : '',
        bookmark.description ? `DESCRIPTION="${escapeHtml(bookmark.description)}"` : '',
      ].filter(Boolean).join(' ');
      return `  <DT><A ${attrs}>${escapeHtml(bookmark.title || bookmark.url)}</A>`;
    }),
    '</DL><p>',
  ].join('\n');
};

const parseCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
};

const parseCsvBookmarks = (text: string): Array<Record<string, unknown>> => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const headers = parseCsvLine(lines.shift() || '').map((header) => header.trim());
  return lines.map((line) => {
    const values = parseCsvLine(line);
    const item: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      item[header] = values[index] ?? '';
    });
    return item;
  }).filter((item) => item.title && item.url);
};

const parseHtmlBookmarks = (text: string): Array<Record<string, unknown>> => {
  const items: Array<Record<string, unknown>> = [];
  const pattern = /<A\b([^>]*)>([^<]+)<\/A>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const attrs = match[1];
    const url = attrs.match(/\bHREF=["']([^"']+)["']/i)?.[1];
    if (url) {
      items.push({
        title: match[2].trim(),
        url,
        category: null,
        description: attrs.match(/\bDESCRIPTION=["']([^"']+)["']/i)?.[1] || null,
        visible: true,
      });
    }
  }
  return items;
};

const importBookmarks = async (
  env: Env,
  bookmarks: Array<Record<string, unknown>>,
  categoryOrder: Array<Record<string, unknown>> = [],
  overwrite = false,
) => {
  if (overwrite) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM bookmarks'),
      env.DB.prepare('DELETE FROM category_order'),
    ]);
  }

  let imported = 0;
  for (const item of bookmarks) {
    if (!item.url) {
      continue;
    }
    const createdAt = String(item.created_at || now());
    await env.DB.prepare(
      `INSERT OR REPLACE INTO bookmarks (id, title, url, category, description, visible, order_value, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        String(item.id || uuid()),
        String(item.title || item.url || ''),
        String(item.url || ''),
        item.category ? String(item.category) : null,
        item.description ? String(item.description) : null,
        item.visible === false || item.visible === 'false' ? 0 : 1,
        Number(item.order ?? item.order_value ?? imported),
        item.tags ? String(item.tags) : null,
        createdAt,
        String(item.updated_at || createdAt),
      )
      .run();
    imported += 1;
    await ensureCategory(env, item.category ? String(item.category) : null);
  }

  let importedCategories = 0;
  for (const item of categoryOrder) {
    if (item.category) {
      await env.DB.prepare(
        'INSERT INTO category_order (category, order_value) VALUES (?, ?) ON CONFLICT(category) DO UPDATE SET order_value = excluded.order_value',
      )
        .bind(String(item.category), Number(item.order ?? 0))
        .run();
      importedCategories += 1;
    }
  }

  return { imported, importedCategories };
};

const getWebDavConfig = async (env: Env) => {
  const settings = await getSettingsMap(env);
  return {
    url: settings.webdav_url || DEFAULT_WEBDAV_CONFIG.url,
    username: settings.webdav_username || DEFAULT_WEBDAV_CONFIG.username,
    password: settings.webdav_password || DEFAULT_WEBDAV_CONFIG.password,
    path: settings.webdav_path || DEFAULT_WEBDAV_CONFIG.path,
    keepBackups: Number(settings.webdav_keep_backups || DEFAULT_WEBDAV_CONFIG.keepBackups),
    enabled: (settings.webdav_enabled || String(DEFAULT_WEBDAV_CONFIG.enabled)) === 'true',
    backupTime: settings.webdav_backup_time || DEFAULT_WEBDAV_CONFIG.backupTime,
    lastBackup: settings.webdav_last_backup || DEFAULT_WEBDAV_CONFIG.lastBackup,
  };
};

const webDavUrl = (baseUrl: string, path: string, filename = ''): string => {
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\/+|\/+$/g, '')}/${filename}`.replace(/([^:]\/)\/+/g, '$1');
};

const webDavRequest = async (method: string, url: string, username: string, password: string, body?: BodyInit): Promise<Response> => {
  return fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${btoa(`${username}:${password}`)}`,
    },
    body,
  });
};

const buildBackupPayload = async (env: Env) => {
  const bookmarks = await bookmarksForBackup(env);
  const categories = await env.DB.prepare('SELECT category, order_value AS "order" FROM category_order ORDER BY order_value ASC').all();
  return JSON.stringify({
    version: VERSION,
    exported_at: now(),
    bookmarks,
    category_order: categories.results ?? [],
  }, null, 2);
};

const listWebDavBackupFiles = async (config: Awaited<ReturnType<typeof getWebDavConfig>>): Promise<string[]> => {
  const response = await webDavRequest('PROPFIND', webDavUrl(config.url, config.path), config.username, config.password, `<?xml version="1.0" encoding="utf-8" ?><propfind xmlns="DAV:"><prop><displayname /></prop></propfind>`);
  if (!response.ok && response.status !== 207) {
    return [];
  }
  const text = await response.text();
  const matches = Array.from(text.matchAll(/<[^:>]*:?href>([^<]+)<\/[^:>]*:?href>/gi));
  return matches
    .map((match) => decodeURIComponent(match[1].split('/').pop() || ''))
    .filter((name) => /^litemark-backup-.*\.json$/.test(name))
    .sort();
};

const cleanupWebDavBackups = async (config: Awaited<ReturnType<typeof getWebDavConfig>>) => {
  const keep = Math.max(1, Number(config.keepBackups || 7));
  const files = await listWebDavBackupFiles(config);
  const remove = files.slice(0, Math.max(0, files.length - keep));
  await Promise.all(remove.map((filename) => webDavRequest('DELETE', webDavUrl(config.url, config.path, filename), config.username, config.password)));
  return remove.length;
};

const runWebDavBackup = async (env: Env, reason = 'manual') => {
  const config = await getWebDavConfig(env);
  if (!config.url || !config.username || !config.password) {
    throw new Error('WebDAV 配置不完整');
  }
  const filename = `litemark-backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
  const response = await webDavRequest('PUT', webDavUrl(config.url, config.path, filename), config.username, config.password, await buildBackupPayload(env));
  if (!response.ok && response.status !== 201 && response.status !== 204) {
    throw new Error(`WebDAV 备份失败: ${response.status}`);
  }
  const removed = await cleanupWebDavBackups(config);
  await upsertSetting(env, 'webdav_last_backup', now());
  await upsertSetting(env, 'webdav_last_backup_reason', reason);
  return { filename, removed };
};

const getShanghaiParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '00';
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    hour: Number(value('hour')),
    minute: Number(value('minute')),
  };
};

const shouldRunScheduledBackup = async (env: Env, scheduledAt: Date): Promise<boolean> => {
  const config = await getWebDavConfig(env);
  if (!config.enabled || !config.url || !config.username || !config.password) {
    return false;
  }
  const [hourText, minuteText] = config.backupTime.split(':');
  const targetMinutes = Number(hourText || 0) * 60 + Number(minuteText || 0);
  const shanghai = getShanghaiParts(scheduledAt);
  const currentMinutes = shanghai.hour * 60 + shanghai.minute;
  const delta = (currentMinutes - targetMinutes + 1440) % 1440;
  if (delta > 29) {
    return false;
  }
  const settings = await getSettingsMap(env);
  return settings.webdav_last_scheduled_backup_date !== shanghai.date;
};

const handleBackup = async (request: Request, env: Env, path: string, url: URL): Promise<Response | null> => {
  if (path === '/api/backup/export' && request.method === 'GET') {
    const user = await requireUser(request, env);
    if (user instanceof Response) {
      return user;
    }

    const format = url.searchParams.get('format') || 'json';
    const bookmarks = await bookmarksForBackup(env);
    const categories = await env.DB.prepare('SELECT category, order_value AS "order" FROM category_order ORDER BY order_value ASC').all<{
      category: string;
      order: number;
    }>();

    if (format === 'csv') {
      const header = 'id,title,url,category,description,tags,visible,order,created_at,updated_at';
      const lines = bookmarks.map((bookmark) =>
        [
          bookmark.id,
          bookmark.title,
          bookmark.url,
          bookmark.category ?? '',
          bookmark.description ?? '',
          bookmark.tags ?? '',
          bookmark.visible,
          bookmark.order,
          bookmark.created_at ?? '',
          bookmark.updated_at ?? '',
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(','),
      );
      return new Response([header, ...lines].join('\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename=litemark-bookmarks-${new Date().toISOString().slice(0, 10)}.csv`,
        },
      });
    }

    if (format === 'html') {
      return new Response(bookmarksToHtml(bookmarks), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename=litemark-bookmarks-${new Date().toISOString().slice(0, 10)}.html`,
        },
      });
    }

    return json(
      {
        version: VERSION,
        exported_at: now(),
        bookmarks,
        category_order: categories.results ?? [],
      },
      {
        headers: {
          'Content-Disposition': `attachment; filename=litemark-backup-${new Date().toISOString().slice(0, 10)}.json`,
        },
      },
    );
  }

  if (path === '/api/backup/import' && request.method === 'POST') {
    const user = await requireUser(request, env);
    if (user instanceof Response) {
      return user;
    }
    const body = await readJson<{ bookmarks?: Array<Record<string, unknown>>; category_order?: Array<Record<string, unknown>>; categoryOrder?: Array<Record<string, unknown>> }>(request);
    const result = await importBookmarks(env, body.bookmarks ?? [], body.category_order ?? body.categoryOrder ?? [], true);
    return json({ success: true, imported_bookmarks: result.imported, imported_categories: result.importedCategories });
  }

  if (path === '/api/backup/import-file' && request.method === 'POST') {
    const user = await requireUser(request, env);
    if (user instanceof Response) {
      return user;
    }
    const form = await request.formData();
    const file = form.get('file');
    const overwrite = String(form.get('overwrite') || 'false') === 'true';
    if (!(file instanceof File)) {
      return error('请选择导入文件');
    }
    const content = await file.text();
    let bookmarks: Array<Record<string, unknown>> = [];
    let categoryOrder: Array<Record<string, unknown>> = [];
    const name = file.name.toLowerCase();

    if (name.endsWith('.csv') || file.type === 'text/csv') {
      bookmarks = parseCsvBookmarks(content);
    } else if (name.endsWith('.html') || name.endsWith('.htm') || file.type === 'text/html') {
      bookmarks = parseHtmlBookmarks(content);
    } else {
      try {
        const payload = JSON.parse(content) as Array<Record<string, unknown>> | { bookmarks?: Array<Record<string, unknown>>; category_order?: Array<Record<string, unknown>> };
        if (Array.isArray(payload)) {
          bookmarks = payload;
        } else {
          bookmarks = payload.bookmarks ?? [];
          categoryOrder = payload.category_order ?? [];
        }
      } catch {
        return error('无法识别的导入文件格式，只支持 CSV/JSON/HTML');
      }
    }

    const result = await importBookmarks(env, bookmarks, categoryOrder, overwrite);
    return json({ success: true, imported_bookmarks: result.imported, imported_categories: result.importedCategories });
  }

  if (path.startsWith('/api/backup/webdav')) {
    const user = await requireUser(request, env);
    if (user instanceof Response) {
      return user;
    }
    const config = await getWebDavConfig(env);

    if (request.method === 'GET') {
      if (url.searchParams.get('test') === 'true') {
        if (!config.url || !config.username || !config.password) {
          return error('WebDAV 配置不完整');
        }
        const response = await webDavRequest('PROPFIND', webDavUrl(config.url, config.path), config.username, config.password);
        if (!response.ok && response.status !== 207 && response.status !== 404) {
          return error(`WebDAV 连接失败: ${response.status}`);
        }
        return json({ success: true, message: 'WebDAV 连接成功' });
      }
      return json({
        url: config.url,
        username: config.username,
        password: '',
        path: config.path,
        keepBackups: config.keepBackups,
        enabled: config.enabled,
        backupTime: config.backupTime,
        lastBackup: config.lastBackup,
        configured: Boolean(config.url),
      });
    }

    if (request.method === 'PUT') {
      const body = await readJson<Record<string, unknown>>(request);
      const mapping: Record<string, string> = {
        url: 'webdav_url',
        username: 'webdav_username',
        password: 'webdav_password',
        path: 'webdav_path',
        keepBackups: 'webdav_keep_backups',
        enabled: 'webdav_enabled',
        backupTime: 'webdav_backup_time',
      };
      for (const [inputKey, settingKey] of Object.entries(mapping)) {
        if (body[inputKey] !== undefined && body[inputKey] !== null && !(inputKey === 'password' && body[inputKey] === '')) {
          await upsertSetting(env, settingKey, inputKey === 'enabled' ? String(Boolean(body[inputKey])) : String(body[inputKey]));
        }
      }
      return json({ success: true, message: 'WebDAV 配置已保存' });
    }

    if (request.method === 'POST') {
      try {
        const result = await runWebDavBackup(env, 'manual');
        return json({ success: true, message: '备份到 WebDAV 成功', ...result });
      } catch (err) {
        return error(err instanceof Error ? err.message : 'WebDAV 备份失败');
      }
    }
  }

  return null;
};

const handleAi = async (request: Request, env: Env, path: string): Promise<Response | null> => {
  if (path === '/api/ai/status' && request.method === 'GET') {
    const settings = await getAiConfig(env);
    return json({
      openai_configured: Boolean(settings.ai_api_key),
      openai_model: settings.ai_model,
      openai_base_url: settings.ai_base_url,
    });
  }

  if (path === '/api/ai/fetch-page-info' && request.method === 'POST') {
    const body = await readJson<{ url?: string }>(request);
    if (!body.url) {
      return error('请提供 url');
    }
    try {
      const { title, description } = await getPageInfo(body.url);
      return json({ title, description, favicon: '' });
    } catch {
      return error('无法获取网页信息');
    }
  }

  if (path === '/api/ai/summarize' && request.method === 'POST') {
    const user = await optionalUser(request, env);
    const body = await readJson<{ bookmark_id?: string; url?: string }>(request);
    let targetUrl = body.url;
    if (body.bookmark_id) {
      const bookmark = await env.DB.prepare('SELECT * FROM bookmarks WHERE id = ?').bind(body.bookmark_id).first<Bookmark>();
      targetUrl = bookmark?.url;
    }
    if (!targetUrl) {
      return error('请提供 bookmark_id 或 url');
    }
    try {
      const page = await getPageInfo(targetUrl);
      const content = await chatCompletion(env, [
        { role: 'system', content: '你是书签管理助手。请根据网页内容生成简洁摘要和 3-8 个中文标签，只返回 JSON。' },
        {
          role: 'user',
          content: `URL: ${targetUrl}\n标题: ${page.title}\n描述: ${page.description}\n正文: ${page.text}\n\n返回格式: {"summary":"...","tags":["..."],"reading_time":1}`,
        },
      ], 900);
      const result = jsonFromModelText<{ summary: string; tags: string[]; reading_time?: number }>(content, {
        summary: page.description || page.title || '',
        tags: [],
        reading_time: undefined,
      });
      return json({
        summary: result.summary || page.description || page.title || '',
        tags: Array.isArray(result.tags) ? result.tags : [],
        reading_time: result.reading_time,
      });
    } catch (err) {
      return error(err instanceof Error ? err.message : 'AI 生成失败', 503);
    }
  }

  if (path === '/api/ai/classify' && request.method === 'POST') {
    const body = await readJson<{ bookmark_id?: string; url?: string; title?: string; description?: string }>(request);
    let title = body.title || '';
    let targetUrl = body.url || '';
    let description = body.description || '';
    if (body.bookmark_id) {
      const bookmark = await env.DB.prepare('SELECT * FROM bookmarks WHERE id = ?').bind(body.bookmark_id).first<Bookmark>();
      if (!bookmark) {
        return error('书签不存在', 404);
      }
      title = bookmark.title;
      targetUrl = bookmark.url;
      description = bookmark.description || '';
    }
    if (!targetUrl) {
      return error('请提供 bookmark_id 或 url');
    }
    const categories = await getCategories(env);
    try {
      if (!title || !description) {
        const page = await getPageInfo(targetUrl);
        title = title || page.title;
        description = description || page.description || page.text.slice(0, 1000);
      }
      const content = await chatCompletion(env, [
        { role: 'system', content: '你是书签分类助手。请从现有分类中选择最合适分类，必要时给出新分类。只返回 JSON。' },
        {
          role: 'user',
          content: `现有分类: ${categories.join(', ') || '无'}\n标题: ${title}\nURL: ${targetUrl}\n描述: ${description}\n\n返回格式: {"suggested_category":"...","confidence":0.8,"reasoning":"..."}`,
        },
      ], 500);
      const result = jsonFromModelText<{ suggested_category: string; confidence: number; reasoning: string }>(content, {
        suggested_category: categories[0] || '未分类',
        confidence: 0.5,
        reasoning: 'AI 未返回结构化结果',
      });
      return json({
        suggested_category: result.suggested_category || '未分类',
        confidence: typeof result.confidence === 'number' ? result.confidence : 0.5,
        reasoning: result.reasoning || '',
        existing_categories: categories,
      });
    } catch (err) {
      return error(err instanceof Error ? err.message : 'AI 分类失败', 503);
    }
  }

  if (path === '/api/ai/quick-add' && request.method === 'POST') {
    const user = await requireUser(request, env);
    if (user instanceof Response) {
      return user;
    }
    const body = await readJson<{ url?: string }>(request);
    if (!body.url) {
      return error('请提供 url');
    }
    try {
      const summary = await summarizeForQuickAdd(env, body.url);
      const category = await classifyForQuickAdd(env, summary.title, body.url, summary.summary);
      const bookmark = await createBookmarkRecord(env, {
        title: summary.title,
        url: body.url,
        description: summary.summary,
        tags: JSON.stringify(summary.tags),
        category,
        visible: true,
      });
      return json({ ...bookmark, tags: bookmark?.tags || '' });
    } catch (err) {
      return error(err instanceof Error ? err.message : '快速添加失败', 503);
    }
  }

  if (path === '/api/ai/quick-add-with-title' && request.method === 'POST') {
    const user = await requireUser(request, env);
    if (user instanceof Response) {
      return user;
    }
    const body = await readJson<{ url?: string; title?: string }>(request);
    if (!body.url || !body.title) {
      return error('请提供 url 和 title');
    }
    try {
      const summary = await summarizeForQuickAdd(env, body.url, body.title);
      const category = await classifyForQuickAdd(env, body.title, body.url, summary.summary);
      const bookmark = await createBookmarkRecord(env, {
        title: body.title,
        url: body.url,
        description: summary.summary,
        tags: JSON.stringify(summary.tags),
        category,
        visible: true,
      });
      return json({ ...bookmark, tags: bookmark?.tags || '' });
    } catch (err) {
      return error(err instanceof Error ? err.message : '快速添加失败', 503);
    }
  }

  if (path === '/api/ai/quick-add-with-category' && request.method === 'POST') {
    const user = await requireUser(request, env);
    if (user instanceof Response) {
      return user;
    }
    const body = await readJson<{ url?: string; title?: string; category?: string }>(request);
    if (!body.url || !body.title || !body.category) {
      return error('请提供 url、title 和 category');
    }
    try {
      const summary = await summarizeForQuickAdd(env, body.url, body.title);
      const bookmark = await createBookmarkRecord(env, {
        title: body.title,
        url: body.url,
        description: summary.summary,
        tags: JSON.stringify(summary.tags),
        category: body.category,
        visible: true,
      });
      return json({ ...bookmark, tags: bookmark?.tags || '' });
    } catch (err) {
      return error(err instanceof Error ? err.message : '快速添加失败', 503);
    }
  }

  if (path === '/api/ai/batch' && request.method === 'POST') {
    return unsupported('AI 批量后台任务');
  }

  if (path === '/api/ai/tasks' || path.startsWith('/api/ai/task/')) {
    return json([]);
  }

  return null;
};

const handleVersion = (path: string): Response | null => {
  if (path === '/version' || path === '/health') {
    if (path === '/health') {
      return json({ status: 'healthy', version: VERSION });
    }
    return json({
      version: VERSION,
      name: 'LiteMark',
      description: '书签管理系统 API - Cloudflare Workers',
      author: 'LiteMark',
    });
  }
  return null;
};

const mcpToolResult = (result: unknown) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify(result, null, 2),
    },
  ],
});

const callMcpTool = async (env: Env, name: string, args: Record<string, unknown>) => {
  switch (name) {
    case 'list_litemark_bookmarks': {
      const includeHidden = args.include_hidden !== false;
      const rows = await env.DB.prepare(
        includeHidden
          ? 'SELECT * FROM bookmarks ORDER BY order_value ASC, created_at DESC'
          : 'SELECT * FROM bookmarks WHERE visible = 1 ORDER BY order_value ASC, created_at DESC',
      ).all<Bookmark>();
      const query = String(args.query || '').toLowerCase();
      const category = args.category ? String(args.category) : '';
      const limit = Math.max(1, Math.min(Number(args.limit || 200), 1000));
      const bookmarks = (rows.results ?? []).map(toBookmarkResponse).filter((bookmark) => {
        if (category && bookmark.category !== category) return false;
        if (!query) return true;
        return `${bookmark.title} ${bookmark.url} ${bookmark.category || ''} ${bookmark.description || ''} ${bookmark.tags || ''}`.toLowerCase().includes(query);
      }).slice(0, limit);
      return { count: bookmarks.length, bookmarks };
    }
    case 'get_litemark_bookmark': {
      const bookmark = await env.DB.prepare('SELECT * FROM bookmarks WHERE id = ?').bind(String(args.bookmark_id || '')).first<Bookmark>();
      return bookmark ? { success: true, bookmark: toBookmarkResponse(bookmark) } : { success: false, error: '书签不存在' };
    }
    case 'add_litemark_bookmark': {
      const title = String(args.title || '').trim();
      const url = String(args.url || '').trim();
      if (!title || !url) return { success: false, error: '标题和 URL 不能为空' };
      const createdAt = now();
      const id = uuid();
      const category = args.category ? String(args.category).trim() : null;
      await ensureCategory(env, category);
      await env.DB.prepare(
        `INSERT INTO bookmarks (id, title, url, category, description, visible, order_value, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id,
        title,
        url,
        category,
        args.description ? String(args.description) : null,
        args.visible === false ? 0 : 1,
        0,
        Array.isArray(args.tags) ? JSON.stringify(args.tags) : args.tags ? String(args.tags) : null,
        createdAt,
        createdAt,
      ).run();
      const bookmark = await env.DB.prepare('SELECT * FROM bookmarks WHERE id = ?').bind(id).first<Bookmark>();
      return { success: true, bookmark: bookmark ? toBookmarkResponse(bookmark) : null };
    }
    case 'update_litemark_bookmark': {
      const id = String(args.bookmark_id || '');
      const current = await env.DB.prepare('SELECT * FROM bookmarks WHERE id = ?').bind(id).first<Bookmark>();
      if (!current) return { success: false, error: '书签不存在' };
      const category = args.category !== undefined ? String(args.category || '').trim() || null : current.category;
      await ensureCategory(env, category);
      await env.DB.prepare(
        `UPDATE bookmarks SET title = ?, url = ?, category = ?, description = ?, visible = ?, order_value = ?, tags = ?, updated_at = ? WHERE id = ?`,
      ).bind(
        args.title !== undefined ? String(args.title) : current.title,
        args.url !== undefined ? String(args.url) : current.url,
        category,
        args.description !== undefined ? String(args.description || '') : current.description,
        args.visible === undefined ? current.visible : args.visible ? 1 : 0,
        args.order !== undefined ? Number(args.order) : current.order_value,
        args.tags !== undefined ? (Array.isArray(args.tags) ? JSON.stringify(args.tags) : String(args.tags || '')) : current.tags,
        now(),
        id,
      ).run();
      const bookmark = await env.DB.prepare('SELECT * FROM bookmarks WHERE id = ?').bind(id).first<Bookmark>();
      return { success: true, bookmark: bookmark ? toBookmarkResponse(bookmark) : null };
    }
    case 'delete_litemark_bookmark':
      await env.DB.prepare('DELETE FROM bookmarks WHERE id = ?').bind(String(args.bookmark_id || '')).run();
      return { success: true, deleted_id: args.bookmark_id };
    case 'list_litemark_categories':
      return { categories: await getCategories(env) };
    case 'add_litemark_category':
      await ensureCategory(env, String(args.category || '').trim());
      return { success: true, category: args.category };
    case 'rename_litemark_category': {
      const oldName = String(args.old_name || '');
      const newName = String(args.new_name || '');
      await env.DB.batch([
        env.DB.prepare('UPDATE bookmarks SET category = ?, updated_at = ? WHERE category = ?').bind(newName, now(), oldName),
        env.DB.prepare('UPDATE category_order SET category = ? WHERE category = ?').bind(newName, oldName),
      ]);
      return { success: true, category: newName };
    }
    case 'delete_litemark_category': {
      const category = String(args.category || '');
      await env.DB.batch([
        env.DB.prepare('UPDATE bookmarks SET category = NULL, updated_at = ? WHERE category = ?').bind(now(), category),
        env.DB.prepare('DELETE FROM category_order WHERE category = ?').bind(category),
      ]);
      return { success: true, category };
    }
    case 'reorder_litemark_bookmarks': {
      const ids = Array.isArray(args.bookmark_ids) ? args.bookmark_ids.map(String) : [];
      await Promise.all(ids.map((id, index) => env.DB.prepare('UPDATE bookmarks SET order_value = ?, updated_at = ? WHERE id = ?').bind(index, now(), id).run()));
      return { success: true, ordered_ids: ids };
    }
    case 'reorder_litemark_categories': {
      const categories = Array.isArray(args.categories) ? args.categories.map(String) : [];
      await Promise.all(categories.map((category, index) => env.DB.prepare(
        'INSERT INTO category_order (category, order_value) VALUES (?, ?) ON CONFLICT(category) DO UPDATE SET order_value = excluded.order_value',
      ).bind(category, index).run()));
      return { success: true, categories };
    }
    default:
      return { success: false, error: `未知工具: ${name}` };
  }
};

const createBookmarkRecord = async (env: Env, input: BookmarkInput) => {
  if (!input.title || !input.url) {
    throw new Error('标题和 URL 不能为空');
  }
  const max = await env.DB.prepare('SELECT COALESCE(MAX(order_value), -1) AS max_order FROM bookmarks WHERE COALESCE(category, "") = COALESCE(?, "")')
    .bind(input.category ?? null)
    .first<{ max_order: number }>();
  const createdAt = now();
  const id = uuid();
  await ensureCategory(env, input.category);
  await env.DB.prepare(
    `INSERT INTO bookmarks (id, title, url, category, description, visible, order_value, tags, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.title,
      input.url,
      input.category ?? null,
      input.description ?? null,
      input.visible === false ? 0 : 1,
      input.order ?? (max?.max_order ?? -1) + 1,
      input.tags ?? null,
      createdAt,
      createdAt,
    )
    .run();
  const bookmark = await env.DB.prepare('SELECT * FROM bookmarks WHERE id = ?').bind(id).first<Bookmark>();
  return bookmark ? toBookmarkResponse(bookmark) : null;
};

const summarizeForQuickAdd = async (env: Env, url: string, title = '') => {
  const page = await getPageInfo(url);
  const content = await chatCompletion(env, [
    { role: 'system', content: '你是书签管理助手。请根据网页内容生成简洁摘要和 3-8 个中文标签，只返回 JSON。' },
    { role: 'user', content: `URL: ${url}\n标题: ${title || page.title}\n描述: ${page.description}\n正文: ${page.text}\n\n返回格式: {"summary":"...","tags":["..."],"reading_time":1}` },
  ], 900);
  const result = jsonFromModelText<{ summary: string; tags: string[] }>(content, { summary: page.description || '', tags: [] });
  return {
    title: title || page.title || url,
    summary: result.summary || page.description || '',
    tags: Array.isArray(result.tags) ? result.tags : [],
  };
};

const classifyForQuickAdd = async (env: Env, title: string, url: string, description: string) => {
  const categories = await getCategories(env);
  const content = await chatCompletion(env, [
    { role: 'system', content: '你是书签分类助手。请从现有分类中选择最合适分类，必要时给出新分类。只返回 JSON。' },
    { role: 'user', content: `现有分类: ${categories.join(', ') || '无'}\n标题: ${title}\nURL: ${url}\n描述: ${description}\n\n返回格式: {"suggested_category":"...","confidence":0.8,"reasoning":"..."}` },
  ], 500);
  const result = jsonFromModelText<{ suggested_category: string }>(content, { suggested_category: categories[0] || '未分类' });
  return result.suggested_category || '未分类';
};

const mcpTools = () => [
  { name: 'list_litemark_bookmarks', description: 'List LiteMark bookmarks', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_litemark_bookmark', description: 'Get one bookmark by id', inputSchema: { type: 'object', properties: { bookmark_id: { type: 'string' } }, required: ['bookmark_id'] } },
  { name: 'add_litemark_bookmark', description: 'Add a bookmark', inputSchema: { type: 'object', properties: { title: { type: 'string' }, url: { type: 'string' }, category: { type: 'string' }, description: { type: 'string' }, tags: {}, visible: { type: 'boolean' } }, required: ['title', 'url'] } },
  { name: 'update_litemark_bookmark', description: 'Update a bookmark', inputSchema: { type: 'object', properties: { bookmark_id: { type: 'string' } }, required: ['bookmark_id'] } },
  { name: 'delete_litemark_bookmark', description: 'Delete a bookmark', inputSchema: { type: 'object', properties: { bookmark_id: { type: 'string' } }, required: ['bookmark_id'] } },
  { name: 'list_litemark_categories', description: 'List categories', inputSchema: { type: 'object', properties: {} } },
  { name: 'add_litemark_category', description: 'Add category', inputSchema: { type: 'object', properties: { category: { type: 'string' } }, required: ['category'] } },
  { name: 'rename_litemark_category', description: 'Rename category', inputSchema: { type: 'object', properties: { old_name: { type: 'string' }, new_name: { type: 'string' } }, required: ['old_name', 'new_name'] } },
  { name: 'delete_litemark_category', description: 'Delete category', inputSchema: { type: 'object', properties: { category: { type: 'string' } }, required: ['category'] } },
  { name: 'reorder_litemark_bookmarks', description: 'Reorder bookmarks', inputSchema: { type: 'object', properties: { bookmark_ids: { type: 'array', items: { type: 'string' } } }, required: ['bookmark_ids'] } },
  { name: 'reorder_litemark_categories', description: 'Reorder categories', inputSchema: { type: 'object', properties: { categories: { type: 'array', items: { type: 'string' } } }, required: ['categories'] } },
];

const handleMcpAndOAuth = async (request: Request, env: Env, path: string): Promise<Response | null> => {
  const base = externalBaseUrl(request);
  if (path === '/.well-known/oauth-protected-resource' || path === '/.well-known/oauth-protected-resource/mcp') {
    return json({ resource: `${base}/mcp/`, authorization_servers: [base], bearer_methods_supported: ['header'], scopes_supported: MCP_SCOPE.split(' ') });
  }
  if (path === '/.well-known/oauth-authorization-server') {
    return json({ issuer: base, token_endpoint: `${base}/oauth/token`, grant_types_supported: ['client_credentials'], token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'], scopes_supported: MCP_SCOPE.split(' '), response_types_supported: [] });
  }
  if (path === '/oauth/token' && request.method === 'POST') {
    const config = await getMcpConfig(env);
    const form = await request.formData();
    const basic = request.headers.get('Authorization') || '';
    let basicSecret = '';
    if (basic.toLowerCase().startsWith('basic ')) {
      basicSecret = atob(basic.slice(6)).split(':')[1] || '';
    }
    const clientSecret = String(form.get('client_secret') || basicSecret || '');
    if (!config.mcp_enabled || !config.mcp_token || clientSecret !== config.mcp_token) {
      return error('client_secret 无效', 401);
    }
    const token = await signToken({ sub: 'litemark-mcp', typ: 'mcp_oauth', scope: MCP_SCOPE, mcp_token_hash: await tokenHash(config.mcp_token), exp: Math.floor(Date.now() / 1000) + 3600 }, getJwtSecret(env));
    return json({ access_token: token, token_type: 'Bearer', expires_in: 3600, scope: MCP_SCOPE });
  }
  if (path === '/mcp' || path === '/mcp/') {
    const { config, response } = await requireMcpAuth(request, env);
    const cors = mcpCorsHeaders(request, config);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (response) {
      cors.forEach((value, key) => response.headers.set(key, value));
      return response;
    }
    if (request.method !== 'POST') return json({ status: 'ok' }, { headers: cors });
    const rpc = await readJson<{ id?: unknown; method?: string; params?: Record<string, unknown> }>(request);
    let result: unknown;
    if (rpc.method === 'initialize') {
      result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'LiteMark', version: VERSION } };
    } else if (rpc.method === 'tools/list') {
      result = { tools: mcpTools() };
    } else if (rpc.method === 'tools/call') {
      const params = rpc.params || {};
      result = mcpToolResult(await callMcpTool(env, String(params.name || ''), (params.arguments || {}) as Record<string, unknown>));
    } else {
      return json({ jsonrpc: '2.0', id: rpc.id ?? null, error: { code: -32601, message: 'Method not found' } }, { headers: cors });
    }
    return json({ jsonrpc: '2.0', id: rpc.id ?? null, result }, { headers: cors });
  }
  return null;
};

const handleApi = async (request: Request, env: Env): Promise<Response | null> => {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '') || '/';

  if (path.startsWith('/mcp') || path.startsWith('/oauth') || path.startsWith('/.well-known/')) {
    return handleMcpAndOAuth(request, env, path);
  }

  const handlers = [
    () => handleVersion(path),
    () => handleAuth(request, env, path),
    () => handleBookmarks(request, env, path),
    () => handleSettings(request, env, path),
    () => handleBackup(request, env, path, url),
    () => handleAi(request, env, path),
  ];

  for (const handler of handlers) {
    const response = await handler();
    if (response) {
      return response;
    }
  }

  if (path.startsWith('/api/')) {
    return error('接口不存在', 404);
  }
  return null;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const apiResponse = await handleApi(request, env);
    if (apiResponse) {
      return apiResponse;
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil((async () => {
      const scheduledAt = new Date(event.scheduledTime);
      if (!(await shouldRunScheduledBackup(env, scheduledAt))) {
        return;
      }
      await runWebDavBackup(env, 'scheduled');
      await upsertSetting(env, 'webdav_last_scheduled_backup_date', getShanghaiParts(scheduledAt).date);
    })());
  },
};
