// Музыка целиком синтезируется в браузере: никаких аудиофайлов.
// Голоса: музыкальная шкатулка (неармоничные обертоны металлического язычка)
// и щипковая струна (алгоритм Карплуса — Стронга).
//
// Тема — это не фиксированные ноты, а набор настроек: круг аккордов, размер,
// темп, плотность перебора, доля хроматики, количество хора, подкладок и
// перкуссии. Ноты каждый раз собираются заново, поэтому одна и та же тема
// звучит похоже, но никогда одинаково.

const rnd = (a, b) => a + Math.random() * (b - a);
const chance = (p) => Math.random() < p;

// ——— круги аккордов ———
// chord: MIDI-ноты снизу вверх. melody: из чего собирается верхний голос —
// в каждом наборе есть тритон от основного тона и хроматические соседи.

const PROG_CRYPT = [
  { chord: [45, 52, 57, 60, 64], melody: [69, 72, 75, 70, 64] }, // Am
  { chord: [41, 48, 53, 57, 60], melody: [65, 71, 69, 76, 66] }, // F
  { chord: [38, 45, 50, 53, 57], melody: [74, 68, 77, 73, 69] }, // Dm
  { chord: [47, 50, 53, 56, 62], melody: [71, 77, 68, 74, 65] }, // Bdim
  { chord: [46, 53, 58, 62, 65], melody: [70, 76, 74, 73, 65] }, // Bb
  { chord: [40, 47, 52, 56, 59], melody: [76, 70, 68, 71, 77] }, // E
];

// Хроматически сползающий бас: A — G# — G — F# — F — E.
const PROG_LAMENT = [
  { chord: [45, 52, 57, 60, 64], melody: [69, 72, 76, 75] }, // Am
  { chord: [44, 51, 56, 59, 63], melody: [68, 71, 75, 74] }, // Am/G#
  { chord: [43, 50, 55, 60, 64], melody: [67, 72, 76, 70] }, // C/G
  { chord: [42, 48, 54, 57, 60], melody: [66, 72, 69, 75] }, // F#dim
  { chord: [41, 48, 53, 57, 60], melody: [65, 71, 69, 72] }, // F
  { chord: [40, 47, 52, 56, 59], melody: [64, 71, 68, 70] }, // E
];

const PROG_WALTZ = [
  { chord: [45, 57, 60, 64, 69], melody: [76, 72, 81, 75] }, // Am
  { chord: [40, 52, 55, 59, 64], melody: [71, 76, 79, 70] }, // Em
  { chord: [41, 53, 57, 60, 65], melody: [77, 72, 81, 66] }, // F
  { chord: [40, 52, 56, 59, 64], melody: [76, 68, 71, 77] }, // E
];

const PROG_VOID = [
  { chord: [45, 52, 57, 64, 69], melody: [69, 75, 72, 76] }, // Am
  { chord: [46, 53, 58, 65, 70], melody: [70, 76, 74, 65] }, // Bb
  { chord: [47, 50, 53, 62, 68], melody: [71, 77, 68, 74] }, // Bdim
  { chord: [40, 47, 52, 59, 64], melody: [76, 70, 71, 68] }, // E
];

const PROG_HUNT = [
  { chord: [45, 52, 57, 60, 64], melody: [69, 75, 72, 70] }, // Am
  { chord: [46, 52, 58, 61, 64], melody: [70, 76, 73, 64] }, // Bb
  { chord: [44, 51, 56, 59, 62], melody: [68, 74, 71, 75] }, // G#dim
  { chord: [40, 47, 52, 56, 59], melody: [76, 70, 68, 74] }, // E
];

/**
 * Пять тем. Отличаются темпом, размером, голосом, кругом аккордов,
 * плотностью нот и тем, чего в них больше — хора, подкладок или перкуссии.
 */
