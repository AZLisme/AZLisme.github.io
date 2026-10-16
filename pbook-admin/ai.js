// Real browser inference. Keep the sibling local test assets when moving this demo.
const OCR_BASE = new URL('../ipad-ocr-test/', import.meta.url);
const TTS_BASE = new URL('../ipad-tts-test/', import.meta.url);
const WORKERS = {
  ocr: new URL('assets/worker-CaV9_yDS.js', OCR_BASE),
  tts: new URL('assets/worker-Bo5UlQsR.js', TTS_BASE),
};
let family = null, worker = null, ready = false, pending = null;
let sequence = 0, epoch = 0, queue = Promise.resolve();
const abortError = () => new DOMException('任务已取消，请重新开始。', 'AbortError');
const progress = (callback, message) => { try { callback?.(message); } catch {} };

function dispose(reason = abortError()) {
  worker?.terminate(); worker = null; family = null; ready = false;
  if (pending) { const request = pending; pending = null; request.reject(reason); }
}

/** Stop inference immediately, discard queued requests, retain caller-owned results. */
export function releaseModels() { epoch++; dispose(); }

function serial(operation) {
  const captured = epoch;
  const result = queue.catch(() => {}).then(() => {
    if (captured !== epoch) throw abortError();
    return operation(captured);
  });
  queue = result.catch(() => {});
  return result;
}

function createWorker(kind) {
  dispose(); family = kind;
  const created = new Worker(WORKERS[kind], {type: 'module'});
  worker = created;
  created.onmessage = ({data}) => {
    if (worker !== created) return;
    const request = pending;
    if (!request) return;
    if (data.type === 'error') {
      const error = new Error(data.error || '浏览器 AI 任务失败');
      if (request.type === 'load') dispose(error);
      else { pending = null; request.reject(error); }
    } else if (data.type === request.expected) {
      pending = null;
      if (data.type === 'ready') ready = true;
      request.resolve(data);
    } else if (data.type === 'stage') progress(request.onProgress, data.stage);
    else if (data.type === 'loading') progress(request.onProgress, data.message);
    else if (data.type === 'runtime-ready') progress(request.onProgress, '运行库就绪，正在加载配音模型…');
    else if (data.type === 'progress') {
      if (kind === 'ocr') progress(request.onProgress, `读取 OCR 模型 ${Math.round(data.loaded / 1048576)} / ${Math.round(data.total / 1048576)} MiB`);
      else {
        const p = data.progress || {};
        const message = p.status === 'progress' && Number.isFinite(p.progress)
          ? `正在下载配音模型 ${Math.round(p.progress)}%`
          : p.status === 'download' || p.status === 'initiate'
            ? '正在读取配音模型文件…'
            : '正在准备配音模型…';
        progress(request.onProgress, message);
      }
    } else if (data.type === 'file-error') progress(request.onProgress, '模型文件读取失败，正在等待加载结果…');
  };
  created.onerror = event => { if (worker === created) dispose(new Error(event.message || 'AI Worker 加载失败')); };
  created.onmessageerror = () => { if (worker === created) dispose(new Error('AI Worker 结果无法读取')); };
}

function request(type, expected, payload, onProgress, transfer = []) {
  if (!worker) return Promise.reject(new Error('AI 模型未加载'));
  return new Promise((resolve, reject) => {
    pending = {type, expected, resolve, reject, onProgress};
    try { worker.postMessage({type, ...payload}, transfer); }
    catch (error) { pending = null; reject(error); }
  });
}

async function ensure(kind, onProgress) {
  if (family === kind && ready) return;
  if (!globalThis.Worker || !globalThis.WebAssembly) throw new Error('浏览器需要支持 Web Worker 和 WebAssembly');
  progress(onProgress, kind === 'ocr' ? '加载本地 OCR 模型…' : '加载配音模型，首次需要联网下载…');
  createWorker(kind);
  await request('load', 'ready', kind === 'ocr' ? {base: OCR_BASE.href} : {wasmBase: new URL('vendor/', TTS_BASE).href}, onProgress);
  progress(onProgress, kind === 'ocr' ? 'OCR 模型就绪' : '配音模型就绪');
}

export function loadOCR(onProgress) { return serial(() => ensure('ocr', onProgress)); }
export function loadTTS(onProgress) { return serial(() => ensure('tts', onProgress)); }

/** Keep recognition pixels bounded without changing the stored source image. */
export function getOCRSize(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('图片尺寸无效');
  const ratio = Math.min(1, 2400 / Math.max(width, height), Math.sqrt(4000000 / (width * height)));
  const scaledWidth = Math.max(1, Math.floor(width * ratio));
  const scaledHeight = Math.max(1, Math.floor(height * ratio));
  return {originalWidth: width, originalHeight: height, width: scaledWidth, height: scaledHeight, scaleX: width / scaledWidth, scaleY: height / scaledHeight, wasResized: scaledWidth !== width || scaledHeight !== height};
}

export function mapOCRItems(items, input) {
  return (items || []).map(item => ({text: item.text, score: item.score, poly: (item.poly || []).map(([x, y]) => [x * input.scaleX, y * input.scaleY])}));
}

