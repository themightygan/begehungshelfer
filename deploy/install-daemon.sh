#!/bin/zsh
# Wechselt von LaunchAgents (Login-basiert) auf System-LaunchDaemons
# (laufen ohne Login, überstehen Reboots). MIT sudo ausführen:
#   sudo zsh /Users/macmini/Code/begehungshelfer/deploy/install-daemon.sh
set -e
REPO="/Users/macmini/Code/begehungshelfer"
UID_MM="$(id -u macmini)"
APP="de.gartenfreunde.begehungshelfer-app"
TUN="de.gartenfreunde.begehungshelfer-tunnel"

echo "1/4 Alte LaunchAgents stoppen…"
launchctl bootout "gui/${UID_MM}/${APP}" 2>/dev/null || true
launchctl bootout "gui/${UID_MM}/${TUN}" 2>/dev/null || true
rm -f "/Users/macmini/Library/LaunchAgents/${APP}.plist" \
      "/Users/macmini/Library/LaunchAgents/${TUN}.plist"

echo "2/4 Daemons nach /Library/LaunchDaemons kopieren…"
cp "${REPO}/deploy/daemon/${APP}.plist" "${REPO}/deploy/daemon/${TUN}.plist" /Library/LaunchDaemons/
chown root:wheel "/Library/LaunchDaemons/${APP}.plist" "/Library/LaunchDaemons/${TUN}.plist"
chmod 644 "/Library/LaunchDaemons/${APP}.plist" "/Library/LaunchDaemons/${TUN}.plist"

echo "3/4 Daemons starten…"
launchctl bootstrap system "/Library/LaunchDaemons/${APP}.plist"
launchctl bootstrap system "/Library/LaunchDaemons/${TUN}.plist"

echo "4/4 Status:"
launchctl print "system/${APP}" >/dev/null 2>&1 && echo "  ${APP}: geladen" || echo "  ${APP}: FEHLER"
launchctl print "system/${TUN}" >/dev/null 2>&1 && echo "  ${TUN}: geladen" || echo "  ${TUN}: FEHLER"
echo "Fertig. App + Tunnel laufen jetzt als System-Daemons (auch ohne Login)."
