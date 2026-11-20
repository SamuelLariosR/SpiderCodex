/**
 * math.js
 * Funciones matemáticas auxiliares, interpolación y utilidades
 */

export const rand = (a, b) => a + Math.random() * (b - a);

export const pick = (arr) => arr[(Math.random() * arr.length) | 0];

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const lerp = (a, b, t) => a + (b - a) * t;

export const easeInOut = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const isReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
