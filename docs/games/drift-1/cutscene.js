// 漂流発明記: オープニング・エンディングの「動く紙芝居」
// 層に分けた絵を、ずらす・拡大する・揺らす。雨・稲妻・霧・雲はここで描く。画面タップで次へ、「とばす」で終了。
import { SCENE } from './data.js';

const ease = (k) => k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
const lerp = (a, b, k) => a + (b - a) * k;

// 位置は画面の割合（x,y は絵の中心）。s は「画面を覆う大きさ」を1とした倍率（fit:'w' は画面の幅を1）
export const OPENING = [
  { dur: 6.5, sound: 'storm', fx: ['rain', 'lightning'], text: { str: '嵐の夜――', from: 0.6, to: 4.5 },
    layers: [
      { src: 'storm', from: { x: 0.42, y: 0.5, s: 1.25 }, to: { x: 0.58, y: 0.5, s: 1.3 } },
      { src: 'oldship', fit: 'w', from: { x: -0.2, y: 0.42, s: 0.85, r: -0.05 }, to: { x: 0.55, y: 0.46, s: 0.95, r: 0.05 }, sway: 0.06 },
    ] },
  { dur: 2.8, fx: ['rain', 'strike', 'shake'], sound: 'thunder',
    layers: [
      { src: 'storm', from: { x: 0.58, y: 0.5, s: 1.3 }, to: { x: 0.6, y: 0.55, s: 1.35 } },
      { src: 'oldship', fit: 'w', from: { x: 0.55, y: 0.46, s: 0.95, r: 0.05 }, to: { x: 0.75, y: 0.75, s: 0.9, r: 0.45 }, sway: 0.12, smoke: true },
    ] },
  { dur: 5.5, fx: ['rain', 'fog', 'lightning'], fadeOut: 1.4,
    layers: [
      { src: 'island', from: { x: 0.5, y: 0.45, s: 1.05 }, to: { x: 0.52, y: 0.62, s: 1.9 } },
      { src: 'oldship', fit: 'w', from: { x: 0.35, y: 0.18, s: 0.32, r: 0.5 }, to: { x: 0.56, y: 0.62, s: 0.12, r: 0.9 }, smoke: true },
    ] },
  { dur: 2.6, sound: 'waves', black: true, text: { str: '……', from: 0.6, to: 2.4 } },
  { dur: 7, eyes: true, sound: 'waves', fx: ['fog-light'], text: { str: '……ここは、どこだ？', from: 3.4, to: 6.8 }, fadeOut: 1.2,
    layers: [
      { src: 'beach', from: { x: 0.5, y: 0.32, s: 1.35 }, to: { x: 0.5, y: 0.6, s: 1.08 } },
    ] },
];

export const ENDING = [
  { dur: 7.5, sound: 'wind', fx: ['glow'], fadeIn: 1.2,
    layers: [
      { src: 'dawn', from: { x: 0.5, y: 0.62, s: 1.15 }, to: { x: 0.5, y: 0.42, s: 1.15 } },
      { src: 'shipup', fit: 'h', from: { x: 0.5, y: 0.62, s: 0.62 }, to: { x: 0.52, y: 0.38, s: 0.72 }, sway: 0.015 },
      { src: 'crew', fit: 'w', anchor: 'bottom', from: { x: 0.5, y: 1.0, s: 1.25 }, to: { x: 0.5, y: 1.32, s: 1.3 } },
    ] },
  { dur: 2.2, sound: 'whistle', fx: ['steam', 'glow'],
    layers: [
      { src: 'dawn', from: { x: 0.5, y: 0.42, s: 1.15 }, to: { x: 0.5, y: 0.38, s: 1.18 } },
      { src: 'shipup', fit: 'h', from: { x: 0.52, y: 0.38, s: 0.72 }, to: { x: 0.53, y: 0.22, s: 0.66 }, sway: 0.02 },
      { src: 'crew', fit: 'w', anchor: 'bottom', from: { x: 0.5, y: 1.32, s: 1.3 }, to: { x: 0.5, y: 1.4, s: 1.32 } },
    ] },
  { dur: 6.5, sound: 'wind', fx: ['clouds'], text: { str: '霧の島をあとにして――', from: 1.2, to: 5.6 },
    layers: [
      { src: 'cloudsea', from: { x: 0.35, y: 0.5, s: 1.15 }, to: { x: 0.6, y: 0.5, s: 1.2 } },
      { src: 'ship', fit: 'w', from: { x: 0.2, y: 0.58, s: 0.72, r: -0.04 }, to: { x: 0.58, y: 0.4, s: 0.82, r: -0.02 }, sway: 0.02, propeller: true },
    ] },
  { dur: 7.5, sound: 'wind', fx: ['far-lightning'], text: { str: '……また、嵐か', from: 4.4, to: 7.5 }, endFlash: true,
    layers: [
      { src: 'nextstorm', from: { x: 0.45, y: 0.5, s: 1.1 }, to: { x: 0.55, y: 0.48, s: 1.22 } },
      { src: 'ship', fit: 'w', from: { x: 0.3, y: 0.62, s: 0.5, r: 0 }, to: { x: 0.6, y: 0.52, s: 0.22, r: 0 }, sway: 0.015, propeller: true },
    ] },
];

