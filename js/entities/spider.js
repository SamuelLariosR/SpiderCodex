/**
 * spider.js
 * Entidad de la araña: estado cinemático, navegación autónoma y seguimiento del ratón,
 * marcha tetrápoda alterna (gait controller) y anclaje a palabras.
 */
import { TAU, DEG } from '../config/constants.js';
import { rand, clamp, easeInOut, lerp } from '../utils/math.js';
import { anchorDoc, holdWord } from '../core/wordManager.js';
import { startStep, solveLeg } from './leg.js';
import { addThread, spawnImpact } from '../effects/silkSimulation.js';
import { touchWord } from '../effects/glitchEffects.js';

export function createSpider(initialW = 800, initialH = 600) {
  const initX = initialW * 0.62;
  const initY = Math.min(initialH * 0.45, 420);

  return {
    x: initX,
    y: initY,
    vx: 0,
    vy: 0,
    sp: 0,
    h: -Math.PI / 2, // Orientación en radianes (inicialmente mirando hacia arriba)
    c: 0,
    s: -1,
    // Posiciones visuales suavizadas (balanceo y rebote)
    rx: initX,
    ry: initY,
    swX: 0,
    swY: 0,
    bob: 0,
    // Escala y tamaño
    scale: 1,
    sizeIdx: 1,
    // Puntero y seguimiento
    mx: initX,
    my: initY,
    inside: false,
    lastMove: -1e9,
    // Paseo autónomo
    wx: initX,
    wy: initY,
    wanderT: 0,
    pauseUntil: 0,
    nextTap: 0,
    // Marcha y telemetría
    lastGroup: 1,
    mode: 'explorando',
    silk: true,
    drag: null, // Hilo de seguridad activo fijado a una palabra
    edge: 0,
    steps: 0,
    touched: new Set(),
  };
}

/**
 * Convierte coordenadas relativas locales de la araña al sistema de coordenadas de la vista.
 */
export function localToWorld(lx, ly, ox, oy, scale, cos, sin) {
  return [ox + (lx * cos - ly * sin) * scale, oy + (lx * sin + ly * cos) * scale];
}

/**
 * Coordenadas de las hileras (glándulas de seda posteriores) en el viewport.
 */
export function spinneretView(spider) {
  return localToWorld(
    -48,
    0,
    spider.rx,
    spider.ry - spider.bob,
    spider.scale,
    spider.c,
    spider.s
  );
}

/**
 * Coordenadas de las hileras en coordenadas de documento completo.
 */
export function spinneretDoc(spider, scroll) {
  const [x, y] = spinneretView(spider);
  return [x + scroll.x, y + scroll.y];
}

/**
 * Evento disparado cuando una pata aterriza y asienta el paso.
 */
export function onLand(L, now, spider, scroll, callbacks) {
  spider.steps++;
  const a = L.anchor;
  const [x, y] = anchorDoc(a);

  if (a.i >= 0) {
    spider.touched.add(a.i);
    holdWord(L, a.i);
    touchWord(
      a.i,
      L.j === 0 ? 0.24 : 0.12,
      spider.silk,
      callbacks && callbacks.onAddWrap
    );
  }

  spawnImpact(x, y, a.i, now, spider.scale);

  // Gestión del hilo de seguridad (dragline) continuo
  if (spider.silk && a.i >= 0) {
    if (!spider.drag) {
      if (L.j >= 2) spider.drag = { ...a };
    } else {
      const [gx, gy] = anchorDoc(spider.drag);
      const [px, py] = spinneretDoc(spider, scroll);
      const len = Math.hypot(px - gx, py - gy);
      if (
        (L.j >= 2 && len > 150 * spider.scale && Math.random() < 0.55) ||
        len > 560
      ) {
        if (spider.drag.i !== a.i) {
          addThread(spider.drag, a, now);
        }
        spider.drag = { ...a };
      }
    }
  }
}

/**
 * Actualiza la simulación completa de la araña: objetivos, marcha, IK y balanceo.
 */
