import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  applyCors,
  handleOptions,
  sendError,
  sendJson
} from '../_lib/http.js';
import { listBookmarks } from '../_lib/db.js';
import { getSettings } from '../_lib/db.js';
import { requireAuth } from '../_lib/auth.js';
import { getShanghaiISOString } from '../_lib/date.js';

/**
 * 导出备份数据
 */
export async function exportBackupData() {
  const bookmarks = await listBookmarks();
  const settings = await getSettings();
  
  return {
    version: '1.0',
    exportedAt: getShanghaiISOString(),
    settings,
    bookmarks
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, 'GET,OPTIONS')) {
    return;
  }
  applyCors(res, 'GET,OPTIONS');

  const auth = requireAuth(req, res);
  if (!auth) {
    return;
  }

  if (req.method !== 'GET') {
    sendError(res, 405, 'Method Not Allowed');
    return;
  }

  try {
    const backup = await exportBackupData();
    sendJson(res, 200, backup);
  } catch (error) {
    console.error('导出备份失败', error);
    sendError(res, 500, '导出备份失败');
  }
}

