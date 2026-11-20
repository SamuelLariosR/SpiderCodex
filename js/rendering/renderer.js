/**
 * renderer.js
 * Motor de renderizado en Canvas 2D: renderizado de capas en coordenadas de documento
 * (seda, impactos, capullos, disparos) y coordenadas de vista (araña, sombras, articulaciones luminosas).
 */
import { TAU, COL, EYES } from '../config/constants.js';
import { clamp, easeInOut, lerp } from '../utils/math.js';
import { words, anchorDoc } from '../core/wordManager.js';
import { spinneretView, spinneretDoc } from '../entities/spider.js';

function ell(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
}

function dot(ctx, x, y, r) {
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, TAU);
}

function strokeRope(ctx, P) {
  ctx.beginPath();
  ctx.moveTo(P[0].x, P[0].y);
  for (let k = 1; k < P.length - 1; k++) {
    ctx.quadraticCurveTo(
      P[k].x,
      P[k].y,
      (P[k].x + P[k + 1].x) / 2,
      (P[k].y + P[k + 1].y) / 2
    );
  }
  const l = P[P.length - 1];
  ctx.lineTo(l.x, l.y);
  ctx.stroke();
}

export function drawWraps(ctx, now, wraps) {
  ctx.lineWidth = 0.7;
  for (let i = 0; i < wraps.length; i++) {
    const wp = wraps[i];
    if (wp.i < 0 || wp.i >= words.length) continue;
    const w = words[wp.i];
    const a = Math.min(1, (now - wp.t0) / 350);
    ctx.strokeStyle = `rgba(240,240,244,${0.55 * a})`;
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of wp.lines) {
      ctx.moveTo(w.x + x1 * w.w, w.y + y1 * w.h);
      ctx.lineTo(w.x + x2 * w.w, w.y + y2 * w.h);
    }
    ctx.stroke();
  }
}

export function drawThreads(ctx, now, threads, scroll, H) {
  const top = scroll.y - 200;
  const bottom = scroll.y + H + 200;

  for (let i = 0; i < threads.length; i++) {
    const T = threads[i];
    const P = T.pts;
    const last = P[P.length - 1];
    if (Math.max(P[0].y, last.y) < top || Math.min(P[0].y, last.y) > bottom) {
      continue;
    }

    const age = now - T.t0;
    const a = Math.min(1, age / 250) * clamp((T.life - age) / 3500, 0, 1);
    if (a <= 0) continue;

    ctx.lineWidth = 0.8;
    ctx.strokeStyle = `rgba(236,236,240,${0.6 * a})`;
    strokeRope(ctx, P);

    // Destello de pulso de luz que recorre el hilo
    const u = (now / 1800 + T.seed) % 1;
    const idx = u * (P.length - 1);
    const k0 = Math.floor(idx);
    const f = idx - k0;
    const p0 = P[k0];
    const p1 = P[Math.min(k0 + 1, P.length - 1)];

    ctx.fillStyle = `rgba(255,255,255,${0.9 * a})`;
    ctx.beginPath();
    dot(ctx, lerp(p0.x, p1.x, f), lerp(p0.y, p1.y, f), 1.3);
    dot(ctx, P[0].x, P[0].y, 1.8);
    dot(ctx, last.x, last.y, 1.8);
    ctx.fill();
  }
}

