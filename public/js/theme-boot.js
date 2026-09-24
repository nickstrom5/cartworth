// Apply the saved theme before first paint, so a visitor who chose dark never sees a white flash.
//
// A classic script loaded from <head> — not a module (modules are deferred, too late to beat the
// first paint) and not inline (the static host ships script-src 'self', which blocks inline
// scripts; see the note in index.html).
//
// The key and its JSON encoding are the ones the theme toggle actually writes: setPref('theme')
// in public/js/store.js stores `cartworth:v1:pref:theme` = '"dark"'. The inline snippet this
// replaces read `cartworth:theme`, a key nothing in the app has ever written, so the saved theme
// was never applied on load at all — not before paint, and not after, since main.js only applies
// the theme when the toggle is clicked. test/qa-app-behaviour.test.js pins the round trip.
try {
  const t = JSON.parse(localStorage.getItem('cartworth:v1:pref:theme') || 'null');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch {}
