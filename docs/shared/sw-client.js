// IMHS 共通: Service Worker 登録・オフライン準備状況・更新の適用
// 更新は「新しいキャッシュに準備 → 待機」までで止め、切替はユーザー操作（安全な時点）で行う。

let registration = null;
let reloadOnChange = false;

/**
 * @param {string} swUrl ページから見た sw.js の相対パス
 * @param {{onStatus?:(s)=>void, onUpdate?:()=>void}} hooks
 */
export async function initServiceWorker(swUrl, hooks = {}) {
  const { onStatus = () => {}, onUpdate = () => {} } = hooks;
  if (!('serviceWorker' in navigator)) {
    onStatus({ state: 'unsupported' });
    return null;
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadOnChange) { location.reload(); return; }
    refresh();
  });

  const watchInstalling = (sw) => {
    if (!sw) return;
    onStatus({ state: 'preparing' });
    sw.addEventListener('statechange', () => {
      if (sw.state === 'installed' && navigator.serviceWorker.controller) onUpdate();
      if (sw.state === 'redundant') refresh();
      if (sw.state === 'activated') refresh();
    });
  };

  async function refresh() {
    if (!navigator.serviceWorker.controller) {
      onStatus({ state: registration?.installing ? 'preparing' : 'notready' });
      return;
    }
    const s = await ask('STATUS');
    onStatus(s && s.ready ? { state: 'ready', ...s } : { state: 'incomplete', ...(s || {}) });
  }

  // 登録はブラウザ内で前の作業（新しい版の取り込みなど）の順番待ちになることがある。
  // 待たずに、すでにある登録から先に状態を表示する。
  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing) {
      registration = existing;
      if (existing.waiting && navigator.serviceWorker.controller) onUpdate();
      watchInstalling(existing.installing);
      refresh();
    }
  } catch { /* 取得できなければ登録を待つ */ }

  try {
    registration = await navigator.serviceWorker.register(swUrl, { updateViaCache: 'none' });
  } catch (e) {
    onStatus({ state: 'error', error: String(e) });
    return null;
  }
  if (registration.waiting && navigator.serviceWorker.controller) onUpdate();
  watchInstalling(registration.installing);
  registration.addEventListener('updatefound', () => watchInstalling(registration.installing));

  await refresh();
  // 起動時と画面復帰時に更新を確認（失敗しても旧版で動作継続）
  registration.update().catch(() => {});
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') registration?.update().catch(() => {});
  });
  return { refresh, repair, applyUpdate, hasUpdate: () => !!registration?.waiting };
}

function ask(type, timeout = 15000) {
  const target = navigator.serviceWorker.controller;
  if (!target) return Promise.resolve(null);
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    const t = setTimeout(() => resolve(null), timeout);
    ch.port1.onmessage = (e) => { clearTimeout(t); resolve(e.data); };
    target.postMessage({ type }, [ch.port2]);
  });
}

/** 不足ファイルの再取得。未登録・インストール失敗時は再登録を試みる。 */
export async function repair() {
  if (!navigator.serviceWorker.controller) {
    try { await registration?.update(); } catch { /* オフライン */ }
    return null;
  }
  return ask('REPAIR', 120000);
}

/** 待機中の新版へ切り替える（呼び出し側で保存完了を確認してから） */
export function applyUpdate() {
  const w = registration?.waiting;
  if (!w) return false;
  reloadOnChange = true;
  w.postMessage({ type: 'SKIP_WAITING' });
  return true;
}
