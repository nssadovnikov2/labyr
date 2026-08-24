// Музыка целиком синтезируется в браузере: никаких аудиофайлов.
// Гитара — физическая модель щипковой струны (алгоритм Карплуса — Стронга),
// поверх неё хоровые пэды, диссонансные подкладки и редкие удары.
// Тема авторская, в духе подземелий и Тристрама: ля минор, медленно, много пауз.

const BPM = 54;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;

// Аккорды: MIDI-ноты снизу вверх. Ля-минор с фригийским поворотом в конце.
const PROGRESSION = [
  { name: 'Am', chord: [45, 52, 57, 60, 64], melody: [69, 72, 76, 67] },
  { name: 'F',  chord: [41, 48, 53, 57, 60], melody: [65, 69, 72, 77] },
  { name: 'Dm', chord: [38, 45, 50, 53, 57], melody: [69, 74, 77, 65] },
  { name: 'E',  chord: [40, 47, 52, 56, 59], melody: [68, 71, 76, 64] },
];

// Восьмые внутри такта, на которых вообще может прозвучать нота перебора.
const PATTERNS = [
  [0, 2, 3, 5, 6],
  [0, 3, 4, 6],
  [0, 2, 4, 5, 7],
  [0, 1, 3, 6],
];

const rnd = (a, b) => a + Math.random() * (b - a);

export class Music {
  constructor(sfx) {
    this.sfx = sfx;
    this.enabled = true;
    this.volume = 0.55;
    this.playing = false;
    this.bar = 0;
    this._strings = new Map();
    this._timer = null;
    this._duck = 1;
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
    this.send = ctx.createGain();
    this.send.gain.value = 0.5;
    this.send.connect(this.sfx.verb);
    this.bus.connect(this.send);

    // «корпус гитары»: пара резонансов и срез верха, чтобы струна не звенела сталью
    const body1 = ctx.createBiquadFilter();
    body1.type = 'peaking'; body1.frequency.value = 110; body1.Q.value = 1.1; body1.gain.value = 4;
    const body2 = ctx.createBiquadFilter();
    body2.type = 'peaking'; body2.frequency.value = 230; body2.Q.value = 1.4; body2.gain.value = 3;
    const top = ctx.createBiquadFilter();
    top.type = 'lowpass'; top.frequency.value = 4800; top.Q.value = 0.7;
    body1.connect(body2); body2.connect(top); top.connect(this.bus);
    this.guitarIn = body1;

    this.padIn = ctx.createGain();
    this.padIn.gain.value = 1;
    this.padIn.connect(this.bus);
    return true;
  }

  /**
   * Карплус — Стронг: возбуждаем «струну» шумом и гоняем по кольцевой линии
   * задержки с усреднением соседей — высокие частоты гаснут быстрее низких,
   * как у настоящей струны. Готовый сэмпл кэшируем по ноте.
   */
  _string(midi) {
    const key = midi;
    if (this._strings.has(key)) return this._strings.get(key);
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
    // нормализация, короткая атака и обязательный уход в тишину
    const norm = peak > 0 ? 0.9 / peak : 1;
    const att = Math.floor(sr * 0.004);
    for (let i = 0; i < len; i++) {
      let g = norm;
      if (i < att) g *= i / att;
      const tail = 1 - i / len;
      out[i] *= g * tail * tail;
    }
    this._strings.set(key, buf);
    return buf;
  }

  pluck(midi, when, gain = 0.5, pan = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._string(midi);
    src.playbackRate.value = rnd(0.998, 1.002); // живой разброс строя
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p); p.connect(this.guitarIn);
    } else {
      g.connect(this.guitarIn);
    }
    src.start(when);
  }

  /** Хоровой пэд: расстроенные пилы через формантные полосы. */
  pad(midis, when, dur, level = 1) {
    const ctx = this.ctx;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.linearRampToValueAtTime(0.028 * level, when + dur * 0.45);
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
    g.gain.linearRampToValueAtTime(0.02, when + dur * 0.5);
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
    g.gain.exponentialRampToValueAtTime(0.14 * level, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 1.1);
    o.connect(g); g.connect(this.bus);
    o.start(when); o.stop(when + 1.2);
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
      this.nextBarTime += BAR;
      this.bar++;
    }
  }

  _scheduleBar(bar, t0) {
    const section = PROGRESSION[((bar / 2) | 0) % PROGRESSION.length];
    const chord = section.chord;
    const firstBarOfChord = bar % 2 === 0;

    // бас на первой доле — не каждый такт, чтобы оставался воздух
    if (firstBarOfChord || Math.random() < 0.45) {
      this.pluck(chord[0], t0 + rnd(-0.01, 0.02), rnd(0.42, 0.6), rnd(-0.15, 0.15));
    }

    // перебор
    const pattern = PATTERNS[(bar + (Math.random() < 0.3 ? 1 : 0)) % PATTERNS.length];
    const up = Math.random() < 0.65;
    pattern.forEach((slot, i) => {
      if (slot === 0) return;
      if (Math.random() < 0.12) return; // пропуски — дыхание фразы
      const order = up ? i : pattern.length - 1 - i;
      const note = chord[1 + (order % (chord.length - 1))];
      this.pluck(note, t0 + slot * (BEAT / 2) + rnd(-0.02, 0.03), rnd(0.22, 0.38), rnd(-0.35, 0.35));
    });

    // мелодия — редко и высоко
    if (Math.random() < (firstBarOfChord ? 0.55 : 0.3)) {
      const mel = section.melody;
      let t = t0 + rnd(1, 2) * BEAT;
      const count = 1 + ((Math.random() * 2) | 0);
      for (let i = 0; i < count; i++) {
        this.pluck(mel[(Math.random() * mel.length) | 0], t, rnd(0.3, 0.45), rnd(-0.4, 0.4));
        t += BEAT * (Math.random() < 0.5 ? 0.5 : 1);
      }
    }

    // хор на смене аккорда
    if (firstBarOfChord) {
      this.pad([chord[0] + 12, chord[3], chord[4]], t0, BAR * 2.1, rnd(0.7, 1));
    }

    // диссонанс раз в несколько тактов
    if (bar % 8 === 5 && Math.random() < 0.7) {
      this.drone(chord[0] + 13, t0 + BEAT, BAR * 1.6);
    }

    // удар
    if (bar % 4 === 0) this.drum(t0, rnd(0.7, 1));
    else if (bar % 4 === 2 && Math.random() < 0.3) this.drum(t0 + BEAT * 2, 0.5);
  }
}
