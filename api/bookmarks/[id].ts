import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  applyCors,
  handleOptions,
  parseJsonBody,
  sendError,
  sendJson
} from '../_lib/http.js';
import { deleteBookmark, updateBookmark } from '../_lib/db.js';
import { requireAuth } from '../_lib/auth.js';

type BookmarkBody = {
  title?: string;
  url?: string;
  category?: string;
  description?: string;
  visible?: boolean;
};

function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, 'GET,PUT,DELETE,OPTIONS')) {
    return;
  }

  applyCors(res, 'GET,PUT,DELETE,OPTIONS');

  const id = req.query.id;
  if (!id || Array.isArray(id)) {
    sendError(res, 400, '缺少书签 ID');
    return;
  }

  if (req.method === 'PUT') {
    const auth = requireAuth(req, res);
    if (!auth) {
      return;
    }
    try {
      const body = await parseJsonBody<BookmarkBody>(req);
      const title = body.title?.trim();
      const url = body.url?.trim();
      if (!title || !url) {
        sendError(res, 400, '标题和链接不能为空');
        return;
      }
      const updated = await updateBookmark(id, {
        title,
        url: sanitizeUrl(url),
        category: body.category?.trim() || undefined,
        description: body.description?.trim() || undefined,
        visible: body.visible ?? true
      });
      if (!updated) {
        sendError(res, 404, '书签不存在');
        return;
      }
      sendJson(res, 200, updated);
    } catch (error) {
      console.error('更新书签失败', error);
      sendError(res, 500, '更新书签失败');
    }
    return;
  }

  if (req.method === 'DELETE') {
    const auth = requireAuth(req, res);
    if (!auth) {
      return;
    }
    try {
      const deleted = await deleteBookmark(id);
      if (!deleted) {
        sendError(res, 404, '书签不存在');
        return;
      }
      sendJson(res, 200, deleted);
    } catch (error) {
      console.error('删除书签失败', error);
      sendError(res, 500, '删除书签失败');
    }
    return;
  }

  sendError(res, 405, 'Method Not Allowed');
}

