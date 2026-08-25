// Отрисовка: лабиринт на canvas, живые существа — DOM-элементы с CSS-графикой.
import { ITEMS } from './items.js';
import { N, E, S, W } from './maze.js';

const ZOOM_TILES = { near: 13, mid: 19, far: 27 };

const PALETTE = {
  unknown: '#04050a',
  floorKnown: '#0d0f16',
  floorSeen: '#232838',
  wallKnown: '#1c1f2a',
  wallSeen: '#3b4152',
  exit: '#59f2a4',
  path: '#5fa8ff',
};

// Насколько сильно камера наезжает на героя при полном страхе.
const FEAR_ZOOM = 0.95;

export class Renderer {
  constructor(canvas, entityLayer, vignette) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.layer = entityLayer;
    this.vignette = vignette || null;
    this.game = null;
    this.cam = { x: 0, y: 0 };
    this.entities = new Map();
    this.ts = 28;
    this.baseTs = 28;
    this.fearZoom = 1;
    this.zoom = 'mid';
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.t = 0;
    this.shake = 0;
    this._raf = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  attach(game) {
    this.game = game;
    this.layer.innerHTML = '';
    this.entities.clear();
    this.cam.x = game.player.x;
    this.cam.y = game.player.y;
    this._buildEntities();
  }

