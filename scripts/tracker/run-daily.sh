#!/bin/zsh
# Cartworth price tracker: the daily job. launchd runs this (ops/launchd/app.cartworth.tracker.plist)
# at 06:30 and hourly at :35; `capture.js --daily` does nothing before 06:30 or once today's capture
# is done, so the hourly runs only matter on a morning the Mac was switched off at 06:30.
# Anything after `run-daily.sh` is passed to capture.js.
set -u
REPO="${0:A:h:h:h}"
NODE=""
for c in "${CARTWORTH_NODE:-}" /usr/local/bin/node /opt/homebrew/bin/node "$(command -v node 2>/dev/null)"; do
  if [[ -n "$c" && -x "$c" ]]; then NODE="$c"; break; fi
done
if [[ -z "$NODE" ]]; then echo "[$(date -u +%FT%TZ)] run-daily: node not found" >&2; exit 127; fi
# The tracker's own data dir. capture.js also refuses anything inside the repo's data/ and always
# points the product's cache at <data dir>/product-cache.db, whatever BASKET_DB says.
export BASKET_DATA_DIR="${BASKET_DATA_DIR:-$HOME/Library/Application Support/Cartworth/tracker}"
unset BASKET_DB
cd "$REPO" || exit 1
# caffeinate -i holds off IDLE sleep only while the capture runs (a full run is ~2-3 hours of one
# request at a time); it changes no setting, and closing the lid still sleeps the Mac.
exec /usr/bin/caffeinate -i "$NODE" --disable-warning=ExperimentalWarning scripts/tracker/capture.js --daily "$@"
