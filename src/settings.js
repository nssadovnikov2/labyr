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
  sound: true,
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

/** Читает значения из формы настроек. */
export function readForm(root) {
  const val = (name) => root.querySelector(`[name="${name}"]`);
  return {
    fog: val('fog').checked,
    fogRadius: +val('fogRadius').value,
    ai: +val('ai').value,
    difficulty: val('difficulty').value,
    size: +val('size').value,
    braid: +val('braid').value,
    itemDensity: +val('itemDensity').value,
    exitAt: val('exitAt').value,
    zoom: val('zoom').value,
    sound: val('sound').checked,
    seed: val('seed').value.trim(),
  };
}

export function writeForm(root, s) {
  const val = (name) => root.querySelector(`[name="${name}"]`);
  val('fog').checked = s.fog;
  val('fogRadius').value = s.fogRadius;
  val('ai').value = s.ai;
  val('difficulty').value = s.difficulty;
  val('size').value = s.size;
  val('braid').value = s.braid;
  val('itemDensity').value = s.itemDensity;
  val('exitAt').value = s.exitAt;
  val('zoom').value = s.zoom;
  val('sound').checked = s.sound;
  val('seed').value = s.seed || '';
}
