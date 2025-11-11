import { randomUUID } from 'crypto';
import { readJson, writeJson } from './storage.js';

export type BookmarkRecord = {
  id: string;
  title: string;
  url: string;
  category?: string;
  description?: string;
  visible: boolean;
};

type BookmarkInput = {
  title: string;
  url: string;
  category?: string;
  description?: string;
  visible: boolean;
};

type SettingsData = {
  theme: string;
  siteTitle: string;
  siteIcon: string;
};

const DEFAULT_SETTINGS: SettingsData = {
  theme: 'light',
  siteTitle: '个人书签',
  siteIcon: '🔖'
};

type StoredBookmark = BookmarkRecord & { weight?: number };

function normalizeCategoryValue(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function bookmarkCategoryKey(bookmark: BookmarkRecord | StoredBookmark): string {
  return normalizeCategoryValue(bookmark.category) ?? '';
}

function normalizeCategoryKeyInput(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function stripWeight(bookmark: StoredBookmark): BookmarkRecord {
  const { weight: _weight, ...rest } = bookmark;
  return {
    ...rest,
    category: normalizeCategoryValue(rest.category)
  };
}

async function readBookmarksFromStorage(): Promise<BookmarkRecord[]> {
  const data = await readJson('bookmarks', [] as StoredBookmark[]);
  return data.map(stripWeight);
}

async function writeBookmarksToStorage(bookmarks: BookmarkRecord[]) {
  const sanitized = bookmarks.map((bookmark) => ({
    ...bookmark,
    category: normalizeCategoryValue(bookmark.category)
  }));
  await writeJson('bookmarks', sanitized);
}

async function readSettingsFromStorage(): Promise<SettingsData> {
  return readJson('settings', DEFAULT_SETTINGS);
}

async function writeSettingsToStorage(settings: SettingsData) {
  await writeJson('settings', settings);
}

export async function getSettings(): Promise<SettingsData> {
  return readSettingsFromStorage();
}

export async function updateSettings(partial: Partial<SettingsData>): Promise<SettingsData> {
  const current = await readSettingsFromStorage();
  const next: SettingsData = {
    ...current,
    ...partial,
    theme: partial.theme ?? current.theme,
    siteTitle: partial.siteTitle ?? current.siteTitle,
    siteIcon: partial.siteIcon ?? current.siteIcon
  };
  await writeSettingsToStorage(next);
  return next;
}

export async function listBookmarks(): Promise<BookmarkRecord[]> {
  return readBookmarksFromStorage();
}

export async function createBookmark(data: BookmarkInput): Promise<BookmarkRecord> {
  const bookmarks = await readBookmarksFromStorage();
  const bookmark: BookmarkRecord = {
    id: randomUUID(),
    title: data.title,
    url: data.url,
    category: normalizeCategoryValue(data.category),
    description: data.description,
    visible: data.visible
  };
  bookmarks.push(bookmark);
  await writeBookmarksToStorage(bookmarks);
  return bookmark;
}

export async function reorderBookmarks(order: string[]): Promise<BookmarkRecord[]> {
  const bookmarks = await readBookmarksFromStorage();
  const map = new Map<string, BookmarkRecord>();
  bookmarks.forEach((bookmark) => {
    map.set(bookmark.id, bookmark);
  });

  const reordered: BookmarkRecord[] = [];
  order.forEach((id) => {
    const record = map.get(id);
    if (record) {
      reordered.push(record);
      map.delete(id);
    }
  });

  map.forEach((bookmark) => {
    reordered.push(bookmark);
  });

  await writeBookmarksToStorage(reordered);
  return reordered;
}

export async function reorderBookmarkCategories(order: string[]): Promise<BookmarkRecord[]> {
  const bookmarks = await readBookmarksFromStorage();
  const categoryMap = new Map<string, BookmarkRecord[]>();
  const originalOrder: string[] = [];

  bookmarks.forEach((bookmark) => {
    const key = bookmarkCategoryKey(bookmark);
    if (!categoryMap.has(key)) {
      categoryMap.set(key, []);
      originalOrder.push(key);
    }
    categoryMap.get(key)!.push(bookmark);
  });

  const requestedOrder: string[] = [];
  order.forEach((value) => {
    const key = normalizeCategoryKeyInput(value);
    if (categoryMap.has(key) && !requestedOrder.includes(key)) {
      requestedOrder.push(key);
    }
  });

  originalOrder.forEach((key) => {
    if (!requestedOrder.includes(key)) {
      requestedOrder.push(key);
    }
  });

  const reordered: BookmarkRecord[] = [];
  requestedOrder.forEach((key) => {
    const items = categoryMap.get(key);
    if (items) {
      reordered.push(...items);
    }
  });

  await writeBookmarksToStorage(reordered);
  return reordered;
}

export async function updateBookmark(
  id: string,
  data: BookmarkInput
): Promise<BookmarkRecord | null> {
  const bookmarks = await readBookmarksFromStorage();
  const index = bookmarks.findIndex((item) => item.id === id);
  if (index === -1) {
    return null;
  }
  const existing = bookmarks[index];
  const updated: BookmarkRecord = {
    ...existing,
    title: data.title,
    url: data.url,
    category: normalizeCategoryValue(data.category),
    description: data.description,
    visible: data.visible
  };
  bookmarks[index] = updated;
  await writeBookmarksToStorage(bookmarks);
  return updated;
}

export async function deleteBookmark(id: string): Promise<BookmarkRecord | null> {
  const bookmarks = await readBookmarksFromStorage();
  const index = bookmarks.findIndex((item) => item.id === id);
  if (index === -1) {
    return null;
  }
  const [removed] = bookmarks.splice(index, 1);
  await writeBookmarksToStorage(bookmarks);
  return removed;
}