export function drawImpacts(ctx, now, impacts, scale = 1) {
  for (let i = 0; i < impacts.length; i++) {
    const I = impacts[i];
    const age = (now - I.t0) / I.dur;
    if (age >= 1) continue;

    const grow = 1 - Math.pow(1 - Math.min(1, age * 2.6), 3);
    const fade = 1 - age;

    // Filamentos de seda radiales desde el punto de impacto
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = `rgba(240,240,244,${0.75 * fade})`;
    ctx.beginPath();
    for (const st of I.strands) {
      const L = st.len * grow;
      ctx.moveTo(I.x, I.y);
      ctx.quadraticCurveTo(
        I.x + Math.cos(st.a + st.bend) * L * 0.5,
        I.y + Math.sin(st.a + st.bend) * L * 0.5,
        I.x + Math.cos(st.a) * L,
        I.y + Math.sin(st.a) * L
      );
    }
    ctx.stroke();

    // Anillo de expansión verde
    ctx.strokeStyle = `rgba(141,255,60,${0.7 * fade})`;
    ctx.beginPath();
    ctx.arc(I.x, I.y, (3 + age * 10) * scale, 0, TAU);
    ctx.stroke();

    // Glitch cromático y líneas de escaneo sobre la palabra impactada
    if (I.i >= 0 && I.i < words.length && age < 0.4) {
      const w = words[I.i];
      const q = 1 - age / 0.4;
      const j = (Math.random() - 0.5) * 4;

      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(47,230,255,${0.9 * q})`;
      ctx.strokeRect(w.x - 2 + j, w.y - 1, w.w + 4, w.h + 2);
      ctx.strokeStyle = `rgba(255,61,240,${0.9 * q})`;
      ctx.strokeRect(w.x - j, w.y, w.w + 4, w.h + 2);

      ctx.fillStyle = `rgba(${I.rgb},${0.3 * q})`;
      for (let k = 0; k < 2; k++) {
        ctx.fillRect(
          w.x - 6 + Math.random() * 8,
          w.y + Math.random() * w.h,
          w.w * (0.4 + Math.random() * 0.8),
          1 + Math.random() * 2
        );
      }
    }
  }
}

export function drawShots(ctx, now, shots, spider, scroll) {
  if (!shots.length) return;
  const [sx, sy] = spinneretDoc(spider, scroll);
  ctx.lineWidth = 1;

  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    const e = easeInOut(clamp((now - s.t0) / s.dur, 0, 1));
    const [bx, by] = anchorDoc(s.to);
    ctx.strokeStyle = 'rgba(255,255,255,.95)';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(lerp(sx, bx, e), lerp(sy, by, e));
    ctx.stroke();
  }
}

export function drawDragline(ctx, now, spider, scroll) {
  if (!spider.silk || !spider.drag) return;
  const [ax, ay] = anchorDoc(spider.drag);
  const x0 = ax - scroll.x;
  const y0 = ay - scroll.y;
  const [x1, y1] = spinneretView(spider);
  const d = Math.hypot(x1 - x0, y1 - y0);
  const sag = Math.min(28, d * 0.08);

  ctx.lineWidth = 0.9;
  ctx.strokeStyle = 'rgba(245,245,248,.85)';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(
    (x0 + x1) / 2 + Math.sin(now / 400) * 2,
    (y0 + y1) / 2 + sag,
    x1,
    y1
  );
  ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.beginPath();
  dot(ctx, x0, y0, 2);
  ctx.fill();
}

export function drawSpider(ctx, now, spider, legs) {
  const sc = spider.scale;

  // 1. Sombra del cuerpo proyectada en el documento
  ctx.save();
  ctx.translate(spider.rx + 5 * sc, spider.ry + 9 * sc);
  ctx.rotate(spider.h);
  ctx.scale(sc, sc);
  ctx.fillStyle = 'rgba(0,0,0,.38)';
  ell(ctx, -12, 0, 40, 17);
  ctx.fill();
  ctx.restore();

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 2. Sombra de las patas proyectadas
  ctx.strokeStyle = 'rgba(0,0,0,.42)';
  ctx.lineWidth = 2.2 * sc;
  ctx.beginPath();
  for (let i = 0; i < legs.length; i++) {
    const L = legs[i];
    ctx.moveTo(L.shx, L.shy);
    ctx.lineTo(L.skx, L.sky);
    ctx.lineTo(L.sax, L.say);
    ctx.lineTo(L.sfx, L.sfy);
  }
  ctx.stroke();

  // 3. Patas: segmentos de fémur, tibia y tarso
  ctx.strokeStyle = COL.leg;
  const segs = [
    [2.8, 'h', 'k'],
    [2.1, 'k', 'a'],
    [1.4, 'a', 'f'],
  ];
  for (const [lw, s0, s1] of segs) {
    ctx.lineWidth = lw * sc;
    ctx.beginPath();
    for (let i = 0; i < legs.length; i++) {
      const L = legs[i];
      ctx.moveTo(L[s0 + 'x'], L[s0 + 'y']);
      ctx.lineTo(L[s1 + 'x'], L[s1 + 'y']);
    }
    ctx.stroke();
  }

  // 4. Articulaciones y pies brillantes
  ctx.save();
  ctx.shadowColor = COL.joint;
  ctx.shadowBlur = 7;
  ctx.fillStyle = COL.joint;
  ctx.beginPath();
  for (let i = 0; i < legs.length; i++) {
    const L = legs[i];
    dot(ctx, L.kx, L.ky, 2.9 * sc);
    dot(ctx, L.ax, L.ay, 2.3 * sc);
    if (!L.stepping) dot(ctx, L.fx, L.fy, 3.2 * sc);
  }
  ctx.fill();

  ctx.strokeStyle = COL.joint;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  for (let i = 0; i < legs.length; i++) {
    const L = legs[i];
    if (L.stepping) dot(ctx, L.fx, L.fy, (3 + L.lift * 2.5) * sc);
  }
  ctx.stroke();
  ctx.restore();

  // 5. Cuerpo (Abdomen, hileras, cefalotórax, quelíceros y ojos)
  ctx.save();
  ctx.translate(spider.rx, spider.ry - spider.bob);
  ctx.rotate(spider.h);
  ctx.scale(sc, sc);

  // Abdomen (opistosoma) con respiración latente y reloj de arena
  const br = 1 + Math.sin(now / 480) * 0.025;
  ctx.save();
  ctx.translate(-25, 0);
  ctx.scale(br, br);

  let g = ctx.createRadialGradient(4, -5, 1, 0, 0, 22);
  g.addColorStop(0, '#45121a');
  g.addColorStop(0.5, '#1a0609');
  g.addColorStop(1, '#070203');
  ctx.fillStyle = g;
  ell(ctx, 0, 0, 21, 15.5);
  ctx.fill();

  ctx.lineWidth = 1.3;
  ctx.strokeStyle = COL.leg;
  ctx.stroke();

  ctx.lineWidth = 0.6;
  ctx.strokeStyle = 'rgba(255,59,47,.3)';
  ell(ctx, 0, 0, 14.5, 10.5);
  ctx.stroke();
  ell(ctx, 0, 0, 8, 5.6);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-21, 0);
  ctx.lineTo(21, 0);
  ctx.stroke();

  // Marca de reloj de arena rojo bioluminiscente
  ctx.fillStyle = COL.red;
  ctx.shadowColor = COL.red;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(-9, -4.2);
  ctx.lineTo(-9, 4.2);
  ctx.lineTo(-1.2, 0);
  ctx.closePath();
  ctx.moveTo(9, -4.2);
  ctx.lineTo(9, 4.2);
  ctx.lineTo(1.2, 0);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,.13)';
  ell(ctx, 6, -7.5, 7, 2.4, -0.25);
  ctx.fill();
  ctx.restore();

  // Hileras y pedicelo
  ctx.fillStyle = COL.leg;
  ctx.beginPath();
  ctx.moveTo(-45.2, -2.4);
  ctx.lineTo(-50, 0);
  ctx.lineTo(-45.2, 2.4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#2b0b10';
  ctx.fillRect(-6.5, -2.4, 4, 4.8);

  // Quelíceros y pedipalpos articulados
  const tw = Math.sin(now / 170) * 1.2;
  ctx.fillStyle = '#1d0609';
  ctx.strokeStyle = COL.leg;
  ctx.lineWidth = 0.9;
  for (const s of [-1, 1]) {
    ell(ctx, 15.8, s * 3.1, 3.8, 2.6);
    ctx.fill();
    ctx.stroke();
  }

  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const s of [-1, 1]) {
    ctx.moveTo(12, s * 6);
    ctx.lineTo(19.5, s * (10 + tw));
    ctx.lineTo(25, s * (7.5 + tw * 0.5));
  }
  ctx.stroke();

  // Cefalotórax (prosoma)
  g = ctx.createRadialGradient(6, -3, 1, 3, 0, 15);
  g.addColorStop(0, '#3d1016');
  g.addColorStop(0.55, '#16050a');
  g.addColorStop(1, '#060203');
  ctx.fillStyle = g;
  ell(ctx, 3, 0, 13.5, 10.5);
  ctx.fill();

  ctx.lineWidth = 1.3;
  ctx.strokeStyle = COL.leg;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,59,47,.32)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (const a of [-2.4, -1.57, -0.75, 0.75, 1.57, 2.4]) {
    ctx.moveTo(1 + Math.cos(a) * 2.5, Math.sin(a) * 2.5);
    ctx.lineTo(3 + Math.cos(a) * 11, Math.sin(a) * 8.5);
  }
  ctx.stroke();

  // Ojos y pedipalpos con brillo verde
  ctx.fillStyle = COL.joint;
  ctx.shadowColor = COL.joint;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  for (const [ex, ey, r] of EYES) {
    for (const s of [-1, 1]) {
      dot(ctx, ex, s * ey, r);
    }
  }
  for (const s of [-1, 1]) {
    dot(ctx, 19.5, s * (10 + tw), 1.5);
    dot(ctx, 25, s * (7.5 + tw * 0.5), 1.3);
  }
  ctx.fill();
  ctx.restore();
}

/**
 * Función principal de renderizado que coordina capas de documento y capas de vista.
 */
export function renderAll(ctx, now, viewport, scroll, spider, legs, silk) {
  const { W, H } = viewport;
  ctx.clearRect(0, 0, W, H);

  // Capa 1: Coordenadas de documento (hilos en el texto, impactos, disparos)
  ctx.save();
  ctx.translate(-scroll.x, -scroll.y);
  drawWraps(ctx, now, silk.wraps);
  if (spider.silk) {
    drawThreads(ctx, now, silk.threads, scroll, H);
  }
  drawImpacts(ctx, now, silk.impacts, spider.scale);
  drawShots(ctx, now, silk.shots, spider, scroll);
  ctx.restore();

  // Capa 2: Coordenadas de vista fija (hilo de arrastre activo y araña)
  drawDragline(ctx, now, spider, scroll);
  drawSpider(ctx, now, spider, legs);
}
