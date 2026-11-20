/**
 * leg.js
 * Cinemática Inversa (IK) pseudo-3D para las 8 extremidades, articulaciones
 * (coxa, trocánter, fémur, rótula, tibia, tarso), proyección cenital y sombras.
 */
import { LEGDEF, LAT, LIGHT_X, LIGHT_Y } from '../config/constants.js';
import { rand, clamp } from '../utils/math.js';
import { makeAnchor, releaseWord } from '../core/wordManager.js';

/**
 * Instancia las 8 patas de la araña (4 izquierdas y 4 derechas) con sus grupos de marcha.
 * Marcha tetrápoda alterna:
 * Grupo 0 = I1, D2, I3, D4
 * Grupo 1 = D1, I2, D3, I4
 */
export function createLegs() {
  const legs = [];
  for (const side of [-1, 1]) {
    LEGDEF.forEach((d, j) => {
      legs.push({
        side, // -1 para izquierda, 1 para derecha
        j,    // Índice de pata (0 = delantera, 3 = trasera)
        d,    // Geometría base y alcance
        group: (j + (side > 0 ? 1 : 0)) % 2,
        bend: side * (j % 2 === 0 ? 1 : -1), // Orientación del arco de rodilla
        anchor: null,
        from: null,
        to: null,
        stepping: false,
        t: 0,
        dur: 0.14,
        last: 0,
        settled: false,
        held: -1,
        lift: 0,
        // Puntos proyectados de la pata
        ix: 0, iy: 0, // Posición ideal de reposo
        hx: 0, hy: 0, // Cadera
        px: 0, py: 0, // Apoyo del pie en el documento
        kx: 0, ky: 0, // Rodilla
        ax: 0, ay: 0, // Tobillo
        fx: 0, fy: 0, // Pie elevado
        // Puntos proyectados de la sombra
        shx: 0, shy: 0,
        skx: 0, sky: 0,
        sax: 0, say: 0,
        sfx: 0, sfy: 0,
      });
    });
  }
  return legs;
}

/**
 * Comprueba si una palabra ya está reservada o pisada por otra extremidad.
 */
export function isTakenBy(L, legs) {
  return (i) =>
    legs.some(
      (o) =>
        o !== L &&
        ((o.anchor && o.anchor.i === i) ||
          (o.stepping && o.to && o.to.i === i))
    );
}

/**
 * Inicia el movimiento de paso de una pata hacia su posición ideal.
 */
export function startStep(L, dur, jitter = 0, scroll, scale, legs) {
  const px = L.ix + scroll.x + rand(-jitter, jitter);
  const py = L.iy + scroll.y + rand(-jitter, jitter);
  L.from = L.anchor;
  L.to = makeAnchor(px, py, 44 * scale, isTakenBy(L, legs));
  L.stepping = true;
  L.t = 0;
  L.dur = dur * rand(0.9, 1.1);
  releaseWord(L);
}

/**
 * Resuelve la cinemática inversa en el plano vertical 3D y la proyecta cenitalmente.
 */
export function solveLeg(L, scale, bob) {
  const d = L.d;
  const hx = L.hx;
  const hy = L.hy;
  const dx = L.px - hx;
  const dy = L.py - hy; // Vector de la cadera al pie sobre el papel
  const dist = Math.hypot(dx, dy) || 0.001;
  const ux = dx / dist;
  const uy = dy / dist;
  const nx = -uy * L.bend;
  const ny = ux * L.bend; // Vector perpendicular hacia la curvatura de la rodilla

  const l1 = d.l1 * scale;
  const l2 = d.l2 * scale;
  const l3 = d.l3 * scale;

  const h0 = 9 * scale + bob * 0.5; // Altura de la cadera
  const zF = L.lift * 12 * scale;    // Altura del pie durante la fase aérea

  // Tobillo: el tarso desciende inclinado hacia el pie
  const uA = Math.max(0, dist - l3 * 0.8);
  const zA = l3 * 0.6 + zF;

  // Triangulación de dos segmentos (fémur + tibia) de la cadera al tobillo
  const vu = uA;
  const vz = zA - h0;
  const D = Math.hypot(vu, vz) || 0.001;
  let k1 = l1;
  let k2 = l2;

  // Si la distancia supera la extensión máxima, estira proporcionalmente
  if (D > k1 + k2 - 0.5) {
    const f = D / (k1 + k2 - 0.5);
    k1 *= f;
    k2 *= f;
  }

  const Dc = Math.max(D, Math.abs(k1 - k2) + 0.5);
  const cosA = clamp((k1 * k1 + Dc * Dc - k2 * k2) / (2 * k1 * Dc), -1, 1);
  const ang = Math.atan2(vz, vu) + Math.acos(cosA);
  const uK = Math.cos(ang) * k1;
  const zK = h0 + Math.sin(ang) * k1;

  // Proyección cenital con desplazamiento de arco lateral según altura
  L.kx = hx + ux * uK + nx * zK * LAT;
  L.ky = hy + uy * uK + ny * zK * LAT;
  L.ax = hx + ux * uA + nx * zA * LAT;
  L.ay = hy + uy * uA + ny * zA * LAT;
  L.fx = L.px + nx * zF * LAT;
  L.fy = L.py + ny * zF * LAT - zF * 0.35;

  // Proyección de sombras proyectadas en el suelo según el ángulo de la luz
  L.shx = hx + LIGHT_X * h0;
  L.shy = hy + LIGHT_Y * h0;
  L.skx = hx + ux * uK + LIGHT_X * zK;
  L.sky = hy + uy * uK + LIGHT_Y * zK;
  L.sax = hx + ux * uA + LIGHT_X * zA;
  L.say = hy + uy * uA + LIGHT_Y * zA;
  L.sfx = L.px + LIGHT_X * zF;
  L.sfy = L.py + LIGHT_Y * zF;
}
