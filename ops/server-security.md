# Running the Cartworth server in public

From the pre-launch security review (Sept 2026). Defaults are safe; these are the knobs.

| Variable | Default | What it does |
|---|---|---|
| `HOST` | `127.0.0.1` | Listen address. On a loopback address the API also refuses any Host header that is not `localhost`/`127.0.0.1` (DNS rebinding). Set `0.0.0.0` (or the interface) when a proxy sits in front. |
| `BASKET_TRUST_PROXY` | `0` | Number of trusted proxy hops that append to `X-Forwarded-For`. 1 behind one load balancer or CDN. |
| `BASKET_TRUST_CF` | off | Set `1` only when the server is behind Cloudflare: then `CF-Connecting-IP` identifies the visitor. |
| `BASKET_RATE_LIMIT` | 90 | API requests per visitor per minute. |
| `BASKET_COLD_LIMIT` | 600 | Requests to retailer sites per visitor per 10 minutes (cache hits are free). |
| `BASKET_MAX_BACKLOG` | 40 | Requests waiting for one retailer host before new lookups there are shed (visitors get saved prices or "busy"). |
| `BASKET_FRESH_LIMIT` | 12 | Cache-bypassing refreshes per visitor per 10 minutes. |
| `BASKET_HEALTH_TOKEN` | unset | Lets a remote monitor see `/api/health` details by sending `X-Health-Token`. Without it, only requests from the machine itself see them; everyone else gets `{ ok }`. |
| `KROGER_CLIENT_ID` / `KROGER_CLIENT_SECRET` | unset | See `kroger-launch.md`. |
| `KROGER_PER_VISITOR_HOURLY` | 150 | Each visitor's hourly share of the server's Kroger calls. |

Visitors are identified per IPv4 address or per IPv6 /64.

What the server guarantees
- No request can crash it: malformed paths, NUL bytes and bad Host headers get a 400, and anything
  unexpected is caught and logged.
- Static files: no path traversal (separator-checked), and every page is sent with a
  Content-Security-Policy (self only, https images), `nosniff`, `DENY` framing and a referrer policy.
- Outbound: every retailer request made for a visitor is counted against that visitor
  (`src/http.js` requestScope). A redirect cannot go to plain http or a private or local address, and a
  redirect to another site loses the Authorization header and cookies.
- Errors that reach a visitor never include a retailer's reply text or a network address.
