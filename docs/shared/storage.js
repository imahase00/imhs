// IMHS 共通: ゲームID別のセーブ保存（IndexedDB）
// ゲーム固有の内容（盤面・通貨など）は扱わない。data はゲームが渡す不透明なオブジェクト。
//
// レコード形式: { gameId, schema, rev, savedAt, summary, data }
//   - 現行データ:   key = gameId
//   - 直前の正常版: key = gameId + '#prev'
// 保存は1トランザクションで「現行→prev へ退避」「新データを現行へ」を行う。
// rev が想定と違えば（別タブ・復元で更新済み）上書きせず ConflictError。

const DB_NAME = 'imhs';
const DB_VERSION = 1;
const STORE = 'saves';

export class ConflictError extends Error {
  constructor(message = '別の画面でデータが更新されています') {
    super(message);
    this.name = 'ConflictError';
  }
}

let dbPromise = null;
// iPhone の Safari では、画面の切り替え直後などに open が応答しないことがある。
// 一定時間で見切りをつけ、次の呼び出しで開き直す（待ち続けて画面が止まるのを防ぐ）。
const OPEN_TIMEOUT = 4000;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { dbPromise = null; reject(new Error('保存領域の応答がありません')); }, OPEN_TIMEOUT);
    if (!('indexedDB' in globalThis)) {
      reject(new Error('この環境では IndexedDB が使えません'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { clearTimeout(timer); dbPromise = null; reject(req.error); };
    req.onblocked = () => { /* 他タブが古い接続を保持。onsuccess を待つ */ };
  });
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('トランザクションが中断されました'));
  });
}

function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 接続を閉じる（画面を離れる前に呼ぶ。次の画面の読み込みを妨げないため） */
export async function closeDB() {
  const p = dbPromise;
  dbPromise = null;
  if (!p) return;
  try { (await p).close(); } catch { /* 開けていなければ何もしない */ }
}

// 読み込みが応答しないとき（前の画面の書き込みが止まったままのときなど）に、待ち続けないための上限
const READ_TIMEOUT = 3000;

/** 現行セーブを読む（無ければ null）。timeoutMs を過ぎたら失敗として返す */
export async function loadSave(gameId, timeoutMs = 0) {
  const work = (async () => {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readonly');
    const rec = await reqP(tx.objectStore(STORE).get(gameId));
    await done(tx);
    return rec ?? null;
  })();
  if (!timeoutMs) return work;
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => { dbPromise = null; reject(new Error('保存領域の応答がありません')); }, timeoutMs);
  });
  try { return await Promise.race([work, limit]); } finally { clearTimeout(timer); }
}
export { READ_TIMEOUT };

/** 直前の正常セーブを読む（無ければ null） */
export async function loadPrevSave(gameId) {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readonly');
  const rec = await reqP(tx.objectStore(STORE).get(gameId + '#prev'));
  await done(tx);
  return rec ?? null;
}

/**
 * セーブを書き込む。
 * @param {string} gameId
 * @param {{schema:number, data:object, summary?:object}} payload
 * @param {number|null} expectedRev 読み込んだ時点の rev（新規は null）
 * @returns {Promise<number>} 新しい rev
 */
export async function writeSave(gameId, payload, expectedRev) {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const current = await reqP(store.get(gameId));
  const curRev = current ? current.rev : null;
  if (curRev !== expectedRev) {
    tx.abort();
    await done(tx).catch(() => {});
    throw new ConflictError();
  }
  const rev = (curRev ?? 0) + 1;
  const rec = {
    gameId,
    schema: payload.schema,
    rev,
    savedAt: new Date().toISOString(),
    summary: payload.summary ?? null,
    data: payload.data,
  };
  if (current) store.put(current, gameId + '#prev');
  store.put(rec, gameId);
  await done(tx);
  return rev;
}

/** セーブを削除（はじめから遊ぶ用）。直前版は残す。 */
export async function deleteSave(gameId, expectedRev) {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const current = await reqP(store.get(gameId));
  const curRev = current ? current.rev : null;
  if (expectedRev !== undefined && curRev !== expectedRev) {
    tx.abort();
    await done(tx).catch(() => {});
    throw new ConflictError();
  }
  if (current) {
    store.put(current, gameId + '#prev');
    store.delete(gameId);
  }
  await done(tx);
}

// ---- 二重タブ防止（Web Locks。未対応環境では rev 照合のみで保護） ----

/**
 * ゲームの排他ロックを取得し、ページが閉じるまで保持する。
 * @returns {Promise<boolean>} 取得できたら true
 */
export function holdGameLock(gameId) {
  if (!navigator.locks?.request) return Promise.resolve(true);
  return new Promise((resolve) => {
    navigator.locks.request('imhs:' + gameId, { ifAvailable: true }, (lock) => {
      if (!lock) { resolve(false); return undefined; }
      resolve(true);
      return new Promise(() => {}); // ページ終了まで保持
    });
  });
}

/** 一時的にロックを取得して fn を実行（取得できなければ null を返す） */
export async function withGameLock(gameId, fn) {
  if (!navigator.locks?.request) return fn();
  let ran = false;
  let result = null;
  await navigator.locks.request('imhs:' + gameId, { ifAvailable: true }, async (lock) => {
    if (!lock) return;
    ran = true;
    result = await fn();
  });
  return ran ? result : null;
}

// ---- バックアップ（JSON） ----

export const BACKUP_FORMAT = 'imhs-backup';

export function makeBackup(record) {
  return {
    format: BACKUP_FORMAT,
    gameId: record.gameId,
    schema: record.schema,
    exportedAt: new Date().toISOString(),
    savedAt: record.savedAt,
    data: record.data,
  };
}

export function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function readFileText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}
