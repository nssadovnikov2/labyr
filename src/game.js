// Ядро игры: состояние, ходы, аниматроники, предметы, победа и смерть.
import {
  generateMaze, bfsDist, findPath, fieldOfView,
  mulberry32, seedFromString, N, E, S, W, DX, DY, DIRS,
} from './maze.js';
import { ITEMS, rollItem } from './items.js';

export const AI_TYPES = [
  { type: 'freddy', name: 'Фредди' },
  { type: 'bonnie', name: 'Бонни' },
  { type: 'chica', name: 'Чика' },
  { type: 'foxy', name: 'Фокси' },
];

// Лестница сложностей. Нижняя ступень — «Кошмар»: аниматроники слышат игрока
// всегда и отовсюду, легче не бывает. Выше — то, что хуже кошмара.
//   sense      — радиус слуха в клетках
//   speed      — клеток за ход
//   patience   — сколько ходов подряд он гонится, прежде чем выдохнется
//   dodgeCd    — перезарядка рывка в ходах
//   stun       — на сколько ходов рывок сбивает его с ног
//   adrenaline — даёт ли страх герою четвёртый шаг
//   flank      — доля аниматроников, которые вместо погони режут путь к выходу
export const DIFFICULTY = {
  nightmare: {
    label: 'Кошмар', order: 1,
    sense: Infinity, speed: 4, scent: 1, stalkTurns: 999,
    patience: 20, dodgeCd: 8, stun: 2, adrenaline: true, flank: 0,
    about: 'слышат отовсюду, но выдыхаются в погоне',
  },
  blood: {
    label: 'Кровавая ночь', order: 2,
    sense: Infinity, speed: 4, scent: 1, stalkTurns: 999,
    patience: 34, dodgeCd: 10, stun: 2, adrenaline: true, flank: 0.5,
    about: 'дольше не отстают, один режет путь к выходу',
  },
  golden: {
    label: 'Золотой Фредди', order: 3,
    sense: Infinity, speed: 5, scent: 1, stalkTurns: 999,
    patience: Infinity, dodgeCd: 12, stun: 1, adrenaline: true, flank: 0.5,
    about: '5 клеток за ход, не выдыхаются никогда',
  },
  eternal: {
    label: 'Вечная ночь', order: 4,
    sense: Infinity, speed: 5, scent: 1, stalkTurns: 999,
    patience: Infinity, dodgeCd: 14, stun: 1, adrenaline: false, flank: 1,
    about: 'без адреналина, все режут путь',
  },
};

// Сколько ходов аниматроник не слышит игрока после того, как выдохся.
const HUNT_RECOVERY = 6;

const BASE_STEPS = 3;
// Пока ближайший аниматроник дальше этого, ход разрешается мгновенно:
// пошаговая возня нужна только когда есть с кем считаться.
const FAR_DISTANCE = 40;

export class Game {
  constructor(settings) {
    this.settings = settings;
    this.listeners = {};
    this.aiStepDelay = 110;
    this.reset(settings);
  }

  /** Партия закончилась/заменена: асинхронный ход ИИ должен тихо остановиться. */
  abort() {
    this.aborted = true;
    this.listeners = {};
  }

  on(type, fn) {
    (this.listeners[type] || (this.listeners[type] = [])).push(fn);
    return this;
  }
  emit(type, data) {
    const l = this.listeners[type];
    if (l) for (const fn of l) fn(data);
  }

  reset(settings = this.settings) {
    this.settings = settings;
    const size = settings.size;
    const seedText = (settings.seed || '').trim();
    this.seed = seedText ? seedFromString(seedText) : (Math.random() * 0xffffffff) >>> 0;
    this.seedText = seedText || this.seed.toString(36);
    const rng = mulberry32(this.seed);
    this.rng = rng;

    this.maze = generateMaze(size, size, rng, settings.braid / 100);
    this.w = size;
    this.h = size;
    const total = size * size;

    this.known = new Uint8Array(total);
    this.visible = new Uint8Array(total);
    this.visDist = new Int16Array(total).fill(-1);
    this.items = new Map();
    this.seenItems = new Map();
    this.inventory = [];
    this.effects = { path: 0, radar: 0, haste: 0, lantern: 0, revealed: false };
    this.turn = 1;
    this.phase = 'player';
    this.aborted = false;
    this.fear = 0;
    this.calm = 0;
    this.dodge = 0;
    this.wasFar = true;
    this.pathHint = [];
    this.log = [];

    this._placeEntities(rng);
    this._placeItems(rng);

    this.player.stepsLeft = this.stepsPerTurn();
    this.distPlayer = bfsDist(this.maze, this.playerIdx());
    this.recomputeVision();
    this._updateFear(1);
    this.emit('state');
  }

