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
    const bookmarks = await listBookmarks();
    const settings = await getSettings();
    
    const backup = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      settings,
      bookmarks,
      
    };

    sendJson(res, 200, backup);
  } catch (error) {
    console.error('导出备份失败', error);
    sendError(res, 500, '导出备份失败');
  }
}

