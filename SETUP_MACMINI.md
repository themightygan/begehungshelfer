# Transfer & Setup auf dem Mac Mini

> Ziel: das vorbereitete Projekt sauber vom MacBook (Dropbox) auf den Mac Mini bringen
> und dort lauffähig machen. **Keine PII über Dropbox/GitHub** — die landet nur lokal auf dem Mac Mini.
> Reihenfolge strikt einhalten.

## Was wird übertragen — und was NICHT

**Übertragen (Quellcode + Konfig + Doku):**
`CLAUDE.md`, `SETUP_MACMINI.md`, `.gitignore`, `.env.example`, `package.json`,
`prisma/schema.prisma`, `prisma/seed.mjs`, `scripts/preprocess_parzellen.py`

**NICHT übertragen (wird auf dem Mac Mini neu erzeugt / enthält Geheimes/PII):**
- `node_modules/`, `.next/`, `package-lock.json` → kommen via `npm install`
- `.env` → neu anlegen (Geheimnisse)
- `data/` (enthält PII der 153 Pächter) → wird auf dem Mac Mini neu aus den Excel-Dateien erzeugt
- `prisma/dev.db` → entsteht bei `migrate`

**Separat (NICHT über Dropbox/GitHub — z. B. AirDrop/USB direkt auf den Mac Mini):**
Die zwei Excel-Quellen (enthalten PII):
- `April 2026 Mitgliederliste.xlsx`
- `PArzellenfläche.xlsx`
→ auf dem Mac Mini nach `<projekt>/_quelldaten/` legen (Pfade dann im Skript anpassen, s. Schritt 4).

---

## Schritt-für-Schritt (auf dem Mac Mini)

### 1. Voraussetzungen prüfen
```bash
node --version    # >= 20 (ideal 22)
git --version
gh --version
python3 -c "import openpyxl"   # für den Import; sonst: pip3 install openpyxl
```

### 2. Projektordner anlegen (AUSSERHALB jeder Cloud!)
```bash
mkdir -p ~/Code/begehungshelfer && cd ~/Code/begehungshelfer
```
Dann die „Übertragen"-Dateien (oben) per AirDrop/USB hierher kopieren — die Ordnerstruktur
(`prisma/`, `scripts/`) beibehalten.

### 3. GitHub als richtiger Account verbinden
> WICHTIG: NICHT der MAIQ-Account `sascha-maiq`, sondern **themightygan**.
```bash
unset GH_TOKEN                      # MAIQ-Token aus der Umgebung lösen
gh auth login                      # Account: themightygan wählen (Browser)
gh auth status                     # muss themightygan zeigen
git init && git add -A && git commit -m "chore: initial transfer (siehe CLAUDE.md)"
git branch -M main
git remote add origin https://github.com/themightygan/begehungshelfer.git
git push -u origin main
```

### 4. Excel-Quellen + Import-Pfade
Die zwei Excel-Dateien nach `~/Code/begehungshelfer/_quelldaten/` legen, dann in
`scripts/preprocess_parzellen.py` die beiden Pfad-Konstanten oben (`MITGL`, `FLAECHE`)
auf `_quelldaten/...` zeigen lassen. `_quelldaten/` steht in `.gitignore` (PII).

### 5. Secrets anlegen
```bash
cp .env.example .env
# in .env setzen:
#   APP_PASSWORD = ein langes gemeinsames Passwort (Vorstand)
#   SESSION_SECRET = $(openssl rand -base64 32)
```

### 6. Abhängigkeiten, DB, Daten
```bash
npm install
python3 scripts/preprocess_parzellen.py   # erzeugt data/parzellen.csv (153 Parzellen)
npx prisma migrate dev --name init         # legt prisma/dev.db an
npm run db:seed                            # Anlagen + 153 Parzellen + Mängelkatalog
npx prisma studio                          # optional: Daten visuell prüfen
```

### 7. Ab hier: App bauen mit Claude Code auf dem Mac Mini
Claude Code dort starten — es liest automatisch `CLAUDE.md` (gesamter Projektkontext)
und diesen Plan. Nächste Bau-Schritte stehen in `CLAUDE.md` / im Plan:
Foto+PDF-Prototyp → Login → Erfassung → Übersicht → Export.

---

## Danach: DSGVO-Aufräumen auf dem MacBook
Sobald der Mac Mini läuft, die **Dropbox-Kopie** dieses Projekts löschen — insbesondere
`data/parzellen.csv` und die Excel-Dateien in `~/Downloads`, da sie PII enthalten und
über Dropbox bereits in die Cloud synchronisiert wurden.

## Produktivbetrieb (später, Phase 4)
- **Always-on:** Ruhezustand des Mac Mini aus; App via `launchd` oder `pm2` autostart + Reboot-fest.
- **Fernzugriff:** `brew install cloudflared`, Tunnel auf `begehungshelfer.de`, davor **Cloudflare Access** (Pflicht).
- **Backup:** `prisma/dev.db` + `storage/` regelmäßig sichern (z. B. verschlüsselt). Foto-Backup getrennt denken (kann groß werden).