  // ——— размещение игрока, аниматроников и выхода ———
  _placeEntities(rng) {
    const { w, h } = this;
    const corners = [
      { x: 0, y: 0 }, { x: w - 1, y: 0 },
      { x: 0, y: h - 1 }, { x: w - 1, y: h - 1 },
    ];
    const pc = (rng() * 4) | 0;
    const lair = 3 - pc; // диагонально противоположный угол
    const rest = [0, 1, 2, 3].filter((i) => i !== pc && i !== lair);

    this.player = { x: corners[pc].x, y: corners[pc].y, dir: S, stepsLeft: BASE_STEPS, moving: false };
    const distFromPlayer = bfsDist(this.maze, this.idx(this.player.x, this.player.y));
    let maxDist = 0;
    for (let i = 0; i < distFromPlayer.length; i++) if (distFromPlayer[i] > maxDist) maxDist = distFromPlayer[i];

    // выход
    let exitCell;
    if (this.settings.exitAt === 'lair') {
      exitCell = corners[lair];
    } else if (this.settings.exitAt === 'far') {
      const pool = [];
      for (let i = 0; i < distFromPlayer.length; i++) if (distFromPlayer[i] >= maxDist * 0.8) pool.push(i);
      const pick = pool[(rng() * pool.length) | 0];
      exitCell = { x: pick % w, y: (pick / w) | 0 };
    } else {
      exitCell = corners[rest[(rng() * rest.length) | 0]];
    }
    this.exit = { x: exitCell.x, y: exitCell.y };
    this.exitIdx = this.idx(this.exit.x, this.exit.y);

    // аниматроники
    const count = this.settings.ai;
    const diff = DIFFICULTY[this.settings.difficulty] || DIFFICULTY.nightmare;
    this.diff = diff;
    const spots = [corners[lair]];
    for (const ri of rest) {
      if (spots.length >= count) break;
      const c = corners[ri];
      if (c.x === this.exit.x && c.y === this.exit.y && this.settings.exitAt !== 'lair') continue;
      spots.push(c);
    }
    const exitDist = bfsDist(this.maze, this.exitIdx);
    this.exitDistField = exitDist;
    this.exitRegion = [];
    for (let i = 0; i < exitDist.length; i++) {
      if (exitDist[i] >= 3 && exitDist[i] <= 30) this.exitRegion.push(i);
    }
    // Ночь может потребовать, чтобы аниматроники стартовали ближе: на малых
    // картах из дальнего угла они физически не успевают дойти до игрока.
    const near = this.settings.aiSpawnDist;
    if (near) {
      spots.length = 0;
      const ring = [];
      for (let i = 0; i < distFromPlayer.length; i++) {
        const d = distFromPlayer[i];
        if (d >= near * 0.75 && d <= near * 1.25 && exitDist[i] >= 10) ring.push(i);
      }
      let g2 = 0;
      while (spots.length < count && ring.length && g2++ < 3000) {
        const i = ring[(rng() * ring.length) | 0];
        const c = { x: i % w, y: (i / w) | 0 };
        if (spots.some((sp) => Math.abs(sp.x - c.x) + Math.abs(sp.y - c.y) < 6)) continue;
        spots.push(c);
      }
    }

    let guard = 0;
    while (spots.length < count && guard++ < 4000) {
      const i = (rng() * w * h) | 0;
      if (distFromPlayer[i] < maxDist * 0.45) continue;
      if (exitDist[i] < 12) continue;
      const c = { x: i % w, y: (i / w) | 0 };
      if (spots.some((s) => s.x === c.x && s.y === c.y)) continue;
      spots.push(c);
    }

    // хотя бы один всегда идёт в лоб: если резать путь будут все,
    // за игроком никто не погонится и его просто не поймают
    const flankers = Math.min(count - 1, Math.round(count * diff.flank));
    this.ais = spots.slice(0, count).map((s, i) => ({
      ...AI_TYPES[i % AI_TYPES.length],
      id: i,
      x: s.x, y: s.y,
      dir: N,
      sense: diff.sense,
      speed: diff.speed,
      scent: diff.scent,
      stalkTurns: diff.stalkTurns,
      patience: diff.patience,
      flank: false,
      frozen: 0,
      mode: 'patrol',
      plan: 1 + ((rng() * 6) | 0),
      stalk: 0,
      bestDist: Infinity,
      huntTurns: 0,
      lost: 0,
      flankPlan: 0,
      target: -1,
      targetDist: null,
      lastIdx: -1,
    }));
    // фланкеры — последние в списке, чтобы первый всегда шёл в лоб
    for (let i = 0; i < flankers && i < this.ais.length; i++) {
      this.ais[this.ais.length - 1 - i].flank = true;
    }
  }

