import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  applyCors,
  handleOptions,
  parseJsonBody,
  sendError,
  sendJson
} from '../_lib/http.js';
import { createBookmark, listBookmarks, deleteBookmark } from '../_lib/db.js';
import { updateSettings } from '../_lib/db.js';
import { requireAuth } from '../_lib/auth.js';

type BackupData = {
  version?: string;
  overwrite?: boolean;
  bookmarks?: Array<{
    title: string;
    url: string;
    category?: string;
    description?: string;
    visible?: boolean;
  }>;
  settings?: {
    theme?: string;
    siteTitle?: string;
    siteIcon?: string;
  };
};

function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, 'POST,OPTIONS')) {
    return;
  }
  applyCors(res, 'POST,OPTIONS');

  const auth = requireAuth(req, res);
  if (!auth) {
    return;
  }

  if (req.method !== 'POST') {
    sendError(res, 405, 'Method Not Allowed');
    return;
  }

  try {
    const body = await parseJsonBody<BackupData>(req);
    const overwrite = body.overwrite === true;
    
    // 如果选择覆盖，先删除所有现有书签
    if (overwrite) {
      const existingBookmarks = await listBookmarks();
      for (const bookmark of existingBookmarks) {
        try {
          await deleteBookmark(bookmark.id);
        } catch (error) {
          console.error('删除现有书签失败', error);
        }
      }
    }
    
    // 导入书签
    let importedCount = 0;
    const errors: string[] = [];
    if (Array.isArray(body.bookmarks)) {
      for (const item of body.bookmarks) {
        const title = item.title?.trim();
        const url = item.url?.trim();

        if (!title || !url) {
          errors.push(`跳过无效书签：标题或链接为空`);
          continue;
        }

        try {
          await createBookmark({
            title,
            url: sanitizeUrl(url),
            category: item.category?.trim() || undefined,
            description: item.description?.trim() || undefined,
            visible: item.visible ?? true
          });
          importedCount++;
        } catch (error) {
          const errorMsg = `导入书签失败：${title}`;
          console.error(errorMsg, error);
          errors.push(errorMsg);
        }
      }
    }

    // 导入设置
    let updatedSettings = false;
    if (body.settings) {
      try {
        await updateSettings(body.settings);
        updatedSettings = true;
      } catch (error) {
        console.error('导入设置失败', error);
        errors.push('导入设置失败');
      }
    }

    const allBookmarks = await listBookmarks();
    sendJson(res, 200, { 
      success: true,
      importedBookmarks: importedCount,
      updatedSettings,
      totalBookmarks: allBookmarks.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('导入备份失败', error);
    sendError(res, 500, '导入备份失败');
  }
}

