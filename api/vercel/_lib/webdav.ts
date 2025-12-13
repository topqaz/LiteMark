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


async function uploadWithRetry(
  fullUrl: string,
  auth: string,
  content: string,
  maxRetries: number = 3
): Promise<Response> {
  let lastError: Error | null = null;
  let lastResponse: Response | null = null;
  
  const contentBytes = Buffer.from(content, 'utf-8');
  const contentLength = contentBytes.length;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let timeoutId: NodeJS.Timeout | null = null;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时
      
      // 构建请求头
      // 某些 WebDAV 服务器对请求头很敏感，需要精确设置
      const headers: Record<string, string> = {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': contentLength.toString(), // 必须准确，使用字节长度
        'User-Agent': 'LiteMark/1.0'
      };
      
      // 使用字符串作为 body（fetch 会自动编码为 UTF-8）
      // 某些 WebDAV 服务器对 Buffer 的处理可能有问题，使用字符串更兼容
      const response = await fetch(fullUrl, {
        method: 'PUT',
        headers,
        body: content, // 使用原始字符串，fetch 会自动处理编码
        signal: controller.signal
      });
      
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      
      // 检查响应状态码，504 (Gateway Timeout) 和 502 (Bad Gateway) 应该重试
      if (response.status === 504 || response.status === 502 || response.status === 503) {
        lastResponse = response;
        const responseText = await response.text().catch(() => '');
        const isGatewayTimeout = response.status === 504 || 
                                 responseText.includes('504') || 
                                 responseText.includes('Gateway Time-out') ||
                                 responseText.includes('Gateway Timeout');
        
        if (attempt < maxRetries) {
          const waitTime = attempt * 3000; // 递增等待时间：3s, 6s, 9s
          console.warn(`收到网关超时错误 (${response.status})，${waitTime}ms 后重试 (${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        } else {
          throw new Error(`网关超时 (${response.status})：WebDAV 服务器响应超时，请检查服务器状态或网络连接`);
        }
      }
      
      // 如果响应不成功但不是网关错误，记录详细信息并返回
      if (!response.ok && response.status !== 504 && response.status !== 502 && response.status !== 503) {
        const errorText = await response.text().catch(() => '无法读取错误信息');
        console.error(`[WebDAV] 上传失败 (${response.status}):`, {
          status: response.status,
          statusText: response.statusText,
          url: fullUrl,
          error: errorText.substring(0, 500) // 限制错误文本长度
        });
        return response;
      }
      
      // 成功响应
      console.log(`[WebDAV] 上传成功 (${response.status}): ${fullUrl}`);
      return response;
    } catch (error: any) {
      // 清理 timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      
      lastError = error;
      
      // 检查是否是超时错误（AbortError）
      const isAbortError = error.name === 'AbortError' || 
                          error.message?.includes('aborted') ||
                          error.message?.includes('AbortError');
      
      // 检查是否是网络连接错误
      const isNetworkError = error.code === 'UND_ERR_SOCKET' ||
                            error.message?.includes('fetch failed') ||
                            error.message?.includes('other side closed') ||
                            error.message?.includes('ECONNREFUSED') ||
                            error.message?.includes('ETIMEDOUT') ||
                            error.message?.includes('ENOTFOUND');
      
      // 如果是超时或网络错误且还有重试机会，等待后重试
      if (attempt < maxRetries && (isAbortError || isNetworkError)) {
        const waitTime = attempt * 3000; // 递增等待时间：3s, 6s, 9s
        const errorType = isAbortError ? '超时' : '网络连接';
        console.warn(`上传失败（${errorType}），${waitTime}ms 后重试 (${attempt}/${maxRetries}):`, error.message || error.name);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      // 如果是最后一次尝试且是超时错误，提供更友好的错误消息
      if (attempt === maxRetries && isAbortError) {
        throw new Error(`上传超时：在 ${maxRetries} 次尝试后仍无法完成上传，请检查网络连接或 WebDAV 服务器状态`);
      }
      
      // 如果不是可重试的错误或没有重试机会了，直接抛出
      throw error;
    }
  }
  
  // 所有重试都失败了
  if (lastResponse) {
    throw new Error(`上传失败：网关错误 (${lastResponse.status})`);
  }
  throw lastError || new Error('上传失败：未知错误');
}

/**
 * 上传文件到 WebDAV
 */
export async function uploadToWebDAV(
  config: WebDAVConfig,
  content: string,
  filename?: string
): Promise<void> {
  const { url, username, password, path = 'litemark-backup/' } = config;
  
  // 确保 baseUrl 不以 / 结尾
  const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
  
  // 构建文件路径
  let filePath: string;
  if (filename) {
    // 如果提供了 filename，使用它（可能已经包含完整路径）
    filePath = filename;
  } else {
    // 否则使用 path
    filePath = path;
  }
  
  // 确保 filePath 以 / 开头
  if (!filePath.startsWith('/')) {
    filePath = '/' + filePath;
  }
  
  // 构建完整 URL
  // 对于 WebDAV，通常路径不需要编码，但某些服务器可能需要
  // 先尝试不编码，如果失败可以尝试编码
  const fullUrl = `${baseUrl}${filePath}`;
  
  console.log(`[WebDAV] 上传文件到: ${fullUrl}`);
  console.log(`[WebDAV] 文件路径: ${filePath}`);
  console.log(`[WebDAV] Base URL: ${baseUrl}`);
  
  // 创建 Basic Auth header
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  
  // 确保目录存在（使用原始路径，不编码）
  await ensureDirectoryExists(baseUrl, auth, filePath);
  
  // 使用重试机制上传
  console.log(`[WebDAV] 开始上传，内容大小: ${Buffer.from(content, 'utf-8').length} 字节`);
  const response = await uploadWithRetry(fullUrl, auth, content);
  
  if (!response.ok) {
    const errorText = await response.text().catch(() => '无法读取错误信息');
    const errorDetails = {
      status: response.status,
      statusText: response.statusText,
      url: fullUrl,
      error: errorText.substring(0, 500)
    };
    console.error(`[WebDAV] 上传最终失败:`, errorDetails);
    throw new Error(`WebDAV 上传失败 (${response.status}): ${errorText.substring(0, 200)}`);
  }
  
  console.log(`[WebDAV] 上传完成: ${fullUrl}`);
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
