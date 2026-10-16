// Local prototype only. Every durable write completes an IndexedDB transaction.
import { isPageRectified, sentenceIssues, validateRegions } from './structure.js';
const DB_NAME = 'pbook-admin-local-v1';
const STATUSES = new Set(['draft', 'published', 'hidden', 'withdrawn']);
const transitions = new WeakMap();
let database;
let opening;
const clone = value => structuredClone(value);
const now = () => new Date().toISOString();
export const newId = (prefix = 'id') => `${prefix}_${crypto.randomUUID()}`;
const metadataFields = ['title', 'cover', 'author', 'series', 'age', 'tags', 'description', 'sort'];
function metadata(book) { return Object.fromEntries(metadataFields.map(key => [key, clone(book[key] ?? (key === 'tags' ? [] : key === 'cover' ? null : key === 'sort' ? 0 : ''))])); }

async function db() {
  if (database) return database;
  if (!opening) opening = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('当前浏览器无法使用 IndexedDB，本地保存不可用。'));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('books', { keyPath: 'id' });
      request.result.createObjectStore('settings');
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('本地数据库被其他窗口占用，请关闭旧窗口后重试。'));
    request.onsuccess = () => {
      database = request.result;
      database.onversionchange = () => { database.close(); database = null; opening = null; };
      resolve(database);
    };
  }).catch(error => { opening = null; throw error; });
  return opening;
}
async function transaction(stores, mode, run) {
  const conn = await db();
  return new Promise((resolve, reject) => {
    const tx = conn.transaction(stores, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error || new Error('本地保存已中止，改动没有保存。'));
    tx.onerror = () => {};
    try { run(tx, value => { result = value; }); }
    catch (error) { tx.abort(); reject(error); }
  });
}
export async function listBooks() {
  const books = await transaction(['books'], 'readonly', (tx, done) => {
    const request = tx.objectStore('books').getAll(); request.onsuccess = () => done(request.result);
  });
  return books.sort((a, b) => (a.sort || 0) - (b.sort || 0) || b.updatedAt.localeCompare(a.updatedAt));
}
export async function getBook(id) {
  return transaction(['books'], 'readonly', (tx, done) => {
    const request = tx.objectStore('books').get(id); request.onsuccess = () => done(request.result || null);
  });
}
export async function createBook(title = '未命名绘本') {
  const book = { id: newId('book'), title, cover: null, author: '', series: '', age: '', tags: [], description: '', sort: 0, status: 'draft', published: null, createdAt: now(), updatedAt: now(), revision: 0 };
  book.draft = { metadata: metadata(book), pages: [], updatedAt: now() };
  return saveBook(book);
}
export function beginEdit(book) {
  const next = clone(book);
  if (!next.draft) next.draft = clone(next.published || { metadata: metadata(next), pages: [] });
  delete next.draft.releaseId; delete next.draft.publishedAt;
  return next;
}
export function validateBook(book) {
  const draft = book.draft;
  const errors = [];
  if (!draft) return ['没有待发布的修改草稿。'];
  if (!draft.metadata?.title?.trim()) errors.push('请填写书名。');
  if (!(draft.metadata?.cover instanceof Blob) || !draft.metadata.cover.size) errors.push('请设置封面。');
  if (!draft.pages?.length) errors.push('请至少添加一个阅读页面。');
  const ids = new Set();
  (draft.pages || []).forEach((page, index) => {
    const label = `第 ${index + 1} 页`;
    if (!page.id || ids.has(page.id)) errors.push(`${label}的页面标识无效。`);
    ids.add(page.id);
    if (!(page.image instanceof Blob) || !page.image.size) errors.push(`${label}缺少页面图片。`);
    if (!isPageRectified(page)) errors.push(`${label}尚未确认当前图片的书页校正。`);
    if (!page.sentences?.length && (page.analysisReviewed !== true || page.analysisRevision !== (page.imageRevision || 0))) errors.push(`${label}尚未人工确认当前图片是无正文的插画页。`);
    const sentenceIds = new Set();
    (page.sentences || []).forEach((sentence, sentenceIndex) => {
      const sentenceLabel = `${label}第 ${sentenceIndex + 1} 句`;
      if (!sentence.id || sentenceIds.has(sentence.id)) errors.push(`${sentenceLabel}的句子标识无效。`);
      sentenceIds.add(sentence.id);
      if (!sentence.en?.trim()) errors.push(`${sentenceLabel}缺少英文。`);
      if (!sentence.zh?.trim()) errors.push(`${sentenceLabel}缺少中文字幕，请先校对翻译。`);
      for (const issue of sentenceIssues(sentence, page)) errors.push(`${sentenceLabel}：${issue}。`);
      if (sentence.includeInNarration !== false) {
        if (!(sentence.audio instanceof Blob) || !sentence.audio.size) errors.push(`${sentenceLabel}尚未生成配音。`);
        else if (sentence.audioText !== sentence.en) errors.push(`${sentenceLabel}文字修改后需要重新配音。`);
      }
    });
  });
  if (!(draft.pages || []).some(page => page.sentences?.some(sentence => sentence.en?.trim() && sentence.includeInNarration !== false))) errors.push('整本绘本至少需要一句英文正文和配音；纯插画页可以不配音。');
  return errors;
}
export function publishBook(book) {
  const errors = validateBook(book);
  if (errors.length) { const error = new Error(errors.join('\n')); error.validationErrors = errors; throw error; }
  const next = clone(book);
  next.published = clone(next.draft);
  next.published.releaseId = newId('release'); next.published.publishedAt = now();
  Object.assign(next, clone(next.published.metadata));
  next.draft = null; next.status = 'published'; next.isDemo = false;
  transitions.set(next, { kind: 'publish' });
  return next;
}
export function setStatus(book, status) {
  if (!STATUSES.has(status)) throw new Error('无效的绘本状态。');
  if (status === 'draft') throw new Error('已发布绘本请创建修改草稿。');
  if (!book.published) throw new Error('绘本尚未发布。');
  const next = clone(book); next.status = status;
  transitions.set(next, { kind: 'status' });
  return next;
}
export async function saveBook(book) {
  if (!book?.id || !STATUSES.has(book.status)) throw new Error('绘本数据格式无效。');
  const transition = transitions.get(book);
  const next = clone(book); next.updatedAt = now();
  return transaction(['books'], 'readwrite', (tx, done) => {
    const store = tx.objectStore('books');
    const request = store.get(next.id);
    request.onsuccess = () => {
      const previous = request.result;
      if (previous && previous.revision !== next.revision) {
        done(null); tx.abort(); return;
      }
      if (previous) {
        if (transition?.kind !== 'publish') next.published = clone(previous.published);
        if (!transition) next.status = previous.status;
        // Public metadata belongs to the released snapshot; drafts edit draft.metadata.
        if (transition?.kind !== 'publish' && previous.published) Object.assign(next, metadata(previous));
      }
      next.revision = (previous?.revision || 0) + 1;
      store.put(next); done(clone(next));
    };
  }).catch(error => {
    if (error.name === 'AbortError' || /中止/.test(error.message)) throw new Error('保存失败：另一个窗口可能已更新这本书，请重新打开后再试。');
    throw error;
  });
}
export async function deleteBook(id) {
  return transaction(['books'], 'readwrite', (tx, done) => {
    tx.objectStore('books').delete(id); done(true);
  });
}
async function encode(value) {
  if (value instanceof Blob) {
    const bytes = new Uint8Array(await value.arrayBuffer());
    let binary = ''; for (let start = 0; start < bytes.length; start += 32768) binary += String.fromCharCode(...bytes.subarray(start, start + 32768));
    return { __pbookBlob: true, type: value.type, base64: btoa(binary) };
  }
  if (Array.isArray(value)) return Promise.all(value.map(encode));
  if (value && typeof value === 'object') return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, child]) => [key, await encode(child)])));
  return value;
}
function decode(value) {
  if (value?.__pbookBlob === true) {
    if (typeof value.base64 !== 'string' || typeof value.type !== 'string') throw new Error('备份中的媒体数据无效。');
    const binary = atob(value.base64); return new Blob([Uint8Array.from(binary, char => char.charCodeAt(0))], { type: value.type });
  }
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, decode(child)]));
  return value;
}
export async function exportBackup() { return { format: 'pbook-admin-backup', version: 1, exportedAt: now(), books: await encode(await listBooks()) }; }
export async function importBackup(data) {
  const parsed = typeof data === 'string' ? JSON.parse(data) : data;
  if (parsed?.format !== 'pbook-admin-backup' || parsed.version !== 1 || !Array.isArray(parsed.books)) throw new Error('请选择本管理端导出的有效备份文件。');
  const books = decode(parsed.books), ids = new Set();
  for (const book of books) {
    if (typeof book.id !== 'string' || !book.id || ids.has(book.id) || !STATUSES.has(book.status) || (!book.draft && !book.published) || typeof book.title !== 'string' || !Array.isArray(book.tags) || book.tags.some(tag => typeof tag !== 'string') || !Number.isInteger(book.revision) || book.revision < 0 || typeof book.createdAt !== 'string' || typeof book.updatedAt !== 'string') throw new Error('备份中的绘本结构无效，未导入任何内容。');
    if (book.status !== 'draft' && !book.published) throw new Error('备份缺少已发布版本，未导入任何内容。');
    for (const snapshot of [book.draft, book.published].filter(Boolean)) {
      if (!snapshot.metadata || typeof snapshot.metadata.title !== 'string' || !Array.isArray(snapshot.metadata.tags) || snapshot.metadata.tags.some(tag => typeof tag !== 'string') || !Array.isArray(snapshot.pages)) throw new Error('备份缺少页面数据或元信息无效，未导入任何内容。');
      if (snapshot.metadata.cover !== null && !(snapshot.metadata.cover instanceof Blob)) throw new Error('备份封面无效，未导入任何内容。');
      const pageIds = new Set();
      for (const page of snapshot.pages) {
        if (typeof page.id !== 'string' || !page.id || pageIds.has(page.id) || !(page.image instanceof Blob) || !Array.isArray(page.sentences)) throw new Error('备份页面或媒体无效，未导入任何内容。');
        pageIds.add(page.id);
        for (const key of ['imageRevision', 'rectificationRevision', 'analysisRevision']) if (page[key] !== undefined && (!Number.isInteger(page[key]) || page[key] < 0)) throw new Error('备份图片版本字段无效，未导入任何内容。');
        for (const key of ['rectificationReviewed', 'analysisReviewed']) if (page[key] !== undefined && typeof page[key] !== 'boolean') throw new Error('备份页面审核字段无效，未导入任何内容。');
        const sentenceIds = new Set();
        for (const sentence of page.sentences) {
          if (typeof sentence.id !== 'string' || !sentence.id || sentenceIds.has(sentence.id) || typeof sentence.en !== 'string' || typeof sentence.zh !== 'string' || (sentence.audio != null && !(sentence.audio instanceof Blob)) || (sentence.audioText != null && typeof sentence.audioText !== 'string')) throw new Error('备份句子或音频无效，未导入任何内容。');
          sentenceIds.add(sentence.id);
          if (sentence.regions !== undefined) {
            if (!Array.isArray(sentence.regions)) throw new Error('备份文字区域无效，未导入任何内容。');
            if (sentence.regions.length) { try { validateRegions(sentence.regions); } catch { throw new Error('备份文字区域无效，未导入任何内容。'); } }
          }
          if (sentence.anchorRevision !== undefined && (!Number.isInteger(sentence.anchorRevision) || sentence.anchorRevision < 0)) throw new Error('备份文字定位版本无效，未导入任何内容。');
          if ((sentence.reviewed !== undefined && typeof sentence.reviewed !== 'boolean') || (sentence.includeInNarration !== undefined && typeof sentence.includeInNarration !== 'boolean') || (sentence.kind !== undefined && !['narration', 'speech', 'label'].includes(sentence.kind))) throw new Error('备份句子审核或朗读字段无效，未导入任何内容。');
        }
      }
    }
    ids.add(book.id);
  }
  await transaction(['books'], 'readwrite', (tx, done) => {
    const store = tx.objectStore('books');
    for (const book of books) {
      const request = store.get(book.id);
      request.onsuccess = () => {
        // Import is a new local write, so already-open editor copies become stale.
        book.revision = Math.max(book.revision, request.result?.revision || 0) + 1;
        book.updatedAt = now();
        store.put(book);
      };
    }
    done(books.length);
  });
  return books.length;
}
export async function init() {
  await db();
  const seeded = await transaction(['settings'], 'readonly', (tx, done) => {
    const request = tx.objectStore('settings').get('seeded'); request.onsuccess = () => done(request.result);
  });
  if (!seeded) {
    const sample = async name => {
      const response = await fetch(new URL(`../ipad-ocr-test/samples/${name}.jpeg`, import.meta.url));
      if (!response.ok) throw new Error('本地示例图片加载失败，请检查测试服务。');
      return response.blob();
    };
    const [cover, ...images] = await Promise.all(['p01', 'p04', 'p08', 'p18'].map(sample));
    const book = { id: 'demo-drop', title: 'DROP · 示例绘本', cover, author: '', series: '', age: '3–6 岁', tags: ['英文', '示例'], description: '本地演示数据，用于体验编辑、隐藏、下架及预览。旧版素材待补齐：未导入原书完整文字和配音。', sort: 0, status: 'published', createdAt: now(), updatedAt: now(), revision: 1, isDemo: true, draft: null };
    book.published = { metadata: metadata(book), pages: images.map((image, index) => ({ id: `demo-page-${index}`, image, name: ['普通双页', '艺术字页', '密集文字页'][index], sentences: [], ocrStatus: 'idle' })), releaseId: 'demo-release', publishedAt: now() };
    await transaction(['books', 'settings'], 'readwrite', (tx, done) => {
      const request = tx.objectStore('settings').get('seeded');
      request.onsuccess = () => {
        if (!request.result) { tx.objectStore('books').put(book); tx.objectStore('settings').put(true, 'seeded'); }
        done(true);
      };
    });
  }
  return { mode: 'local', durable: true };
}
