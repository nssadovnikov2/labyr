// Настройки игры: значения по умолчанию, хранение в localStorage, связка с формой.
const KEY = 'labyr.settings.v1';

export const DEFAULTS = {
  fog: true,
  fogRadius: 6,
  ai: 2,
  difficulty: 'normal',
  size: 100,
  braid: 25,
  itemDensity: 0.01,
  exitAt: 'other',
  zoom: 'mid',
  fearFx: true,
  sound: true,
  volume: 70,
  ambience: true,
  music: true,
  musicVolume: 55,
  musicTheme: 'random',
  seed: '',
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* приватный режим — переживём */ }
}

/**
 * Читает значения из формы настроек. Если браузер подсунул закэшированный
 * index.html без какого-то поля, берём прежнее значение, а не мусор.
 */
export function readForm(root, prev = DEFAULTS) {
  const el = (name) => root.querySelector(`[name="${name}"]`);
  const bool = (name) => { const e = el(name); return e ? e.checked : prev[name]; };
  const num = (name) => { const e = el(name); return e ? +e.value : prev[name]; };
  const str = (name) => { const e = el(name); return e ? e.value : prev[name]; };
  return {
    fog: bool('fog'),
    fogRadius: num('fogRadius'),
    ai: num('ai'),
    difficulty: str('difficulty'),
    size: num('size'),
    braid: num('braid'),
    itemDensity: num('itemDensity'),
    exitAt: str('exitAt'),
    zoom: str('zoom'),
    fearFx: bool('fearFx'),
    sound: bool('sound'),
    volume: num('volume'),
    ambience: bool('ambience'),
    music: bool('music'),
    musicVolume: num('musicVolume'),
    musicTheme: str('musicTheme'),
    seed: (str('seed') || '').trim(),
  };
}

export function writeForm(root, s) {
  const el = (name) => root.querySelector(`[name="${name}"]`);
  const set = (name, value, prop = 'value') => { const e = el(name); if (e) e[prop] = value; };
  set('fog', s.fog, 'checked');
  set('fogRadius', s.fogRadius);
  set('ai', s.ai);
  set('difficulty', s.difficulty);
  set('size', s.size);
  set('braid', s.braid);
  set('itemDensity', s.itemDensity);
  set('exitAt', s.exitAt);
  set('zoom', s.zoom);
  set('fearFx', s.fearFx, 'checked');
  set('sound', s.sound, 'checked');
  set('volume', s.volume);
  set('ambience', s.ambience, 'checked');
  set('music', s.music, 'checked');
  set('musicVolume', s.musicVolume);
  set('musicTheme', s.musicTheme);
  set('seed', s.seed || '');
}
