/**
 * glitchEffects.js
 * Efectos visuales de glitch sobre el texto del DOM: scramble tipográfico,
 * distorsión cromática, animación de sacudida y marcas persistentes.
 */
import {
  COL,
  GLYPHS,
  MARKS,
  MARK_TOTAL,
  MARK_CLASSES,
} from '../config/constants.js';
import { rand, pick, isReducedMotion } from '../utils/math.js';
import { words } from '../core/wordManager.js';

export const markedWords = new Set();

/**
 * Selecciona un tipo de marca visual ponderada por su peso.
 */
export function pickMark() {
  let r = Math.random() * MARK_TOTAL;
  for (let k = 0; k < MARKS.length; k++) {
    const m = MARKS[k];
    if ((r -= m.w) <= 0) return m;
  }
  return MARKS[0];
}

/**
 * Desordena progresivamente los caracteres de una palabra simulando decodificación o glitch.
 */
export function scramble(el, text) {
  if (isReducedMotion()) return;
  clearTimeout(el._st);
  const frames = 6;
  let f = 0;
  el.classList.add('scr');

  const tick = () => {
    f++;
    const reveal = Math.floor(text.length * (f / frames));
    let s = '';
    for (let k = 0; k < text.length; k++) {
      s += k < reveal ? text[k] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    }
    el.setAttribute('data-s', s);
    el._st =
      f < frames
        ? setTimeout(tick, 38)
        : setTimeout(() => el.classList.remove('scr'), 40);
  };
  tick();
}

/**
 * Provoca una sacudida y glitch momentáneo en una palabra.
 */
export function hitGlitch(w) {
  const el = w.el;
  el.style.setProperty('--scol', pick([COL.cyan, COL.mag, COL.lime, COL.amber]));
  scramble(el, w.text);

  if (isReducedMotion() || !el.animate) return;
  try {
    el.animate(
      [
        { transform: 'translate(0px, 0px) skewX(0deg)' },
        {
          transform: `translate(${rand(-4, 4).toFixed(1)}px, ${rand(-2, 2).toFixed(1)}px) skewX(${rand(-20, 20).toFixed(1)}deg)`,
        },
        {
          transform: `translate(${rand(-3, 3).toFixed(1)}px, ${rand(-1.5, 1.5).toFixed(1)}px) skewX(${rand(-10, 10).toFixed(1)}deg)`,
        },
        { transform: 'translate(0px, 0px) skewX(0deg)' },
      ],
      { duration: 260, easing: 'steps(3, end)', composite: 'add' }
    );
  } catch (e) {
    // Si el navegador no soporta composite 'add', se omite suavemente la sacudida
  }
}

/**
 * Aplica una marca persistente (invertida, rotada, monocromática, gigante o resaltada).
 */
export function applyMark(i, silkEnabled, onAddWrap) {
  if (i < 0 || i >= words.length) return;
  const w = words[i];
  const el = w.el;
  const m = pickMark();
  const col = pick(m.cols);

  el.classList.remove(...MARK_CLASSES);
  el.classList.add('mk', 'mk-' + m.v);
  el.style.setProperty('--c', col);
  el.style.setProperty('--fg', col === COL.blue ? '#ffffff' : '#050505');

  let rot = rand(-2.5, 2.5);
  let scl = 1;
  let sk = 0;

  if (m.v === 'rot') rot = (Math.random() < 0.5 ? -1 : 1) * rand(8, 32);
  else if (m.v === 'big') {
    scl = rand(1.45, 2.1);
    rot = rand(-5, 5);
  } else if (m.v === 'mono') {
    el.setAttribute('data-m', w.text);
    rot = rand(-3, 3);
  } else if (m.v === 'red') {
    sk = rand(-14, 14);
    rot = 0;
  }

  el.style.setProperty('--rot', rot.toFixed(1) + 'deg');
  el.style.setProperty('--sc', scl.toFixed(2));
  el.style.setProperty('--sk', sk.toFixed(1) + 'deg');
  markedWords.add(i);

  if (onAddWrap) {
    if (silkEnabled && m.v !== 'rot' && m.v !== 'big' && Math.random() < 0.4) {
      onAddWrap(i);
    }
  }

  clearTimeout(el._mt);
  el._mt = setTimeout(() => clearMark(i), rand(6500, 12000));
}

/**
 * Limpia y restaura una palabra marcada a su estado original.
 */
export function clearMark(i, onRemoveWrap) {
  if (i < 0 || i >= words.length) return;
  const el = words[i].el;
  clearTimeout(el._mt);
  el.classList.remove(...MARK_CLASSES);
  for (const p of ['--c', '--fg', '--rot', '--sc', '--sk']) {
    el.style.removeProperty(p);
  }
  markedWords.delete(i);
  if (onRemoveWrap) onRemoveWrap(i);
}

/**
 * Se invoca cuando una pata de la araña pisa o toca una palabra.
 */
export function touchWord(i, markChance, silkEnabled, onAddWrap) {
  if (i < 0 || i >= words.length) return;
  hitGlitch(words[i]);
  if (Math.random() < markChance) {
    applyMark(i, silkEnabled, onAddWrap);
  }
}

/**
 * Limpia todas las marcas activas en el documento.
 */
export function clearAllMarks(onRemoveWrap) {
  for (const i of Array.from(markedWords)) {
    clearMark(i, onRemoveWrap);
  }
}
