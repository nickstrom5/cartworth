/* ---------------------------------------------------------------------------
   APP_STORE_URL: the one and only place the App Store link is configured.

   The Cartworth listing does not exist yet, so this is deliberately EMPTY.
   While it is empty every App Store button on the site reads
   "Coming to the App Store" and falls back to the pricing section, which is
   the honest state: nothing on the site implies the app is downloadable.

   When the app is approved, paste the URL between the quotes below and
   redeploy. Every button on every page turns into a live App Store link and
   relabels itself. Nothing else needs to change.

     var APP_STORE_URL = 'https://apps.apple.com/us/app/cartworth/id0000000000';

   If you would rather not rely on JavaScript at all, you can instead edit the
   href and the label of each element marked data-appstore directly in the HTML
   and delete this file plus its <script> tags. See README.md.
   --------------------------------------------------------------------------- */

var APP_STORE_URL = '';

/* ---------------------------------------------------------------------------
   WEB_APP_URL: where the free web app lives.

   '/app/' assumes the web app is served from the same origin as this site, which
   is what the committed _redirects and vercel.json expect. Point it at another
   origin (for example 'https://app.cartworth.app') if you host it separately.

   Note for LOCAL PREVIEW: a plain static file server does not read _redirects,
   so /app/ will 404 when you preview this folder with something like
   `python3 -m http.server`. That is the preview server, not the site. Either run
   the site behind a server that honours the rewrites, or temporarily set this to
   the address the web app is actually listening on, e.g. 'http://localhost:4799'.
   --------------------------------------------------------------------------- */
var WEB_APP_URL = '/app/';

/* Images that have not been produced yet must degrade gracefully rather than showing a broken
   icon. This used to be an inline onerror attribute on each <img>, but the site ships
   `script-src 'self'` with no 'unsafe-inline', so the CSP blocked it and the fallback silently
   never ran in production. Doing it here, from an external file, is allowed.

   `error` does not bubble, so the listener is registered in the CAPTURE phase. Images that already
   failed before this script ran are caught by the sweep underneath. */
(function () {
  'use strict';
  function markMissing(img) {
    if (img && img.tagName === 'IMG') img.classList.add('is-missing');
  }
  document.addEventListener('error', function (e) { markMissing(e.target); }, true);
  function sweep() {
    var imgs = document.images;
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].complete && imgs[i].naturalWidth === 0) markMissing(imgs[i]);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sweep);
  else sweep();
})();

(function () {
  'use strict';
  if (WEB_APP_URL && WEB_APP_URL !== '/app/') {
    var webLinks = document.querySelectorAll('a[href="/app/"], [data-webapp]');
    for (var w = 0; w < webLinks.length; w++) {
      webLinks[w].setAttribute('href', WEB_APP_URL);
      if (/^https?:/i.test(WEB_APP_URL)) webLinks[w].setAttribute('rel', 'noopener');
    }
  }
  if (!APP_STORE_URL) return;
  var buttons = document.querySelectorAll('[data-appstore]');
  for (var i = 0; i < buttons.length; i++) {
    var el = buttons[i];
    el.setAttribute('href', APP_STORE_URL);
    el.setAttribute('rel', 'noopener');
    el.classList.add('is-live');
    var label = el.querySelector('[data-appstore-label]');
    if (label) label.textContent = el.getAttribute('data-appstore') || 'Get it on the App Store';
  }
})();