  _placeItems(rng) {
    const { w, h, maze } = this;
    const density = this.settings.itemDensity;
    const count = Math.max(6, Math.round(w * h * density));
    const pIdx = this.playerIdx();
    const dist = bfsDist(maze, pIdx);
    const busy = new Set([pIdx, this.exitIdx, ...this.ais.map((a) => this.idx(a.x, a.y))]);

    const deadEnds = [];
    for (let i = 0; i < w * h; i++) {
      const v = maze.cells[i];
      const wc = (v & N ? 1 : 0) + (v & E ? 1 : 0) + (v & S ? 1 : 0) + (v & W ? 1 : 0);
      if (wc === 3) deadEnds.push(i);
    }

    let placed = 0, guard = 0;
    while (placed < count && guard++ < count * 60) {
      let i;
      if (deadEnds.length && rng() < 0.6) i = deadEnds[(rng() * deadEnds.length) | 0];
      else i = (rng() * w * h) | 0;
      if (busy.has(i) || this.items.has(i)) continue;
      if (dist[i] < 4) continue;
      this.items.set(i, rollItem(rng));
      placed++;
    }

    // гарантируем карту недалеко от старта, чтобы механика вообще нашлась
    const near = [];
    for (let i = 0; i < w * h; i++) if (dist[i] >= 8 && dist[i] <= 45 && !busy.has(i)) near.push(i);
    if (near.length) this.items.set(near[(rng() * near.length) | 0], 'map');
  }

  // ——— утилиты ———
  idx(x, y) { return y * this.w + x; }
  playerIdx() { return this.idx(this.player.x, this.player.y); }
  /** На адреналине герой делает лишний шаг — иначе от погони не оторваться. */
  stepsPerTurn() {
    const adrenaline = this.diff && this.diff.adrenaline !== false;
    return BASE_STEPS
      + (this.effects.haste > 0 ? 3 : 0)
      + (adrenaline && this.fear >= 0.7 ? 1 : 0);
  }
  fogRadius() {
    if (!this.settings.fog) return Infinity;
    return this.settings.fogRadius + this.effects.lantern;
  }

  recomputeVision() {
    const total = this.w * this.h;
    this.visible.fill(0);
    if (!this.settings.fog) {
      this.visible.fill(1);
      this.known.fill(1);
      this.visDist.fill(0);
      this._rememberItems();
      return;
    }
    this.visDist.fill(-1);
    const fov = fieldOfView(this.maze, this.playerIdx(), this.fogRadius());
    for (const [i, d] of fov) {
      this.visible[i] = 1;
      this.known[i] = 1;
      this.visDist[i] = d;
    }
    if (this.effects.revealed) {
      for (let i = 0; i < total; i++) this.known[i] = 1;
    }
    this._rememberItems();
  }

  _rememberItems() {
    for (const [i, id] of this.items) {
      if (this.visible[i] || (this.effects.revealed && this.known[i])) this.seenItems.set(i, id);
    }
    for (const i of [...this.seenItems.keys()]) if (!this.items.has(i)) this.seenItems.delete(i);
  }

  /**
   * Страх героя, 0..1. Растёт от близости аниматроника и особенно от того,
   * что он попал в поле зрения; нарастает рывком, отпускает медленно.
   * Найденный предмет переключает внимание и на пару ходов гасит страх совсем.
   */
  _updateFear(force = 0) {
    let target = 0;
    if (this.calm <= 0) {
      const d = this.nearestAiDistance();
      if (isFinite(d)) {
        if (d <= 3) target = 1;
        else if (d < 26) target = (26 - d) / 23;
      }
      if (target > 0 && this.ais.some((a) => this.visible[this.idx(a.x, a.y)])) {
        target = Math.min(1, target + 0.35);
      }
    }
    const k = force || (target > this.fear ? 0.45 : 0.1);
    this.fear += (target - this.fear) * k;
    if (this.fear < 0.004) this.fear = 0;
  }

