// Точка входа: экраны, HUD, оверлеи и связка игры с отрисовкой и вводом.
import { Game, DIFFICULTY } from './game.js';
import { Renderer, animatronicMarkup } from './render.js';
import { loadSettings, saveSettings, readForm, writeForm, DEFAULTS } from './settings.js';
import { bindInput } from './input.js';
import { Sfx } from './audio.js';
import { Music, PRESETS } from './music.js';
import { ITEMS } from './items.js';
import { NIGHTS, nightById, nightSettings, loadProgress, saveProgress, unlockedUpTo, markDone, loreParagraphs } from './campaign.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

let settings = loadSettings();
// у тех, кто играл до перетряски лестницы сложностей, в хранилище лежит
// исчезнувшая «Нормальная» — молча переводим на нижнюю ступень
if (!DIFFICULTY[settings.difficulty]) {
  settings.difficulty = DEFAULTS.difficulty;
  saveSettings(settings);
}
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
  dodge: $('#dodge'),
  player: $('#player'),
  trackName: $('#track-name'),
  musicVol: $('#music-vol'),
  pause: $('#overlay-pause'),
  death: $('#overlay-death'),
  win: $('#overlay-win'),
  winSub: $('#win-sub'),
  jumpscare: $('#jumpscare'),
  form: $('#settings-form'),
  nightList: $('#night-list'),
  nightScreen: $('#screen-night'),
  nsFace: $('#ns-face'),
  nsNum: $('#ns-num'),
  nsKicker: $('#ns-kicker'),
  nsTitle: $('#ns-title'),
  nsTagline: $('#ns-tagline'),
  nsText: $('#ns-text'),
  nsMeta: $('#ns-meta'),
  nsActions: $('#ns-actions'),
  nextNight: $('[data-action="next-night"]'),
};

let progress = loadProgress();
// какая ночь идёт сейчас; null — свободная игра
let currentNight = null;

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
    sfx.resetDread();
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

/**
 * Страх глушит весь мир и выводит вперёд сердцебиение: на пике тоннельного зрения
 * не остаётся ни музыки, ни шорохов — только удары, всё чаще по мере приближения.
 */
