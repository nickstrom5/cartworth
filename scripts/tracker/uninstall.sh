#!/bin/zsh
# Remove the Cartworth price tracker LaunchAgent. Captured data is kept:
#   ~/Library/Application Support/Cartworth/tracker/   (tracker.db, local exports, run reports)
#   My Drive/Cartworth/price-tracker/                  (daily CSVs, imported files)
set -u
LABEL="app.cartworth.tracker"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null && echo "Stopped $LABEL." || echo "$LABEL was not loaded."
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist" && echo "Removed ~/Library/LaunchAgents/$LABEL.plist."
echo "Data kept in ~/Library/Application Support/Cartworth/tracker and in Drive."