export const PRESETS = [
  {
    id: 'box', name: 'Шкатулка',
    about: 'медленно, поровну хора и тишины',
    bpm: 50, beats: 4, barsPerChord: 2, voice: 'box', transpose: 12,
    prog: PROG_CRYPT,
    patterns: [[0, 2, 3, 5, 6], [0, 3, 4, 6], [0, 2, 4, 5, 7], [0, 1, 3, 6]],
    rest: 0.12, bass: 0.45,
    melodyChance: 0.5, chromatic: 0.45, tritone: 0.28, sour: 0.12,
    pad: 1, drone: 0.75, droneEvery: 5,
    drumEvery: 4, drumLevel: 0.85, tick: 0, wet: 0.5,
  },
  {
    id: 'waltz', name: 'Колыбельная',
    about: 'вальс, много хора, без ударных',
    bpm: 44, beats: 3, barsPerChord: 2, voice: 'box', transpose: 12,
    prog: PROG_WALTZ,
    patterns: [[0, 2, 4], [0, 2, 3, 4], [0, 4], [0, 2, 4, 5]],
    rest: 0.08, bass: 0.9,
    melodyChance: 0.62, chromatic: 0.5, tritone: 0.2, sour: 0.16,
    pad: 1.4, drone: 0.5, droneEvery: 7,
    drumEvery: 12, drumLevel: 0.4, tick: 0, wet: 0.62,
  },
  {
    id: 'clockwork', name: 'Механизм',
    about: 'быстро, тиканье и ударные',
    bpm: 78, beats: 4, barsPerChord: 1, voice: 'box', transpose: 12,
    prog: PROG_LAMENT,
    patterns: [[0, 2, 4, 6], [0, 1, 2, 4, 6], [0, 2, 4, 5, 6], [0, 2, 3, 4, 6, 7]],
    rest: 0.05, bass: 0.85,
    melodyChance: 0.4, chromatic: 0.4, tritone: 0.3, sour: 0.08,
    pad: 0.45, drone: 0.4, droneEvery: 9,
    drumEvery: 2, drumLevel: 1, tick: 1, wet: 0.36,
  },
  {
    id: 'void', name: 'Пустота',
    about: 'почти без мелодии, хор и диссонансы',
    bpm: 40, beats: 4, barsPerChord: 4, voice: 'box', transpose: 12,
    prog: PROG_VOID,
    patterns: [[0, 4], [0], [0, 3], [0, 5]],
    rest: 0.3, bass: 0.55,
    melodyChance: 0.28, chromatic: 0.55, tritone: 0.35, sour: 0.2,
    pad: 1.5, drone: 1, droneEvery: 3,
    drumEvery: 8, drumLevel: 1.2, tick: 0, wet: 0.75,
  },
  {
    id: 'hunt', name: 'Погоня',
    about: 'струна вместо шкатулки, быстро',
    bpm: 96, beats: 4, barsPerChord: 1, voice: 'guitar', transpose: 0,
    prog: PROG_HUNT,
    patterns: [[0, 1, 2, 3, 4, 5, 6, 7], [0, 2, 3, 4, 6, 7], [0, 1, 3, 4, 5, 7]],
    rest: 0.1, bass: 1,
    melodyChance: 0.35, chromatic: 0.35, tritone: 0.4, sour: 0.06,
    pad: 0.3, drone: 0.5, droneEvery: 6,
    drumEvery: 2, drumLevel: 1.1, tick: 0, wet: 0.3,
  },
];

export function presetById(id) {
  return PRESETS.find((p) => p.id === id) || PRESETS[0];
}

export class Music {
  constructor(sfx) {
    this.sfx = sfx;
    this.enabled = true;
    this.volume = 0.55;
    this.playing = false;
    this.bar = 0;
    this._buffers = new Map();
    this._timer = null;
    this._duck = 1;
    this.preset = PRESETS[0];
    this._applyTiming();
  }

  _applyTiming() {
    this.beat = 60 / this.preset.bpm;
    this.barDur = this.beat * this.preset.beats;
    this.slots = this.preset.beats * 2; // восьмые
  }