function applyDread() {
  if (!game || !settings.sound) return;
  const fear = settings.fearFx === false ? 0 : game.fear;
  const dist = game.nearestAiDistance();
  sfx.setDread(fear, isFinite(dist) ? dist : 40);
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
function startGame(night = null) {
  hideOverlays();
  music.duck(1, 0.6);
  sfx.resetDread();
  if (settings.musicTheme === 'random') music.setPreset('random');
  if (!renderer) renderer = new Renderer(el.canvas, el.entities, el.vignette);
  if (game) game.abort();
  currentNight = night;
  game = new Game(night ? nightSettings(night, settings) : settings);
  dangerLevel = 0;
  renderer.setZoom(settings.zoom);
  renderer.attach(game);
  wireGame(game);
  showScreen('game');
  el.seedLabel.textContent = currentNight ? `ночь ${currentNight.n}` : 'ID ' + game.seedText;
  if (currentNight) el.seedLabel.dataset.campaign = currentNight.n;
  else delete el.seedLabel.dataset.campaign;
  updatePlayerUI();
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
  g.on('phase', () => applyDread());
  g.on('dodge', () => { sfx.dodge(); renderer.kick(2); });
  g.on('stomp', () => { sfx.stomp(); renderer.kick(0.9); });
  g.on('mode', (far) => {
    toast(far ? 'Никого рядом — идёшь свободно' : 'Они близко — ход за ходом',
      far ? '#8fa39a' : '#ff8f7d');
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
  const panicFrom = max - (game.fear >= 0.7 ? 1 : 0);
  [...el.steps.children].forEach((d, i) => {
    d.classList.toggle('used', i >= left);
    d.classList.toggle('panic', i >= panicFrom);
  });

  el.dodge.classList.toggle('ready', game.dodge <= 0);
  el.dodge.querySelector('b').textContent = game.dodge <= 0 ? '»' : game.dodge;

  if (game.phase === 'ai') el.status.textContent = 'Они идут…';
  else if (game.phase === 'player') el.status.textContent = game.isFar() ? 'Свободный ход' : 'Твой ход';
  else el.status.textContent = '';
  el.status.classList.toggle('ai-turn', game.phase === 'ai');

  const d = game.nearestAiDistance();
  let level = 0, text = '';
  if (d <= 4) { level = 3; text = 'ОНИ ЗДЕСЬ'; }
  else if (d <= 8) { level = 2; text = 'ОНИ РЯДОМ'; }
  else if (d <= 15) { level = 1; text = 'ОНИ БЛИЗКО'; }
  if (level > dangerLevel && game.phase !== 'dead') sfx.stinger(level);
  dangerLevel = level;
  applyDread();
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
  // сердце остановилось: сплошная нота держится всю сцену смерти
  setTimeout(() => sfx.flatline(6.5), 700);
  renderer.kick(3);
  el.jumpscare.className = 'jumpscare type-' + (killer ? killer.type : 'freddy');
  el.jumpscare.innerHTML = animatronicMarkup();
  el.death.hidden = false;
  // перезапуск CSS-анимаций
  void el.death.offsetWidth;
  el.death.classList.add('playing');
}

function showWin(info) {
  sfx.resetDread();
  sfx.win();
  sfx.stopDrone();
  sfx.stopAmbience();
  music.duck(0.35, 1.2);
  if (currentNight) {
    const night = currentNight;
    progress = markDone(progress, night.n, info.turns);
    setTimeout(() => showNightSplash(night, 'outro', info.turns), 900);
    return;
  }
  const turns = `${info.turns} ${plural(info.turns, 'ход', 'хода', 'ходов')}`;
  el.nextNight.hidden = true;
  el.winSub.textContent = `Ты выбрался за ${turns}. Лабиринт ${game.w}×${game.h}, ID ${game.seedText}.`;
  el.win.hidden = false;
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

// ——— заставка ночи ———
let splashNight = null;

function chip(text, cls = '') {
  return `<li${cls ? ` class="${cls}"` : ''}>${text}</li>`;
}

/** mode: 'intro' — перед ночью, 'outro' — после победы. */
function showNightSplash(night, mode, turns = 0) {
  splashNight = night;
  const intro = mode === 'intro';
  el.nightScreen.classList.toggle('outro', !intro);

  el.nsFace.className = `ns-face ent-ai type-${night.face}`;
  el.nsFace.innerHTML = animatronicMarkup();
  el.nsNum.textContent = night.n;
  el.nsTitle.textContent = night.name;
  el.nsKicker.textContent = intro ? `Ночь ${night.n} из ${NIGHTS.length}` : 'Ночь пройдена';
  el.nsTagline.textContent = intro ? night.tagline : '';
  el.nsTagline.hidden = !intro;

  const text = intro ? night.lore : night.epilogue;
  el.nsText.innerHTML = loreParagraphs(text).map((p) => `<p>${p}</p>`).join('');
  el.nsText.scrollTop = 0;

  const best = progress.done[night.n];
  const diff = DIFFICULTY[night.difficulty];
  if (intro) {
    el.nsMeta.innerHTML =
      chip(`${night.size}×${night.size}`) +
      chip(`${night.ai} ${plural(night.ai, 'аниматроник', 'аниматроника', 'аниматроников')}`) +
      chip(diff.label, 'accent') +
      chip(`обзор ${night.fogRadius}`) +
      (best ? chip(`рекорд ${best} ${plural(best, 'ход', 'хода', 'ходов')}`, 'good') : '');
  } else {
    el.nsMeta.innerHTML =
      chip(`${turns} ${plural(turns, 'ход', 'хода', 'ходов')}`, 'good') +
      (best && best !== turns ? chip(`рекорд ${best}`, 'good') : '') +
      chip(`${night.size}×${night.size}`) +
      chip(diff.label);
  }

  const next = nightById(night.n + 1);
  el.nsActions.innerHTML = intro
    ? `<button class="btn btn-primary" data-action="night-start">Начать ночь</button>
       <button class="btn btn-ghost" data-action="campaign">К списку ночей</button>`
    : (next
        ? `<button class="btn btn-primary" data-action="night-next">Следующая ночь</button>`
        : `<button class="btn btn-primary" data-action="campaign">К списку ночей</button>`) +
      `<button class="btn" data-action="night-again">Пройти заново</button>
       <button class="btn btn-ghost" data-action="menu">В меню</button>`;

  showScreen('night');
}

// ——— прохождение ———
function renderCampaign() {
  const open = unlockedUpTo(progress);
  el.nightList.innerHTML = NIGHTS.map((night) => {
    const done = progress.done[night.n];
    const state = done ? 'done' : night.n <= open ? 'open' : 'locked';
    const diff = DIFFICULTY[night.difficulty];
    const status = done
      ? `пройдено за ${done} ${plural(done, 'ход', 'хода', 'ходов')}`
      : state === 'open' ? 'доступна' : 'закрыта';
    return `<li class="night ${state}" data-night="${night.n}">
      <div class="night-n">${night.n}</div>
      <div class="night-body">
        <b>${night.name}</b>
        <span>${night.size}×${night.size} · ${night.ai} ${plural(night.ai, 'аниматроник', 'аниматроника', 'аниматроников')} · ${diff.label}</span>
      </div>
      <div class="night-state">${status}</div>
    </li>`;
  }).join('');
}

el.nightList.addEventListener('click', (e) => {
  const li = e.target.closest('.night');
  if (!li || li.classList.contains('locked')) return;
  const night = nightById(+li.dataset.night);
  if (night) { wakeAudio(); showNightSplash(night, 'intro'); }
});

// ——— плеер в шапке ———
function updatePlayerUI() {
  el.player.classList.toggle('off', !settings.music);
  el.trackName.textContent = settings.music ? music.preset.name : 'выкл';
  if (document.activeElement !== el.musicVol) el.musicVol.value = settings.musicVolume;
}

function switchTrack(delta) {
  const ids = PRESETS.map((p) => p.id);
  const i = (ids.indexOf(music.preset.id) + delta + ids.length) % ids.length;
  settings.musicTheme = ids[i];
  if (!settings.music) settings.music = true;
  saveSettings(settings);
  music.setEnabled(settings.sound);
  music.setPreset(ids[i]);
  music.stop();
  music.start();
  updatePlayerUI();
  toast('Тема: ' + music.preset.name, '#ffd76a');
}

function toggleMusic() {
  settings.music = !settings.music;
  saveSettings(settings);
  music.setEnabled(settings.music && settings.sound);
  if (settings.music) music.start();
  updatePlayerUI();
}

let volTimer = null;
el.musicVol.addEventListener('input', () => {
  settings.musicVolume = +el.musicVol.value;
  music.setVolume(settings.musicVolume / 100);
  clearTimeout(volTimer);
  volTimer = setTimeout(() => saveSettings(settings), 400);
});

// ——— настройки ———
function syncOutputs() {
  const f = el.form;
  f.querySelector('[name="fogRadiusOut"]').value = f.querySelector('[name="fogRadius"]').value;
  f.querySelector('[name="aiOut"]').value = f.querySelector('[name="ai"]').value;
  f.querySelector('[name="braidOut"]').value = f.querySelector('[name="braid"]').value;
  f.querySelector('[name="volumeOut"]').value = f.querySelector('[name="volume"]').value;
  const soundOn = f.querySelector('[name="sound"]').checked;
  for (const n of ['volume', 'ambience']) {
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
  if (settings.sound && settings.music) music.start();
  updatePlayerUI();
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
    case 'new-game': startGame(null); break;
    case 'replay': startGame(currentNight); break;
    case 'campaign': renderCampaign(); showScreen('campaign'); break;
    case 'campaign-reset':
      progress = { done: {} };
      saveProgress(progress);
      renderCampaign();
      toast('Прогресс прохождения сброшен');
      break;
    case 'night-start': if (splashNight) startGame(splashNight); break;
    case 'night-again': if (splashNight) startGame(splashNight); break;
    case 'night-next': {
      const nxt = splashNight ? nightById(splashNight.n + 1) : null;
      if (nxt) showNightSplash(nxt, 'intro');
      else { renderCampaign(); showScreen('campaign'); }
      break;
    }
    case 'next-night': {
      const next = currentNight ? nightById(currentNight.n + 1) : null;
      if (next) startGame(next); else { renderCampaign(); showScreen('campaign'); }
      break;
    }
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
    case 'track-prev': switchTrack(-1); break;
    case 'track-next': switchTrack(1); break;
    case 'music-toggle': toggleMusic(); break;
  }
  // чтобы стрелки после клика снова двигали героя, а не кнопку
  btn.blur();
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
// ——— список сложностей ———
el.form.querySelector('[name="difficulty"]').innerHTML = Object.entries(DIFFICULTY)
  .sort((a, b) => a[1].order - b[1].order)
  .map(([id, d]) => `<option value="${id}">${d.order}. ${d.label} — ${d.about}</option>`)
  .join('');

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