  nearestAiDistance() {
    if (!this.distPlayer) return Infinity;
    let best = Infinity;
    for (const a of this.ais) {
      const d = this.distPlayer[this.idx(a.x, a.y)];
      if (d >= 0 && d < best) best = d;
    }
    return best;
  }

  // ——— ход игрока ———
  move(dir) {
    if (this.aborted || this.phase !== 'player') return false;
    if (this.player.stepsLeft <= 0) return false;
    this.player.dir = dir;
    const { x, y } = this.player;
    if (!this.maze.open(x, y, dir)) {
      this.emit('bump');
      this.emit('state');
      return false;
    }
    const nx = x + DX[dir], ny = y + DY[dir];
    const blockers = this.ais.filter((a) => a.x === nx && a.y === ny);

    if (blockers.length) {
      const allDown = blockers.every((a) => a.frozen > 0);
      if (allDown) {
        // лежачего можно перешагнуть, а заодно приложить ещё раз
        for (const a of blockers) a.frozen = Math.max(a.frozen, this.diff.stun);
        this.player.x = nx;
        this.player.y = ny;
        this.player.stepsLeft--;
        this.distPlayer = bfsDist(this.maze, this.playerIdx());
        this.recomputeVision();
        this._updateFear();
        this.emit('stomp', blockers[0]);
        this.emit('state');
        if (this.player.stepsLeft <= 0) this.endTurn();
        return true;
      }

      if (this.dodge > 0) {
        this.player.x = nx;
        this.player.y = ny;
        this.recomputeVision();
        return this._die(blockers.find((a) => a.frozen <= 0) || blockers[0]);
      }

      // рывок сбивает с ног всех, кто оказался в этой клетке
      for (const a of blockers) {
        a.x = x;
        a.y = y;
        a.lastIdx = this.idx(nx, ny);
        a.frozen = this.diff.stun;
        a.mode = 'hunt';
      }
      this.player.x = nx;
      this.player.y = ny;
      this.player.stepsLeft = 0;
      this.dodge = this.diff.dodgeCd;
      this.fear = 1;
      this.calm = 0;
      this.distPlayer = bfsDist(this.maze, this.playerIdx());
      this.recomputeVision();
      this.emit('dodge', blockers[0]);
      this.emit('toast', {
        text: blockers.length > 1
          ? `Рывок сквозь двоих!`
          : `Рывок мимо ${blockers[0].name}!`,
        color: '#ffb9ad',
      });
      this.emit('state');
      this.endTurn();
      return true;
    }

    this.player.x = nx;
    this.player.y = ny;
    this.player.stepsLeft--;
    this.emit('step');

    const i = this.playerIdx();
    this.distPlayer = bfsDist(this.maze, i);
    this.recomputeVision();
    this._pickup(i);

    if (this.effects.path > 0) this._refreshPathHint();
    this._updateFear();

    if (i === this.exitIdx) return this._win();

    this.emit('state');
    if (this.player.stepsLeft <= 0) this.endTurn();
    return true;
  }

  endTurn() {
    if (this.phase !== 'player') return;
    this.player.stepsLeft = 0;
    if (this.isFar()) this._aiTurnFast();
    else { this.emit('state'); this._aiTurn(); }
  }

  _pickup(i) {
    const id = this.items.get(i);
    if (!id) return;
    this.items.delete(i);
    this.seenItems.delete(i);
    const def = ITEMS[id];
    // внимание переключилось на находку — страх отпускает, камера отъезжает
    this.fear = 0;
    this.calm = 2;
    if (def.instant) {
      if (id === 'lantern') this.effects.lantern = Math.min(8, this.effects.lantern + 2);
      this.recomputeVision();
      this.emit('toast', { text: `${def.name}: радиус обзора увеличен`, color: def.color });
    } else {
      this.inventory.push(id);
      this.emit('toast', { text: `Найдено: ${def.name}`, color: def.color });
    }
    this.emit('pickup', id);
  }

  useItem(slot) {
    if (this.phase !== 'player') return;
    const id = this.inventory[slot];
    if (!id) return;
    const def = ITEMS[id];
    this.inventory.splice(slot, 1);
    switch (id) {
      case 'map':
        this.effects.path = 6;
        this._refreshPathHint();
        break;
      case 'vision':
        this.effects.revealed = true;
        break;
      case 'haste':
        this.effects.haste = 3;
        this.player.stepsLeft += 3;
        this.dodge = 0; // на адреналине рывок снова готов
        break;
      case 'radar':
        this.effects.radar = 5;
        break;
      case 'trap':
        for (const a of this.ais) a.frozen = 2;
        break;
    }
    this.recomputeVision();
    this.emit('toast', { text: `${def.name} — применено`, color: def.color });
    this.emit('use', id);
    this.emit('state');
  }

