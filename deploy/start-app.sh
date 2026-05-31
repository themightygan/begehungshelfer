#!/bin/zsh
# Startet die Begehungshelfer-App im Produktionsmodus (von launchd aufgerufen).
# Voraussetzung: vorher einmal `npm run build` ausführen.
export PATH="/Users/macmini/.local/bin:/opt/homebrew/bin:/usr/bin:/bin"
export NODE_ENV=production
export PORT=3100
cd /Users/macmini/Code/begehungshelfer || exit 1
exec npm run start
