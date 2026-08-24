// Весь звук синтезируется на лету через WebAudio — никаких файлов и бэкенда.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this.droneOn = false;
  }

  ensure() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.stopDrone();
    if (this.master) this.master.gain.value = on ? 0.5 : 0;
  }

  _env(node, t0, attack, decay, peak = 1) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    node.connect(g);
    g.connect(this.master);
    return g;
  }

  tone(freq, dur = 0.12, type = 'sine', gain = 0.15, slideTo = null) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    this._env(o, t0, 0.01, dur, gain);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  noise(dur = 0.3, gain = 0.2, filterFreq = 1200, q = 1) {
    const ctx = this.ensure();
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = filterFreq;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start();
  }

  step() { this.tone(90 + Math.random() * 20, 0.06, 'triangle', 0.05); }
  bump() { this.tone(70, 0.09, 'square', 0.05); }
  pickup() { this.tone(520, 0.1, 'sine', 0.12, 900); }
  use() { this.tone(300, 0.22, 'triangle', 0.12, 620); }
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
    for (let k = 0; k < 3; k++) {
      const o = ctx.createOscillator();
      o.type = k === 1 ? 'sawtooth' : 'square';
      o.frequency.setValueAtTime(900 + k * 260, t0);
      o.frequency.exponentialRampToValueAtTime(60 + k * 20, t0 + 1.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.18, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
      o.connect(g); g.connect(this.master);
      o.start(t0); o.stop(t0 + 1.7);
    }
    this.noise(1.2, 0.35, 2400, 0.6);
  }

  startDrone() {
    const ctx = this.ensure();
    if (!ctx || this.droneOn) return;
    this.droneOn = true;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 38;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 6;
    lfo.connect(lfoGain); lfoGain.connect(o.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 180;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    o.connect(lp); lp.connect(g); g.connect(this.master);
    o.start(); lfo.start();
    this._drone = { o, lfo, g };
  }
  stopDrone() {
    if (!this._drone) return;
    try { this._drone.o.stop(); this._drone.lfo.stop(); } catch { /* уже остановлен */ }
    this._drone = null;
    this.droneOn = false;
  }
}