  /** id темы, либо 'random' — выбрать случайную. */
  setPreset(id) {
    const next = id === 'random' ? PRESETS[(Math.random() * PRESETS.length) | 0] : presetById(id);
    if (next === this.preset && this.playing) return next;
    this.preset = next;
    this._applyTiming();
    this.bar = 0;
    if (this.ctx) {
      this.nextBarTime = this.ctx.currentTime + 0.25;
      if (this.wetGain) this.wetGain.gain.value = next.wet;
    }
    return next;
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.stop();
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.bus) this.bus.gain.value = this.volume * this._duck;
  }

  /** Приглушить музыку (джампскейр, финал) без остановки. */
  duck(amount = 0, seconds = 0.4) {
    this._duck = amount;
    if (!this.bus) return;
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setValueAtTime(this.bus.gain.value, t);
    this.bus.gain.linearRampToValueAtTime(Math.max(0.0001, this.volume * amount), t + seconds);
  }

  _build() {
    const ctx = this.sfx.ensure();
    if (!ctx) return false;
    this.ctx = ctx;
    if (this.bus) return true;

    this.bus = ctx.createGain();
    this.bus.gain.value = this.volume * this._duck;
    this.bus.connect(this.sfx.master);

    // отправка в общий ревербератор — музыка звучит в том же помещении
    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = this.preset.wet;
    this.wetGain.connect(this.sfx.verb);
    this.bus.connect(this.wetGain);

    // Баланс голосов. Шкатулка ведёт тему, поэтому она тише остальных,
    // а бас идёт своей шиной — иначе он тонет под её же перебором.
    const body1 = ctx.createBiquadFilter();
    body1.type = 'peaking'; body1.frequency.value = 110; body1.Q.value = 1.1; body1.gain.value = 4;
    const body2 = ctx.createBiquadFilter();
    body2.type = 'peaking'; body2.frequency.value = 230; body2.Q.value = 1.4; body2.gain.value = 3;
    const top = ctx.createBiquadFilter();
    top.type = 'lowpass'; top.frequency.value = 4800; top.Q.value = 0.7;
    this.guitarGain = ctx.createGain();
    this.guitarGain.gain.value = 0.94;
    body1.connect(body2); body2.connect(top); top.connect(this.guitarGain);
    this.guitarGain.connect(this.bus);
    this.guitarIn = body1;

    // шкатулка: без низа, с лёгким блеском наверху
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 190; hp.Q.value = 0.7;
    const sparkle = ctx.createBiquadFilter();
    sparkle.type = 'peaking'; sparkle.frequency.value = 2600; sparkle.Q.value = 1.2; sparkle.gain.value = 3.5;
    this.boxGain = ctx.createGain();
    this.boxGain.gain.value = 0.72;
    hp.connect(sparkle); sparkle.connect(this.boxGain);
    this.boxGain.connect(this.bus);
    this.boxIn = hp;

    // бас: отдельная шина с подчёркнутым низом
    const bassShelf = ctx.createBiquadFilter();
    bassShelf.type = 'lowshelf'; bassShelf.frequency.value = 320; bassShelf.gain.value = 5;
    this.bassGain = ctx.createGain();
    this.bassGain.gain.value = 1.2;
    bassShelf.connect(this.bassGain);
    this.bassGain.connect(this.bus);
    this.bassIn = bassShelf;

    this.padIn = ctx.createGain();
    this.padIn.gain.value = 1;
    this.padIn.connect(this.bus);
    return true;
  }

  // ——— голоса ———

  _buffer(voice, midi) {
    const key = voice + ':' + midi;
    if (this._buffers.has(key)) return this._buffers.get(key);
    const buf = voice === 'box' ? this._renderBox(midi) : this._renderString(midi);
    this._buffers.set(key, buf);
    return buf;
  }

  /**
   * Музыкальная шкатулка: металлический язычок гребёнки. Его обертоны
   * неармоничны (примерно 1 : 2.76 : 5.40 : 8.93, как у свободного бруска),
   * верхние гаснут заметно быстрее нижних, а в начале щёлкает штифт вала.
   */
  _renderBox(midi) {
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const f0 = 440 * Math.pow(2, (midi - 69) / 12);
    // высокие язычки короче звучат
    const pitchK = Math.max(0.5, Math.min(2.6, f0 / 523));
    const dur = Math.max(0.8, Math.min(3.2, 2.9 / pitchK));
    const len = Math.floor(sr * dur);
    const buf = ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);

    const partials = [
      [1.0, 1.0, 2.4],
      [2.76, 0.4, 4.6],
      [5.4, 0.17, 8.5],
      [8.93, 0.06, 14],
      [13.34, 0.025, 20],
    ];
    for (const p of partials) {
      const freq = f0 * p[0] * rnd(0.998, 1.002); // язычок не идеален
      const w = 2 * Math.PI * freq / sr;
      const phase = Math.random() * Math.PI * 2;
      const decay = p[2] * pitchK / sr;
      const amp = p[1];
      for (let i = 0; i < len; i++) {
        out[i] += Math.sin(w * i + phase) * amp * Math.exp(-decay * i);
      }
    }

    // щелчок механизма: штифт цепляет язычок
    const clickLen = Math.floor(sr * 0.006);
    let prev = 0;
    for (let i = 0; i < clickLen; i++) {
      const n = Math.random() * 2 - 1;
      const hp = n - prev; // грубый highpass — щелчок, а не шлепок
      prev = n;
      out[i] += hp * 0.5 * (1 - i / clickLen);
    }

    let peak = 0;
    for (let i = 0; i < len; i++) if (Math.abs(out[i]) > peak) peak = Math.abs(out[i]);
    const norm = peak > 0 ? 0.9 / peak : 1;
    const fade = Math.floor(sr * 0.03);
    for (let i = 0; i < len; i++) {
      let g = norm;
      if (i > len - fade) g *= (len - i) / fade;
      out[i] *= g;
    }
    return buf;
  }

  /**
   * Карплус — Стронг: возбуждаем «струну» шумом и гоняем по кольцевой линии
   * задержки с усреднением соседей — высокие частоты гаснут быстрее низких.
   */
  _renderString(midi) {
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const n = Math.max(2, Math.round(sr / freq));

    const line = new Float32Array(n);
    let s = 0;
    for (let i = 0; i < n; i++) {
      s = s * 0.62 + (Math.random() * 2 - 1) * 0.38; // мягкое возбуждение — нейлон
      line[i] = s;
    }
    let mean = 0;
    for (let i = 0; i < n; i++) mean += line[i];
    mean /= n;
    for (let i = 0; i < n; i++) line[i] -= mean;

    const dur = midi < 55 ? 3.6 : 2.6;
    const len = Math.floor(sr * dur);
    const buf = ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    const damp = 0.9975;
    const bright = 0.35;
    let idx = 0, prev = 0, peak = 0;
    for (let i = 0; i < len; i++) {
      const cur = line[idx];
      out[i] = cur;
      if (Math.abs(cur) > peak) peak = Math.abs(cur);
      const avg = (cur + prev) * 0.5;
      prev = cur;
      line[idx] = ((1 - bright) * avg + bright * cur) * damp;
      idx = (idx + 1) % n;
    }
    const norm = peak > 0 ? 0.9 / peak : 1;
    const att = Math.floor(sr * 0.004);
    for (let i = 0; i < len; i++) {
      let g = norm;
      if (i < att) g *= i / att;
      const tail = 1 - i / len;
      out[i] *= g * tail * tail;
    }
    return buf;
  }

  /**
   * detune — расстройка в центах: небольшая делает звук живым, большая — больным.
   * role 'bass' уводит ноту на басовую шину, мимо громкости ведущего голоса.
   */
  note(midi, when, gain = 0.5, pan = 0, detune = 0, role = 'lead') {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const voice = this.preset.voice;
    const m = midi + this.preset.transpose;
    const src = ctx.createBufferSource();
    src.buffer = this._buffer(voice, m);
    src.playbackRate.value = Math.pow(2, (detune + rnd(-3, 3)) / 1200);
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    const dest = role === 'bass' ? this.bassIn : (voice === 'box' ? this.boxIn : this.guitarIn);
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p); p.connect(dest);
    } else {
      g.connect(dest);
    }
    src.start(when);
  }

  /** Хоровой пэд: расстроенные пилы через формантные полосы. */
  pad(midis, when, dur, level = 1) {
    const ctx = this.ctx;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.linearRampToValueAtTime(0.031 * level, when + dur * 0.45);
    amp.gain.linearRampToValueAtTime(0.0001, when + dur);
    amp.connect(this.padIn);

    for (const [f, q, lvl] of [[620, 6, 1], [1080, 8, 0.6], [2500, 9, 0.18]]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const bg = ctx.createGain(); bg.gain.value = lvl;
      bp.connect(bg); bg.connect(amp);
      for (const m of midis) {
        const freq = 440 * Math.pow(2, (m - 69) / 12);
        for (let k = 0; k < 2; k++) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = freq * (k ? 1.004 : 0.996);
          o.connect(bp);
          o.start(when);
          o.stop(when + dur + 0.1);
        }
      }
    }
  }

  /** Диссонансная подкладка: секунда или тритон, всплывающие из темноты. */
  drone(midi, when, dur) {
    const ctx = this.ctx;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(0.022, when + dur * 0.5);
    g.gain.linearRampToValueAtTime(0.0001, when + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 700;
    lp.connect(g); g.connect(this.bus);
    for (const mul of [1, 1.5, 2.002]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq * mul;
      o.connect(lp);
      o.start(when);
      o.stop(when + dur + 0.1);
    }
  }

  /** Редкий глухой удар — где-то в глубине подземелья. */
  drum(when, level = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(74, when);
    o.frequency.exponentialRampToValueAtTime(36, when + 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.154 * level, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 1.1);
    o.connect(g); g.connect(this.bus);
    o.start(when); o.stop(when + 1.2);
  }

  /** Тиканье вала: сухой щелчок механизма на каждой доле. */
  tick(when, level = 1) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 0.02);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const n = Math.random() * 2 - 1;
      d[i] = (n - prev) * Math.pow(1 - i / len, 6);
      prev = n;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = rnd(3200, 4800); bp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.value = 0.06 * level;
    src.connect(bp); bp.connect(g); g.connect(this.bus);
    src.start(when);
  }

  // ——— секвенсор ———
  start() {
    if (!this.enabled || this.playing) return;
    if (!this._build()) return;
    this.playing = true;
    this.nextBarTime = this.ctx.currentTime + 0.4;
    this._timer = setInterval(() => this._schedule(), 250);
    this._schedule();
  }

  stop() {
    this.playing = false;
    clearInterval(this._timer);
    this._timer = null;
  }

  _schedule() {
    if (!this.playing || !this.ctx) return;
    while (this.nextBarTime < this.ctx.currentTime + 2.2) {
      this._scheduleBar(this.bar, this.nextBarTime);
      this.nextBarTime += this.barDur;
      this.bar++;
    }
  }

  _scheduleBar(bar, t0) {
    const P = this.preset;
    const beat = this.beat;
    const eighth = beat / 2;
    const idx = ((bar / P.barsPerChord) | 0) % P.prog.length;
    const section = P.prog[idx];
    const chord = section.chord;
    const firstBarOfChord = bar % P.barsPerChord === 0;
    const tritone = chord[0] + 6;

    if (firstBarOfChord || chance(P.bass * 0.5)) {
      this.note(chord[0], t0 + rnd(-0.01, 0.02), rnd(0.42, 0.6), rnd(-0.15, 0.15), 0, 'bass');
    }

    // перебор
    const pattern = P.patterns[(bar + (chance(0.3) ? 1 : 0)) % P.patterns.length];
    const up = chance(0.65);
    pattern.forEach((slot, i) => {
      if (slot === 0) return;
      if (slot >= this.slots) return;
      if (chance(P.rest)) return;
      const order = up ? i : pattern.length - 1 - i;
      let n = chord[1 + (order % (chord.length - 1))];
      if (chance(0.1)) n = tritone + 12; // тритон вместо аккордовой ноты
      this.note(n, t0 + slot * eighth + rnd(-0.02, 0.03), rnd(0.22, 0.38), rnd(-0.35, 0.35));
    });

    // мелодия с хроматическими подходами
    if (chance(firstBarOfChord ? P.melodyChance : P.melodyChance * 0.6)) {
      const mel = section.melody;
      let t = t0 + rnd(0.6, 1.6) * beat;
      const count = 1 + ((Math.random() * 2) | 0);
      for (let i = 0; i < count; i++) {
        const n = mel[(Math.random() * mel.length) | 0];
        const pan = rnd(-0.4, 0.4);
        if (chance(P.chromatic)) {
          this.note(n + (chance(0.6) ? -1 : 1), t - beat * 0.28, rnd(0.14, 0.22), pan);
        }
        const sour = chance(P.sour) ? rnd(18, 34) * (chance(0.5) ? -1 : 1) : 0;
        this.note(n, t, rnd(0.3, 0.45), pan, sour);
        t += beat * (chance(0.5) ? 0.5 : 1);
        if (t > t0 + this.barDur) break;
      }
    }

    // одинокий тритон, который не разрешается
    if (chance(P.tritone)) {
      this.note(tritone + 12, t0 + beat * rnd(1.2, P.beats - 0.6), rnd(0.18, 0.28), rnd(-0.6, 0.6));
    }

    // хроматический подход баса к следующему аккорду
    const lastBarOfChord = bar % P.barsPerChord === P.barsPerChord - 1;
    if (lastBarOfChord && chance(0.55)) {
      const next = P.prog[(idx + 1) % P.prog.length];
      this.note(next.chord[0] + (chance(0.5) ? 1 : -1), t0 + this.barDur - eighth,
        rnd(0.24, 0.34), rnd(-0.2, 0.2), 0, 'bass');
    }

    if (firstBarOfChord && P.pad > 0) {
      this.pad([chord[0] + 12, chord[3], chord[4]], t0,
        this.barDur * P.barsPerChord * 1.05, rnd(0.7, 1) * P.pad);
    }

    if (bar % P.droneEvery === P.droneEvery - 2 && chance(P.drone)) {
      this.drone(chord[0] + (chance(0.5) ? 13 : 6), t0 + beat, this.barDur * 1.6);
    }

    if (bar % P.drumEvery === 0) this.drum(t0, rnd(0.7, 1) * P.drumLevel);
    else if (P.drumEvery > 2 && bar % P.drumEvery === 2 && chance(0.3)) {
      this.drum(t0 + beat * 2, 0.5 * P.drumLevel);
    }

    if (P.tick) {
      for (let b = 0; b < P.beats; b++) {
        this.tick(t0 + b * beat, b === 0 ? 1.4 : 0.8);
      }
    }
  }
}