  _refreshPathHint() {
    this.pathHint = findPath(this.maze, this.playerIdx(), this.exitIdx);
  }

  // ——— ход аниматроников ———
  async _aiTurn() {
    if (this.aborted) return;
    this.phase = 'ai';
    this.emit('phase', 'ai');
    this.emit('state');

    for (const a of this.ais) if (a.frozen <= 0) this._aiPlan(a);

    const maxSteps = Math.max(...this.ais.map((a) => a.speed));
    for (let step = 0; step < maxSteps; step++) {
      let moved = false;
      for (const a of this.ais) {
        if (a.frozen > 0) continue;
        if (step >= a.speed) continue;
        this._stepAi(a);
        moved = true;
        if (a.x === this.player.x && a.y === this.player.y) {
          this.emit('state');
          return this._die(a);
        }
      }
      this.recomputeVision();
      this._updateFear();
      this.emit('state');
      if (moved) await sleep(this.aiStepDelay);
      if (this.aborted) return;
    }

    this._endAiTurn();
  }

  /** Ход аниматроников без пауз — когда они далеко и смотреть не на что. */
  _aiTurnFast() {
    if (this.aborted) return;
    this.phase = 'ai';
    for (const a of this.ais) if (a.frozen <= 0) this._aiPlan(a);
    const maxSteps = Math.max(...this.ais.map((a) => a.speed));
    for (let step = 0; step < maxSteps; step++) {
      for (const a of this.ais) {
        if (a.frozen > 0 || step >= a.speed) continue;
        this._stepAi(a);
        if (a.x === this.player.x && a.y === this.player.y) {
          this.recomputeVision();
          this.emit('state');
          return this._die(a);
        }
      }
    }
    this.recomputeVision();
    this._updateFear();
    this._endAiTurn();
  }

  _endAiTurn() {
    for (const a of this.ais) if (a.frozen > 0) a.frozen--;
    this.turn++;
    if (this.effects.path > 0) this.effects.path--;
    if (this.effects.radar > 0) this.effects.radar--;
    if (this.effects.haste > 0) this.effects.haste--;
    if (this.calm > 0) this.calm--;
    if (this.dodge > 0) this.dodge--;
    if (this.effects.path > 0) this._refreshPathHint(); else this.pathHint = [];

    this.phase = 'player';
    this.player.stepsLeft = this.stepsPerTurn();
    const far = this.isFar();
    if (far !== this.wasFar) {
      this.wasFar = far;
      this.emit('mode', far);
    }
    this.emit('phase', 'player');
    this.emit('state');
  }

  /** Никого поблизости — ход можно не разыгрывать, а просто идти. */
  isFar() {
    const d = this.nearestAiDistance();
    return isFinite(d) ? d > FAR_DISTANCE : true;
  }