  setZoom(z) { this.zoom = z; this.resize(); }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.vw = Math.max(240, rect.width);
    this.vh = Math.max(240, rect.height);
    this.canvas.width = Math.floor(this.vw * this.dpr);
    this.canvas.height = Math.floor(this.vh * this.dpr);
    this.canvas.style.width = this.vw + 'px';
    this.canvas.style.height = this.vh + 'px';
    const across = ZOOM_TILES[this.zoom] || 19;
    const short = Math.min(this.vw, this.vh);
    this.baseTs = Math.max(12, Math.min(64, Math.floor(short / across)));
    this.ts = Math.round(this.baseTs * this.fearZoom);
    if (this.game) this._syncEntitySizes();
  }

  _buildEntities() {
    const g = this.game;
    const p = document.createElement('div');
    p.className = 'ent ent-player';
    p.innerHTML = `
      <div class="p-cone"></div>
      <div class="p-glow"></div>
      <div class="p-fig">
        <div class="p-head"><span class="p-eye l"></span><span class="p-eye r"></span></div>
        <div class="p-arm l"></div><div class="p-arm r"></div>
        <div class="p-torso"></div>
        <div class="p-leg l"></div><div class="p-leg r"></div>
      </div>`;
    this.layer.appendChild(p);
    this.entities.set('player', { el: p, rx: g.player.x, ry: g.player.y });

    g.ais.forEach((a) => {
      const el = document.createElement('div');
      el.className = `ent ent-ai type-${a.type}`;
      el.innerHTML = animatronicMarkup();
      this.layer.appendChild(el);
      this.entities.set('ai' + a.id, { el, rx: a.x, ry: a.y });
    });
    this._syncEntitySizes();
  }

  _syncEntitySizes() {
    for (const e of this.entities.values()) e.el.style.fontSize = this.ts + 'px';
  }

  start() {
    if (this._raf) cancelAnimationFrame(this._raf);
    const tick = () => {
      this._raf = requestAnimationFrame(tick);
      this.frame();
    };
    tick();
  }
  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  kick(amount = 1) { this.shake = Math.min(3, this.shake + amount); }

  frame() {
    const g = this.game;
    if (!g) return;
    this.t += 1 / 60;

    // страх сужает обзор: камера наезжает на героя, оставляя ему тоннель
    const fear = g.settings.fearFx === false ? 0 : (g.fear || 0);
    const wanted = 1 + fear * FEAR_ZOOM;
    this.fearZoom += (wanted - this.fearZoom) * 0.06;
    const ts0 = Math.round(this.baseTs * this.fearZoom);
    if (ts0 !== this.ts) {
      this.ts = ts0;
      this._syncEntitySizes();
    }
    if (this.vignette) this.vignette.style.setProperty('--tunnel', fear.toFixed(3));

    // мягкое слежение камеры
    const k = 0.18;
    this.cam.x += (g.player.x - this.cam.x) * k;
    this.cam.y += (g.player.y - this.cam.y) * k;
    if (Math.abs(this.cam.x - g.player.x) < 0.002) this.cam.x = g.player.x;
    if (Math.abs(this.cam.y - g.player.y) < 0.002) this.cam.y = g.player.y;

    this.shake *= 0.86;
    const sx = this.shake > 0.02 ? (Math.random() - 0.5) * this.shake * 6 : 0;
    const sy = this.shake > 0.02 ? (Math.random() - 0.5) * this.shake * 6 : 0;

    const ts = this.ts;
    // камера всегда держит игрока в центре: за краем лабиринта просто пустота
    const ox = this.vw / 2 - (this.cam.x + 0.5) * ts + sx;
    const oy = this.vh / 2 - (this.cam.y + 0.5) * ts + sy;
    this.ox = ox; this.oy = oy;

    this.drawMaze();
    this.drawEntities();
  }

  drawMaze() {
    const g = this.game, ctx = this.ctx, ts = this.ts;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PALETTE.unknown;
    ctx.fillRect(0, 0, this.vw, this.vh);

    const x0 = Math.max(0, Math.floor(-this.ox / ts) - 1);
    const y0 = Math.max(0, Math.floor(-this.oy / ts) - 1);
    const x1 = Math.min(g.w - 1, Math.ceil((this.vw - this.ox) / ts) + 1);
    const y1 = Math.min(g.h - 1, Math.ceil((this.vh - this.oy) / ts) + 1);
    const radius = g.fogRadius();

    // пол
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * g.w + x;
        if (!g.known[i]) continue;
        const px = this.ox + x * ts, py = this.oy + y * ts;
        if (g.visible[i]) {
          const d = g.visDist[i] < 0 ? 0 : g.visDist[i];
          const f = radius === Infinity ? 0.55 : Math.max(0.12, 1 - d / (radius + 1));
          ctx.fillStyle = shade(PALETTE.floorSeen, f);
        } else {
          ctx.fillStyle = PALETTE.floorKnown;
        }
        ctx.fillRect(px, py, ts, ts);
      }
    }

    // подсказка пути от «Карты»
    if (g.pathHint.length > 1) {
      ctx.save();
      ctx.strokeStyle = PALETTE.path;
      ctx.globalAlpha = 0.55 + Math.sin(this.t * 4) * 0.2;
      ctx.lineWidth = Math.max(2, ts * 0.18);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = PALETTE.path;
      ctx.shadowBlur = ts * 0.5;
      ctx.beginPath();
      for (let k = 0; k < g.pathHint.length; k++) {
        const i = g.pathHint[k];
        const px = this.ox + (i % g.w) * ts + ts / 2;
        const py = this.oy + ((i / g.w) | 0) * ts + ts / 2;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    }

    // выход
    if (g.known[g.exitIdx] || g.effects.path > 0 || g.effects.revealed) {
      const ex = this.ox + g.exit.x * ts, ey = this.oy + g.exit.y * ts;
      const pulse = 0.6 + Math.sin(this.t * 3) * 0.3;
      ctx.save();
      ctx.shadowColor = PALETTE.exit;
      ctx.shadowBlur = ts * pulse;
      ctx.fillStyle = PALETTE.exit;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(ex + ts * 0.22, ey + ts * 0.14, ts * 0.56, ts * 0.72);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#031a10';
      ctx.fillRect(ex + ts * 0.34, ey + ts * 0.3, ts * 0.32, ts * 0.56);
      ctx.restore();
    }

    // предметы
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.floor(ts * 0.62)}px "Share Tech Mono", monospace`;
    for (const [i, id] of g.seenItems) {
      const x = i % g.w, y = (i / g.w) | 0;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const def = ITEMS[id];
      const px = this.ox + x * ts + ts / 2, py = this.oy + y * ts + ts / 2;
      ctx.save();
      ctx.globalAlpha = g.visible[i] ? 1 : 0.45;
      ctx.shadowColor = def.color;
      ctx.shadowBlur = g.visible[i] ? ts * 0.5 : 0;
      ctx.fillStyle = def.color;
      ctx.fillText(def.glyph, px, py);
      ctx.restore();
    }

    // стены
    const lw = Math.max(1.5, ts * 0.13);
    ctx.lineWidth = lw;
    ctx.lineCap = 'square';
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass === 0 ? PALETTE.wallKnown : PALETTE.wallSeen;
      ctx.beginPath();
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * g.w + x;
          if (!g.known[i]) continue;
          const seen = !!g.visible[i];
          if ((pass === 1) !== seen) continue;
          const v = g.maze.cells[i];
          const px = this.ox + x * ts, py = this.oy + y * ts;
          if (v & N) { ctx.moveTo(px, py); ctx.lineTo(px + ts, py); }
          if (v & W) { ctx.moveTo(px, py); ctx.lineTo(px, py + ts); }
          if (v & S) { ctx.moveTo(px, py + ts); ctx.lineTo(px + ts, py + ts); }
          if (v & E) { ctx.moveTo(px + ts, py); ctx.lineTo(px + ts, py + ts); }
        }
      }
      ctx.stroke();
    }

    // световое пятно вокруг игрока
    const pcx = this.ox + (this.cam.x + 0.5) * ts;
    const pcy = this.oy + (this.cam.y + 0.5) * ts;
    const r = ts * (radius === Infinity ? 6 : radius + 1);
    const grad = ctx.createRadialGradient(pcx, pcy, ts * 0.3, pcx, pcy, r);
    grad.addColorStop(0, 'rgba(255,236,190,0.10)');
    grad.addColorStop(0.5, 'rgba(255,214,150,0.04)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.vw, this.vh);

    this.drawCompass();
  }

  /** Стрелка у края экрана в сторону выхода: направление знаем всегда, дорогу — нет. */
  drawCompass() {
    const g = this.game;
    const known = g.effects.path > 0 || g.effects.revealed || !!g.known[g.exitIdx];
    const ts = this.ts;
    const ex = this.ox + (g.exit.x + 0.5) * ts, ey = this.oy + (g.exit.y + 0.5) * ts;
    if (ex > 8 && ex < this.vw - 8 && ey > 8 && ey < this.vh - 8) return;
    const cx = this.vw / 2, cy = this.vh / 2;
    const ang = Math.atan2(ey - cy, ex - cx);
    const rx = Math.min(this.vw, this.vh) * 0.42;
    const px = cx + Math.cos(ang) * rx, py = cy + Math.sin(ang) * rx;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.fillStyle = PALETTE.exit;
    ctx.globalAlpha = known ? 0.5 + Math.sin(this.t * 4) * 0.2 : 0.22;
    ctx.shadowColor = PALETTE.exit;
    ctx.shadowBlur = known ? 12 : 4;
    ctx.beginPath();
    ctx.moveTo(10, 0); ctx.lineTo(-8, -7); ctx.lineTo(-8, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawEntities() {
    const g = this.game, ts = this.ts;
    const p = this.entities.get('player');
    if (p) {
      p.rx += (g.player.x - p.rx) * 0.3;
      p.ry += (g.player.y - p.ry) * 0.3;
      place(p.el, this.ox + p.rx * ts, this.oy + p.ry * ts);
      p.el.dataset.dir = dirName(g.player.dir);
      p.el.classList.toggle('walking', Math.abs(p.rx - g.player.x) + Math.abs(p.ry - g.player.y) > 0.02);
      const fear = g.settings.fearFx === false ? 0 : (g.fear || 0);
      p.el.classList.toggle('scared', fear > 0.4);
      p.el.classList.toggle('terrified', fear > 0.8);
      p.el.style.display = '';
    }
    for (const a of g.ais) {
      const e = this.entities.get('ai' + a.id);
      if (!e) continue;
      e.rx += (a.x - e.rx) * 0.3;
      e.ry += (a.y - e.ry) * 0.3;
      const i = g.idx(a.x, a.y);
      const shown = !!g.visible[i] || g.effects.radar > 0;
      e.el.style.display = shown ? '' : 'none';
      if (!shown) continue;
      e.el.classList.toggle('ghost', !g.visible[i]);
      e.el.classList.toggle('hunting', a.mode === 'hunt' || a.mode === 'flank');
      e.el.classList.toggle('frozen', a.frozen > 0);
      place(e.el, this.ox + e.rx * ts, this.oy + e.ry * ts);
    }
  }
}

/** Разметка мордочки аниматроника — используется и на поле, и в джампскейре. */
export function animatronicMarkup() {
  return `
    <div class="a-aura"></div>
    <div class="a-fig">
      <div class="a-ear l"></div><div class="a-ear r"></div>
      <div class="a-hat"></div>
      <div class="a-head">
        <div class="a-brow l"></div><div class="a-brow r"></div>
        <div class="a-eye l"><i></i></div><div class="a-eye r"><i></i></div>
        <div class="a-patch"></div>
        <div class="a-muzzle">
          <div class="a-nose"></div>
          <div class="a-teeth top"></div>
          <div class="a-teeth bottom"></div>
        </div>
      </div>
    </div>`;
}

function place(el, x, y) {
  el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
}

function dirName(d) {
  return d === N ? 'n' : d === S ? 's' : d === E ? 'e' : 'w';
}

const shadeCache = new Map();
function shade(hex, f) {
  const q = Math.round(f * 20) / 20;
  const key = hex + q;
  const hit = shadeCache.get(key);
  if (hit) return hit;
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * q);
  const g = Math.round(((n >> 8) & 255) * q);
  const b = Math.round((n & 255) * q);
  const out = `rgb(${r},${g},${b})`;
  shadeCache.set(key, out);
  return out;
}
