/* ---------------------------------------------------------------------------
   APP_STORE_URL: the one and only place the App Store link is configured.

   Cartworth is live on the App Store ("Cartworth: Grocery Prices", Apple ID
   6816954374, released 6 Nov 2026), so this holds the US listing URL. Every
   element marked data-appstore gets this href and relabels itself with its
   data-appstore text ("Download on the App Store").

   The HTML itself still says "Coming to the App Store" and links to #pricing,
   which is what a visitor without JavaScript sees. Setting this back to an
   empty string restores that state everywhere, for example if the app is ever
   pulled from sale.

   The same app ID is in the apple-itunes-app meta tag and the
   SoftwareApplication JSON-LD in index.html; change all three together.

   If you would rather not rely on JavaScript for the link, you can instead edit
   the href, the label and the btn-soon class of each element marked
   data-appstore directly in the HTML. Keep this file either way: it also holds
   WEB_APP_URL and the missing-image fallback below. See README.md.
   --------------------------------------------------------------------------- */

var APP_STORE_URL = 'https://apps.apple.com/us/app/cartworth-grocery-prices/id6816954374';

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
