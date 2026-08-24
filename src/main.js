// Точка входа: экраны, HUD, оверлеи и связка игры с отрисовкой и вводом.
import { Game, DIFFICULTY } from './game.js';
import { Renderer, animatronicMarkup } from './render.js';
import { loadSettings, saveSettings, readForm, writeForm, DEFAULTS } from './settings.js';
import { bindInput } from './input.js';
import { Sfx } from './audio.js';
import { Music, PRESETS } from './music.js';
import { ITEMS } from './items.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

let settings = loadSettings();
let game = null;
let renderer = null;
const sfx = new Sfx();
sfx.setEnabled(settings.sound);
sfx.setVolume(settings.volume / 100);
sfx.setAmbient(settings.ambience);
const music = new Music(sfx);
music.setEnabled(settings.music && settings.sound);
music.setVolume(settings.musicVolume / 100);
music.setPreset(settings.musicTheme);

const el = {
  screens: $$('.screen'),
  canvas: $('#maze'),
  entities: $('#entities'),
  turn: $('#turn-num'),
  steps: $('#steps'),
  status: $('#status'),
  danger: $('#danger'),
  vignette: $('#vignette'),
  inventory: $('#inventory'),
  toast: $('#toast'),
  seedLabel: $('#seed-label'),
  pause: $('#overlay-pause'),
  death: $('#overlay-death'),
  win: $('#overlay-win'),
  winSub: $('#win-sub'),
  jumpscare: $('#jumpscare'),
  form: $('#settings-form'),
};

// ——— экраны ———
let current = 'menu';
function showScreen(name) {
  current = name;
  el.screens.forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
  if (name !== 'game') {
    hideOverlays();
    if (renderer) renderer.stop();
    sfx.stopDrone();
    sfx.stopAmbience();
    music.duck(1);
  } else if (renderer) {
    renderer.resize();
    renderer.start();
    if (settings.sound) {
      sfx.startDrone();
      sfx.startAmbience(tension);
    }
  }
}

/** 0..1 — насколько близко подобрались аниматроники. Управляет плотностью атмосферы. */
function tension() {
  if (!game || game.phase === 'dead' || game.phase === 'win') return 0;
  const d = game.nearestAiDistance();
  if (!isFinite(d)) return 0;
  if (d <= 4) return 1;
  if (d >= 45) return 0.05;
  return Math.max(0.05, 1 - (d - 4) / 41);
}

function hideOverlays() {
  el.pause.hidden = true;
  el.death.hidden = true;
  el.win.hidden = true;
  el.death.classList.remove('playing');
}

// ——— игра ———
function startGame() {
  hideOverlays();
  music.duck(1, 0.6);
  if (settings.musicTheme === 'random') music.setPreset('random');
  if (!renderer) renderer = new Renderer(el.canvas, el.entities, el.vignette);
  if (game) game.abort();
  game = new Game(settings);
  dangerLevel = 0;
  renderer.setZoom(settings.zoom);
  renderer.attach(game);
  wireGame(game);
  showScreen('game');
  el.seedLabel.textContent = 'сид ' + game.seedText;
  updateHud();
  renderer.resize();
}

function wireGame(g) {
  g.on('state', updateHud);
  g.on('step', () => sfx.step());
  g.on('bump', () => { sfx.bump(); renderer.kick(0.35); });
  g.on('pickup', () => sfx.pickup());
  g.on('use', () => sfx.use());
  g.on('toast', ({ text, color }) => toast(text, color));
  g.on('phase', (p) => {
    if (p === 'player') {
      const d = g.nearestAiDistance();
      if (d <= 8) sfx.heartbeat(d <= 4 ? 1.4 : 0.8);
    }
  });
  g.on('death', (killer) => showDeath(killer));
  g.on('win', (info) => showWin(info));
}

