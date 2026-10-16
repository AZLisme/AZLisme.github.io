/** Personal browser vault. Encryption protects locked storage, not executing same-origin scripts. */
export const VAULT_STORAGE_KEY = 'pbook-admin.credentials.v1';
export const VAULT_SESSION_KEY = 'pbook-admin.credentials.password.v1';
const rounds = 310000;
const secretFields = ['apiToken', 'cosSecretId', 'cosSecretKey'];
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal: true});
const fail = message => new Error(message);
const configFields = ['baseURL', 'model', 'jsonMode', 'cosBucket', 'cosRegion', 'cosPrefix'];
function strictObject(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).some(key => !allowed.includes(key))) throw fail('配置文本包含不支持的字段或对象。');
  return value;
}
function textEnvelope(text) {
  if (typeof text !== 'string' || text.length > 300000) throw fail('配置文本为空或超过 300 KB 限制。');
  let value; try { value = JSON.parse(text); } catch { throw fail('配置文本不是有效 JSON。'); }
  strictObject(value, ['format', 'version', 'config', 'vault']);
  if (value.format !== 'pbook-admin-config' || value.version !== 1) throw fail('不支持此配置文本的格式或版本。');
  const publicMode = Object.hasOwn(value, 'config'), encryptedMode = Object.hasOwn(value, 'vault');
  if (publicMode === encryptedMode) throw fail('配置文本必须只包含公开配置或加密保险箱。');
  if (publicMode) return {type: 'public', config: configValue(strictObject(value.config, configFields)), credentialsIncluded: false};
  const record = parse(JSON.stringify(value.vault));
  return {type: 'encrypted', config: {...record.config}, credentialsIncluded: true, record};
}
function configValue(input = {}) {
  const result = {};
  for (const field of ['baseURL', 'model', 'cosBucket', 'cosRegion', 'cosPrefix']) {
    if (input[field] !== undefined && typeof input[field] !== 'string') throw fail('配置格式无效。');
    if (input[field]?.length > 4096) throw fail('配置内容过长。');
    result[field] = (input[field] || '').trim();
  }
  if (result.baseURL) {
    let url;
    try { url = new URL(result.baseURL); } catch { throw fail('模型地址必须是完整的 HTTP 或 HTTPS 地址。'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw fail('模型地址不能包含账号、密码、查询参数或片段。');
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw fail('远程模型地址必须使用 HTTPS。');
    result.baseURL = url.href.replace(/\/$/, '');
  }
  if (input.jsonMode !== undefined && !['on', 'off'].includes(input.jsonMode)) throw fail('JSON 模式配置无效。');
  result.jsonMode = input.jsonMode || 'on';
  return result;
}
function secretsValue(input = {}, previous = {}) {
  const result = {};
  for (const field of secretFields) {
    const value = input[field] === undefined ? previous[field] || '' : input[field];
    if (typeof value !== 'string' || value.length > 16384) throw fail('凭据格式无效或过长。');
    result[field] = value.trim();
  }
  return result;
}
const to64 = bytes => { let text = ''; for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(text); };
function from64(value, length) {
  if (typeof value !== 'string' || value.length > 200000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw fail('保险箱记录格式无效。');
  let bytes;
  try { bytes = Uint8Array.from(atob(value), char => char.charCodeAt(0)); } catch { throw fail('保险箱记录格式无效。'); }
  if (length !== undefined && bytes.length !== length) throw fail('保险箱记录格式无效。');
  return bytes;
}
function parse(raw) {
  let record;
  try { record = JSON.parse(raw); } catch { throw fail('保险箱记录损坏，请保留浏览器数据并恢复配置。'); }
  strictObject(record, ['version', 'kdf', 'iterations', 'cipher', 'config', 'salt', 'iv', 'data']);
  strictObject(record.config, configFields);
  if (!record || record.version !== 1 || record.kdf !== 'PBKDF2-SHA256' || record.iterations !== rounds || record.cipher !== 'AES-GCM') throw fail('保险箱记录版本或格式无效。');
  const config = configValue(record.config);
  if (JSON.stringify(config) !== JSON.stringify(record.config)) throw fail('保险箱配置格式无效。');
  from64(record.salt, 16); from64(record.iv, 12);
  if (from64(record.data).length < 16) throw fail('保险箱密文格式无效。');
  return {...record, config};
}
export function createCredentialVault(options = {}) {
  const storage = name => {
    if (options[name]) return options[name];
    // Access browser getters only on use: blocked storage must not break module loading.
    return {getItem: key => globalThis[name].getItem(key), setItem: (key, value) => globalThis[name].setItem(key, value), removeItem: key => globalThis[name].removeItem(key)};
  };
  const local = storage('localStorage');
  const session = storage('sessionStorage');
  const crypto = options.crypto || globalThis.crypto;
  const events = options.eventTarget || globalThis.window;
  let unlocked = null, activeRaw = null, generation = 0, busy = false;
  let observedRaw, revision = 0;
  function getStorageRevision() { const raw = read(); if (raw !== observedRaw) { observedRaw = raw; revision++; } return `${generation}:${revision}`; }
  function checkExpected(expected) { if (expected !== undefined && expected !== getStorageRevision()) throw fail('配置在解析后已经变更，请重新解析并确认导入。'); }
  const subscribers = new Set();
  function read() { try { return local.getItem(VAULT_STORAGE_KEY); } catch { throw fail('浏览器无法读取配置存储，请检查隐私或存储设置。'); } }
  function getStatus() {
    try {
      const raw = read(); getStorageRevision();
      if (unlocked && raw !== activeRaw) lock('changed');
      if (raw) parse(raw);
      return {configured: !!raw, unlocked: !!unlocked, corrupt: false, error: ''};
    } catch (error) { return {configured: true, unlocked: false, corrupt: true, error: error.message}; }
  }
  function emit(reason) { const state = {...getStatus(), reason}; for (const listener of subscribers) { try { listener(state); } catch {} } }
  function lock(reason = 'locked') {
    generation++; unlocked = null; activeRaw = null;
    let error;
    try { session.removeItem(VAULT_SESSION_KEY); } catch { error = fail('无法清除标签页解锁密码，请关闭此标签页。'); }
    emit(reason);
    if (error) throw error;
  }
  function current() {
    if (unlocked && read() !== activeRaw) lock('changed');
    if (!unlocked) throw fail('请先解锁 AI 配置。');
    return unlocked;
  }
  function getConfig() { const raw = read(); return raw ? {...parse(raw).config} : configValue(); }
  function getCredentials() { return {...current().credentials}; }
  function passwordValue(password) { if (typeof password !== 'string' || !password.length || password.length > 4096) throw fail('请输入解锁密码。'); return password; }
  async function derive(password, salt) {
    if (!crypto?.subtle) throw fail('此浏览器无法使用安全加密，请通过 HTTPS 或 localhost 打开管理端。');
    const material = await crypto.subtle.importKey('raw', encoder.encode(passwordValue(password)), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds}, material, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
  }
  async function operation(fn) {
    if (busy) throw fail('配置操作正在进行，请稍后再试。');
    busy = true; const ticket = generation;
    try { return await fn(() => { if (ticket !== generation) throw fail('配置已锁定或变更，请重新操作。'); }); }
    finally { busy = false; }
  }
  async function unlock(password) {
    return operation(async guard => {
      passwordValue(password);
      const raw = read(); if (!raw) throw fail('尚未保存 AI 配置。');
      const record = parse(raw);
      const key = await derive(password, from64(record.salt));
      let credentials;
      try {
        const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: from64(record.iv), additionalData: encoder.encode(JSON.stringify(record.config))}, key, from64(record.data));
        credentials = secretsValue(JSON.parse(decoder.decode(plain)));
      } catch { throw fail('密码不正确，或加密记录已被修改。原配置未更改。'); }
      guard(); if (read() !== raw) throw fail('配置已被其他标签页修改，请重试。');
      try { session.setItem(VAULT_SESSION_KEY, password); } catch { throw fail('无法保存标签页解锁状态，请检查浏览器存储设置。'); }
      unlocked = {credentials}; activeRaw = raw; emit('unlocked'); return getStatus();
    });
  }
  async function restore() {
    let password;
    try { password = session.getItem(VAULT_SESSION_KEY); } catch { return false; }
    if (!password) return false;
    try { await unlock(password); return true; } catch (error) { lock('restore-failed'); throw error; }
  }
  async function save({config = {}, credentials = {}, password, expectedRevision} = {}) {
    return operation(async guard => {
      checkExpected(expectedRevision);
      const before = read();
      if (before) { parse(before); current(); }
      let previousPassword;
      try { previousPassword = session.getItem(VAULT_SESSION_KEY); } catch { throw fail('浏览器无法读取标签页解锁状态。'); }
      if (password === undefined && !previousPassword) throw fail('标签页解锁状态已丢失，请锁定后重新解锁，或输入密码保存。');
      const chosenPassword = passwordValue(password === undefined ? previousPassword : password);
      const nextConfig = configValue({...getConfig(), ...config});
      const nextSecrets = secretsValue(credentials, unlocked?.credentials);
      if (!crypto?.subtle || !crypto?.getRandomValues) throw fail('此浏览器无法使用安全加密，请通过 HTTPS 或 localhost 打开管理端。');
      const payload = encoder.encode(JSON.stringify(nextSecrets));
      if (payload.length > 65536) throw fail('凭据内容过长，请缩短后重试。');
      const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await derive(chosenPassword, salt);
      const encrypted = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: encoder.encode(JSON.stringify(nextConfig))}, key, payload);
      const raw = JSON.stringify({version: 1, kdf: 'PBKDF2-SHA256', iterations: rounds, cipher: 'AES-GCM', config: nextConfig, salt: to64(salt), iv: to64(iv), data: to64(new Uint8Array(encrypted))});
      guard(); checkExpected(expectedRevision); if (read() !== before) throw fail('配置已被其他标签页修改，请重试。');
      try { session.setItem(VAULT_SESSION_KEY, chosenPassword); }
      catch { throw fail('无法保存标签页解锁密码，原配置未更改。'); }
      try { local.setItem(VAULT_STORAGE_KEY, raw); }
      catch {
        try { if (previousPassword === null) session.removeItem(VAULT_SESSION_KEY); else session.setItem(VAULT_SESSION_KEY, previousPassword); } catch { unlocked = null; activeRaw = null; }
        throw fail('无法保存加密配置，可能是存储空间不足。原配置未更改。');
      }
      unlocked = {credentials: nextSecrets}; activeRaw = raw; emit('saved'); return getStatus();
    });
  }
  function exportText({includeCredentials = false} = {}) {
    const raw = read();
    if (!raw) throw fail('尚未保存配置，无法导出。');
    const record = parse(raw);
    return JSON.stringify(includeCredentials ? {format: 'pbook-admin-config', version: 1, vault: record} : {format: 'pbook-admin-config', version: 1, config: record.config}, null, 2);
  }
  function parseText(text) {
    const {type, config, credentialsIncluded} = textEnvelope(text);
    return {type, config, credentialsIncluded, revisionOpaque: getStorageRevision()};
  }
  async function importText(text, {password, expectedRevision} = {}) {
    const imported = textEnvelope(text);
    if (imported.type === 'public') return save({config: imported.config, password, expectedRevision});
    return operation(async guard => {
      checkExpected(expectedRevision);
      const before = read(); if (before) parse(before);
      passwordValue(password);
      const record = imported.record;
      const key = await derive(password, from64(record.salt));
      let credentials;
      try {
        const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: from64(record.iv), additionalData: encoder.encode(JSON.stringify(record.config))}, key, from64(record.data));
        credentials = secretsValue(strictObject(JSON.parse(decoder.decode(plain)), secretFields));
      } catch { throw fail('导入密码不正确，或加密文本已被修改。原配置未更改。'); }
      guard(); checkExpected(expectedRevision); if (read() !== before) throw fail('配置已被其他标签页修改，请重新解析并导入。');
      let previousPassword;
      try { previousPassword = session.getItem(VAULT_SESSION_KEY); session.setItem(VAULT_SESSION_KEY, password); }
      catch { throw fail('无法保存标签页解锁状态，原配置未更改。'); }
      const raw = JSON.stringify(record);
      try { local.setItem(VAULT_STORAGE_KEY, raw); }
      catch {
        try { if (previousPassword === null) session.removeItem(VAULT_SESSION_KEY); else session.setItem(VAULT_SESSION_KEY, previousPassword); } catch { unlocked = null; activeRaw = null; }
        throw fail('无法保存导入配置，可能是存储空间不足。原配置未更改。');
      }
      unlocked = {credentials}; activeRaw = raw; emit('saved'); return getStatus();
    });
  }
  function changePassword(password) { current(); return save({password: passwordValue(password)}); }
  function clear() {
    if (busy) throw fail('配置操作正在进行，请稍后再试。');
    try { local.removeItem(VAULT_STORAGE_KEY); } catch { throw fail('无法清除配置，请检查浏览器存储设置。'); }
    lock('cleared'); return getStatus();
  }
  function subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); }
  const onStorage = event => { if ((event.key === VAULT_STORAGE_KEY || event.key === null) && (!event.storageArea || event.storageArea === options.localStorage || !options.localStorage)) { try { lock('changed'); } catch {} } };
  events?.addEventListener?.('storage', onStorage);
  return {getStatus, getConfig, getCredentials, save, unlock, restore, lock, clear, changePassword, subscribe, exportText, parseText, importText, getStorageRevision, destroy() { lock('destroyed'); events?.removeEventListener?.('storage', onStorage); subscribers.clear(); }};
}
const vault = createCredentialVault();
export const getStatus = (...args) => vault.getStatus(...args);
export const getConfig = (...args) => vault.getConfig(...args);
export const getCredentials = (...args) => vault.getCredentials(...args);
export const save = (...args) => vault.save(...args);
export const unlock = (...args) => vault.unlock(...args);
export const restore = (...args) => vault.restore(...args);
export const lock = (...args) => vault.lock(...args);
export const clear = (...args) => vault.clear(...args);
export const changePassword = (...args) => vault.changePassword(...args);
export const subscribe = (...args) => vault.subscribe(...args);

export const exportText = (...args) => vault.exportText(...args);
export const parseText = (...args) => vault.parseText(...args);
export const importText = (...args) => vault.importText(...args);
export const getStorageRevision = (...args) => vault.getStorageRevision(...args);
