#!/bin/zsh
# Startet die Begehungshelfer-App im Produktionsmodus (von launchd aufgerufen).
# Voraussetzung: vorher einmal `npm run build` ausführen.
export PATH="/Users/macmini/.local/bin:/opt/homebrew/bin:/usr/bin:/bin"
export NODE_ENV=production
export PORT=3100
cd /Users/macmini/Code/begehungshelfer || exit 1
# Wartungsmodus: solange die Sentinel-Datei existiert, startet die App nicht
# (z. B. für DB-Migrationen — launchd respawnt sonst schneller als migriert ist).
while [[ -f /tmp/begehung-maintenance ]]; do
  echo "Wartungsmodus aktiv — App-Start ausgesetzt"
  sleep 10
done
exec npm run start
