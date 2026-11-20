/**
 * input.js
 * Captura de interacción del usuario (puntero, mouse, touch) y auto-scroll
 * cinético en los bordes superior e inferior de la ventana.
 */
import {
  EDGE_ZONE,
  EDGE_MARGIN,
  EDGE_MIN_SPEED,
  EDGE_MAX_SPEED,
} from '../config/constants.js';
import { clamp } from '../utils/math.js';
import { makeAnchor } from './wordManager.js';

export function setupInput(spider, scroll, getViewport, onWordClick) {
  function setPointer(x, y) {
    spider.mx = x;
    spider.my = y;
    spider.inside = true;
    spider.lastMove = performance.now();
  }

  window.addEventListener(
    'pointermove',
    (e) => setPointer(e.clientX, e.clientY),
    { passive: true }
  );

  window.addEventListener(
    'pointerdown',
    (e) => setPointer(e.clientX, e.clientY),
    { passive: true }
  );

  window.addEventListener(
    'touchmove',
    (e) => {
      const t = e.touches[0];
      if (t) setPointer(t.clientX, t.clientY);
    },
    { passive: true }
  );

  document.documentElement.addEventListener('mouseleave', () => {
    spider.inside = false;
  });

  window.addEventListener('blur', () => {
    spider.inside = false;
  });

  // Al hacer clic sobre el documento, dispara hilo de seda si pulsa una palabra
  document.addEventListener('click', (e) => {
    if (e.target.closest('a, button, .hud')) return;
    const to = makeAnchor(
      e.clientX + window.scrollX,
      e.clientY + window.scrollY,
      90,
      null
    );
    if (to.i < 0) return;
    if (onWordClick) {
      onWordClick(to);
    }
  });
}

/**
 * Desplaza la página verticalmente cuando el puntero y la araña alcanzan los bordes.
 */
export function edgeScroll(dt, now, spider, scroll, getViewport, onScrollChanged) {
  spider.edge = 0;
  if (!spider.inside) return;

  const { H } = getViewport();
  const zone = Math.min(EDGE_ZONE, H * 0.25);
  let dir = 0;
  if (spider.my <= zone) dir = -1;
  else if (spider.my >= H - zone) dir = 1;
  if (!dir) return;

  // No desplazar si el puntero se encuentra sobre el HUD
  const under = document.elementFromPoint(spider.mx, spider.my);
  if (under && under.closest('.hud')) return;

  // Se activa solo si la araña ha alcanzado la proximidad del borde
  const trigger = zone + EDGE_MARGIN;
  const bodyDist = dir < 0 ? spider.y : H - spider.y;
  if (bodyDist > trigger) return;

  spider.lastMove = now;

  const maxY = Math.max(0, document.documentElement.scrollHeight - H);
  if (dir < 0 ? scroll.y <= 0 : scroll.y >= maxY - 1) return;

  const t = clamp(1 - bodyDist / trigger, 0, 1);
  const speed = EDGE_MIN_SPEED + (EDGE_MAX_SPEED - EDGE_MIN_SPEED) * t * t;
  spider.edge = dir;
  window.scrollBy(0, dir * speed * dt);
  if (onScrollChanged) onScrollChanged();
}
