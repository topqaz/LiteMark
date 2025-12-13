/**
 * WebDAV 客户端工具
 */

export interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
  path?: string; // 备份文件路径，默认为 litemark-backup/
  enabled?: boolean; // 是否启用自动备份
  keepBackups?: number; // 保留备份数量，0 表示不限制，默认保留 7 个
}

/**
 * 确保 WebDAV 目录存在
 */
async function ensureDirectoryExists(
  baseUrl: string,
  auth: string,
  dirPath: string
): Promise<void> {
  // 如果路径是文件路径，提取目录部分
  const directory = dirPath.includes('/') 
    ? dirPath.substring(0, dirPath.lastIndexOf('/'))
    : dirPath;
  
  if (!directory || directory === '/') {
    return; // 根目录，不需要创建
  }
  
  const dirUrl = `${baseUrl}${directory.startsWith('/') ? directory : '/' + directory}`;
  
  let timeoutId: NodeJS.Timeout | null = null;
  try {
    // 尝试创建目录（如果不存在）
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
    
    const response = await fetch(dirUrl, {
      method: 'MKCOL',
      headers: {
        'Authorization': `Basic ${auth}`,
        'User-Agent': 'LiteMark/1.0'
      },
      signal: controller.signal
    });
    
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    
    // 201 (Created) 表示成功创建，405 (Method Not Allowed) 表示已存在，都是正常的
    if (response.status !== 201 && response.status !== 405 && response.status !== 409) {
      // 409 (Conflict) 也可能表示已存在，但有些服务器会返回这个
      if (response.status !== 207) {
        // 207 (Multi-Status) 也可能表示部分成功
        console.warn(`创建目录可能失败 (${response.status}): ${dirUrl}`);
      }
    }
  } catch (error: any) {
    // 清理 timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    // 忽略目录创建错误，继续尝试上传
    console.warn('创建目录时出错（可能已存在）:', error.message || error);
  }
}


export async function uploadToWebDAV(
  config: WebDAVConfig,
  content: string,
  filename?: string,
  maxRetries: number = 3
): Promise<void> {
  const { url, username, password, path = 'litemark-backup/' } = config;

  // 确保 baseUrl 不以 / 结尾
  const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
  
  // 构建文件路径
  let filePath: string = filename || path;

  // 确保 filePath 以 / 开头
  if (!filePath.startsWith('/')) {
    filePath = '/' + filePath;
  }

  // 构建完整 URL
  const fullUrl = `${baseUrl}${filePath}`;

  // 创建 Basic Auth header
  const auth = Buffer.from(`${username}:${password}`).toString('base64');

  // 确保目录存在
  await ensureDirectoryExists(baseUrl, auth, filePath);

  // 请求头构建
  const contentBytes = Buffer.from(content, 'utf-8');
  const contentLength = contentBytes.length;
  
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': contentLength.toString(),
    'User-Agent': 'LiteMark/1.0'
  };

  console.log(`[WebDAV] 开始上传文件到: ${fullUrl}`);
  
  // 重试机制
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let timeoutId: NodeJS.Timeout | null = null;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时
      
      // 发起上传请求
      const response = await fetch(fullUrl, {
        method: 'PUT',
        headers,
        body: content,
        signal: controller.signal
      });

      clearTimeout(timeoutId); // 清理超时

      // 判断是否是网络或网关相关错误，进行重试
      if ([504, 502, 503].includes(response.status)) {
        const errorText = await response.text();
        if (attempt < maxRetries) {
          const waitTime = attempt * 3000; // 递增等待时间：3s, 6s, 9s
          console.warn(`收到网关超时错误 (${response.status})，${waitTime}ms 后重试 (${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        } else {
          throw new Error(`网关超时 (${response.status}): ${errorText}`);
        }
      }

      // 如果响应不成功，但不是网关错误
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`上传失败 (${response.status}): ${errorText.substring(0, 200)}`);
      }

      console.log(`[WebDAV] 上传成功: ${fullUrl}`);
      return;

    } catch (error: any) {
      // 处理上传时的网络错误或超时错误
      if (attempt === maxRetries) {
        console.error(`上传失败，最大重试次数已达 (${maxRetries})`);
        throw error;
      }

      const waitTime = attempt * 3000; // 递增等待时间：3s, 6s, 9s
      const errorMessage = error.message || error.name || '未知错误';
      console.warn(`上传失败 (${errorMessage})，${waitTime}ms 后重试 (${attempt}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  throw new Error('上传失败：未知错误');
}

/**
 * 测试 WebDAV 连接
 */
export async function testWebDAVConnection(config: WebDAVConfig): Promise<boolean> {
  try {
    const { url, username, password } = config;
    const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    
    // 尝试执行 PROPFIND 请求来测试连接
    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    
    let timeoutId: NodeJS.Timeout | null = null;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时
      
      const response = await fetch(baseUrl, {
        method: 'PROPFIND',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Depth': '0',
          'User-Agent': 'LiteMark/1.0'
        },
        signal: controller.signal
      });
      
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      
      // 200, 207 (Multi-Status) 或 404 都表示连接成功
      return response.status === 200 || response.status === 207 || response.status === 404;
    } catch (fetchError: any) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      
      // 如果是超时错误，提供更详细的日志
      if (fetchError.name === 'AbortError' || fetchError.message?.includes('aborted')) {
        console.error('WebDAV 连接测试超时:', baseUrl);
      }
      throw fetchError;
    }
  } catch (error: any) {
    console.error('WebDAV 连接测试失败:', error.message || error);
    return false;
  }
}

