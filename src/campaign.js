// Режим прохождения: семь ночей с постоянными лабиринтами.
// ID лабиринта у каждой ночи зашит, поэтому карта всегда одна и та же —
// её можно выучить, а вот противник с каждой ночью злее.

export const NIGHTS = [
  { n: 1, name: 'Первая ночь',    size: 40,  ai: 1, difficulty: 'nightmare', fogRadius: 8, braid: 50, itemDensity: 0.016, exitAt: 'other' },
  { n: 2, name: 'Вторая ночь',    size: 60,  ai: 1, difficulty: 'nightmare', fogRadius: 8, braid: 48, itemDensity: 0.014, exitAt: 'other' },
  { n: 3, name: 'Третья ночь',    size: 70,  ai: 2, difficulty: 'nightmare', fogRadius: 7, braid: 45, itemDensity: 0.012, exitAt: 'far'   },
  { n: 4, name: 'Четвёртая ночь', size: 90,  ai: 2, difficulty: 'blood',     fogRadius: 7, braid: 40, itemDensity: 0.010, exitAt: 'other' },
  { n: 5, name: 'Пятая ночь',     size: 110, ai: 3, difficulty: 'blood',     fogRadius: 6, braid: 35, itemDensity: 0.008, exitAt: 'far'   },
  { n: 6, name: 'Шестая ночь',    size: 130, ai: 3, difficulty: 'golden',    fogRadius: 5, braid: 28, itemDensity: 0.006, exitAt: 'lair'  },
  { n: 7, name: 'Вечная ночь',    size: 150, ai: 4, difficulty: 'eternal',   fogRadius: 4, braid: 22, itemDensity: 0.005, exitAt: 'lair'  },
];

const KEY = 'labyr.campaign.v1';

export function nightById(n) {
  return NIGHTS.find((x) => x.n === n) || null;
}

/** ID лабиринта ночи. Меняется — меняются все карты прохождения. */
export function nightSeed(n) {
  return `labyr-night-${n}`;
}

export function loadProgress() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { done: {} };
    const p = JSON.parse(raw);
    return { done: p && p.done ? p.done : {} };
  } catch {
    return { done: {} };
  }
}

export function saveProgress(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* приватный режим */ }
}

/** Номер самой дальней доступной ночи: следующая за последней пройденной. */
export function unlockedUpTo(progress) {
  let last = 0;
  for (const night of NIGHTS) {
    if (progress.done[night.n]) last = night.n;
    else break;
  }
  return Math.min(NIGHTS.length, last + 1);
}

export function markDone(progress, n, turns) {
  const prev = progress.done[n];
  if (!prev || turns < prev) progress.done[n] = turns;
  saveProgress(progress);
  return progress;
}

/** Настройки партии для ночи: конфиг ночи поверх пользовательских предпочтений. */
export function nightSettings(night, userSettings) {
  return {
    ...userSettings,
    fog: true,
    fogRadius: night.fogRadius,
    ai: night.ai,
    difficulty: night.difficulty,
    size: night.size,
    braid: night.braid,
    itemDensity: night.itemDensity,
    exitAt: night.exitAt,
    seed: nightSeed(night.n),
  };
}
