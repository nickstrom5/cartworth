// Import this FIRST (before anything from src/): src/db.js opens SQLite at import time.
//
// The sampler never touches the app's real data directory (basket/data). Its session cookies,
// shop lookups and HTTP cache live in BASKET_DATA_DIR, which defaults to /tmp/basket-sampler.
import path from 'node:path';

const dir = process.env.BASKET_DATA_DIR || '/tmp/basket-sampler';
process.env.BASKET_DATA_DIR = dir;
// BASKET_DB would override the path inside the data dir; pin it so a stray value can't point at real data.
process.env.BASKET_DB = path.join(dir, 'basket.db');

// node:sqlite may print an ExperimentalWarning on some Node versions; it's noise for a CLI.
process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w.name === 'ExperimentalWarning') return;
  console.warn(w);
});

export const DATA_DIR = dir;
