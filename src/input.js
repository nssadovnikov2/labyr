// Управление: клавиатура, свайпы и экранный крестовина-джойстик.
import { N, E, S, W } from './maze.js';

const KEYMAP = {
  ArrowUp: N, ArrowRight: E, ArrowDown: S, ArrowLeft: W,
  KeyW: N, KeyD: E, KeyS: S, KeyA: W,
  KeyZ: N, KeyH: W, KeyJ: S, KeyK: N, KeyL: E,
};

export function bindInput({ onMove, onSkip, onUse, onPause, isActive }) {
  window.addEventListener('keydown', (e) => {
    if (!isActive()) return;
    // в пошаговой игре автоповтор клавиши недопустим — иначе ходы улетают пачками
    if (e.repeat) return;
    if (KEYMAP[e.code] !== undefined) {
      e.preventDefault();
      onMove(KEYMAP[e.code]);
      return;
    }
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); onSkip(); return; }
    if (e.code === 'Escape') { e.preventDefault(); onPause(); return; }
    if (/^Digit[1-6]$/.test(e.code)) { e.preventDefault(); onUse(+e.code.slice(5) - 1); }
  });

  // Свайпы по игровому полю
  const stage = document.getElementById('stage');
  let sx = 0, sy = 0, tracking = false;
  stage.addEventListener('touchstart', (e) => {
    if (!isActive()) return;
    tracking = true;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (!tracking || !isActive()) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) onMove(dx > 0 ? E : W);
    else onMove(dy > 0 ? S : N);
  }, { passive: true });

  // Крестовина
  document.querySelectorAll('[data-dir]').forEach((btn) => {
    const dir = { n: N, e: E, s: S, w: W }[btn.dataset.dir];
    const fire = (ev) => {
      ev.preventDefault();
      if (!isActive()) return;
      onMove(dir);
    };
    btn.addEventListener('pointerdown', fire);
  });
  const skipBtn = document.querySelector('[data-action="skip"]');
  if (skipBtn) skipBtn.addEventListener('click', () => { if (isActive()) onSkip(); });
}