  /**
   * Раз в ход аниматроник решает, куда он вообще идёт.
   * hunt   — слышит игрока и идёт точно на него;
   * search — потерял и добирается до последнего известного места;
   * stalk  — «взял след»: не знает точки, но упорно движется в район игрока,
   *          подновляя направление, пока не выйдет на слышимость;
   * patrol — бродит по лабиринту и стережёт выход.
   */
  _aiPlan(a) {
    const cur = this.idx(a.x, a.y);
    const d = this.distPlayer[cur];
    if (a.lost > 0) a.lost--;
    const senses = a.lost <= 0 && (a.sense === Infinity || (d >= 0 && d <= a.sense));

    if (senses) {
      // погоня выматывает: побегав достаточно долго впустую, он теряет игрока
      a.huntTurns++;
      if (a.huntTurns > a.patience) {
        a.huntTurns = 0;
        a.lost = HUNT_RECOVERY;
        a.mode = 'search';
        a.stalk = 0;
        a.plan = 8;
        a.target = this.playerIdx();
        a.targetDist = bfsDist(this.maze, a.target);
        return;
      }
      a.stalk = 0;
      // фланкер не бежит в лоб, а срезает и ждёт на пути к выходу
      if (a.flank) {
        a.mode = 'flank';
        if (--a.flankPlan <= 0) {
          a.flankPlan = 4;
          a.target = this._cutoffCell();
          a.targetDist = bfsDist(this.maze, a.target);
        }
        return;
      }
      a.mode = 'hunt';
      a.target = -1;
      a.targetDist = null;
      return;
    }
    a.huntTurns = 0;

    if (a.mode === 'hunt') {
      // упустил — идём туда, где он был слышен в последний раз
      a.mode = 'search';
      a.plan = 10;
      a.target = this.playerIdx();
      a.targetDist = bfsDist(this.maze, a.target);
      return;
    }

    if (a.stalk > 0) {
      // след остывает, только пока аниматроник не сокращает разрыв: пока он
      // ставит новый рекорд сближения — идёт верно и погоню не бросает
      if (d >= 0 && d < a.bestDist) a.bestDist = d;
      else a.stalk--;
      if (--a.plan <= 0) {
        a.plan = 5;
        a.target = this._cellNearPlayer();
        a.targetDist = bfsDist(this.maze, a.target);
      }
      return;
    }

    if (--a.plan <= 0 || a.target < 0 || a.target === cur) {
      a.plan = 8 + ((this.rng() * 7) | 0);
      if (this.rng() < (a.scent || 0)) {
        a.mode = 'stalk';
        a.stalk = a.stalkTurns;
        a.bestDist = d >= 0 ? d : Infinity;
        a.target = this._cellNearPlayer();
      } else {
        a.mode = 'patrol';
        a.target = this._patrolTarget();
      }
      a.targetDist = bfsDist(this.maze, a.target);
    }
  }

  _stepAi(a) {
    const field = a.mode === 'hunt' ? this.distPlayer : a.targetDist;

    const opts = [];
    for (const dir of DIRS) {
      if (!this.maze.open(a.x, a.y, dir)) continue;
      const nx = a.x + DX[dir], ny = a.y + DY[dir];
      // в одну клетку двоим не влезть: перепрыгнуть друг друга нельзя
      if (this.ais.some((o) => o !== a && o.x === nx && o.y === ny)) continue;
      opts.push({ d: dir, ni: this.idx(nx, ny) });
    }
    if (!opts.length) return;

    const cur = this.idx(a.x, a.y);
    let choice = null;
    if (field) {
      let best = field[cur];
      const good = [];
      for (const o of opts) {
        const v = field[o.ni];
        if (v >= 0 && v < best) { best = v; good.length = 0; good.push(o); }
        else if (v >= 0 && v === best && good.length) good.push(o);
      }
      if (good.length) choice = good[(this.rng() * good.length) | 0];
    }
    if (!choice) {
      // дошёл или упёрся — бредёт дальше, стараясь не разворачиваться назад
      const fwd = opts.filter((o) => o.ni !== a.lastIdx);
      const pool = fwd.length ? fwd : opts;
      choice = pool[(this.rng() * pool.length) | 0];
      a.plan = 0;
    }

    a.lastIdx = cur;
    a.dir = choice.d;
    a.x += DX[choice.d];
    a.y += DY[choice.d];
  }

  /** Клетка на пути игрока к выходу, чуть впереди него — там его и ждут. */
  _cutoffCell() {
    const path = findPath(this.maze, this.playerIdx(), this.exitIdx, this.exitDistField);
    if (!path.length) return this.exitIdx;
    return path[Math.min(path.length - 1, 14)];
  }

  /** Куда пойдёт скучающий аниматроник: чаще случайная точка, иногда — стеречь выход. */
  _patrolTarget() {
    if (this.exitRegion && this.exitRegion.length && this.rng() < 0.35) {
      return this.exitRegion[(this.rng() * this.exitRegion.length) | 0];
    }
    return (this.rng() * this.w * this.h) | 0;
  }

  /**
   * Точка «по следу»: кольцо вокруг игрока — не его клетка, но его район.
   * Аниматроник не знает, где игрок, но знает, куда идти.
   */
  _cellNearPlayer() {
    const d = this.distPlayer;
    if (!d) return (this.rng() * this.w * this.h) | 0;
    const out = [];
    for (let i = 0; i < d.length; i++) if (d[i] > 5 && d[i] <= 22) out.push(i);
    if (!out.length) return this.playerIdx();
    return out[(this.rng() * out.length) | 0];
  }

  _die(killer) {
    this.phase = 'dead';
    this.emit('death', killer);
    this.emit('state');
    return false;
  }

  _win() {
    this.phase = 'win';
    this.emit('win', { turns: this.turn });
    this.emit('state');
    return true;
  }
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
