#!/bin/zsh
# Install the Cartworth price tracker as a LaunchAgent for this user: a capture every day at 06:30.
#
# ONLY RUN THIS WHEN THE OWNER HAS SAID YES. Once it is loaded this Mac sends requests to grocery
# sites every morning: roughly 4,000-5,000 of them (about 3,500-4,400 to www.instacart.com), one at
# a time per site with at least 0.7 s of idle time between them, for 2-3 hours, stopping at the
# first "too many requests" from a site. ./uninstall.sh reverses it.
set -euo pipefail
REPO="${0:A:h:h:h}"
LABEL="app.cartworth.tracker"
SRC="$REPO/ops/launchd/$LABEL.plist"
DST="$HOME/Library/LaunchAgents/$LABEL.plist"

plutil -lint "$SRC"
if ! grep -q "<string>$REPO/scripts/tracker/run-daily.sh</string>" "$SRC"; then
  echo "install: $SRC runs a script outside $REPO. Edit its ProgramArguments (and the log/data paths) first." >&2
  exit 1
fi
if ! grep -q "<string>$HOME/" "$SRC"; then
  echo "install: $SRC was written for a different home folder than $HOME. Edit its paths first." >&2
  exit 1
fi
mkdir -p "$HOME/Library/Logs/Cartworth" "$HOME/Library/Application Support/Cartworth/tracker" "$HOME/Library/LaunchAgents"
chmod +x "$REPO/scripts/tracker/run-daily.sh"
cp "$SRC" "$DST"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$DST"
launchctl print "gui/$(id -u)/$LABEL" | grep -E "state|path|program|last exit" || true
cat <<MSG

Installed $LABEL.
  Next capture: 06:30 tomorrow (or on wake, if the Mac is asleep then).
  Log:          ~/Library/Logs/Cartworth/tracker.log
  Data:         ~/Library/Application Support/Cartworth/tracker/tracker.db
  Drive:        My Drive/Cartworth/price-tracker/ (daily/, incoming/)
  Run one now:  launchctl kickstart gui/$(id -u)/$LABEL   (does nothing before 06:30 or if today is done)
  Remove:       $REPO/scripts/tracker/uninstall.sh
MSG