// Read JPEG SOF and EXIF orientation, or PNG IHDR, before allocating a full bitmap.
async function imageDimensions(blob) {
  const view = new DataView(await blob.slice(0, 1048576).arrayBuffer());
  if (view.byteLength >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a) return {width: view.getUint32(16), height: view.getUint32(20)};
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
  let offset = 2, width, height, orientation = 1;
  const orient = (start, end) => {
    try {
      if (view.getUint32(start) !== 0x45786966 || view.getUint16(start + 4) !== 0) return;
      const tiff = start + 6, order = view.getUint16(tiff);
      if (![0x4949, 0x4d4d].includes(order)) return;
      const le = order === 0x4949;
      if (view.getUint16(tiff + 2, le) !== 42) return;
      const ifd = tiff + view.getUint32(tiff + 4, le);
      if (ifd < tiff || ifd + 2 > end) return;
      const count = view.getUint16(ifd, le);
      for (let i = 0; i < count; i++) {
        const entry = ifd + 2 + i * 12;
        if (entry + 12 > end) return;
        if (view.getUint16(entry, le) === 0x0112 && view.getUint16(entry + 2, le) === 3 && view.getUint32(entry + 4, le) === 1) {
          const value = view.getUint16(entry + 8, le);
          if (value >= 1 && value <= 8) orientation = value;
          return;
        }
      }
    } catch { /* Malformed metadata falls back to unrotated dimensions. */ }
  };
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;
    while (offset < view.byteLength && view.getUint8(offset) === 0xff) offset++;
    if (offset >= view.byteLength) break;
    const marker = view.getUint8(offset++);
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
    if (offset + 2 > view.byteLength) break;
    const length = view.getUint16(offset), end = offset + length;
    if (length < 2 || end > view.byteLength) break;
    if (marker === 0xe1) orient(offset + 2, end);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 8) {
      height = view.getUint16(offset + 3); width = view.getUint16(offset + 5);
    }
    offset = end;
  }
  if (!width || !height) return null;
  return orientation >= 5 ? {width: height, height: width} : {width, height};
}

/** OCR line order and confidence are raw model output; require human correction. */
export function recognize(blob, onProgress) {
  return serial(async captured => {
    if (!(blob instanceof Blob)) throw new TypeError('请选择 JPEG 或 PNG 图片');
    if (blob.type && !['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) throw new Error('暂不支持此图片格式，请转换为 JPEG / PNG');
    await ensure('ocr', onProgress);
    progress(onProgress, '解码图片…');
    let bitmap, input;
    try {
      const dimensions = await imageDimensions(blob);
      if (captured !== epoch) throw abortError();
      if (dimensions) {
        input = getOCRSize(dimensions.width, dimensions.height);
        bitmap = await createImageBitmap(blob, {imageOrientation: 'from-image', resizeWidth: input.width, resizeHeight: input.height, resizeQuality: 'high'});
      } else {
        bitmap = await createImageBitmap(blob);
        input = getOCRSize(bitmap.width, bitmap.height);
      }
      if (captured !== epoch) throw abortError();
      const canvas = document.createElement('canvas');
      canvas.width = input.width; canvas.height = input.height;
      const ctx = canvas.getContext('2d', {willReadFrequently: true});
      if (!ctx) throw new Error('浏览器无法创建图片画布');
      ctx.drawImage(bitmap, 0, 0, input.width, input.height);
      bitmap.close(); bitmap = null;
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer;
      const width = canvas.width, height = canvas.height;
      canvas.width = canvas.height = 1;
      progress(onProgress, input.wasResized ? `已生成 ${width} × ${height} 识别副本，原图保留。正在识别英文…` : '正在识别英文，请保持页面在前台…');
      const data = await request('predict', 'result', {id: ++sequence, width, height, pixels}, onProgress, [pixels]);
      return {items: mapOCRItems(data.result?.items, input), elapsedMs: data.elapsedMs, input};
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      if (!input || !bitmap && /decode|bitmap|memory|image|allocation/i.test(error.message)) throw new Error('浏览器暂时无法解码这张大图。请关闭其他标签后重试，或转为 JPEG／缩小副本后导入；原图不会被自动替换。');
      throw error;
    } finally { bitmap?.close(); }
  });
}

function wav(pcm, sampleRate) {
  const buffer = new ArrayBuffer(44 + pcm.length * 2), view = new DataView(buffer);
  const text = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const value = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(44 + i * 2, value < 0 ? value * 32768 : value * 32767, true);
  }
  return new Blob([buffer], {type: 'audio/wav'});
}

export function synthesize(text, onProgress) {
  return serial(async captured => {
    const sentence = String(text || '').trim();
    if (!sentence) throw new Error('请先填写英文句子');
    if (sentence.length > 500) throw new Error('请将长段落拆成 500 字符以内的句子');
    await ensure('tts', onProgress);
    if (captured !== epoch) throw abortError();
    progress(onProgress, '正在生成英文配音，请保持页面在前台…');
    const result = await request('generate', 'audio', {id: ++sequence, text: sentence}, onProgress);
    progress(onProgress, `配音完成 · ${(result.elapsedMs / 1000).toFixed(1)} 秒`);
    return wav(result.pcm, result.sampleRate);
  });
}
