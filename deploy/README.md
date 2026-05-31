# Always-on auf dem Mac Mini (launchd)

> ⚠️ **Erst beim Produktiv-Cutover aktivieren.** Solange wir in Dev iterieren
> (`npm run dev` + trycloudflare-Schnelltunnel), NICHT laden — sonst belegt der
> Produktions-Server Port 3100 und kollidiert mit Dev.

Hält App + Cloudflare-Tunnel über Neustarts/Crashes am Laufen.

## Voraussetzungen
- **App:** einmal bauen — `npm run build` (Produktionsbuild). Danach startet
  `deploy/start-app.sh` mit `npm run start` auf Port 3100.
- **Tunnel-Plist:** setzt den **permanenten** benannten Tunnel `begehungshelfer`
  voraus (siehe Hauptprojekt-Anleitung: `cloudflared tunnel login/create/route`
  + `~/.cloudflared/config.yml`). Nicht für den trycloudflare-Schnelltunnel.

## Installation
```bash
# 1) App bauen
cd /Users/macmini/Code/begehungshelfer && npm run build

# 2) Plists als LaunchAgents verlinken
ln -sf "$PWD/deploy/de.gartenfreunde.begehungshelfer-app.plist" \
       ~/Library/LaunchAgents/
ln -sf "$PWD/deploy/de.gartenfreunde.begehungshelfer-tunnel.plist" \
       ~/Library/LaunchAgents/

# 3) Laden (startet sofort + bei jedem Login)
launchctl load ~/Library/LaunchAgents/de.gartenfreunde.begehungshelfer-app.plist
launchctl load ~/Library/LaunchAgents/de.gartenfreunde.begehungshelfer-tunnel.plist
```

Stoppen: `launchctl unload ~/Library/LaunchAgents/<plist>`.
Logs: `~/Library/Logs/begehungshelfer-app.log` bzw. `-tunnel.log`.

## System-Daemon (empfohlen für Dauerbetrieb)
LaunchAgents starten nur beim **Login**. Für echten headless-Betrieb (ohne
angemeldeten Nutzer, übersteht Reboots) auf **LaunchDaemons** wechseln —
ein Skript erledigt den Umstieg:
```bash
sudo zsh /Users/macmini/Code/begehungshelfer/deploy/install-daemon.sh
```
Das stoppt die LaunchAgents und installiert `deploy/daemon/*.plist` nach
`/Library/LaunchDaemons/` (laufen als Benutzer `macmini`). Danach laufen App +
Tunnel unabhängig vom Login. Logs unverändert unter `~/Library/Logs/`.

## Backup (noch offen)
DB (`prisma/dev.db`) + `storage/` regelmäßig sichern (Dropbox/Time Machine) —
separater Punkt, noch nicht eingerichtet.
