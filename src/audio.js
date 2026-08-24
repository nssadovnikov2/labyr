// Весь звук синтезируется на лету через WebAudio — никаких файлов и бэкенда.
// Слои: мастер-громкость → реверберация (общая «комната») → интерфейсные звуки
// и атмосферный слой (скрежет, цепи, плач, шёпот, дыхание, далёкие удары).

// Калибровка громкости атмосферного слоя: узкополосные фильтры съедают
// большую часть энергии, поэтому у каждого звука свой множитель.
const LVL = {
  scrape: 2.86, chains: 3.3, cry: 4.4, breath: 3.3, bang: 1.1, whisper: 8.8, creak: 22,
};

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.ambient = true;
    this.volume = 0.7;
    this.master = null;
    this.droneOn = false;
    this.ambientOn = false;
    this._ambTimer = null;
    this._noiseCache = new Map();
  }

  ensure() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC();
      this.ctx = ctx;

      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(ctx.destination);

      // общая «комната»: длинный тёмный хвост, чтобы звуки казались далёкими
      this.verb = ctx.createConvolver();
      this.verb.buffer = this._impulse(3.2, 2.4);
      this.verbGain = ctx.createGain();
      this.verbGain.gain.value = 0.9;
      const verbLp = ctx.createBiquadFilter();
      verbLp.type = 'lowpass';
      verbLp.frequency.value = 2600;
      this.verb.connect(verbLp);
      verbLp.connect(this.verbGain);
      this.verbGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) { this.stopDrone(); this.stopAmbience(); }
    if (this.master) this.master.gain.value = on ? this.volume : 0;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master && this.enabled) this.master.gain.value = this.volume;
  }

  setAmbient(on) {
    this.ambient = on;
    if (!on) this.stopAmbience();
  }

  // ——— строительные блоки ———
  _impulse(dur, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  _noiseBuf(dur) {
    const key = Math.round(dur * 10);
    if (this._noiseCache.has(key)) return this._noiseCache.get(key);
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noiseCache.set(key, buf);
    return buf;
  }

  _noiseSrc(dur) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf(dur);
    return src;
  }

  _filter(type, freq, q) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q != null) f.Q.value = q;
    return f;
  }

  _gain(v = 1) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  _shaper(amount = 24) {
    const ws = this.ctx.createWaveShaper();
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + amount) * x * 20 * Math.PI) / (180 * (Math.PI + amount * Math.abs(x)));
    }
    ws.curve = curve;
    ws.oversample = '2x';
    return ws;
  }

  /** Подключает источник к сухому и «дальнему» (реверб) выходам, с панорамой. */
  _out(node, wet = 0.35, pan = 0) {
    const ctx = this.ctx;
    let tail = node;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      tail = p;
    }
    const dry = this._gain(1 - wet * 0.6);
    tail.connect(dry);
    dry.connect(this.master);
    const send = this._gain(wet);
    tail.connect(send);
    send.connect(this.verb);
  }

  // ——— интерфейсные звуки ———
  tone(freq, dur = 0.12, type = 'sine', gain = 0.15, slideTo = null) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = this._gain(0.0001);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    this._out(g, 0.2);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  step() { this.tone(rnd(84, 104), 0.06, 'triangle', 0.05); }
  bump() { this.tone(70, 0.09, 'square', 0.05); }
  pickup() { this.tone(520, 0.1, 'sine', 0.12, 900); }
  use() { this.tone(300, 0.22, 'triangle', 0.12, 620); }

  /** Рывок мимо аниматроника: свист воздуха и глухой удар плечом. */
  dodge() {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const bus = this._gain(1);
    // свист
    const n = this._noiseSrc(0.35);
    const bp = this._filter('bandpass', 900, 2.5);
    bp.frequency.exponentialRampToValueAtTime(2600, t0 + 0.3);
    const ng = this._gain(0.0001);
    ng.gain.exponentialRampToValueAtTime(0.22, t0 + 0.04);
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
    n.connect(bp); bp.connect(ng); ng.connect(bus);
    // удар плечом
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t0);
    o.frequency.exponentialRampToValueAtTime(48, t0 + 0.22);
    const og = this._gain(0.0001);
    og.gain.exponentialRampToValueAtTime(0.2, t0 + 0.01);
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
    o.connect(og); og.connect(bus);
    this._out(bus, 0.4);
    n.start(t0); n.stop(t0 + 0.4);
    o.start(t0); o.stop(t0 + 0.45);
    this.chains(0.7);
  }

  heartbeat(intensity = 1) {
    this.tone(52, 0.16, 'sine', 0.1 * intensity);
    setTimeout(() => this.tone(46, 0.2, 'sine', 0.08 * intensity), 170);
  }

  win() {
    [392, 523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'sine', 0.12), i * 130));
  }

  scream() {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const bus = this._gain(1);
    for (let k = 0; k < 3; k++) {
      const o = ctx.createOscillator();
      o.type = k === 1 ? 'sawtooth' : 'square';
      o.frequency.setValueAtTime(900 + k * 260, t0);
      o.frequency.exponentialRampToValueAtTime(60 + k * 20, t0 + 1.4);
      const g = this._gain(0.18);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
      o.connect(g);
      g.connect(bus);
      o.start(t0);
      o.stop(t0 + 1.7);
    }
    const n = this._noiseSrc(1.2);
    const bp = this._filter('bandpass', 2400, 0.6);
    const ng = this._gain(0.35);
    n.connect(bp); bp.connect(ng); ng.connect(bus);
    n.start(t0);
    this._out(bus, 0.5);
    this.metalScrape(1.4, 0.15);
  }

  // ——— атмосферный слой ———

  /** Скрежет металла по металлу. */
  metalScrape(intensity = 1, delay = 0) {
    const ctx = this.ensure();
    if (!ctx) return;
    intensity *= LVL.scrape;
    const t0 = ctx.currentTime + delay;
    const dur = rnd(0.7, 1.7);
    const pan = rnd(-0.8, 0.8);
    const bus = this._gain(1);

    const n = this._noiseSrc(dur);
    const bp = this._filter('bandpass', rnd(700, 1400), rnd(7, 20));
    bp.frequency.linearRampToValueAtTime(rnd(1700, 3400), t0 + dur * 0.8);
    // дрожь фильтра — источник самого «скрежещущего» тембра
    const wob = ctx.createOscillator();
    wob.type = 'sawtooth';
    wob.frequency.value = rnd(14, 46);
    const wobGain = this._gain(rnd(200, 700));
    wob.connect(wobGain);
    wobGain.connect(bp.frequency);

    const ng = this._gain(0.0001);
    ng.gain.exponentialRampToValueAtTime(0.16 * intensity, t0 + 0.14);
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    n.connect(bp); bp.connect(ng); ng.connect(bus);

    // расстроенные пилы через перегруз — «мясо» металла
    const sh = this._shaper(30);
    const hp = this._filter('highpass', 420);
    const og = this._gain(0.0001);
    og.gain.exponentialRampToValueAtTime(0.05 * intensity, t0 + 0.2);
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const base = rnd(110, 210);
    const oscs = [];
    for (let k = 0; k < 2; k++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * (1 + k * 0.012), t0);
      o.frequency.linearRampToValueAtTime(base * rnd(1.2, 1.9), t0 + dur);
      o.connect(sh);
      oscs.push(o);
    }
    sh.connect(hp); hp.connect(og); og.connect(bus);

    this._out(bus, 0.55, pan);
    n.start(t0); n.stop(t0 + dur);
    wob.start(t0); wob.stop(t0 + dur);
    oscs.forEach((o) => { o.start(t0); o.stop(t0 + dur); });
  }

  /** Звяканье цепей — неровная россыпь металлических щелчков. */
  chains(intensity = 1) {
    const ctx = this.ensure();
    if (!ctx) return;
    intensity *= LVL.chains;
    const t0 = ctx.currentTime;
    const bus = this._gain(1);
    const count = (rnd(6, 15) | 0);
    let t = t0;
    for (let i = 0; i < count; i++) {
      t += rnd(0.03, 0.17);
      const n = this._noiseSrc(0.08);
      const bp = this._filter('bandpass', rnd(2200, 6200), rnd(9, 26));
      const g = this._gain(0.0001);
      g.gain.exponentialRampToValueAtTime(rnd(0.05, 0.13) * intensity, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + rnd(0.06, 0.16));
      n.connect(bp); bp.connect(g); g.connect(bus);
      n.start(t); n.stop(t + 0.2);

      // короткий металлический призвук
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = rnd(1700, 4300);
      const og = this._gain(0.0001);
      og.gain.exponentialRampToValueAtTime(rnd(0.01, 0.035) * intensity, t + 0.003);
      og.gain.exponentialRampToValueAtTime(0.0001, t + rnd(0.08, 0.2));
      o.connect(og); og.connect(bus);
      o.start(t); o.stop(t + 0.25);
    }
    this._out(bus, 0.6, rnd(-0.7, 0.7));
  }

  /** Далёкий детский плач: две форманты, вибрато и несколько всхлипов. */
  cry(intensity = 1) {
    const ctx = this.ensure();
    if (!ctx) return;
    intensity *= LVL.cry;
    const t0 = ctx.currentTime;
    const dur = rnd(1.8, 3.4);
    const f0 = rnd(230, 420);
    const bus = this._gain(1);

    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * 0.85, t0);
    o.frequency.linearRampToValueAtTime(f0 * 1.12, t0 + dur * 0.35);
    o.frequency.linearRampToValueAtTime(f0 * 0.62, t0 + dur);

    const vib = ctx.createOscillator();
    vib.frequency.value = rnd(4.5, 6.8);
    const vibGain = this._gain(f0 * 0.03);
    vib.connect(vibGain);
    vibGain.connect(o.frequency);

    const amp = this._gain(0.0001);
    // всхлипы
    let t = t0 + 0.1;
    while (t < t0 + dur - 0.2) {
      const peak = rnd(0.05, 0.12) * intensity;
      amp.gain.exponentialRampToValueAtTime(peak, t + 0.12);
      amp.gain.exponentialRampToValueAtTime(0.004, t + rnd(0.35, 0.6));
      t += rnd(0.5, 0.9);
    }
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    for (const [freq, q, lvl] of [[700, 7, 1], [1150, 9, 0.7], [2600, 10, 0.25]]) {
      const bp = this._filter('bandpass', freq * rnd(0.9, 1.1), q);
      const g = this._gain(lvl);
      o.connect(bp); bp.connect(g); g.connect(amp);
    }

    // придыхание
    const n = this._noiseSrc(dur);
    const nlp = this._filter('lowpass', 1100);
    const ng = this._gain(0.02 * intensity);
    n.connect(nlp); nlp.connect(ng); ng.connect(amp);

    amp.connect(bus);
    this._out(bus, 0.7, rnd(-0.6, 0.6));
    o.start(t0); o.stop(t0 + dur + 0.1);
    vib.start(t0); vib.stop(t0 + dur + 0.1);
    n.start(t0); n.stop(t0 + dur);
  }

  /** Чужое дыхание где-то рядом. */
  breath(intensity = 1) {
    const ctx = this.ensure();
    if (!ctx) return;
    intensity *= LVL.breath;
    const t0 = ctx.currentTime;
    const dur = rnd(1.8, 2.8);
    const n = this._noiseSrc(dur);
    const lp = this._filter('lowpass', 520, 1.2);
    lp.frequency.linearRampToValueAtTime(rnd(700, 1100), t0 + dur * 0.4);
    lp.frequency.linearRampToValueAtTime(380, t0 + dur);
    const g = this._gain(0.0001);
    g.gain.exponentialRampToValueAtTime(0.07 * intensity, t0 + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.02, t0 + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.05 * intensity, t0 + dur * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    n.connect(lp); lp.connect(g);
    this._out(g, 0.45, rnd(-0.9, 0.9));
    n.start(t0); n.stop(t0 + dur);
  }

  /** Далёкий удар: что-то тяжёлое упало в глубине лабиринта. */
  bang(intensity = 1) {
    const ctx = this.ensure();
    if (!ctx) return;
    intensity *= LVL.bang;
    const t0 = ctx.currentTime;
    const bus = this._gain(1);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(rnd(70, 95), t0);
    o.frequency.exponentialRampToValueAtTime(rnd(28, 40), t0 + 0.5);
    const g = this._gain(0.0001);
    g.gain.exponentialRampToValueAtTime(0.22 * intensity, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
    o.connect(g); g.connect(bus);

    const n = this._noiseSrc(0.4);
    const lp = this._filter('lowpass', 420);
    const ng = this._gain(0.0001);
    ng.gain.exponentialRampToValueAtTime(0.1 * intensity, t0 + 0.01);
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
    n.connect(lp); lp.connect(ng); ng.connect(bus);

    this._out(bus, 0.8, rnd(-0.5, 0.5));
    o.start(t0); o.stop(t0 + 1);
    n.start(t0); n.stop(t0 + 0.5);
  }

  /** Шёпот: слоги из узкополосного шума, блуждающие по частоте. */
  whisper(intensity = 1) {
    const ctx = this.ensure();
    if (!ctx) return;
    intensity *= LVL.whisper;
    const t0 = ctx.currentTime;
    const dur = rnd(1.4, 2.6);
    const n = this._noiseSrc(dur);
    const bp = this._filter('bandpass', 1600, 14);
    let t = t0;
    while (t < t0 + dur) {
      bp.frequency.setValueAtTime(rnd(1100, 2900), t);
      t += rnd(0.06, 0.14);
    }
    const g = this._gain(0.0001);
    t = t0;
    while (t < t0 + dur - 0.15) {
      g.gain.exponentialRampToValueAtTime(rnd(0.02, 0.055) * intensity, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.002, t + rnd(0.12, 0.22));
      t += rnd(0.16, 0.3);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    n.connect(bp); bp.connect(g);
    this._out(g, 0.6, rnd(-1, 1));
    n.start(t0); n.stop(t0 + dur);
  }

  /** Скрип: не то петли, не то шарниры аниматроника. */
  creak(intensity = 1) {
    const ctx = this.ensure();
    if (!ctx) return;
    intensity *= LVL.creak;
    const t0 = ctx.currentTime;
    const dur = rnd(0.9, 1.8);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const base = rnd(70, 150);
    let t = t0, f = base;
    while (t < t0 + dur) {
      o.frequency.setValueAtTime(f, t);
      f *= rnd(1.0, 1.13);
      t += rnd(0.05, 0.13);
    }
    const bp = this._filter('bandpass', rnd(420, 900), 13);
    const g = this._gain(0.0001);
    g.gain.exponentialRampToValueAtTime(0.045 * intensity, t0 + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(bp); bp.connect(g);
    this._out(g, 0.55, rnd(-0.8, 0.8));
    o.start(t0); o.stop(t0 + dur);
  }

  /** Резкий акцент, когда опасность выросла. */
  stinger(level) {
    if (level >= 3) { this.metalScrape(1.3); this.chains(0.9); }
    else if (level === 2) { pick([() => this.chains(0.8), () => this.creak(1.2), () => this.metalScrape(0.9)])(); }
    else this.creak(0.8);
  }

  // ——— фон ———
  startDrone() {
    const ctx = this.ensure();
    if (!ctx || this.droneOn) return;
    this.droneOn = true;
    const bus = this._gain(1);

    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 38;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = 57.3;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = this._gain(6);
    lfo.connect(lfoGain);
    lfoGain.connect(o.frequency);

    const lp = this._filter('lowpass', 180, 3);
    const sweep = ctx.createOscillator();
    sweep.frequency.value = 0.035;
    const sweepGain = this._gain(90);
    sweep.connect(sweepGain);
    sweepGain.connect(lp.frequency);

    const g = this._gain(0.045);
    o.connect(lp); o2.connect(lp);
    lp.connect(g); g.connect(bus);

    // тихий «воздух» помещения
    const air = this._noiseSrc(4);
    air.loop = true;
    const airLp = this._filter('lowpass', 420);
    const airG = this._gain(0.012);
    air.connect(airLp); airLp.connect(airG); airG.connect(bus);

    this._out(bus, 0.35);
    o.start(); o2.start(); lfo.start(); sweep.start(); air.start();
    this._drone = { nodes: [o, o2, lfo, sweep, air], g };
  }

  stopDrone() {
    if (!this._drone) return;
    for (const n of this._drone.nodes) { try { n.stop(); } catch { /* уже остановлен */ } }
    this._drone = null;
    this.droneOn = false;
  }

  /**
   * Атмосферный слой. getTension() возвращает 0..1 — чем ближе аниматроники,
   * тем чаще и злее звуки.
   */
  startAmbience(getTension) {
    if (!this.enabled || !this.ambient || this.ambientOn) return;
    if (!this.ensure()) return;
    this.ambientOn = true;
    const loop = () => {
      if (!this.ambientOn) return;
      const t = Math.max(0, Math.min(1, getTension ? getTension() : 0));
      this._ambientEvent(t);
      const base = 13000 - t * 8500;
      this._ambTimer = setTimeout(loop, base * rnd(0.55, 1.35));
    };
    this._ambTimer = setTimeout(loop, rnd(2500, 6000));
  }

  stopAmbience() {
    this.ambientOn = false;
    clearTimeout(this._ambTimer);
    this._ambTimer = null;
  }

  _ambientEvent(t) {
    // веса плавно смещаются от «пустого дома» к «они уже в коридоре»
    const table = [
      ['breath', 3 - 2 * t],
      ['whisper', 3 - 1 * t],
      ['creak', 3 - 1.5 * t],
      ['cry', 2 + 1 * t],
      ['chains', 1.5 + 2.5 * t],
      ['metalScrape', 1 + 3 * t],
      ['bang', 1 + 1 * t],
    ];
    let total = 0;
    for (const row of table) { row[1] = Math.max(0.05, row[1]); total += row[1]; }
    let r = Math.random() * total;
    let choice = 'breath';
    for (const [name, w] of table) { r -= w; if (r <= 0) { choice = name; break; } }
    const intensity = 0.55 + t * 0.75;
    this[choice](intensity);
  }
}
