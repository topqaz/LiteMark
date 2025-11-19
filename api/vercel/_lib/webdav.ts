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
 * 上传文件到 WebDAV
 */
export async function uploadToWebDAV(
  config: WebDAVConfig,
  content: string,
  filename?: string
): Promise<void> {
  const { url, username, password, path = 'litemark-backup/' } = config;
  
  // 确保 URL 以 / 结尾
  const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
  const filePath = filename || path;
  const fullUrl = `${baseUrl}${filePath.startsWith('/') ? filePath : '/' + filePath}`;
  
  // 创建 Basic Auth header
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  
  const response = await fetch(fullUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Content-Length': content.length.toString()
    },
    body: content
  });
  
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`WebDAV 上传失败 (${response.status}): ${errorText}`);
  }
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
    
    const response = await fetch(baseUrl, {
      method: 'PROPFIND',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Depth': '0'
      }
    });
    
    // 200, 207 (Multi-Status) 或 404 都表示连接成功
    return response.status === 200 || response.status === 207 || response.status === 404;
  } catch (error) {
    console.error('WebDAV 连接测试失败:', error);
    return false;
  }
}

/**
 * 列出 WebDAV 目录中的备份文件
 */
export async function listBackupFiles(config: WebDAVConfig): Promise<Array<{ name: string; lastModified: Date }>> {
  const { url, username, password, path = 'litemark-backup/' } = config;
  const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
  
  // 确定目录路径
  const dirPath = path.endsWith('/') ? path : path.includes('.json') ? path.substring(0, path.lastIndexOf('/') + 1) || '/' : path;
  const fullUrl = `${baseUrl}${dirPath.startsWith('/') ? dirPath : '/' + dirPath}`;
  
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  
  try {
    const response = await fetch(fullUrl, {
      method: 'PROPFIND',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Depth': '1'
      }
    });
    
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
      // 从文件名提取日期：litemark-backup-2024-01-01.json
      const dateMatch = fileName.match(/litemark-backup-(\d{4}-\d{2}-\d{2})\.json/);
      if (dateMatch) {
        const date = new Date(dateMatch[1] + 'T00:00:00Z');
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
  
  const response = await fetch(fullUrl, {
    method: 'DELETE',
    headers: {
      'Authorization': `Basic ${auth}`
    }
  });
  
  // 204 (No Content) 或 404 (Not Found) 都表示成功
  if (response.status !== 204 && response.status !== 404) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`删除文件失败 (${response.status}): ${errorText}`);
  }
}

/**
 * 清理旧备份文件
 */
export async function cleanupOldBackups(config: WebDAVConfig): Promise<number> {
  const keepBackups = config.keepBackups ?? 7;
  
  // 如果设置为 0，表示不限制，不清理
  if (keepBackups === 0) {
    return 0;
  }
  
  try {
    const files = await listBackupFiles(config);
    
    // 如果文件数量不超过保留数量，不需要清理
    if (files.length <= keepBackups) {
      return 0;
    }
    
    // 删除超出保留数量的旧文件
    const filesToDelete = files.slice(keepBackups);
    let deletedCount = 0;
    
    const { path = 'litemark-backup/' } = config;
    const dirPath = path.endsWith('/') ? path : path.includes('.json') ? path.substring(0, path.lastIndexOf('/') + 1) || '/' : path;
    
    for (const file of filesToDelete) {
      try {
        const filePath = `${dirPath}${file.name}`;
        await deleteWebDAVFile(config, filePath);
        deletedCount++;
      } catch (error) {
        console.error(`删除备份文件失败: ${file.name}`, error);
      }
    }
    
    return deletedCount;
  } catch (error) {
    console.error('清理旧备份失败:', error);
    return 0;
  }
}

