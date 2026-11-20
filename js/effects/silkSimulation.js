/**
 * silkSimulation.js
 * Simulación física de hilos de seda (Integración de Verlet), impactos de pisadas,
 * disparos teledirigidos hacia palabras y capullos envolventes.
 */
import { TAU, SLICE_RGB } from '../config/constants.js';
import { rand, pick, clamp, lerp } from '../utils/math.js';
import { anchorDoc, makeAnchor } from '../core/wordManager.js';

export const threads = [];
export const impacts = [];
export const shots = [];
export const wraps = [];

/**
 * Añade un hilo elástico entre dos anclajes simulado por partículas Verlet.
 */
export function addThread(a, b, now) {
  const [ax, ay] = anchorDoc(a);
  const [bx, by] = anchorDoc(b);
  const d = Math.hypot(bx - ax, by - ay);
  if (d < 14) return;

  const n = clamp(Math.round(d / 16), 5, 32);
  const pts = [];

  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const x = lerp(ax, bx, t);
    const y = lerp(ay, by, t);
    const kick = Math.sin(Math.PI * t) * rand(3, 9); // Impulso vibratorio inicial
    pts.push({ x, y, px: x, py: y - kick });
  }

  threads.push({
    a: { ...a },
    b: { ...b },
    pts,
    rest: (d / n) * 1.018,
    t0: now,
    life: rand(26000, 38000),
    seed: Math.random(),
  });

  if (threads.length > 60) threads.shift();
}

/**
 * Genera filamentos de impacto en el punto donde se apoya una pata.
 */
export function spawnImpact(x, y, i, now, scale = 1) {
  const strands = [];
  const n = 3 + ((Math.random() * 3) | 0);
  for (let k = 0; k < n; k++) {
    strands.push({
      a: rand(0, TAU),
      len: rand(9, 26) * scale,
      bend: rand(-0.5, 0.5),
    });
  }

  impacts.push({
    x,
    y,
    i,
    t0: now,
    dur: rand(560, 800),
    strands,
    rgb: pick(SLICE_RGB),
  });

  if (impacts.length > 90) impacts.shift();
}

/**
 * Envuelve una palabra marcada con líneas de seda decorativas.
 */
export function addWrap(i) {
  const lines = [];
  const n = 4 + ((Math.random() * 5) | 0);
  for (let k = 0; k < n; k++) {
    if (Math.random() < 0.25) {
      lines.push([-0.25, rand(0.2, 0.8), 1.25, rand(0.2, 0.8)]);
    } else {
      lines.push([
        rand(-0.15, 1.15),
        rand(-0.35, 0.05),
        rand(-0.15, 1.15),
        rand(0.95, 1.35),
      ]);
    }
  }
  wraps.push({ i, lines, t0: performance.now() });
}

/**
 * Retira las líneas de seda envolventes de una palabra.
 */
export function removeWrap(i) {
  for (let k = wraps.length - 1; k >= 0; k--) {
    if (wraps[k].i === i) wraps.splice(k, 1);
  }
}

/**
 * Actualiza la física de Verlet para todos los hilos activos.
 */
export function updateThreads(dt, now, bodyDocX, bodyDocY, scale = 1) {
  const g = 520 * dt * dt;
  const R = 34 * scale;

  for (let t = threads.length - 1; t >= 0; t--) {
    const T = threads[t];
    if (now - T.t0 > T.life) {
      threads.splice(t, 1);
      continue;
    }

    const P = T.pts;
    const n = P.length - 1;
    const [ax, ay] = anchorDoc(T.a);
    const [cx, cy] = anchorDoc(T.b);
    P[0].x = ax;
    P[0].y = ay;
    P[n].x = cx;
    P[n].y = cy;

    // Integración de Verlet + repulsión con el cuerpo de la araña
    for (let k = 1; k < n; k++) {
      const p = P[k];
      const vx = (p.x - p.px) * 0.982;
      const vy = (p.y - p.py) * 0.982;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy + g;

      const dx = p.x - bodyDocX;
      const dy = p.y - bodyDocY;
      const d2 = dx * dx + dy * dy;
      if (d2 < R * R && d2 > 0.01) {
        const dd = Math.sqrt(d2);
        const f = ((R - dd) / dd) * 0.18;
        p.x += dx * f;
        p.y += dy * f;
      }
    }

    // Relajación de tensiones en la cadena (constraints)
    for (let it = 0; it < 6; it++) {
      for (let k = 0; k < n; k++) {
        const p = P[k];
        const q = P[k + 1];
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        if (d <= T.rest) continue; // La seda solo resiste estiramiento, no compresión
        const diff = (d - T.rest) / d;

        if (k === 0) {
          q.x -= dx * diff;
          q.y -= dy * diff;
        } else if (k + 1 === n) {
          p.x += dx * diff;
          p.y += dy * diff;
        } else {
          p.x += dx * diff * 0.5;
          p.y += dy * diff * 0.5;
          q.x -= dx * diff * 0.5;
          q.y -= dy * diff * 0.5;
        }
      }
    }
  }
}

/**
 * Actualiza los disparos de seda activos lanzados por clics del usuario.
 */
export function updateShots(now, getSpinneretDoc, scale, silkEnabled, onShotLand) {
  for (let k = shots.length - 1; k >= 0; k--) {
    const s = shots[k];
    if (now - s.t0 < s.dur) continue;
    shots.splice(k, 1);

    const [sx, sy] = getSpinneretDoc();
    const from = makeAnchor(sx, sy, 70 * scale, null);
    if (silkEnabled) {
      addThread(from, s.to, now);
    }

    if (onShotLand) {
      onShotLand(s.to);
    }

    const [x, y] = anchorDoc(s.to);
    spawnImpact(x, y, s.to.i, now, scale);
  }
}

/**
 * Elimina impactos antiguos cuyo ciclo de animación ha finalizado.
 */
export function cleanExpiredImpacts(now) {
  for (let k = impacts.length - 1; k >= 0; k--) {
    if (now - impacts[k].t0 > impacts[k].dur) {
      impacts.splice(k, 1);
    }
  }
}

/**
 * Reinicia y limpia todos los hilos, impactos, capullos y disparos.
 */
export function clearAllSilk() {
  threads.length = 0;
  impacts.length = 0;
  shots.length = 0;
  wraps.length = 0;
}
