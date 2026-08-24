// Генерация лабиринта, поиск пути и вспомогательная математика сетки.
// Ячейка хранит битовую маску стен: 1 - север, 2 - восток, 4 - юг, 8 - запад.

export const N = 1, E = 2, S = 4, W = 8;
export const DIRS = [N, E, S, W];
export const DX = { 1: 0, 2: 1, 4: 0, 8: -1 };
export const DY = { 1: -1, 2: 0, 4: 1, 8: 0 };
export const OPP = { 1: S, 2: W, 4: N, 8: E };

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class Maze {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.cells = new Uint8Array(w * h).fill(15);
  }
  idx(x, y) { return y * this.w + x; }
  xOf(i) { return i % this.w; }
  yOf(i) { return (i / this.w) | 0; }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  /** Есть ли проход из (x,y) в сторону dir */
  open(x, y, dir) {
    if (!this.inside(x, y)) return false;
    const nx = x + DX[dir], ny = y + DY[dir];
    if (!this.inside(nx, ny)) return false;
    return (this.cells[this.idx(x, y)] & dir) === 0;
  }
  carve(x, y, dir) {
    const nx = x + DX[dir], ny = y + DY[dir];
    if (!this.inside(nx, ny)) return false;
    this.cells[this.idx(x, y)] &= ~dir;
    this.cells[this.idx(nx, ny)] &= ~OPP[dir];
    return true;
  }
}

/**
 * Итеративный "recursive backtracker". Строит идеальный лабиринт:
 * из любой клетки достижима любая другая, значит выход гарантированно доступен.
 * braid (0..1) — доля тупиков, которые вскрываются, добавляя циклы.
 */
export function generateMaze(w, h, rng, braid = 0.25) {
  const m = new Maze(w, h);
  const total = w * h;
  const visited = new Uint8Array(total);
  const stack = new Int32Array(total);
  let sp = 0;

  let cur = ((rng() * total) | 0) % total;
  visited[cur] = 1;
  stack[sp++] = cur;
  let seen = 1;

  const order = [N, E, S, W];
  while (seen < total) {
    const x = cur % w, y = (cur / w) | 0;
    // перемешиваем направления
    for (let i = 3; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    let moved = false;
    for (let i = 0; i < 4; i++) {
      const d = order[i];
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (visited[ni]) continue;
      m.carve(x, y, d);
      visited[ni] = 1;
      seen++;
      stack[sp++] = ni;
      cur = ni;
      moved = true;
      break;
    }
    if (!moved) {
      sp--;
      if (sp <= 0) {
        // подстраховка: находим любую непосещённую клетку рядом с посещённой
        let found = -1;
        for (let i = 0; i < total && found < 0; i++) if (!visited[i]) found = i;
        if (found < 0) break;
        visited[found] = 1; seen++;
        stack[sp++] = found;
        cur = found;
      } else {
        cur = stack[sp - 1];
      }
    }
  }

  if (braid > 0) braidMaze(m, rng, braid);
  return m;
}

/** Вскрывает часть тупиков — появляются петли, играть менее душно. */
function braidMaze(m, rng, chance) {
  const { w, h, cells } = m;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const v = cells[i];
      // тупик — три стены
      const wallCount = (v & N ? 1 : 0) + (v & E ? 1 : 0) + (v & S ? 1 : 0) + (v & W ? 1 : 0);
      if (wallCount !== 3) continue;
      if (rng() > chance) continue;
      const cand = [];
      for (const d of DIRS) {
        if (!(v & d)) continue;
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        cand.push(d);
      }
      if (!cand.length) continue;
      m.carve(x, y, cand[(rng() * cand.length) | 0]);
    }
  }
}

/** Волновой поиск: массив расстояний от startIdx (в клетках), -1 если недостижимо. */
export function bfsDist(maze, startIdx, out) {
  const total = maze.w * maze.h;
  const dist = out || new Int32Array(total);
  dist.fill(-1);
  const queue = new Int32Array(total);
  let head = 0, tail = 0;
  dist[startIdx] = 0;
  queue[tail++] = startIdx;
  const w = maze.w, cells = maze.cells;
  while (head < tail) {
    const i = queue[head++];
    const x = i % w, y = (i / w) | 0;
    const v = cells[i];
    const d = dist[i] + 1;
    if (!(v & N) && y > 0) { const ni = i - w; if (dist[ni] < 0) { dist[ni] = d; queue[tail++] = ni; } }
    if (!(v & S) && y < maze.h - 1) { const ni = i + w; if (dist[ni] < 0) { dist[ni] = d; queue[tail++] = ni; } }
    if (!(v & W) && x > 0) { const ni = i - 1; if (dist[ni] < 0) { dist[ni] = d; queue[tail++] = ni; } }
    if (!(v & E) && x < w - 1) { const ni = i + 1; if (dist[ni] < 0) { dist[ni] = d; queue[tail++] = ni; } }
  }
  return dist;
}

/** Путь из from в to как массив индексов клеток (включая обе). */
export function findPath(maze, fromIdx, toIdx, dist) {
  const d = dist || bfsDist(maze, toIdx);
  if (d[fromIdx] < 0) return [];
  const path = [fromIdx];
  let cur = fromIdx;
  const w = maze.w, cells = maze.cells;
  let guard = maze.w * maze.h + 5;
  while (cur !== toIdx && guard-- > 0) {
    const x = cur % w, y = (cur / w) | 0;
    const v = cells[cur];
    let best = -1, bestD = d[cur];
    if (!(v & N) && y > 0 && d[cur - w] >= 0 && d[cur - w] < bestD) { best = cur - w; bestD = d[best]; }
    if (!(v & S) && y < maze.h - 1 && d[cur + w] >= 0 && d[cur + w] < bestD) { best = cur + w; bestD = d[best]; }
    if (!(v & W) && x > 0 && d[cur - 1] >= 0 && d[cur - 1] < bestD) { best = cur - 1; bestD = d[best]; }
    if (!(v & E) && x < w - 1 && d[cur + 1] >= 0 && d[cur + 1] < bestD) { best = cur + 1; bestD = d[best]; }
    if (best < 0) break;
    path.push(best);
    cur = best;
  }
  return path;
}

/** Клетки в радиусе r от start с учётом стен: Map index -> расстояние. */
export function fieldOfView(maze, startIdx, radius) {
  const res = new Map();
  const w = maze.w, h = maze.h, cells = maze.cells;
  const queue = [startIdx];
  res.set(startIdx, 0);
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi];
    const d = res.get(i);
    if (d >= radius) continue;
    const x = i % w, y = (i / w) | 0;
    const v = cells[i];
    if (!(v & N) && y > 0 && !res.has(i - w)) { res.set(i - w, d + 1); queue.push(i - w); }
    if (!(v & S) && y < h - 1 && !res.has(i + w)) { res.set(i + w, d + 1); queue.push(i + w); }
    if (!(v & W) && x > 0 && !res.has(i - 1)) { res.set(i - 1, d + 1); queue.push(i - 1); }
    if (!(v & E) && x < w - 1 && !res.has(i + 1)) { res.set(i + 1, d + 1); queue.push(i + 1); }
  }
  return res;
}