let dangerLevel = 0;
function updateHud() {
  if (!game) return;
  el.turn.textContent = game.turn;

  const max = game.stepsPerTurn();
  const left = game.player.stepsLeft;
  if (el.steps.childElementCount !== max) {
    el.steps.innerHTML = '';
    for (let i = 0; i < max; i++) {
      const d = document.createElement('i');
      el.steps.appendChild(d);
    }
  }
  [...el.steps.children].forEach((d, i) => d.classList.toggle('used', i >= left));

  if (game.phase === 'ai') el.status.textContent = 'Они идут…';
  else if (game.phase === 'player') el.status.textContent = 'Твой ход';
  else el.status.textContent = '';
  el.status.classList.toggle('ai-turn', game.phase === 'ai');

  const d = game.nearestAiDistance();
  let level = 0, text = '';
  if (d <= 4) { level = 3; text = 'ОНИ ЗДЕСЬ'; }
  else if (d <= 8) { level = 2; text = 'ОНИ РЯДОМ'; }
  else if (d <= 15) { level = 1; text = 'ОНИ БЛИЗКО'; }
  if (level > dangerLevel && game.phase !== 'dead') sfx.stinger(level);
  dangerLevel = level;
  el.danger.hidden = level === 0;
  el.danger.textContent = text;
  el.danger.dataset.level = level;
  el.vignette.dataset.level = level;

  renderInventory();
}

function renderInventory() {
  const inv = game.inventory;
  const parts = inv.map((id, i) => {
    const def = ITEMS[id];
    return `<li class="slot" data-slot="${i}" title="${def.name} — ${def.desc}" style="--c:${def.color}">
      <span class="glyph">${def.glyph}</span><span class="key">${i + 1}</span>
      <span class="slot-name">${def.name}</span></li>`;
  });
  const fx = [];
  if (game.effects.path > 0) fx.push(`<li class="fx" style="--c:${ITEMS.map.color}">${ITEMS.map.glyph} путь ${game.effects.path}</li>`);
  if (game.effects.radar > 0) fx.push(`<li class="fx" style="--c:${ITEMS.radar.color}">${ITEMS.radar.glyph} радар ${game.effects.radar}</li>`);
  if (game.effects.haste > 0) fx.push(`<li class="fx" style="--c:${ITEMS.haste.color}">${ITEMS.haste.glyph} бег ${game.effects.haste}</li>`);
  if (game.effects.lantern > 0) fx.push(`<li class="fx" style="--c:${ITEMS.lantern.color}">${ITEMS.lantern.glyph} +${game.effects.lantern}</li>`);
  if (game.effects.revealed) fx.push(`<li class="fx" style="--c:${ITEMS.vision.color}">${ITEMS.vision.glyph} карта</li>`);
  el.inventory.innerHTML = parts.join('') + fx.join('');
}

el.inventory.addEventListener('click', (e) => {
  const slot = e.target.closest('.slot');
  if (slot && game) game.useItem(+slot.dataset.slot);
});

let toastTimer = null;
function toast(text, color) {
  el.toast.textContent = text;
  el.toast.style.setProperty('--c', color || '#c9cdd6');
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2400);
}

// ——— финалы ———
function showDeath(killer) {
  sfx.scream();
  sfx.stopDrone();
  sfx.stopAmbience();
  music.duck(0, 0.25);
  renderer.kick(3);
  el.jumpscare.className = 'jumpscare type-' + (killer ? killer.type : 'freddy');
  el.jumpscare.innerHTML = animatronicMarkup();
  el.death.hidden = false;
  // перезапуск CSS-анимаций
  void el.death.offsetWidth;
  el.death.classList.add('playing');
}

