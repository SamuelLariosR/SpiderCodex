/**
 * constants.js
 * Constantes geométricas, paleta de renderizado, parámetros físicos y anatómicos
 */

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const COL = {
  leg: '#ff3b2f',
  joint: '#8dff3c',
  mag: '#ff3df0',
  cyan: '#2fe6ff',
  lime: '#7dff4a',
  amber: '#ffcc33',
  blue: '#4d6bff',
  red: '#ff3030',
};

export const SLICE_RGB = ['47,230,255', '255,61,240', '125,255,74', '255,204,51'];

// Definición base de las 4 patas por lado (coxa/trocánter, ángulo y longitudes)
export const LEGDEF = [
  { hx: 9,  hy: 5.5, ang: 30,  reach: 104, l1: 52, l2: 56, l3: 18 },
  { hx: 4,  hy: 8,   ang: 70,  reach: 86,  l1: 44, l2: 46, l3: 15 },
  { hx: -2, hy: 8,   ang: 112, reach: 84,  l1: 42, l2: 46, l3: 15 },
  { hx: -7, hy: 5.5, ang: 150, reach: 100, l1: 50, l2: 54, l3: 18 },
];

for (const d of LEGDEF) {
  d.rx = d.hx + Math.cos(d.ang * DEG) * d.reach;
  d.ry = d.hy + Math.sin(d.ang * DEG) * d.reach;
}

export const SIZES = [
  { label: 'S', v: 0.75 },
  { label: 'M', v: 1.0 },
  { label: 'L', v: 1.4 },
];

// Tamaño en píxeles de cada celda de la rejilla espacial
export const CELL = 72;

// Parámetros de proyección pseudo-3D e iluminación de extremidades
export const LAT = 0.45;
export const LIGHT_X = 0.3;
export const LIGHT_Y = 0.5;

// Configuración del scroll automático en bordes del viewport
export const EDGE_ZONE = 100;
export const EDGE_MARGIN = 60;
export const EDGE_MIN_SPEED = 60;
export const EDGE_MAX_SPEED = 380;

// Caracteres utilizados para el efecto de texto revuelto (glitch)
export const GLYPHS = '!<>-_\\/[]{}=+*^?#%&$@|~:;01ΔΞΣΨ░▒▓';

// Tipos de alteraciones visuales en palabras pisadas
export const MARKS = [
  { v: 'box',  w: 5, cols: [COL.mag, COL.cyan, COL.lime, COL.amber] },
  { v: 'inv',  w: 3, cols: [COL.cyan, COL.lime, COL.mag, COL.blue] },
  { v: 'rot',  w: 4, cols: [COL.red, COL.mag, COL.amber, COL.cyan] },
  { v: 'mono', w: 3, cols: [COL.red] },
  { v: 'big',  w: 2, cols: [COL.cyan, COL.lime] },
  { v: 'red',  w: 2, cols: [COL.red] },
];

export const MARK_TOTAL = MARKS.reduce((s, m) => s + m.w, 0);
export const MARK_CLASSES = ['mk', ...MARKS.map((m) => 'mk-' + m.v)];

// Disposición anatómica de los 8 ojos principales y secundarios
export const EYES = [
  [11.6, 1.6, 1.55],
  [10.6, 4.2, 1.15],
  [9.0, 2.4, 1.0],
  [8.1, 4.9, 0.95],
];
