// Lets Node import the app's browser modules (public/js/*) unchanged.
//
// In the browser, public/index.html's import map resolves "preact", "preact/hooks" and "htm", and
// the server maps /shared/* and /js/* onto the repo. Node has neither, so this registers the same
// mapping as a resolve hook. The modules under test are the shipped files, byte for byte — nothing
// is copied or rewritten — so a test that imports one exercises exactly what the browser runs.
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BARE = { preact: 'public/vendor/preact.mjs', 'preact/hooks': 'public/vendor/preact-hooks.mjs', htm: 'public/vendor/htm.mjs' };

registerHooks({
  resolve(spec, ctx, next) {
    if (BARE[spec]) return { url: pathToFileURL(path.join(ROOT, BARE[spec])).href, shortCircuit: true };
    if (spec.startsWith('/shared/')) return { url: pathToFileURL(path.join(ROOT, spec)).href, shortCircuit: true };
    if (spec.startsWith('/js/') || spec.startsWith('/vendor/')) return { url: pathToFileURL(path.join(ROOT, 'public', spec)).href, shortCircuit: true };
    return next(spec, ctx);
  },
});

/** Import a public/ module by its path under public/, e.g. importPublic('js/charts.js'). */
export const importPublic = (rel) => import(pathToFileURL(path.join(ROOT, 'public', rel)).href);
