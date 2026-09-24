// Checks the store colour palette the way a user actually sees it: eight small dots that must stay
// tellable apart, including for the ~8% of men with a colour-vision deficiency.
//
// For each palette it simulates normal, protanope, deuteranope and tritanope vision (Viénot 1999
// LMS projection) and reports the smallest perceptual distance (CIE76 dE) between any two colours.
// A categorical palette wants every pair above ~20 dE under every vision type; below that, two
// stores read as "the same colour" on a 9px dot.
//
//   node scripts/check-palette.js

const PALETTES = {
  current_light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  current_dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
  // Okabe-Ito, the standard colour-vision-deficiency-safe categorical set, with its pale yellow
  // swapped for a darker amber so it survives a white background, and black swapped for a brown.
  okabe_light: ['#0072b2', '#d55e00', '#009e73', '#9a6c00', '#cc79a7', '#56b4e9', '#5a4fa2', '#8c564b'],
  okabe_dark: ['#4aa3df', '#f07f2e', '#1fbf94', '#e0a72a', '#e295c0', '#8ed0f5', '#9d93e8', '#c08a7e'],
};

// ---- colour maths ----
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToRgb(h) {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

function rgbToLab([r, g, b]) {
  const [R, G, B] = [r, g, b].map(srgbToLinear);
  const X = R * 0.4124 + G * 0.3576 + B * 0.1805;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = R * 0.0193 + G * 0.1192 + B * 0.9505;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(X / 0.95047), f(Y / 1), f(Z / 1.08883)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const dE = (a, b) => Math.hypot(...rgbToLab(a).map((v, i) => v - rgbToLab(b)[i]));

// Viénot, Brettel & Mollon (1999) dichromat simulation via the LMS space.
const RGB_TO_LMS = [
  [0.31399022, 0.63951294, 0.04649755],
  [0.15537241, 0.75789446, 0.08670142],
  [0.01775239, 0.10944209, 0.87256922],
];
const LMS_TO_RGB = [
  [5.47221206, -4.6419601, 0.16963708],
  [-1.1252419, 2.29317094, -0.1678952],
  [0.02980165, -0.19318073, 1.16364789],
];
const SIM = {
  protan: [[0, 1.05118294, -0.05116099], [0, 1, 0], [0, 0, 1]],
  deutan: [[1, 0, 0], [0.9513092, 0, 0.04866992], [0, 0, 1]],
  tritan: [[1, 0, 0], [0, 1, 0], [-0.86744736, 1.86727089, 0]],
};

const mul = (m, v) => m.map((row) => row.reduce((s, x, i) => s + x * v[i], 0));

function simulate(rgb, kind) {
  if (kind === 'normal') return rgb;
  const lin = rgb.map(srgbToLinear);
  const out = mul(LMS_TO_RGB, mul(SIM[kind], mul(RGB_TO_LMS, lin)));
  return out.map((c) => Math.min(1, Math.max(0, linearToSrgb(c))));
}

/** Contrast ratio against a background, so a dot is visible at all. */
function contrast(rgb, bg) {
  const lum = (c) => {
    const [r, g, b] = c.map(srgbToLinear);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [lum(rgb), lum(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

const VISIONS = ['normal', 'protan', 'deutan', 'tritan'];

function report(name, hexes, bgHex) {
  const rgbs = hexes.map(hexToRgb);
  const bg = hexToRgb(bgHex);
  console.log(`\n${name}  (on ${bgHex})`);
  let worstOverall = { d: Infinity };
  for (const vision of VISIONS) {
    const sim = rgbs.map((c) => simulate(c, vision));
    let worst = { d: Infinity };
    for (let i = 0; i < sim.length; i++) {
      for (let j = i + 1; j < sim.length; j++) {
        const d = dE(sim[i], sim[j]);
        if (d < worst.d) worst = { d, i, j };
      }
    }
    const flag = worst.d < 20 ? '  ✗ too close' : worst.d < 25 ? '  ~ marginal' : '  ok';
    console.log(`  ${vision.padEnd(7)} worst pair: slot ${worst.i + 1} ${hexes[worst.i]} vs slot ${worst.j + 1} ${hexes[worst.j]}  dE=${worst.d.toFixed(1)}${flag}`);
    if (worst.d < worstOverall.d) worstOverall = { ...worst, vision };
  }
  const lowContrast = hexes.filter((h) => contrast(hexToRgb(h), bg) < 2.2);
  if (lowContrast.length) console.log(`  low contrast vs background: ${lowContrast.join(', ')}`);
  console.log(`  => minimum separation ${worstOverall.d.toFixed(1)} dE (${worstOverall.vision})`);
  return worstOverall.d;
}

report('current (light theme)', PALETTES.current_light, '#ffffff');
report('current (dark theme)', PALETTES.current_dark, '#141414');
report('Okabe-Ito adapted (light theme)', PALETTES.okabe_light, '#ffffff');
report('Okabe-Ito adapted (dark theme)', PALETTES.okabe_dark, '#141414');

// ---- search for a better palette ----
// Eight categorical colours cannot all stay distinct under every colour-vision deficiency at once
// (tritanopia in particular collapses the yellow-blue axis). So optimise for normal vision plus
// protanopia and deuteranopia, which together cover ~8% of men, and rely on the store NAME rather
// than the dot alone wherever a reader must tell two stores apart.
function labToRgb([L, a, bb]) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - bb / 200;
  const inv = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const [X, Y, Z] = [inv(fx) * 0.95047, inv(fy), inv(fz) * 1.08883];
  const lin = [
    X * 3.2404542 + Y * -1.5371385 + Z * -0.4985314,
    X * -0.969266 + Y * 1.8760108 + Z * 0.041556,
    X * 0.0556434 + Y * -0.2040259 + Z * 1.0572252,
  ];
  if (lin.some((c) => c < -0.002 || c > 1.002)) return null; // outside sRGB
  return lin.map((c) => Math.min(1, Math.max(0, linearToSrgb(c))));
}
const toHex = (rgb) => '#' + rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');

function search(bgHex, Lrange) {
  const bg = hexToRgb(bgHex);
  const pool = [];
  for (let L = Lrange[0]; L <= Lrange[1]; L += 4)
    for (let a = -80; a <= 90; a += 6)
      for (let b = -90; b <= 90; b += 6) {
        const rgb = labToRgb([L, a, b]);
        if (!rgb) continue;
        const c = contrast(rgb, bg);
        if (c < 2.6 || c > 13) continue;
        pool.push(rgb);
      }
  const visions = ['normal', 'protan', 'deutan'];
  const cache = pool.map((c) => visions.map((v) => rgbToLab(simulate(c, v))));
  const sep = (i, j) => Math.min(...cache[i].map((li, k) => Math.hypot(...li.map((v, x) => v - cache[j][k][x]))));

  let best = null;
  for (let seed = 0; seed < pool.length; seed += 7) {
    const chosen = [seed];
    for (let n = 1; n < 8; n++) {
      let pick = -1;
      let pickScore = -1;
      for (let i = 0; i < pool.length; i++) {
        if (chosen.includes(i)) continue;
        let m = Infinity;
        for (const c of chosen) m = Math.min(m, sep(i, c));
        if (m > pickScore) { pickScore = m; pick = i; }
      }
      chosen.push(pick);
    }
    let worst = Infinity;
    for (let i = 0; i < chosen.length; i++) for (let j = i + 1; j < chosen.length; j++) worst = Math.min(worst, sep(chosen[i], chosen[j]));
    if (!best || worst > best.worst) best = { worst, hexes: chosen.map((i) => toHex(pool[i])) };
  }
  return best;
}

if (process.argv.includes('--search')) {
  for (const [name, bg, Lr] of [['light', '#ffffff', [30, 62]], ['dark', '#141414', [55, 88]]]) {
    const r = search(bg, Lr);
    console.log(`\nbest ${name} palette (min ${r.worst.toFixed(1)} dE across normal/protan/deutan):`);
    console.log('  ' + r.hexes.join(', '));
  }
}
