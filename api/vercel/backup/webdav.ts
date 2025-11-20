import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  applyCors,
  handleOptions,
  parseJsonBody,
  sendError,
  sendJson
} from '../_lib/http.js';
import { getStorageConfig, saveStorageConfig } from '../_lib/storage.js';
import { uploadToWebDAV, testWebDAVConnection, cleanupOldBackups, type WebDAVConfig } from '../_lib/webdav.js';
import { requireAuth } from '../_lib/auth.js';
import { exportBackupData } from './export.js';
import { getShanghaiDateString, getShanghaiISOString } from '../_lib/date.js';

/**
 * 备份到 WebDAV
 */
export async function backupToWebDAV(config: WebDAVConfig): Promise<void> {
  // 直接使用 export 功能导出备份数据
  const backup = await exportBackupData();
  
  const content = JSON.stringify(backup, null, 2);
  const filename = `litemark-backup-${getShanghaiDateString()}.json`;
  const filePath = config.path || 'litemark-backup/';
  
  // 如果路径是目录，添加文件名
  const finalPath = filePath.endsWith('/') 
    ? `${filePath}${filename}` 
    : filePath.includes('.json') 
      ? filePath 
      : `${filePath}/${filename}`;
  console.log("开始上传备份文件到 WebDAV");
  await uploadToWebDAV(
    { ...config, path: finalPath },
    content,
    finalPath
  );
  
  // 清理旧备份文件
  if (config.keepBackups !== undefined && config.keepBackups > 0) {
    try {
      await cleanupOldBackups(config);
    } catch (error) {
      console.error('清理旧备份失败:', error);
      // 清理失败不影响备份流程
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, 'GET,POST,PUT,OPTIONS')) {
    return;
  }
  applyCors(res, 'GET,POST,PUT,OPTIONS');

  const auth = requireAuth(req, res);
  if (!auth) {
    return;
  }

  // GET: 获取 WebDAV 配置或测试连接
  if (req.method === 'GET') {
    try {
      const config = await getStorageConfig();
      
      // 如果查询参数中有 test=true，使用已保存的配置进行测试
      if (req.query.test === 'true') {
        if (!config || config.provider !== 'webdav') {
          sendError(res, 400, '请先配置 WebDAV');
          return;
        }

        const webdavConfig = config as any as WebDAVConfig;
        if (!webdavConfig.url || !webdavConfig.username || !webdavConfig.password) {
          sendError(res, 400, 'WebDAV 配置不完整');
          return;
        }

        const isValid = await testWebDAVConnection(webdavConfig);
        if (isValid) {
          sendJson(res, 200, { success: true, message: 'WebDAV 连接测试成功' });
        } else {
          sendError(res, 400, 'WebDAV 连接测试失败，请检查配置');
        }
        return;
      }

      // 正常获取配置
      if (config && config.provider === 'webdav') {
        // 不返回密码
        const { password, ...safeConfig } = config as any;
        sendJson(res, 200, safeConfig);
      } else {
        sendJson(res, 200, null);
      }
    } catch (error) {
      console.error('获取 WebDAV 配置失败', error);
      const message = error instanceof Error ? error.message : '获取 WebDAV 配置失败';
      sendError(res, 500, message);
    }
    return;
  }

  // PUT: 保存/更新 WebDAV 配置
  if (req.method === 'PUT') {
    try {
      const body = await parseJsonBody<WebDAVConfig & { provider: 'webdav' }>(req);
      
      if (!body.url || !body.username || !body.password) {
        sendError(res, 400, 'WebDAV URL、用户名和密码不能为空');
        return;
      }

      // 测试连接
      const isValid = await testWebDAVConnection({
        url: body.url,
        username: body.username,
        password: body.password,
        path: body.path
      });

      if (!isValid) {
        sendError(res, 400, 'WebDAV 连接测试失败，请检查配置');
        return;
      }

      // 保存配置
      await saveStorageConfig({
        provider: 'webdav',
        url: body.url,
        username: body.username,
        password: body.password,
        path: body.path || 'litemark-backup/',
        enabled: body.enabled !== false,
        keepBackups: body.keepBackups ?? 7
      });

      sendJson(res, 200, { success: true, message: 'WebDAV 配置已保存' });
    } catch (error) {
      console.error('保存 WebDAV 配置失败', error);
      const message = error instanceof Error ? error.message : '保存 WebDAV 配置失败';
      sendError(res, 400, message);
    }
    return;
  }

  // POST: 手动触发备份到 WebDAV
  if (req.method === 'POST') {
    try {
      const config = await getStorageConfig();
      
      if (!config || config.provider !== 'webdav') {
        sendError(res, 400, '请先配置 WebDAV');
        return;
      }

      const webdavConfig = config as any as WebDAVConfig;
      
      if (!webdavConfig.url || !webdavConfig.username || !webdavConfig.password) {
        sendError(res, 400, 'WebDAV 配置不完整');
        return;
      }

      await backupToWebDAV(webdavConfig);
      
      sendJson(res, 200, { 
        success: true, 
        message: '备份到 WebDAV 成功',
        timestamp: getShanghaiISOString()
      });
    } catch (error) {
      console.error('备份到 WebDAV 失败', error);
      const message = error instanceof Error ? error.message : '备份到 WebDAV 失败';
      sendError(res, 500, message);
    }
    return;
  }

  sendError(res, 405, 'Method Not Allowed');
}