export function updateSpider(spider, dt, now, scroll, viewport, legs, callbacks) {
  const { W, H } = viewport;
  const sx = scroll.x;
  const sy = scroll.y;

  // --- 1. Determinación de objetivo: ratón o paseo errante autónomo ---
  const following = spider.inside && now - spider.lastMove < 7000;
  let tx, ty, maxSp;

  if (following) {
    tx = spider.mx;
    ty = spider.my;
    maxSp = 440;
  } else {
    const m = Math.min(120, W * 0.2, H * 0.2);
    if (now > spider.wanderT || Math.hypot(spider.wx - spider.x, spider.wy - spider.y) < 24) {
      spider.wx = rand(m, W - m);
      spider.wy = rand(m, H - m);
      spider.wanderT = now + rand(2600, 5200);
      spider.pauseUntil = Math.random() < 0.4 ? now + rand(500, 1500) : 0;
    }
    tx = spider.wx;
    ty = spider.wy;
    maxSp = now < spider.pauseUntil ? 0 : 150;
  }

  spider.mode = spider.edge
    ? spider.edge < 0
      ? 'borde ↑'
      : 'borde ↓'
    : following
      ? 'sigue al ratón'
      : 'explorando';

  // --- 2. Física del cuerpo y llegada suave (Smooth Damping) ---
  const dx = tx - spider.x;
  const dy = ty - spider.y;
  const dist = Math.hypot(dx, dy);
  const des = dist < 3 ? 0 : Math.min(maxSp, dist * 3.2);
  const dvx = dist > 0.001 ? (dx / dist) * des : 0;
  const dvy = dist > 0.001 ? (dy / dist) * des : 0;
  const k = 1 - Math.exp(-dt * 6.5);

  spider.vx += (dvx - spider.vx) * k;
  spider.vy += (dvy - spider.vy) * k;
  spider.x += spider.vx * dt;
  spider.y += spider.vy * dt;

  const sp = Math.hypot(spider.vx, spider.vy);
  spider.sp = sp;

  // Orientación (rotación más corta)
  let want = null;
  if (sp > 16) want = Math.atan2(spider.vy, spider.vx);
  else if (dist > 36) want = Math.atan2(dy, dx);

  if (want !== null) {
    const da = (((want - spider.h) % TAU) + TAU * 1.5) % TAU - Math.PI;
    const mt = (sp > 16 ? 6.5 : 3.2) * dt;
    spider.h += clamp(da, -mt, mt);
  }

  spider.c = Math.cos(spider.h);
  spider.s = Math.sin(spider.h);

  if (sp > 25) {
    for (let i = 0; i < legs.length; i++) legs[i].settled = false;
  }

  // --- 3. Progreso de los pasos en curso ---
  for (let i = 0; i < legs.length; i++) {
    const L = legs[i];
    if (!L.stepping) continue;
    L.t += dt / L.dur;
    if (L.t >= 1) {
      L.stepping = false;
      L.t = 0;
      L.anchor = L.to;
      L.from = L.to = null;
      L.last = now;
      onLand(L, now, spider, scroll, callbacks);
    }
  }

  // --- 4. Posiciones ideales de apoyo y cinemática de pies ---
  const leadT = clamp(0.18 + sp / 2400, 0.18, 0.34);
  const rightX = -spider.s;
  const rightY = spider.c;
  let lat = 0;
  let nPl = 0;

  for (let i = 0; i < legs.length; i++) {
    const L = legs[i];
    const d = L.d;
    const [rx, ry] = localToWorld(
      d.rx,
      L.side * d.ry,
      spider.x,
      spider.y,
      spider.scale,
      spider.c,
      spider.s
    );

    let lx = spider.vx * leadT;
    let ly = spider.vy * leadT;
    const lm = Math.hypot(lx, ly);
    const lmax = d.reach * 0.55 * spider.scale;
    if (lm > lmax) {
      lx *= lmax / lm;
      ly *= lmax / lm;
    }
    L.ix = rx + lx;
    L.iy = ry + ly;

    if (L.stepping) {
      const e = easeInOut(L.t);
      const [ax, ay] = anchorDoc(L.from);
      const [bx, by] = anchorDoc(L.to);
      L.px = lerp(ax, bx, e) - sx;
      L.py = lerp(ay, by, e) - sy;
      L.lift = Math.sin(Math.PI * L.t);
    } else {
      const [ax, ay] = anchorDoc(L.anchor);
      L.px = ax - sx;
      L.py = ay - sy;
      L.lift = 0;
      lat += (L.px - rx) * rightX + (L.py - ry) * rightY;
      nPl++;
    }
  }

  // Balanceo lateral orgánico y cabeceo (bobbing)
  const sway = nPl ? clamp((lat / nPl) * 0.16, -5, 5) * spider.scale : 0;
  const ks = 1 - Math.exp(-dt * 9);
  spider.swX += (rightX * sway - spider.swX) * ks;
  spider.swY += (rightY * sway - spider.swY) * ks;

  let totalBob = 0;
  for (let i = 0; i < legs.length; i++) totalBob += legs[i].lift;
  spider.bob += ((totalBob / 4) * 2.4 * spider.scale - spider.bob) * ks;

  spider.rx = spider.x + spider.swX;
  spider.ry = spider.y + spider.swY;

  for (let i = 0; i < legs.length; i++) {
    const L = legs[i];
    [L.hx, L.hy] = localToWorld(
      L.d.hx,
      L.side * L.d.hy,
      spider.rx,
      spider.ry - spider.bob,
      spider.scale,
      spider.c,
      spider.s
    );
  }

  // --- 5. Algoritmo de decisión de paso (Gait Controller) ---
  const dur = clamp(0.15 - sp / 5200, 0.075, 0.15);
  const thr = 30 * spider.scale + sp * 0.02;
  const cand = [];

  for (let i = 0; i < legs.length; i++) {
    const L = legs[i];
    if (L.stepping) continue;
    const dd = Math.hypot(L.px - L.ix, L.py - L.iy);
    const reachMax = (L.d.l1 + L.d.l2 + L.d.l3) * spider.scale;
    const hd = Math.hypot(L.px - L.hx, L.py - L.hy);

    // Detección de desviación angular respecto al reposo
    const fxl = (L.px - L.hx) * spider.c + (L.py - L.hy) * spider.s;
    const fyl = (-(L.px - L.hx) * spider.s + (L.py - L.hy) * spider.c) * L.side;
    const angDev = Math.abs(Math.atan2(fyl, fxl) - L.d.ang * DEG);
    const crossed = fyl < 4 * spider.scale;

    const urgent =
      dd > thr * 2.4 || hd > reachMax * 1.02 || angDev > 0.75 || crossed;
    const settle = !L.settled && sp < 10 && dd > 9 * spider.scale && now - L.last > 220;

    if (urgent || dd > thr || settle) {
      cand.push({
        L,
        dd,
        urgent,
        settle: settle && !(dd > thr) && !urgent,
      });
    }
  }

  if (cand.length) {
    cand.sort((a, b) => b.dd - a.dd);
    const active = legs.filter((l) => l.stepping);
    let cur = active.length ? active[0].group : -1;
    const canJoin = active.every((l) => l.t < 0.45);

    if (cur < 0) {
      const need = [0, 0];
      for (const c of cand) need[c.L.group] += c.dd;
      cur = need[0] >= need[1] ? 0 : 1;
      if (cur === spider.lastGroup && need[1 - cur] > 0) cur = 1 - cur;
    }

    for (const c of cand) {
      const neighbourUp = legs.some(
        (o) =>
          o.stepping && o.side === c.L.side && Math.abs(o.j - c.L.j) === 1
      );
      const ok =
        (c.L.group === cur && canJoin) ||
        (c.urgent && (c.dd > thr * 3.2 || !neighbourUp));
      if (!ok) continue;

      if (c.settle) c.L.settled = true;
      startStep(c.L, dur, 0, scroll, spider.scale, legs);
      spider.lastGroup = c.L.group;
    }
  }

  // Golpecitos sensoriales ocasionales con patas delanteras al reposar
  if (sp < 10 && now > spider.nextTap) {
    spider.nextTap = now + rand(900, 2400);
    if (!legs.some((l) => l.stepping)) {
      const L =
        legs[(Math.random() < 0.5 ? 0 : 4) + (Math.random() < 0.7 ? 0 : 1)];
      startStep(L, 0.17, 26 * spider.scale, scroll, spider.scale, legs);
    }
  } else if (sp >= 10) {
    spider.nextTap = Math.max(spider.nextTap, now + 800);
  }

  // Resolución de cinemática inversa para cada una de las 8 patas
  for (let i = 0; i < legs.length; i++) {
    solveLeg(legs[i], spider.scale, spider.bob);
  }

  // Rotura del hilo de arrastre si se supera la longitud elástica máxima
  if (spider.drag) {
    const [gx, gy] = anchorDoc(spider.drag);
    const [px, py] = spinneretDoc(spider, scroll);
    if (Math.hypot(px - gx, py - gy) > 900) {
      spider.drag = null;
    }
  }
}
