// Предметы, которые игрок находит в лабиринте.
export const ITEMS = {
  map: {
    id: 'map', name: 'Карта', glyph: '▦', color: '#7fb2ff',
    desc: 'Показывает путь к выходу сквозь туман войны на 6 ходов.',
    instant: false,
  },
  vision: {
    id: 'vision', name: 'Око Фредди', glyph: '◉', color: '#ffd76a',
    desc: 'Навсегда раскрывает всю карту лабиринта.',
    instant: false,
  },
  lantern: {
    id: 'lantern', name: 'Фонарь', glyph: '✦', color: '#ffe6a8',
    desc: 'Срабатывает сразу: +2 к радиусу обзора навсегда.',
    instant: true,
  },
  haste: {
    id: 'haste', name: 'Адреналин', glyph: '»', color: '#8ef0c0',
    desc: '+3 шага к ходу на следующие 3 хода.',
    instant: false,
  },
  radar: {
    id: 'radar', name: 'Радиопомехи', glyph: '◎', color: '#ff9df0',
    desc: 'Показывает аниматроников сквозь стены на 5 ходов.',
    instant: false,
  },
  trap: {
    id: 'trap', name: 'Капкан', glyph: '✖', color: '#ff8a6a',
    desc: 'Обездвиживает всех аниматроников на 2 хода.',
    instant: false,
  },
};

// Веса выпадения предметов при генерации лабиринта.
export const ITEM_WEIGHTS = [
  ['map', 26],
  ['lantern', 22],
  ['haste', 18],
  ['radar', 13],
  ['trap', 13],
  ['vision', 8],
];

export function rollItem(rng) {
  const total = ITEM_WEIGHTS.reduce((s, p) => s + p[1], 0);
  let r = rng() * total;
  for (const [id, w] of ITEM_WEIGHTS) {
    r -= w;
    if (r <= 0) return id;
  }
  return 'map';
}
