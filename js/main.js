/**
 * main.js
 * Punto de entrada principal de Arachnopedia / Araneae.proc
 * Orquestación de módulos, bucle de animación a 60 FPS y ciclo de vida de la aplicación.
 */
import { wrapWords, measureWords, makeAnchor, holdWord } from './core/wordManager.js';
import { setupInput, edgeScroll } from './core/input.js';
import { createSpider, localToWorld, updateSpider } from './entities/spider.js';
import { createLegs, isTakenBy } from './entities/leg.js';
import {
  threads,
  impacts,
  shots,
  wraps,
  addWrap,
  removeWrap,
  clearAllSilk,
  updateThreads,
  updateShots,
  cleanExpiredImpacts,
} from './effects/silkSimulation.js';
import { clearAllMarks, touchWord } from './effects/glitchEffects.js';
import { renderAll } from './rendering/renderer.js';
import { createHudController } from './ui/hud.js';

(() => {
  'use strict';

  // --- 1. Inicialización de Canvas 2D ---
  const cvs = document.getElementById('spider-canvas');
  if (!cvs) return;
  const ctx = cvs.getContext('2d');

  const viewport = { W: 0, H: 0 };
  const scroll = { x: 0, y: 0 };

  function readScroll() {
    scroll.x = window.scrollX;
    scroll.y = window.scrollY;
  }

  function resizeCanvas() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    viewport.W = window.innerWidth;
    viewport.H = window.innerHeight;
    cvs.width = Math.round(viewport.W * dpr);
    cvs.height = Math.round(viewport.H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // --- 2. Preparación del DOM y Modelo Espacial ---
  window.__ARANEAE_INITIALIZED__ = true;
  resizeCanvas();
  wrapWords(document.body);
  measureWords();
  readScroll();

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(measureWords);
  }

  // --- 3. Instanciación de Entidades ---
  const spider = createSpider(viewport.W, viewport.H);
  const legs = createLegs();
  const silkData = { threads, impacts, shots, wraps };

  // Posicionamiento y anclaje inicial de las 8 patas sobre palabras reales
  for (let i = 0; i < legs.length; i++) {
    const L = legs[i];
    const [rx, ry] = localToWorld(
      L.d.rx,
      L.side * L.d.ry,
      spider.x,
      spider.y,
      spider.scale,
      spider.c,
      spider.s
    );
    L.ix = rx;
    L.iy = ry;
    L.anchor = makeAnchor(rx + scroll.x, ry + scroll.y, 44, isTakenBy(L, legs));
    if (L.anchor.i >= 0) {
      holdWord(L, L.anchor.i);
    }
  }

  // --- 4. HUD y Controles de Usuario ---
  const hud = createHudController(spider, legs, silkData, {
    onClear: () => {
      clearAllMarks(removeWrap);
      clearAllSilk();
    },
    onSilkDisabled: () => {
      clearAllSilk();
    },
  });

  // --- 5. Captura de Eventos de Entrada ---
  setupInput(spider, scroll, () => viewport, (toWordAnchor) => {
    if (spider.silk) {
      shots.push({ to: toWordAnchor, t0: performance.now(), dur: 220 });
    } else {
      touchWord(toWordAnchor.i, 1, spider.silk, addWrap);
    }
  });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    resizeCanvas();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(measureWords, 150);
  });

  window.addEventListener('scroll', readScroll, { passive: true });

  // --- 6. Bucle Principal de Animación (Game Loop) ---
  let lastT = performance.now();

  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
    lastT = now;

    readScroll();

    // Auto-scroll cinético en márgenes
    edgeScroll(dt, now, spider, scroll, () => viewport, readScroll);

    // Actualización de estado y marcha de la araña
    updateSpider(spider, dt, now, scroll, viewport, legs, {
      onAddWrap: (wordIndex) => addWrap(wordIndex),
    });

    // Simulación de física de seda y disparos
    updateThreads(dt, now, spider.rx + scroll.x, spider.ry + scroll.y, spider.scale);
    updateShots(
      now,
      () => [spider.rx + scroll.x, spider.ry + scroll.y],
      spider.scale,
      spider.silk,
      (targetAnchor) => {
        touchWord(targetAnchor.i, 1, spider.silk, addWrap);
      }
    );
    cleanExpiredImpacts(now);

    // Renderizado en Canvas 2D
    renderAll(ctx, now, viewport, scroll, spider, legs, silkData);

    // Actualización de telemetría en HUD
    hud.updateHud(now);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
