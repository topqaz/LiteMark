import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getStorageConfig } from '../_lib/storage.js';
import { uploadToWebDAV, cleanupOldBackups, type WebDAVConfig } from '../_lib/webdav.js';
import { exportBackupData } from '../backup/export.js';

/**
 * Vercel Cron Job: 定时备份到 WebDAV
 * 
 * 配置方式：在 vercel.json 中添加 cron 配置
 * {
 *   "crons": [{
 *     "path": "/api/cron/backup",
 *     "schedule": "0 2 * * *"  // 每天凌晨 2 点执行
 *   }]
 * }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 验证 Cron Secret（可选，但推荐）
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 获取 WebDAV 配置
    const config = await getStorageConfig();
    
    if (!config || config.provider !== 'webdav') {
      return res.status(200).json({ 
        message: 'WebDAV 未配置，跳过备份',
        skipped: true 
      });
    }

    const webdavConfig = config as any as WebDAVConfig;
    
    // 检查是否启用自动备份
    if (webdavConfig.enabled !== true) {
      return res.status(200).json({ 
        message: '自动备份未启用，跳过备份',
        skipped: true 
      });
    }

    if (!webdavConfig.url || !webdavConfig.username || !webdavConfig.password) {
      return res.status(400).json({ 
        error: 'WebDAV 配置不完整' 
      });
    }

    // 执行备份：直接使用 export 功能
    const backup = await exportBackupData();
    const content = JSON.stringify(backup, null, 2);
    const filename = `litemark-backup-${new Date().toISOString().split('T')[0]}.json`;
    const filePath = webdavConfig.path || 'litemark-backup/';
    
    // 如果路径是目录，添加文件名
    const finalPath = filePath.endsWith('/') 
      ? `${filePath}${filename}` 
      : filePath.includes('.json') 
        ? filePath 
        : `${filePath}/${filename}`;
    
    await uploadToWebDAV(
      { ...webdavConfig, path: finalPath },
      content,
      finalPath
    );
    
    // 清理旧备份文件
    let deletedCount = 0;
    if (webdavConfig.keepBackups !== undefined && webdavConfig.keepBackups > 0) {
      try {
        deletedCount = await cleanupOldBackups(webdavConfig);
      } catch (error) {
        console.error('清理旧备份失败:', error);
        // 清理失败不影响备份流程
      }
    }
    
    return res.status(200).json({ 
      success: true,
      message: '定时备份成功',
      timestamp: new Date().toISOString(),
      bookmarksCount: backup.bookmarks.length,
      deletedBackups: deletedCount
    });
  } catch (error) {
    console.error('定时备份失败:', error);
    return res.status(500).json({ 
      error: '定时备份失败',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

