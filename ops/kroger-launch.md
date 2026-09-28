# Turning on Kroger prices (Mariano's, Pick 'n Save, Metro Market, Kroger, Ralphs, Fred Meyer, King Soopers, Fry's, Smith's, QFC, Dillons, Harris Teeter)

Only after Kroger confirms in writing that showing its prices in Cartworth is allowed (draft request:
`marketing/outreach/permission-requests.md`, email 1).

1. Register an application at developer.kroger.com (public tier; scope `product.compact`).
2. On the server, set:
   ```
   KROGER_CLIENT_ID=...
   KROGER_CLIENT_SECRET=...
   ```
   and restart. Every visitor's Kroger-banner stores then price from the API (exact store shelf price,
   card price shown as the sale) instead of Instacart. A visitor's own keys in Settings still win.
3. Watch `GET /api/health` → `kroger`: calls used today and the budget.

What the code already does
- **Daily budget.** The server's keys stop at 9,000 product and 1,400 location calls per UTC day
  (Kroger's public tier is about 10,000 and 1,600). Past that, those stores price from Instacart until
  the next day. Change with `KROGER_DAILY_PRODUCTS` / `KROGER_DAILY_LOCATIONS` if Kroger grants more.
- **Caching by Kroger's rules.** A Kroger answer is kept only as long as its `Cache-Control` allows
  (max-age, capped at 20 minutes; `no-store`, `no-cache` or `private`: not kept). It is never served
  from the saved-prices fallback that other stores use when their site is down.
- **Short searches.** Kroger's search needs 3+ letters; shorter ones say so.
- **Secrets.** Never logged, never in a response, never on disk; tokens cached in memory by a hash of
  the id + secret pair.

Still to confirm with Kroger (ask in the same email thread)
- The exact attribution they require on screen (today each result's source line reads "Exact store
  prices from the Kroger API").
- What to do when a response carries no Cache-Control at all (today: the normal 20-minute cache).
- Whether nearest-store answers (`/locations`, cached 7 days by ZIP) fall under the same caching rule.
