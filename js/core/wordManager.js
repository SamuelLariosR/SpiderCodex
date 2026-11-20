/**
 * wordManager.js
 * Indexación del DOM, envoltura de palabras, rejilla espacial (Spatial Hashing)
 * y resolución de puntos de anclaje para las extremidades.
 */
import { CELL } from '../config/constants.js';
import { clamp } from '../utils/math.js';

export const words = []; // Colección de objetos { el, text, x, y, w, h }
const grid = new Map();
let stamp = new Uint32Array(0);
let queryId = 0;
let holdCount = new Uint16Array(0);

/**
 * Recorre el árbol DOM del artículo y envuelve cada palabra en un elemento <span class="w">.
 */
export function wrapWords(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!/\S/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
      const p = node.parentElement;
      if (!p || p.closest('script, style, svg, .hud, canvas, noscript')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const node of nodes) {
    const frag = document.createDocumentFragment();
    // Separación conservando espacios en blanco para no romper el layout
    for (const part of node.nodeValue.split(/([ \t\n\r\f]+)/)) {
      if (!part) continue;
      if (/^[ \t\n\r\f]+$/.test(part)) {
        frag.appendChild(document.createTextNode(part));
        continue;
      }
      const span = document.createElement('span');
      span.className = 'w';
      span.textContent = part;
      words.push({ el: span, text: part, x: 0, y: 0, w: 0, h: 0 });
      frag.appendChild(span);
    }
    node.parentNode.replaceChild(frag, node);
  }

  holdCount = new Uint16Array(words.length);
}

/**
 * Calcula las coordenadas de documento de cada palabra y reconstruye la rejilla espacial.
 */
export function measureWords() {
  document.body.classList.add('measuring'); // Desactiva temporalmente rotaciones y transformaciones
  const sx = window.scrollX;
  const sy = window.scrollY;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const r = w.el.getBoundingClientRect();
    w.x = r.left + sx;
    w.y = r.top + sy;
    w.w = r.width;
    w.h = r.height;
  }
  document.body.classList.remove('measuring');

  grid.clear();
  stamp = new Uint32Array(words.length);

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.w < 1 || w.h < 1) continue;
    const x0 = Math.floor(w.x / CELL);
    const x1 = Math.floor((w.x + w.w) / CELL);
    const y0 = Math.floor(w.y / CELL);
    const y1 = Math.floor((w.y + w.h) / CELL);

    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const k = gy * 8192 + gx;
        let list = grid.get(k);
        if (!list) {
          list = [];
          grid.set(k, list);
        }
        list.push(i);
      }
    }
  }
}

/**
 * Encuentra el índice de la palabra más próxima a (px, py) dentro del radio R.
 */
export function nearestWord(px, py, R, isTaken) {
  queryId++;
  let best = -1;
  let bestD = Infinity;

  const x0 = Math.floor((px - R) / CELL);
  const x1 = Math.floor((px + R) / CELL);
  const y0 = Math.floor((py - R) / CELL);
  const y1 = Math.floor((py + R) / CELL);

  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      const list = grid.get(gy * 8192 + gx);
      if (!list) continue;

      for (let j = 0; j < list.length; j++) {
        const i = list[j];
        if (stamp[i] === queryId) continue;
        stamp[i] = queryId;

        const w = words[i];
        const dx = Math.max(w.x - px, 0, px - (w.x + w.w));
        const dy = Math.max(w.y - py, 0, py - (w.y + w.h));
        let d = Math.hypot(dx, dy);

        if (d > R) continue;
        if (isTaken && isTaken(i)) d += 18; // Penalización para evitar que dos patas coincidan
        d += Math.random() * 4; // Variación orgánica

        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
  }
  return best;
}

/**
 * Crea un anclaje vinculado a una palabra (o un punto libre si no hay palabra próxima).
 */
export function makeAnchor(px, py, R, isTaken) {
  const i = nearestWord(px, py, R, isTaken);
  if (i < 0) return { i: -1, x: px, y: py };

  const w = words[i];
  const inset = Math.min(3, w.w * 0.3);
  const tx = clamp(px, w.x + inset, w.x + w.w - inset);
  const ty = clamp(py, w.y + w.h * 0.32, w.y + w.h * 0.74);

  return { i, fx: (tx - w.x) / w.w, fy: (ty - w.y) / w.h };
}

/**
 * Convierte un anclaje a coordenadas absolutas de documento [x, y].
 */
export function anchorDoc(a) {
  if (a.i >= 0 && a.i < words.length) {
    const w = words[a.i];
    return [w.x + a.fx * w.w, w.y + a.fy * w.h];
  }
  return [a.x, a.y];
}

/**
 * Marca una palabra como activamente sujetada por una extremidad.
 */
export function holdWord(leg, i) {
  leg.held = i;
  if (holdCount[i]++ === 0) {
    words[i].el.classList.add('held');
  }
}

/**
 * Libera la palabra sujetada por una extremidad al levantar el paso.
 */
export function releaseWord(leg) {
  if (leg.held < 0) return;
  const i = leg.held;
  leg.held = -1;
  if (--holdCount[i] <= 0) {
    holdCount[i] = 0;
    if (words[i] && words[i].el) {
      words[i].el.classList.remove('held');
    }
  }
}