/**
 * 列出 WebDAV 目录中的备份文件
 */
export async function listWebDAVFiles(config: WebDAVConfig): Promise<Array<{ name: string; lastModified: Date }>> {
  const { url, username, password, path = 'litemark-backup/' } = config;
  const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;

  // 确定目录路径
  const dirPath = path.endsWith('/') ? path : path.includes('.json') ? path.substring(0, path.lastIndexOf('/') + 1) || '/' : path;
  const fullUrl = `${baseUrl}${dirPath.startsWith('/') ? dirPath : '/' + dirPath}`;

  const auth = Buffer.from(`${username}:${password}`).toString('base64');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时

    const response = await fetch(fullUrl, {
      method: 'PROPFIND',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Depth': '1',
        'User-Agent': 'LiteMark/1.0'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return [];
    }

    const xmlText = await response.text();
    const files: Array<{ name: string; lastModified: Date }> = [];

    // 简单的 XML 解析，提取备份文件
    const filePattern = /<d:href>([^<]+litemark-backup-[^<]+\.json)<\/d:href>/g;
    const datePattern = /<d:getlastmodified>([^<]+)<\/d:getlastmodified>/g;

    let match;
    const hrefs: string[] = [];
    while ((match = filePattern.exec(xmlText)) !== null) {
      const href = decodeURIComponent(match[1]);
      // 移除目录路径前缀，只保留文件名
      const fileName = href.replace(dirPath, '').replace(/^\//, '');
      if (fileName.startsWith('litemark-backup-') && fileName.endsWith('.json')) {
        hrefs.push(fileName);
      }
    }

    // 尝试提取日期信息（简化处理）
    for (const fileName of hrefs) {
      // 从文件名提取日期：litemark-backup-2025-12-13-14-42-47.json
      const dateMatch = fileName.match(/litemark-backup-(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})\.json/);
      if (dateMatch) {
        const dateString = dateMatch[1].replace(/-/g, ':'); // 转换成有效的日期格式
        const date = new Date(dateString);
        files.push({ name: fileName, lastModified: date });
      }
    }

    // 按日期排序，最新的在前
    files.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

    return files;
  } catch (error) {
    console.error('列出备份文件失败:', error);
    return [];
  }
}


/**
 * 删除 WebDAV 文件
 */
export async function deleteWebDAVFile(config: WebDAVConfig, filePath: string): Promise<void> {
  const { url, username, password } = config;
  const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
  const fullUrl = `${baseUrl}${filePath.startsWith('/') ? filePath : '/' + filePath}`;
  
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时
  
  const response = await fetch(fullUrl, {
    method: 'DELETE',
    headers: {
      'Authorization': `Basic ${auth}`,
      'User-Agent': 'LiteMark/1.0'
    },
    signal: controller.signal
  });
  
  clearTimeout(timeoutId);
  
  // 204 (No Content) 或 404 (Not Found) 都表示成功
  if (response.status !== 204 && response.status !== 404) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`删除文件失败 (${response.status}): ${errorText}`);
  }
}