function showWin(info) {
  sfx.win();
  sfx.stopDrone();
  sfx.stopAmbience();
  music.duck(0.35, 1.2);
  el.winSub.textContent = `Ты выбрался за ${info.turns} ${plural(info.turns, 'ход', 'хода', 'ходов')}. Лабиринт ${game.w}×${game.h}, сид ${game.seedText}.`;
  el.win.hidden = false;
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

// ——— настройки ———
function syncOutputs() {
  const f = el.form;
  f.querySelector('[name="fogRadiusOut"]').value = f.querySelector('[name="fogRadius"]').value;
  f.querySelector('[name="aiOut"]').value = f.querySelector('[name="ai"]').value;
  f.querySelector('[name="braidOut"]').value = f.querySelector('[name="braid"]').value;
  f.querySelector('[name="volumeOut"]').value = f.querySelector('[name="volume"]').value;
  f.querySelector('[name="musicVolumeOut"]').value = f.querySelector('[name="musicVolume"]').value;
  const soundOn = f.querySelector('[name="sound"]').checked;
  for (const n of ['volume', 'ambience', 'music', 'musicVolume']) {
    f.querySelector(`[name="${n}"]`).disabled = !soundOn;
  }
  f.querySelector('[name="fogRadius"]').disabled = !f.querySelector('[name="fog"]').checked;
}
el.form.addEventListener('input', syncOutputs);

let settingsFrom = 'menu';
function openSettings() {
  settingsFrom = current === 'game' ? 'game' : 'menu';
  writeForm(el.form, settings);
  syncOutputs();
  showScreen('settings');
}

function applySettings() {
  settings = readForm(el.form, settings);
  saveSettings(settings);
  sfx.setEnabled(settings.sound);
  sfx.setVolume(settings.volume / 100);
  sfx.setAmbient(settings.ambience);
  music.setEnabled(settings.music && settings.sound);
  music.setVolume(settings.musicVolume / 100);
  music.setPreset(settings.musicTheme);
  if (settings.sound) music.start();
  if (settings.sound && current === 'game') { sfx.startDrone(); sfx.startAmbience(tension); }
  if (game) {
    // мгновенно применимое — туман, обзор, масштаб; остальное со следующей ночи
    game.settings.fog = settings.fog;
    game.settings.fogRadius = settings.fogRadius;
    game.settings.fearFx = settings.fearFx;
    game.recomputeVision();
    if (renderer) renderer.setZoom(settings.zoom);
  }
}

// любой первый жест разблокирует звук в браузере — и сразу заводит музыку
function wakeAudio() {
  sfx.ensure();
  if (settings.sound && settings.music) music.start();
}
// ——— кнопки ———
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  wakeAudio();
  switch (action) {
    case 'new-game': startGame(); break;
    case 'settings': openSettings(); break;
    case 'settings-save':
      applySettings();
      leaveSettings();
      break;
    case 'settings-back':
      leaveSettings();
      break;
    case 'settings-reset':
      writeForm(el.form, DEFAULTS);
      syncOutputs();
      break;
    case 'help': showScreen('help'); break;
    case 'menu': showScreen('menu'); break;
    case 'pause': togglePause(true); break;
    case 'resume': togglePause(false); break;
  }
});

function leaveSettings() {
  if (settingsFrom === 'game' && game && game.phase !== 'dead' && game.phase !== 'win') {
    showScreen('game');
    el.pause.hidden = false;
  } else {
    showScreen('menu');
  }
}

function togglePause(on) {
  if (!game || game.phase === 'dead' || game.phase === 'win') return;
  el.pause.hidden = !on;
}

// ——— ввод ———
bindInput({
  isActive: () => !!game && current === 'game' && game.phase === 'player' && el.pause.hidden && el.death.hidden && el.win.hidden,
  onMove: (dir) => game.move(dir),
  onSkip: () => game.endTurn(),
  onUse: (slot) => game.useItem(slot),
  onPause: () => togglePause(el.pause.hidden),
});

// ——— список музыкальных тем ———
el.form.querySelector('[name="musicTheme"]').innerHTML =
  `<option value="random">Случайная — своя на каждую ночь</option>` +
  PRESETS.map((p) => `<option value="${p.id}">${p.name} — ${p.about}</option>`).join('');

// ——— справка по предметам ———
$('#item-legend').innerHTML = Object.values(ITEMS)
  .map((i) => `<li style="--c:${i.color}"><span class="glyph">${i.glyph}</span><span class="txt"><b>${i.name}</b> — ${i.desc}</span></li>`)
  .join('');

// небольшой хук для отладки из консоли браузера
window.LABYR = {
  get game() { return game; },
  get renderer() { return renderer; },
  get settings() { return settings; },
  sfx,
  music,
  start: startGame,
};

window.addEventListener('pointerdown', wakeAudio, { once: true });
window.addEventListener('keydown', wakeAudio, { once: true });

showScreen('menu');
