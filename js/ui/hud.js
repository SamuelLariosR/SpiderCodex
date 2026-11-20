/**
 * hud.js
 * Panel HUD de telemetría (modo, patas ancladas, pasos, palabras, hilos),
 * monitor de marcha visual y botones de control del usuario.
 */
import { SIZES } from '../config/constants.js';

export function createHudController(spider, legs, silk, callbacks) {
  const elements = {
    root: document.getElementById('hud'),
    mode: document.getElementById('h-mode'),
    anch: document.getElementById('h-anch'),
    steps: document.getElementById('h-steps'),
    words: document.getElementById('h-words'),
    threads: document.getElementById('h-threads'),
    cells: Array.from(document.querySelectorAll('.gait i')),
    btnSilk: document.getElementById('b-silk'),
    btnSize: document.getElementById('b-size'),
    btnMin: document.getElementById('b-min'),
    btnClear: document.getElementById('b-clear'),
  };

  const cellState = new Array(8).fill('');
  let lastUpdate = 0;

  // Actualización periódica de telemetría y monitor de marcha
  function updateHud(now) {
    for (let k = 0; k < legs.length; k++) {
      const st = legs[k].stepping ? 'up' : 'on';
      if (cellState[k] !== st) {
        cellState[k] = st;
        if (elements.cells[k]) {
          elements.cells[k].classList.toggle('on', st === 'on');
          elements.cells[k].classList.toggle('up', st === 'up');
        }
      }
    }

    if (now - lastUpdate < 120) return;
    lastUpdate = now;

    if (elements.mode) elements.mode.textContent = spider.mode;
    if (elements.anch) {
      const anchoredCount = legs.filter(
        (l) => !l.stepping && l.anchor && l.anchor.i >= 0
      ).length;
      elements.anch.textContent = `${anchoredCount}/8`;
    }
    if (elements.steps) elements.steps.textContent = spider.steps;
    if (elements.words) elements.words.textContent = spider.touched.size;
    if (elements.threads) {
      elements.threads.textContent =
        silk.threads.length + (spider.silk && spider.drag ? 1 : 0);
    }
  }

  // Configuración de escuchadores de botones
  if (elements.btnClear) {
    elements.btnClear.addEventListener('click', () => {
      if (callbacks && callbacks.onClear) callbacks.onClear();
      spider.drag = null;
    });
  }

  if (elements.btnSilk) {
    elements.btnSilk.addEventListener('click', () => {
      spider.silk = !spider.silk;
      elements.btnSilk.setAttribute('aria-pressed', String(spider.silk));
      elements.btnSilk.textContent = spider.silk ? 'Seda: sí' : 'Seda: no';
      if (!spider.silk) {
        if (callbacks && callbacks.onSilkDisabled) callbacks.onSilkDisabled();
        spider.drag = null;
      }
    });
  }

  if (elements.btnSize) {
    elements.btnSize.addEventListener('click', () => {
      spider.sizeIdx = (spider.sizeIdx + 1) % SIZES.length;
      spider.scale = SIZES[spider.sizeIdx].v;
      elements.btnSize.textContent = 'Tamaño: ' + SIZES[spider.sizeIdx].label;
      for (let i = 0; i < legs.length; i++) {
        legs[i].settled = false;
      }
    });
  }

  if (elements.btnMin) {
    elements.btnMin.addEventListener('click', () => {
      const isMin = elements.root.classList.toggle('min');
      elements.btnMin.textContent = isMin ? '+' : '–';
      elements.btnMin.setAttribute('aria-expanded', String(!isMin));
      elements.btnMin.setAttribute(
        'aria-label',
        isMin ? 'Expandir panel' : 'Contraer panel'
      );
    });
  }

  return { updateHud };
}
