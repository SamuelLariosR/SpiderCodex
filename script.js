(() => {
  'use strict';
  if (window.__ARANEAE_INITIALIZED__) return;
  window.__ARANEAE_INITIALIZED__ = true;

  /* ================================================================
     Utilidades
     ================================================================ */
  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const COL = {
    leg: '#ff3b2f', joint: '#8dff3c',
    mag: '#ff3df0', cyan: '#2fe6ff', lime: '#7dff4a', amber: '#ffcc33', blue: '#4d6bff', red: '#ff3030',
  };
  const SLICE_RGB = ['47,230,255', '255,61,240', '125,255,74', '255,204,51'];

  /* ================================================================
     Canvas
     ================================================================ */
  const cvs = document.getElementById('spider-canvas');
  const ctx = cvs.getContext('2d');
  let W = 0, H = 0;
  // Scroll cacheado: leer window.scrollX/Y tras tocar el DOM fuerza un layout síncrono,
  // así que se lee una vez por fotograma (y en cada evento de scroll).
  let SCX = 0, SCY = 0;
  function readScroll() { SCX = window.scrollX; SCY = window.scrollY; }
  function resizeCanvas() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    cvs.width = Math.round(W * dpr);
    cvs.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ================================================================
     1. Palabras: cada palabra del texto se envuelve en <span class="w">
        y se cachea su rectángulo en coordenadas de documento.
     ================================================================ */
  const words = [];   // { el, text, x, y, w, h }

  function wrapWords(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!/\S/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
        const p = node.parentElement;
        if (!p || p.closest('script, style, svg, .hud, canvas, noscript')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (const node of nodes) {
      const frag = document.createDocumentFragment();
      // Solo se separa por espacios normales: los &nbsp; quedan dentro de la palabra.
      for (const part of node.nodeValue.split(/([ \t\n\r\f]+)/)) {
        if (!part) continue;
        if (/^[ \t\n\r\f]+$/.test(part)) { frag.appendChild(document.createTextNode(part)); continue; }
        const span = document.createElement('span');
        span.className = 'w';
        span.textContent = part;
        words.push({ el: span, text: part, x: 0, y: 0, w: 0, h: 0 });
        frag.appendChild(span);
      }
      node.parentNode.replaceChild(frag, node);
    }
  }

  // Rejilla espacial para encontrar rápido la palabra más cercana a un punto.
  const CELL = 72;
  const grid = new Map();
  let stamp = new Uint32Array(0);
  let queryId = 0;

  function measure() {
    document.body.classList.add('measuring');   // ignora rotaciones/escalas de las marcas
    const sx = window.scrollX, sy = window.scrollY;
    for (const w of words) {
      const r = w.el.getBoundingClientRect();
      w.x = r.left + sx; w.y = r.top + sy; w.w = r.width; w.h = r.height;
    }
    document.body.classList.remove('measuring');

    grid.clear();
    stamp = new Uint32Array(words.length);
    words.forEach((w, i) => {
      if (w.w < 1 || w.h < 1) return;
      const x0 = Math.floor(w.x / CELL), x1 = Math.floor((w.x + w.w) / CELL);
      const y0 = Math.floor(w.y / CELL), y1 = Math.floor((w.y + w.h) / CELL);
      for (let gy = y0; gy <= y1; gy++) {
        for (let gx = x0; gx <= x1; gx++) {
          const k = gy * 8192 + gx;
          let list = grid.get(k);
          if (!list) grid.set(k, (list = []));
          list.push(i);
        }
      }
    });
  }

  function nearestWord(px, py, R, isTaken) {
    queryId++;
    let best = -1, bestD = Infinity;
    const x0 = Math.floor((px - R) / CELL), x1 = Math.floor((px + R) / CELL);
    const y0 = Math.floor((py - R) / CELL), y1 = Math.floor((py + R) / CELL);
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const list = grid.get(gy * 8192 + gx);
        if (!list) continue;
        for (const i of list) {
          if (stamp[i] === queryId) continue;
          stamp[i] = queryId;
          const w = words[i];
          const dx = Math.max(w.x - px, 0, px - (w.x + w.w));
          const dy = Math.max(w.y - py, 0, py - (w.y + w.h));
          let d = Math.hypot(dx, dy);
          if (d > R) continue;
          if (isTaken && isTaken(i)) d += 18;     // evita que dos patas pisen la misma palabra
          d += Math.random() * 4;                // un poco de variación orgánica
          if (d < bestD) { bestD = d; best = i; }
        }
      }
    }
    return best;
  }

  // Un anclaje es una palabra + posición relativa dentro de ella (o un punto libre del documento).
  function makeAnchor(px, py, R, isTaken) {
    const i = nearestWord(px, py, R, isTaken);
    if (i < 0) return { i: -1, x: px, y: py };
    const w = words[i];
    const inset = Math.min(3, w.w * 0.3);
    const tx = clamp(px, w.x + inset, w.x + w.w - inset);
    const ty = clamp(py, w.y + w.h * 0.32, w.y + w.h * 0.74);
    return { i, fx: (tx - w.x) / w.w, fy: (ty - w.y) / w.h };
  }
  function anchorDoc(a) {
    if (a.i >= 0) { const w = words[a.i]; return [w.x + a.fx * w.w, w.y + a.fy * w.h]; }
    return [a.x, a.y];
  }

  /* ================================================================
     2. Araña: cuerpo, patas (IK) y marcha tetrápoda alterna
     ================================================================ */
  // Coordenadas locales: +x hacia delante, +y hacia el lado de la pata.
  const LEGDEF = [
    { hx: 9,  hy: 5.5, ang: 30,  reach: 104, l1: 52, l2: 56, l3: 18 },
    { hx: 4,  hy: 8,   ang: 70,  reach: 86,  l1: 44, l2: 46, l3: 15 },
    { hx: -2, hy: 8,   ang: 112, reach: 84,  l1: 42, l2: 46, l3: 15 },
    { hx: -7, hy: 5.5, ang: 150, reach: 100, l1: 50, l2: 54, l3: 18 },
  ];
  for (const d of LEGDEF) {
    d.rx = d.hx + Math.cos(d.ang * DEG) * d.reach;
    d.ry = d.hy + Math.sin(d.ang * DEG) * d.reach;
  }

  const S = {
    x: 0, y: 0, vx: 0, vy: 0, sp: 0, h: -Math.PI / 2, c: 0, s: -1,
    rx: 0, ry: 0, swX: 0, swY: 0, bob: 0,
    scale: 1, sizeIdx: 1,
    mx: 0, my: 0, inside: false, lastMove: -1e9,
    wx: 0, wy: 0, wanderT: 0, pauseUntil: 0, nextTap: 0,
    lastGroup: 1, mode: 'explorando',
    silk: true, drag: null, edge: 0,
    steps: 0, touched: new Set(),
  };
  const SIZES = [{ label: 'S', v: 0.75 }, { label: 'M', v: 1 }, { label: 'L', v: 1.4 }];

  // Orden: lado izquierdo (side -1) patas 0..3, luego lado derecho.
  // Marcha tetrápoda alterna: grupo 0 = I1, D2, I3, D4 · grupo 1 = D1, I2, D3, I4
  const legs = [];
  for (const side of [-1, 1]) {
    LEGDEF.forEach((d, j) => {
      legs.push({
        side, j, d,
        group: (j + (side > 0 ? 1 : 0)) % 2,
        bend: side * (j % 2 === 0 ? 1 : -1),   // lado hacia el que se arquea la rodilla (I-II delante, III-IV detrás)
        anchor: null, from: null, to: null,
        stepping: false, t: 0, dur: 0.14, last: 0, settled: false,
        held: -1, lift: 0,
        ix: 0, iy: 0, hx: 0, hy: 0, px: 0, py: 0, kx: 0, ky: 0, ax: 0, ay: 0, fx: 0, fy: 0,
        shx: 0, shy: 0, skx: 0, sky: 0, sax: 0, say: 0, sfx: 0, sfy: 0,
      });
    });
  }

  function localToWorld(lx, ly, ox, oy) {
    const k = S.scale;
    return [ox + (lx * S.c - ly * S.s) * k, oy + (lx * S.s + ly * S.c) * k];
  }
  function spinneretView() { return localToWorld(-48, 0, S.rx, S.ry - S.bob); }
  function spinneretDoc() { const [x, y] = spinneretView(); return [x + SCX, y + SCY]; }

  // Palabras "sujetas" por una pata (contorno verde mientras la pata está apoyada).
  let holdCount = new Uint16Array(0);
  function hold(L, i) {
    L.held = i;
    if (holdCount[i]++ === 0) words[i].el.classList.add('held');
  }
  function release(L) {
    if (L.held < 0) return;
    const i = L.held;
    L.held = -1;
    if (--holdCount[i] <= 0) { holdCount[i] = 0; words[i].el.classList.remove('held'); }
  }

  function isTakenBy(L) {
    return (i) => legs.some((o) => o !== L && ((o.anchor && o.anchor.i === i) || (o.stepping && o.to && o.to.i === i)));
  }

  function startStep(L, dur, jitter = 0) {
    const px = L.ix + SCX + rand(-jitter, jitter);
    const py = L.iy + SCY + rand(-jitter, jitter);
    L.from = L.anchor;
    L.to = makeAnchor(px, py, 44 * S.scale, isTakenBy(L));
    L.stepping = true;
    L.t = 0;
    L.dur = dur * rand(0.9, 1.1);
    release(L);
  }

  function onLand(L, now) {
    S.steps++;
    const a = L.anchor;
    const [x, y] = anchorDoc(a);
    if (a.i >= 0) {
      hold(L, a.i);
      touchWord(a.i, L.j === 0 ? 0.24 : 0.12);
    }
    spawnImpact(x, y, a.i, now);

    // Hilo de seguridad: se fija a una palabra y se vuelve a anclar más adelante.
    if (S.silk && a.i >= 0) {
      if (!S.drag) {
        if (L.j >= 2) S.drag = { ...a };
      } else {
        const [gx, gy] = anchorDoc(S.drag);
        const [px, py] = spinneretDoc();
        const len = Math.hypot(px - gx, py - gy);
        if ((L.j >= 2 && len > 150 * S.scale && Math.random() < 0.55) || len > 560) {
          if (S.drag.i !== a.i) addThread(S.drag, a, now);
          S.drag = { ...a };
        }
      }
    }
  }

  // IK pseudo-3D: la pata se resuelve en el plano vertical que contiene cadera y pie
  // (rodilla hacia arriba) y se proyecta desde arriba con un ligero arco hacia fuera.
  const LAT = 0.45;            // cuánto de la altura se ve como desplazamiento lateral
  const LIGHT_X = 0.3, LIGHT_Y = 0.5;   // dirección de la sombra por unidad de altura
  function solveLeg(L) {
    const d = L.d, sc = S.scale;
    const hx = L.hx, hy = L.hy;
    const dx = L.px - hx, dy = L.py - hy;           // L.px/L.py = pie sobre el papel
    const dist = Math.hypot(dx, dy) || 0.001;
    const ux = dx / dist, uy = dy / dist;
    const nx = -uy * L.bend, ny = ux * L.bend;       // perpendicular hacia el lado de la rodilla
    const l1 = d.l1 * sc, l2 = d.l2 * sc, l3 = d.l3 * sc;
    const h0 = 9 * sc + S.bob * 0.5;                  // altura de la cadera
    const zF = L.lift * 12 * sc;                      // altura del pie durante el paso
    // tobillo: el tarso baja inclinado hasta el pie
    const uA = Math.max(0, dist - l3 * 0.8), zA = l3 * 0.6 + zF;
    // dos huesos (fémur + tibia) de la cadera al tobillo
    const vu = uA, vz = zA - h0;
    const D = Math.hypot(vu, vz) || 0.001;
    let k1 = l1, k2 = l2;
    if (D > k1 + k2 - 0.5) { const f = D / (k1 + k2 - 0.5); k1 *= f; k2 *= f; }  // estira antes que soltar el pie
    const Dc = Math.max(D, Math.abs(k1 - k2) + 0.5);
    const cosA = clamp((k1 * k1 + Dc * Dc - k2 * k2) / (2 * k1 * Dc), -1, 1);
    const ang = Math.atan2(vz, vu) + Math.acos(cosA);
    const uK = Math.cos(ang) * k1, zK = h0 + Math.sin(ang) * k1;
    // proyección cenital con arco lateral
    L.kx = hx + ux * uK + nx * zK * LAT;  L.ky = hy + uy * uK + ny * zK * LAT;
    L.ax = hx + ux * uA + nx * zA * LAT;  L.ay = hy + uy * uA + ny * zA * LAT;
    L.fx = L.px + nx * zF * LAT;          L.fy = L.py + ny * zF * LAT - zF * 0.35;
    // puntos de sombra (suelo + desplazamiento según altura)
    L.shx = hx + LIGHT_X * h0;                       L.shy = hy + LIGHT_Y * h0;
    L.skx = hx + ux * uK + LIGHT_X * zK;             L.sky = hy + uy * uK + LIGHT_Y * zK;
    L.sax = hx + ux * uA + LIGHT_X * zA;             L.say = hy + uy * uA + LIGHT_Y * zA;
    L.sfx = L.px + LIGHT_X * zF;                     L.sfy = L.py + LIGHT_Y * zF;
  }

  /* ================================================================
     3. Glitch sobre las palabras
     ================================================================ */
  const GLYPHS = '!<>-_\\/[]{}=+*^?#%&$@|~:;01ΔΞΣΨ░▒▓';
  const MARKS = [
    { v: 'box',  w: 5, cols: [COL.mag, COL.cyan, COL.lime, COL.amber] },
    { v: 'inv',  w: 3, cols: [COL.cyan, COL.lime, COL.mag, COL.blue] },
    { v: 'rot',  w: 4, cols: [COL.red, COL.mag, COL.amber, COL.cyan] },
    { v: 'mono', w: 3, cols: [COL.red] },
    { v: 'big',  w: 2, cols: [COL.cyan, COL.lime] },
    { v: 'red',  w: 2, cols: [COL.red] },
  ];
  const MARK_TOTAL = MARKS.reduce((s, m) => s + m.w, 0);
  const MARK_CLASSES = ['mk', ...MARKS.map((m) => 'mk-' + m.v)];
  const marked = new Set();
  const wraps = [];  // hilos de seda envolviendo palabras marcadas

  function pickMark() {
    let r = Math.random() * MARK_TOTAL;
    for (const m of MARKS) { if ((r -= m.w) <= 0) return m; }
    return MARKS[0];
  }

  function scramble(el, text) {
    if (reduceMotion) return;
    clearTimeout(el._st);
    const frames = 6;
    let f = 0;
    el.classList.add('scr');
    const tick = () => {
      f++;
      const reveal = Math.floor(text.length * (f / frames));
      let s = '';
      for (let k = 0; k < text.length; k++) s += k < reveal ? text[k] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      el.setAttribute('data-s', s);
      el._st = f < frames ? setTimeout(tick, 38) : setTimeout(() => el.classList.remove('scr'), 40);
    };
    tick();
  }

  function hitGlitch(w) {
    const el = w.el;
    el.style.setProperty('--scol', pick([COL.cyan, COL.mag, COL.lime, COL.amber]));
    scramble(el, w.text);
    if (reduceMotion || !el.animate) return;
    try {
      el.animate([
        { transform: 'translate(0px, 0px) skewX(0deg)' },
        { transform: `translate(${rand(-4, 4).toFixed(1)}px, ${rand(-2, 2).toFixed(1)}px) skewX(${rand(-20, 20).toFixed(1)}deg)` },
        { transform: `translate(${rand(-3, 3).toFixed(1)}px, ${rand(-1.5, 1.5).toFixed(1)}px) skewX(${rand(-10, 10).toFixed(1)}deg)` },
        { transform: 'translate(0px, 0px) skewX(0deg)' },
      ], { duration: 260, easing: 'steps(3, end)', composite: 'add' });
    } catch (e) { /* navegadores sin composite: se omite la sacudida */ }
  }

  function applyMark(i) {
    const w = words[i], el = w.el;
    const m = pickMark();
    const col = pick(m.cols);
    el.classList.remove(...MARK_CLASSES);
    el.classList.add('mk', 'mk-' + m.v);
    el.style.setProperty('--c', col);
    el.style.setProperty('--fg', col === COL.blue ? '#ffffff' : '#050505');

    let rot = rand(-2.5, 2.5), scl = 1, sk = 0;
    if (m.v === 'rot') rot = (Math.random() < 0.5 ? -1 : 1) * rand(8, 32);
    else if (m.v === 'big') { scl = rand(1.45, 2.1); rot = rand(-5, 5); }
    else if (m.v === 'mono') { el.setAttribute('data-m', w.text); rot = rand(-3, 3); }
    else if (m.v === 'red') { sk = rand(-14, 14); rot = 0; }
    el.style.setProperty('--rot', rot.toFixed(1) + 'deg');
    el.style.setProperty('--sc', scl.toFixed(2));
    el.style.setProperty('--sk', sk.toFixed(1) + 'deg');
    marked.add(i);

    removeWrap(i);
    if (S.silk && m.v !== 'rot' && m.v !== 'big' && Math.random() < 0.4) addWrap(i);

    clearTimeout(el._mt);
    el._mt = setTimeout(() => clearMark(i), rand(6500, 12000));
  }

  function clearMark(i) {
    const el = words[i].el;
    clearTimeout(el._mt);
    el.classList.remove(...MARK_CLASSES);
    for (const p of ['--c', '--fg', '--rot', '--sc', '--sk']) el.style.removeProperty(p);
    marked.delete(i);
    removeWrap(i);
  }

  function addWrap(i) {
    const lines = [];
    const n = 4 + ((Math.random() * 5) | 0);
    for (let k = 0; k < n; k++) {
      if (Math.random() < 0.25) lines.push([-0.25, rand(0.2, 0.8), 1.25, rand(0.2, 0.8)]);
      else lines.push([rand(-0.15, 1.15), rand(-0.35, 0.05), rand(-0.15, 1.15), rand(0.95, 1.35)]);
    }
    wraps.push({ i, lines, t0: performance.now() });
  }
  function removeWrap(i) {
    for (let k = wraps.length - 1; k >= 0; k--) if (wraps[k].i === i) wraps.splice(k, 1);
  }

  function touchWord(i, markChance) {
    S.touched.add(i);
    hitGlitch(words[i]);
    if (Math.random() < markChance) applyMark(i);
  }

  /* ================================================================
     4. Seda: hilos con Verlet, impactos y disparos
     ================================================================ */
  const threads = [];
  const impacts = [];
  const shots = [];

  function addThread(a, b, now) {
    const [ax, ay] = anchorDoc(a), [bx, by] = anchorDoc(b);
    const d = Math.hypot(bx - ax, by - ay);
    if (d < 14) return;
    const n = clamp(Math.round(d / 16), 5, 32);
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = lerp(ax, bx, t), y = lerp(ay, by, t);
      const kick = Math.sin(Math.PI * t) * rand(3, 9);   // vibración inicial al tensarse
      pts.push({ x, y, px: x, py: y - kick });
    }
    threads.push({ a: { ...a }, b: { ...b }, pts, rest: (d / n) * 1.018, t0: now, life: rand(26000, 38000), seed: Math.random() });
    if (threads.length > 60) threads.shift();
  }

  function spawnImpact(x, y, i, now) {
    const strands = [];
    const n = 3 + ((Math.random() * 3) | 0);
    for (let k = 0; k < n; k++) strands.push({ a: rand(0, TAU), len: rand(9, 26) * S.scale, bend: rand(-0.5, 0.5) });
    impacts.push({ x, y, i, t0: now, dur: rand(560, 800), strands, rgb: pick(SLICE_RGB) });
    if (impacts.length > 90) impacts.shift();
  }

  function updateThreads(dt, now) {
    const g = 520 * dt * dt;
    const bx = S.rx + SCX, by = S.ry + SCY, R = 34 * S.scale;
    for (let t = threads.length - 1; t >= 0; t--) {
      const T = threads[t];
      if (now - T.t0 > T.life) { threads.splice(t, 1); continue; }
      const P = T.pts, n = P.length - 1;
      const [ax, ay] = anchorDoc(T.a), [cx, cy] = anchorDoc(T.b);
      P[0].x = ax; P[0].y = ay; P[n].x = cx; P[n].y = cy;
      for (let k = 1; k < n; k++) {
        const p = P[k];
        const vx = (p.x - p.px) * 0.982, vy = (p.y - p.py) * 0.982;
        p.px = p.x; p.py = p.y;
        p.x += vx; p.y += vy + g;
        // El cuerpo de la araña aparta los hilos al pasar.
        const dx = p.x - bx, dy = p.y - by, d2 = dx * dx + dy * dy;
        if (d2 < R * R && d2 > 0.01) { const dd = Math.sqrt(d2), f = ((R - dd) / dd) * 0.18; p.x += dx * f; p.y += dy * f; }
      }
      for (let it = 0; it < 6; it++) {
        for (let k = 0; k < n; k++) {
          const p = P[k], q = P[k + 1];
          const dx = q.x - p.x, dy = q.y - p.y;
          const d = Math.hypot(dx, dy) || 0.0001;
          if (d <= T.rest) continue;          // la seda no se comprime: solo limita estiramiento
          const diff = (d - T.rest) / d;
          if (k === 0) { q.x -= dx * diff; q.y -= dy * diff; }
          else if (k + 1 === n) { p.x += dx * diff; p.y += dy * diff; }
          else { p.x += dx * diff * 0.5; p.y += dy * diff * 0.5; q.x -= dx * diff * 0.5; q.y -= dy * diff * 0.5; }
        }
      }
    }
  }

  function updateShots(now) {
    for (let k = shots.length - 1; k >= 0; k--) {
      const s = shots[k];
      if (now - s.t0 < s.dur) continue;
      shots.splice(k, 1);
      const [sx, sy] = spinneretDoc();
      const from = makeAnchor(sx, sy, 70 * S.scale, null);
      if (S.silk) addThread(from, s.to, now);
      touchWord(s.to.i, 1);
      const [x, y] = anchorDoc(s.to);
      spawnImpact(x, y, s.to.i, now);
    }
  }

  /* ================================================================
     5. Simulación
     ================================================================ */

  // Auto-scroll: cuando el ratón está en el borde superior/inferior y la araña
  // ya ha llegado allí, la página se desplaza en esa dirección. La velocidad
  // crece a medida que el cuerpo se acerca al borde.
  const EDGE_ZONE = 100;        // px desde el borde donde el ratón activa la zona
  const EDGE_MARGIN = 60;       // margen extra para que la araña llegue antes de mover
  const EDGE_MIN_SPEED = 60;    // px/s al entrar en la zona
  const EDGE_MAX_SPEED = 380;   // px/s pegado al borde

  function edgeScroll(dt, now) {
    S.edge = 0;
    if (!S.inside) return;

    const zone = Math.min(EDGE_ZONE, H * 0.25);
    let dir = 0;
    if (S.my <= zone) dir = -1;
    else if (S.my >= H - zone) dir = 1;
    if (!dir) return;

    // No desplazar mientras se usan los controles del HUD (esquina inferior).
    const under = document.elementFromPoint(S.mx, S.my);
    if (under && under.closest('.hud')) return;

    // Solo se mueve cuando la araña ya está cerca de ese mismo borde.
    const trigger = zone + EDGE_MARGIN;
    const bodyDist = dir < 0 ? S.y : H - S.y;
    if (bodyDist > trigger) return;

    // Mantiene viva la persecución aunque el ratón esté quieto en el borde.
    S.lastMove = now;

    const maxY = Math.max(0, document.documentElement.scrollHeight - H);
    if (dir < 0 ? SCY <= 0 : SCY >= maxY - 1) return;

    const t = clamp(1 - bodyDist / trigger, 0, 1);
    const speed = EDGE_MIN_SPEED + (EDGE_MAX_SPEED - EDGE_MIN_SPEED) * t * t;
    S.edge = dir;
    window.scrollBy(0, dir * speed * dt);
    readScroll();   // evita un fotograma con el scroll desfasado
  }

  function update(dt, now) {
    edgeScroll(dt, now);
    const sx = SCX, sy = SCY;

    // --- objetivo: ratón o paseo autónomo ---
    const following = S.inside && now - S.lastMove < 7000;
    let tx, ty, maxSp;
    if (following) {
      tx = S.mx; ty = S.my; maxSp = 440;
    } else {
      const m = Math.min(120, W * 0.2, H * 0.2);
      if (now > S.wanderT || Math.hypot(S.wx - S.x, S.wy - S.y) < 24) {
        S.wx = rand(m, W - m); S.wy = rand(m, H - m);
        S.wanderT = now + rand(2600, 5200);
        S.pauseUntil = Math.random() < 0.4 ? now + rand(500, 1500) : 0;
      }
      tx = S.wx; ty = S.wy;
      maxSp = now < S.pauseUntil ? 0 : 150;
    }
    S.mode = S.edge ? (S.edge < 0 ? 'borde ↑' : 'borde ↓')
      : following ? 'sigue al ratón' : 'explorando';

    // --- cuerpo: dirección con llegada suave ---
    const dx = tx - S.x, dy = ty - S.y, dist = Math.hypot(dx, dy);
    const des = dist < 3 ? 0 : Math.min(maxSp, dist * 3.2);
    const dvx = dist > 0.001 ? (dx / dist) * des : 0;
    const dvy = dist > 0.001 ? (dy / dist) * des : 0;
    const k = 1 - Math.exp(-dt * 6.5);
    S.vx += (dvx - S.vx) * k;
    S.vy += (dvy - S.vy) * k;
    S.x += S.vx * dt;
    S.y += S.vy * dt;
    const sp = Math.hypot(S.vx, S.vy);
    S.sp = sp;

    let want = null;
    if (sp > 16) want = Math.atan2(S.vy, S.vx);
    else if (dist > 36) want = Math.atan2(dy, dx);
    if (want !== null) {
      const da = (((want - S.h) % TAU) + TAU * 1.5) % TAU - Math.PI;
      const mt = (sp > 16 ? 6.5 : 3.2) * dt;
      S.h += clamp(da, -mt, mt);
    }
    S.c = Math.cos(S.h);
    S.s = Math.sin(S.h);
    if (sp > 25) for (const L of legs) L.settled = false;

    // --- progreso de los pasos en curso ---
    for (const L of legs) {
      if (!L.stepping) continue;
      L.t += dt / L.dur;
      if (L.t >= 1) {
        L.stepping = false; L.t = 0;
        L.anchor = L.to; L.from = L.to = null;
        L.last = now;
        onLand(L, now);
      }
    }

    // --- posiciones ideales y pies ---
    const leadT = clamp(0.18 + sp / 2400, 0.18, 0.34);
    const rightX = -S.s, rightY = S.c;
    let lat = 0, nPl = 0;
    for (const L of legs) {
      const d = L.d;
      const [rx, ry] = localToWorld(d.rx, L.side * d.ry, S.x, S.y);
      let lx = S.vx * leadT, ly = S.vy * leadT;
      const lm = Math.hypot(lx, ly), lmax = d.reach * 0.55 * S.scale;
      if (lm > lmax) { lx *= lmax / lm; ly *= lmax / lm; }
      L.ix = rx + lx; L.iy = ry + ly;

      if (L.stepping) {
        const e = easeInOut(L.t);
        const [ax, ay] = anchorDoc(L.from), [bx, by] = anchorDoc(L.to);
        L.px = lerp(ax, bx, e) - sx;
        L.py = lerp(ay, by, e) - sy;
        L.lift = Math.sin(Math.PI * L.t);
      } else {
        const [ax, ay] = anchorDoc(L.anchor);
        L.px = ax - sx; L.py = ay - sy; L.lift = 0;
        lat += (L.px - rx) * rightX + (L.py - ry) * rightY;
        nPl++;
      }
    }

    // Balanceo lateral del cuerpo según los apoyos + leve rebote al dar pasos.
    const sway = nPl ? clamp((lat / nPl) * 0.16, -5, 5) * S.scale : 0;
    const ks = 1 - Math.exp(-dt * 9);
    S.swX += (rightX * sway - S.swX) * ks;
    S.swY += (rightY * sway - S.swY) * ks;
    let bob = 0;
    for (const L of legs) bob += L.lift;
    S.bob += ((bob / 4) * 2.4 * S.scale - S.bob) * ks;
    S.rx = S.x + S.swX;
    S.ry = S.y + S.swY;
    for (const L of legs) [L.hx, L.hy] = localToWorld(L.d.hx, L.side * L.d.hy, S.rx, S.ry - S.bob);

    // --- decidir qué patas dan un paso ---
    const dur = clamp(0.15 - sp / 5200, 0.075, 0.15);
    const thr = 30 * S.scale + sp * 0.02;
    const cand = [];
    for (const L of legs) {
      if (L.stepping) continue;
      const dd = Math.hypot(L.px - L.ix, L.py - L.iy);
      const reachMax = (L.d.l1 + L.d.l2 + L.d.l3) * S.scale;
      const hd = Math.hypot(L.px - L.hx, L.py - L.hy);
      // Ángulo del pie en el marco local del cuerpo: si la araña gira y el pie queda
      // muy desviado de su ángulo de reposo (o cruza bajo el cuerpo), el paso es urgente.
      const fxl = (L.px - L.hx) * S.c + (L.py - L.hy) * S.s;
      const fyl = (-(L.px - L.hx) * S.s + (L.py - L.hy) * S.c) * L.side;
      const angDev = Math.abs(Math.atan2(fyl, fxl) - L.d.ang * DEG);
      const crossed = fyl < 4 * S.scale;
      const urgent = dd > thr * 2.4 || hd > reachMax * 1.02 || angDev > 0.75 || crossed;
      const settle = !L.settled && sp < 10 && dd > 9 * S.scale && now - L.last > 220;
      if (urgent || dd > thr || settle) cand.push({ L, dd, urgent, settle: settle && !(dd > thr) && !urgent });
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
        if (cur === S.lastGroup && need[1 - cur] > 0) cur = 1 - cur;   // alterna los grupos
      }
      for (const c of cand) {
        // Fuera de turno solo si es urgente y ninguna pata vecina del mismo lado está en el aire.
        const neighbourUp = legs.some((o) => o.stepping && o.side === c.L.side && Math.abs(o.j - c.L.j) === 1);
        const ok = (c.L.group === cur && canJoin) || (c.urgent && (c.dd > thr * 3.2 || !neighbourUp));
        if (!ok) continue;
        if (c.settle) c.L.settled = true;
        startStep(c.L, dur);
        S.lastGroup = c.L.group;
      }
    }

    // Golpecitos ocasionales con las patas delanteras cuando está quieta.
    if (sp < 10 && now > S.nextTap) {
      S.nextTap = now + rand(900, 2400);
      if (!legs.some((l) => l.stepping)) {
        const L = legs[(Math.random() < 0.5 ? 0 : 4) + (Math.random() < 0.7 ? 0 : 1)];
        startStep(L, 0.17, 26 * S.scale);
      }
    } else if (sp >= 10) {
      S.nextTap = Math.max(S.nextTap, now + 800);
    }

    for (const L of legs) solveLeg(L);

    // --- efectos ---
    updateThreads(dt, now);
    updateShots(now);
    for (let k = impacts.length - 1; k >= 0; k--) if (now - impacts[k].t0 > impacts[k].dur) impacts.splice(k, 1);
    if (S.drag) {
      const [gx, gy] = anchorDoc(S.drag), [px, py] = spinneretDoc();
      if (Math.hypot(px - gx, py - gy) > 900) S.drag = null;   // se rompe si se estira demasiado
    }
  }

  /* ================================================================
     6. Dibujo
     ================================================================ */
  function ell(x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); }
  function dot(x, y, r) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }

  function strokeRope(P) {
    ctx.beginPath();
    ctx.moveTo(P[0].x, P[0].y);
    for (let k = 1; k < P.length - 1; k++) {
      ctx.quadraticCurveTo(P[k].x, P[k].y, (P[k].x + P[k + 1].x) / 2, (P[k].y + P[k + 1].y) / 2);
    }
    const l = P[P.length - 1];
    ctx.lineTo(l.x, l.y);
    ctx.stroke();
  }

  function drawWraps(now) {
    ctx.lineWidth = 0.7;
    for (const wp of wraps) {
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

  function drawThreads(now) {
    const top = SCY - 200, bottom = SCY + H + 200;
    for (const T of threads) {
      const P = T.pts, last = P[P.length - 1];
      if (Math.max(P[0].y, last.y) < top || Math.min(P[0].y, last.y) > bottom) continue;
      const age = now - T.t0;
      const a = Math.min(1, age / 250) * clamp((T.life - age) / 3500, 0, 1);
      if (a <= 0) continue;
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = `rgba(236,236,240,${0.6 * a})`;
      strokeRope(P);
      // destello de luz que recorre el hilo
      const u = (now / 1800 + T.seed) % 1;
      const idx = u * (P.length - 1), k0 = Math.floor(idx), f = idx - k0;
      const p0 = P[k0], p1 = P[Math.min(k0 + 1, P.length - 1)];
      ctx.fillStyle = `rgba(255,255,255,${0.9 * a})`;
      ctx.beginPath();
      dot(lerp(p0.x, p1.x, f), lerp(p0.y, p1.y, f), 1.3);
      dot(P[0].x, P[0].y, 1.8);
      dot(last.x, last.y, 1.8);
      ctx.fill();
    }
  }

  function drawImpacts(now) {
    for (const I of impacts) {
      const age = (now - I.t0) / I.dur;
      if (age >= 1) continue;
      const grow = 1 - Math.pow(1 - Math.min(1, age * 2.6), 3);
      const fade = 1 - age;
      // filamentos de seda que salen del punto de apoyo
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = `rgba(240,240,244,${0.75 * fade})`;
      ctx.beginPath();
      for (const st of I.strands) {
        const L = st.len * grow;
        ctx.moveTo(I.x, I.y);
        ctx.quadraticCurveTo(
          I.x + Math.cos(st.a + st.bend) * L * 0.5, I.y + Math.sin(st.a + st.bend) * L * 0.5,
          I.x + Math.cos(st.a) * L, I.y + Math.sin(st.a) * L,
        );
      }
      ctx.stroke();
      ctx.strokeStyle = `rgba(141,255,60,${0.7 * fade})`;
      ctx.beginPath();
      ctx.arc(I.x, I.y, (3 + age * 10) * S.scale, 0, TAU);
      ctx.stroke();
      // rectángulos RGB desplazados + franjas de escaneo sobre la palabra
      if (I.i >= 0 && age < 0.4) {
        const w = words[I.i], q = 1 - age / 0.4, j = (Math.random() - 0.5) * 4;
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(47,230,255,${0.9 * q})`;
        ctx.strokeRect(w.x - 2 + j, w.y - 1, w.w + 4, w.h + 2);
        ctx.strokeStyle = `rgba(255,61,240,${0.9 * q})`;
        ctx.strokeRect(w.x - j, w.y, w.w + 4, w.h + 2);
        ctx.fillStyle = `rgba(${I.rgb},${0.3 * q})`;
        for (let k = 0; k < 2; k++) ctx.fillRect(w.x - 6 + Math.random() * 8, w.y + Math.random() * w.h, w.w * rand(0.4, 1.2), rand(1, 3));
      }
    }
  }

  function drawShots(now) {
    if (!shots.length) return;
    const [sx, sy] = spinneretDoc();
    ctx.lineWidth = 1;
    for (const s of shots) {
      const e = easeInOut(clamp((now - s.t0) / s.dur, 0, 1));
      const [bx, by] = anchorDoc(s.to);
      ctx.strokeStyle = 'rgba(255,255,255,.95)';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(lerp(sx, bx, e), lerp(sy, by, e));
      ctx.stroke();
    }
  }

  function drawDragline(now) {
    if (!S.silk || !S.drag) return;
    const [ax, ay] = anchorDoc(S.drag);
    const x0 = ax - SCX, y0 = ay - SCY;
    const [x1, y1] = spinneretView();
    const d = Math.hypot(x1 - x0, y1 - y0);
    const sag = Math.min(28, d * 0.08);
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = 'rgba(245,245,248,.85)';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo((x0 + x1) / 2 + Math.sin(now / 400) * 2, (y0 + y1) / 2 + sag, x1, y1);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    dot(x0, y0, 2);
    ctx.fill();
  }

  const EYES = [[11.6, 1.6, 1.55], [10.6, 4.2, 1.15], [9, 2.4, 1.0], [8.1, 4.9, 0.95]];

  function drawSpider(now) {
    const sc = S.scale;

    // sombra del cuerpo
    ctx.save();
    ctx.translate(S.rx + 5 * sc, S.ry + 9 * sc);
    ctx.rotate(S.h);
    ctx.scale(sc, sc);
    ctx.fillStyle = 'rgba(0,0,0,.38)';
    ell(-12, 0, 40, 17);
    ctx.fill();
    ctx.restore();

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // sombra de las patas
    ctx.strokeStyle = 'rgba(0,0,0,.42)';
    ctx.lineWidth = 2.2 * sc;
    ctx.beginPath();
    for (const L of legs) {
      ctx.moveTo(L.shx, L.shy);
      ctx.lineTo(L.skx, L.sky);
      ctx.lineTo(L.sax, L.say);
      ctx.lineTo(L.sfx, L.sfy);
    }
    ctx.stroke();

    // patas: fémur, tibia, tarso
    ctx.strokeStyle = COL.leg;
    const segs = [[2.8, 'h', 'k'], [2.1, 'k', 'a'], [1.4, 'a', 'f']];
    for (const [lw, s0, s1] of segs) {
      ctx.lineWidth = lw * sc;
      ctx.beginPath();
      for (const L of legs) {
        ctx.moveTo(L[s0 + 'x'], L[s0 + 'y']);
        ctx.lineTo(L[s1 + 'x'], L[s1 + 'y']);
      }
      ctx.stroke();
    }

    // articulaciones
    ctx.save();
    ctx.shadowColor = COL.joint;
    ctx.shadowBlur = 7;
    ctx.fillStyle = COL.joint;
    ctx.beginPath();
    for (const L of legs) {
      dot(L.kx, L.ky, 2.9 * sc);
      dot(L.ax, L.ay, 2.3 * sc);
      if (!L.stepping) dot(L.fx, L.fy, 3.2 * sc);
    }
    ctx.fill();
    ctx.strokeStyle = COL.joint;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (const L of legs) if (L.stepping) dot(L.fx, L.fy, (3 + L.lift * 2.5) * sc);
    ctx.stroke();
    ctx.restore();

    // cuerpo
    ctx.save();
    ctx.translate(S.rx, S.ry - S.bob);
    ctx.rotate(S.h);
    ctx.scale(sc, sc);

    // abdomen (opistosoma) con marca de reloj de arena
    const br = 1 + Math.sin(now / 480) * 0.025;
    ctx.save();
    ctx.translate(-25, 0);
    ctx.scale(br, br);
    let g = ctx.createRadialGradient(4, -5, 1, 0, 0, 22);
    g.addColorStop(0, '#45121a');
    g.addColorStop(0.5, '#1a0609');
    g.addColorStop(1, '#070203');
    ctx.fillStyle = g;
    ell(0, 0, 21, 15.5);
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = COL.leg;
    ctx.stroke();
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = 'rgba(255,59,47,.3)';
    ell(0, 0, 14.5, 10.5); ctx.stroke();
    ell(0, 0, 8, 5.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-21, 0); ctx.lineTo(21, 0); ctx.stroke();
    ctx.fillStyle = COL.red;
    ctx.shadowColor = COL.red;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(-9, -4.2); ctx.lineTo(-9, 4.2); ctx.lineTo(-1.2, 0); ctx.closePath();
    ctx.moveTo(9, -4.2); ctx.lineTo(9, 4.2); ctx.lineTo(1.2, 0); ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,.13)';
    ell(6, -7.5, 7, 2.4, -0.25);
    ctx.fill();
    ctx.restore();

    // hileras y pedicelo
    ctx.fillStyle = COL.leg;
    ctx.beginPath();
    ctx.moveTo(-45.2, -2.4); ctx.lineTo(-50, 0); ctx.lineTo(-45.2, 2.4); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2b0b10';
    ctx.fillRect(-6.5, -2.4, 4, 4.8);

    // quelíceros y pedipalpos
    const tw = Math.sin(now / 170) * 1.2;
    ctx.fillStyle = '#1d0609';
    ctx.strokeStyle = COL.leg;
    ctx.lineWidth = 0.9;
    for (const s of [-1, 1]) { ell(15.8, s * 3.1, 3.8, 2.6); ctx.fill(); ctx.stroke(); }
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const s of [-1, 1]) {
      ctx.moveTo(12, s * 6);
      ctx.lineTo(19.5, s * (10 + tw));
      ctx.lineTo(25, s * (7.5 + tw * 0.5));
    }
    ctx.stroke();

    // cefalotórax (prosoma)
    g = ctx.createRadialGradient(6, -3, 1, 3, 0, 15);
    g.addColorStop(0, '#3d1016');
    g.addColorStop(0.55, '#16050a');
    g.addColorStop(1, '#060203');
    ctx.fillStyle = g;
    ell(3, 0, 13.5, 10.5);
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

    // ojos y articulaciones de los pedipalpos
    ctx.fillStyle = COL.joint;
    ctx.shadowColor = COL.joint;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    for (const [ex, ey, r] of EYES) for (const s of [-1, 1]) dot(ex, s * ey, r);
    for (const s of [-1, 1]) { dot(19.5, s * (10 + tw), 1.5); dot(25, s * (7.5 + tw * 0.5), 1.3); }
    ctx.fill();
    ctx.restore();
  }

  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(-SCX, -SCY);   // capa en coordenadas de documento
    drawWraps(now);
    if (S.silk) drawThreads(now);
    drawImpacts(now);
    drawShots(now);
    ctx.restore();
    drawDragline(now);
    drawSpider(now);
  }

  /* ================================================================
     7. HUD
     ================================================================ */
  const hud = {
    root: document.getElementById('hud'),
    mode: document.getElementById('h-mode'),
    anch: document.getElementById('h-anch'),
    steps: document.getElementById('h-steps'),
    words: document.getElementById('h-words'),
    threads: document.getElementById('h-threads'),
    cells: Array.from(document.querySelectorAll('.gait i')),
    cellState: new Array(8).fill(''),
    last: 0,
  };

  function updateHud(now) {
    for (let k = 0; k < legs.length; k++) {
      const st = legs[k].stepping ? 'up' : 'on';
      if (hud.cellState[k] !== st) {
        hud.cellState[k] = st;
        hud.cells[k].classList.toggle('on', st === 'on');
        hud.cells[k].classList.toggle('up', st === 'up');
      }
    }
    if (now - hud.last < 120) return;
    hud.last = now;
    hud.mode.textContent = S.mode;
    hud.anch.textContent = `${legs.filter((l) => !l.stepping && l.anchor && l.anchor.i >= 0).length}/8`;
    hud.steps.textContent = S.steps;
    hud.words.textContent = S.touched.size;
    hud.threads.textContent = threads.length + (S.silk && S.drag ? 1 : 0);
  }

  const btnSilk = document.getElementById('b-silk');
  const btnSize = document.getElementById('b-size');
  const btnMin = document.getElementById('b-min');

  document.getElementById('b-clear').addEventListener('click', () => {
    for (const i of Array.from(marked)) clearMark(i);
    wraps.length = 0;
    threads.length = 0;
    shots.length = 0;
    S.drag = null;
  });
  btnSilk.addEventListener('click', () => {
    S.silk = !S.silk;
    btnSilk.setAttribute('aria-pressed', String(S.silk));
    btnSilk.textContent = S.silk ? 'Seda: sí' : 'Seda: no';
    if (!S.silk) { threads.length = 0; wraps.length = 0; shots.length = 0; S.drag = null; }
  });
  btnSize.addEventListener('click', () => {
    S.sizeIdx = (S.sizeIdx + 1) % SIZES.length;
    S.scale = SIZES[S.sizeIdx].v;
    btnSize.textContent = 'Tamaño: ' + SIZES[S.sizeIdx].label;
    for (const L of legs) L.settled = false;
  });
  btnMin.addEventListener('click', () => {
    const min = hud.root.classList.toggle('min');
    btnMin.textContent = min ? '+' : '–';
    btnMin.setAttribute('aria-expanded', String(!min));
    btnMin.setAttribute('aria-label', min ? 'Expandir panel' : 'Contraer panel');
  });

  /* ================================================================
     8. Entrada
     ================================================================ */
  function setPointer(x, y) {
    S.mx = x; S.my = y;
    S.inside = true;
    S.lastMove = performance.now();
  }
  window.addEventListener('pointermove', (e) => setPointer(e.clientX, e.clientY), { passive: true });
  window.addEventListener('pointerdown', (e) => setPointer(e.clientX, e.clientY), { passive: true });
  window.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) setPointer(t.clientX, t.clientY); }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => { S.inside = false; });
  window.addEventListener('blur', () => { S.inside = false; });

  // Clic en una palabra: la araña dispara un hilo de seda hacia ella.
  document.addEventListener('click', (e) => {
    if (e.target.closest('a, button, .hud')) return;
    const to = makeAnchor(e.clientX + window.scrollX, e.clientY + window.scrollY, 90, null);
    if (to.i < 0) return;
    if (S.silk) shots.push({ to, t0: performance.now(), dur: 220 });
    else touchWord(to.i, 1);
  });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    resizeCanvas();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(measure, 150);
  });
  window.addEventListener('scroll', readScroll, { passive: true });

  /* ================================================================
     9. Arranque
     ================================================================ */
  resizeCanvas();
  wrapWords(document.body);
  holdCount = new Uint16Array(words.length);
  measure();
  readScroll();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);

  S.x = S.wx = W * 0.62;
  S.y = S.wy = Math.min(H * 0.45, 420);
  S.rx = S.x; S.ry = S.y;
  S.mx = S.x; S.my = S.y;
  S.c = Math.cos(S.h); S.s = Math.sin(S.h);
  for (const L of legs) {
    const [rx, ry] = localToWorld(L.d.rx, L.side * L.d.ry, S.x, S.y);
    L.ix = rx; L.iy = ry;
    L.anchor = makeAnchor(rx + SCX, ry + SCY, 44, isTakenBy(L));
    if (L.anchor.i >= 0) hold(L, L.anchor.i);
  }

  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
    lastT = now;
    readScroll();
    update(dt, now);
    draw(now);
    updateHud(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