export const SCENE_SRCS = ['storm', 'oldship', 'island', 'beach', 'dawn', 'shipup', 'crew', 'cloudsea', 'ship', 'nextstorm'].map((id) => SCENE(id));

const cache = {};
function loadScene(id) {
  if (cache[id]) return cache[id];
  cache[id] = new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = SCENE(id);
  });
  return cache[id];
}
export const sceneImage = (id) => loadScene(id);

/**
 * 紙芝居を再生する。
 * @param {HTMLElement} root 全画面の入れ物（canvas と「とばす」ボタンを中に作る）
 * @returns {Promise<void>} 終わったら解決
 */
export async function play(root, shots, { audio } = {}) {
  const ids = [...new Set(shots.flatMap((s) => (s.layers ?? []).map((l) => l.src)))];
  const imgs = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await loadScene(id)])));
  root.replaceChildren();
  root.hidden = false;
  const c = document.createElement('canvas');
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'btn ghost small scene-skip';
  skip.textContent = 'とばす ▶▶';
  const tap = document.createElement('div');
  tap.className = 'scene-tap';
  tap.textContent = 'タップで次へ';
  root.append(c, skip, tap);
  const g = c.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = () => {
    c.width = Math.round(window.innerWidth * dpr);
    c.height = Math.round(window.innerHeight * dpr);
  };
  size();
  window.addEventListener('resize', size);
  const rain = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random(), v: 0.9 + Math.random() * 0.8 }));
  const clouds = Array.from({ length: 7 }, (_, i) => ({ x: Math.random(), y: 0.55 + Math.random() * 0.45, s: 0.25 + Math.random() * 0.3, v: 0.03 + i * 0.008 }));
  let flash = 0;
  let shake = 0;
  let nextBolt = 1.2;
  return new Promise((resolve) => {
    let k = 0;
    let t0 = performance.now();
    let done = false;
    let lastSound = -1;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('resize', size);
      audio?.ambient(null);
      root.hidden = true;
      root.replaceChildren();
      resolve();
    };
    skip.addEventListener('click', (e) => { e.stopPropagation(); finish(); });
    root.onclick = () => {
      audio?.unlock();
      // 次の場面へ（文字が出ている途中なら、文字の終わりまで）
      if (k < shots.length - 1) { k++; t0 = performance.now(); } else finish();
    };
    const frame = (now) => {
      if (done) return;
      let t = (now - t0) / 1000;
      let shot = shots[k];
      if (t >= shot.dur) {
        if (k >= shots.length - 1) { finish(); return; }
        k++;
        t0 = now;
        t = 0;
        shot = shots[k];
      }
      if (lastSound !== k) {
        lastSound = k;
        if (shot.sound === 'thunder') { audio?.sfx('thunder'); flash = 1; shake = 1; }
        if (shot.sound === 'whistle') audio?.sfx('whistle');
        audio?.ambient(shot.sound === 'storm' || shot.sound === 'thunder' ? 'storm' : shot.sound === 'waves' ? 'waves' : shot.sound === 'wind' || shot.sound === 'whistle' ? 'wind' : null);
        if (shot.fx?.includes('strike')) { flash = 1.2; shake = 1.2; }
      }
      const W = c.width;
      const H = c.height;
      const p = Math.min(1, t / shot.dur);
      const e = ease(p);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
      if (!shot.black) {
        g.save();
        if (shake > 0) { g.translate((Math.random() - 0.5) * 18 * shake * dpr, (Math.random() - 0.5) * 18 * shake * dpr); shake = Math.max(0, shake - 0.03); }
        if (shot.fx?.includes('shake')) g.translate(Math.sin(t * 40) * 4 * dpr, Math.cos(t * 33) * 4 * dpr);
        for (const l of shot.layers) drawLayer(g, imgs[l.src], l, e, t, W, H);
        for (const l of shot.layers) if (l.smoke) drawSmoke(g, l, e, t, W, H, imgs[l.src]);
        if (shot.fx?.includes('fog')) fog(g, W, H, t, 0.35);
        if (shot.fx?.includes('fog-light')) fog(g, W, H, t, 0.18);
        if (shot.fx?.includes('clouds')) {
          for (const cl of clouds) {
            const x = ((cl.x - t * cl.v) % 1.4 + 1.4) % 1.4 - 0.2;
            const r = cl.s * W;
            const gr = g.createRadialGradient(x * W, cl.y * H, 0, x * W, cl.y * H, r);
            gr.addColorStop(0, 'rgba(255,255,255,0.75)');
            gr.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = gr;
            g.fillRect(x * W - r, cl.y * H - r, r * 2, r * 2);
          }
        }
        if (shot.fx?.includes('glow')) {
          const gr = g.createRadialGradient(W * 0.5, H * 1.05, 0, W * 0.5, H * 1.05, H * 0.9);
          gr.addColorStop(0, 'rgba(255,214,140,0.35)');
          gr.addColorStop(1, 'rgba(255,214,140,0)');
          g.fillStyle = gr;
          g.fillRect(0, 0, W, H);
        }
        if (shot.fx?.includes('steam')) {
          for (let i = 0; i < 6; i++) {
            const kk = (t * 0.6 + i / 6) % 1;
            g.fillStyle = `rgba(250,248,240,${0.45 * (1 - kk)})`;
            g.beginPath();
            g.arc(W * (0.3 + i * 0.08), H * (0.75 - kk * 0.3), W * (0.06 + kk * 0.1), 0, Math.PI * 2);
            g.fill();
          }
        }
        if (shot.fx?.includes('rain')) {
          g.strokeStyle = 'rgba(200,215,235,0.45)';
          g.lineWidth = 1.5 * dpr;
          g.beginPath();
          for (const d of rain) {
            const y = ((d.y + t * d.v * 1.6) % 1) * H;
            const x = ((d.x + t * 0.35 * d.v) % 1) * W;
            g.moveTo(x, y);
            g.lineTo(x - 10 * dpr, y + 34 * dpr);
          }
          g.stroke();
        }
        if (shot.fx?.includes('lightning')) {
          nextBolt -= 1 / 60;
          if (nextBolt <= 0) { flash = 0.8; nextBolt = 1.8 + Math.random() * 2.2; audio?.sfx('thunder'); }
        }
        if (shot.fx?.includes('far-lightning')) {
          nextBolt -= 1 / 60;
          if (nextBolt <= 0) { flash = 0.35; nextBolt = 1.4 + Math.random() * 1.6; audio?.sfx('rumble'); }
        }
        g.restore();
        if (shot.eyes) eyes(g, W, H, t);
      }
      // 文字
      if (shot.text && t >= shot.text.from && t <= shot.text.to) {
        const a = Math.min(1, (t - shot.text.from) / 0.6, (shot.text.to - t) / 0.5);
        g.globalAlpha = Math.max(0, a);
        g.font = `700 ${Math.round(Math.min(W, H * 0.6) * 0.06)}px "Hiragino Mincho ProN", "Yu Mincho", serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillText(shot.text.str, W / 2 + 2 * dpr, H * 0.82 + 2 * dpr);
        g.fillStyle = '#fbf3e0';
        g.fillText(shot.text.str, W / 2, H * 0.82);
        g.globalAlpha = 1;
      }
      // 終わりの稲光 → 暗転
      if (shot.endFlash && t > shot.dur - 1.4) {
        const q = (t - (shot.dur - 1.4)) / 1.4;
        if (q < 0.15) { g.fillStyle = `rgba(255,255,255,${q / 0.15})`; if (!shot._f) { shot._f = true; audio?.sfx('thunder'); } } else g.fillStyle = `rgba(0,0,0,${Math.min(1, (q - 0.15) / 0.5)})`;
        g.fillRect(0, 0, W, H);
      } else if (shot.endFlash) shot._f = false;
      if (flash > 0) {
        g.fillStyle = `rgba(235,240,255,${Math.min(0.85, flash)})`;
        g.fillRect(0, 0, W, H);
        flash = Math.max(0, flash - 0.05);
      }
      const fi = shot.fadeIn && t < shot.fadeIn ? 1 - t / shot.fadeIn : 0;
      const fo = shot.fadeOut && t > shot.dur - shot.fadeOut ? (t - (shot.dur - shot.fadeOut)) / shot.fadeOut : 0;
      const f = Math.max(fi, fo);
      if (f > 0) { g.fillStyle = `rgba(0,0,0,${Math.min(1, f)})`; g.fillRect(0, 0, W, H); }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

function drawLayer(g, im, l, e, t, W, H) {
  if (!im) return;
  const a = l.from;
  const b = l.to ?? l.from;
  const x = lerp(a.x, b.x, e);
  const y = lerp(a.y, b.y, e);
  const s = lerp(a.s ?? 1, b.s ?? 1, e);
  const r = lerp(a.r ?? 0, b.r ?? 0, e) + (l.sway ? Math.sin(t * 1.6) * l.sway : 0);
  let base;
  if (l.fit === 'w') base = W / im.width;
  else if (l.fit === 'h') base = H / im.height;
  else base = Math.max(W / im.width, H / im.height);
  const w = im.width * base * s;
  const h = im.height * base * s;
  g.save();
  g.translate(x * W, y * H + (l.sway ? Math.sin(t * 2.1) * H * l.sway * 0.15 : 0));
  g.rotate(r);
  if (l.anchor === 'bottom') g.drawImage(im, -w / 2, -h, w, h);
  else g.drawImage(im, -w / 2, -h / 2, w, h);
  g.restore();
}

function drawSmoke(g, l, e, t, W, H, im) {
  if (!im) return;
  const a = l.from;
  const b = l.to ?? l.from;
  const x = lerp(a.x, b.x, e) * W;
  const y = lerp(a.y, b.y, e) * H;
  const s = lerp(a.s ?? 1, b.s ?? 1, e) * W;
  for (let i = 0; i < 8; i++) {
    const k = (t * 0.9 + i / 8) % 1;
    g.fillStyle = `rgba(60,60,64,${0.5 * (1 - k)})`;
    g.beginPath();
    g.arc(x - s * 0.25 - k * s * 0.5, y + s * 0.05 - k * s * 0.15, s * (0.04 + k * 0.08), 0, Math.PI * 2);
    g.fill();
  }
}

function fog(g, W, H, t, a) {
  for (let i = 0; i < 5; i++) {
    const x = ((i * 0.27 + t * 0.03 * (i % 2 ? 1 : -1)) % 1.4 + 1.4) % 1.4 - 0.2;
    const y = 0.3 + i * 0.13;
    const r = W * 0.7;
    const gr = g.createRadialGradient(x * W, y * H, 0, x * W, y * H, r);
    gr.addColorStop(0, `rgba(235,238,240,${a})`);
    gr.addColorStop(1, 'rgba(235,238,240,0)');
    g.fillStyle = gr;
    g.fillRect(x * W - r, y * H - r, r * 2, r * 2);
  }
}

// まぶたが開くように（2回まばたきしてから開く）
function eyes(g, W, H, t) {
  let open;
  if (t < 1) open = 0;
  else if (t < 1.6) open = (t - 1) / 0.6 * 0.25;
  else if (t < 1.9) open = 0.25 - (t - 1.6) / 0.3 * 0.25;
  else if (t < 2.8) open = (t - 1.9) / 0.9 * 0.55;
  else if (t < 3.0) open = 0.55 - (t - 2.8) / 0.2 * 0.3;
  else open = Math.min(1, 0.25 + (t - 3.0) / 0.8 * 0.75);
  const h = (1 - open) * H / 2;
  g.fillStyle = '#000';
  g.beginPath();
  g.ellipse(W / 2, -H * 0.15 + h * 0.6, W * 0.9, h + H * 0.15, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(W / 2, H * 1.15 - h * 0.6, W * 0.9, h + H * 0.15, 0, 0, Math.PI * 2);
  g.fill();
  if (open < 1) {
    g.fillStyle = `rgba(0,0,0,${(1 - open) * 0.5})`;
    g.fillRect(0, 0, W, H);
  }
}
