# CLAUDE.md — Gartenbegehungs-App

> Lebendige Projekt-Doku. Wird jede Session automatisch geladen. **Aktuell halten.**

## Projekt
Webapp für Gartenbegehungen des **Gartenfreunde Stuttgart Sillenbuch e.V.** (Sascha ist im Vorstand).
Der Vorstand begeht mehrmals/Jahr die **>150 Parzellen** in zwei Anlagen — **Silberwald (Kürzel S)** und **Kühwasen (Kürzel K)** — und prüft Einhaltung von **Unterpachtvertrag (UPV)**, **Gartenordnung (GO)**, ggf. **Ortsrecht** (Bau-/Nachbarrecht, Abstandsflächen) und **BKleingG**.
Ziel: Papier/Doppelarbeit ersetzen; **Bericht pro Parzelle** für Akte + Pächter; Hinweise/Abmahnungen/Kündigungen mit minimalem Aufwand.

## Status (Stand 2026-05-31)
- **Was + Wie: freigegeben/entschieden.** Finaler Plan: `~/.claude/plans/ich-m-chte-mit-dir-clever-piglet.md`. Hostile Audit durchgeführt, Befunde eingearbeitet.
- **Repo:** https://github.com/themightygan/begehungshelfer (privat). Push-Auth = Account `themightygan` (NICHT MAIQ-Account `sascha-maiq` — `unset GH_TOKEN` + `gh auth login`).
- **Daten vorverarbeitet:** `data/parzellen.csv` (153 Parzellen: K=72, S=81; MK ignoriert) via `scripts/preprocess_parzellen.py`.
- **DB-Basis poliert:** SQLite-Schema + Seed stehen (`prisma/schema.prisma`, `prisma/seed.mjs`). Audit-Politur eingearbeitet (s. u.). Migration/Seed noch NICHT ausgeführt (passiert auf Mac Mini).
- **Transfer:** `SETUP_MACMINI.md` = Schritt-für-Schritt-Anleitung. Dropbox-Verschmutzung (node_modules/.next/lock) entfernt.
- **NÄCHSTER SCHRITT:** Phase 6 (Produktiv): Cloudflare permanent auf app.begehungshelfer.de (Domain-Umzug zu Cloudflare läuft, Stand 2026-05-31) + Access, always-on (launchd), Backup. Phasen 1–5 ✅. **Runden-Verwaltung jetzt echt** (Begehung starten: Anlage + Teilnehmer → /begehung mit Karte + Parzellen-Raster → Speichern&weiter → Abschluss/einfrieren → Berichte). Offen: Vorjahres-Vergleich beim Erfassen.
- **Stufe-1-Härtung Offline/Multi-User (2026-06-11) ✅:** Queue-Poison-Fix (Netzfehler zählen nicht), kein Löschen bei unerwarteten 4xx, 120-s-Timeout, Web-Locks, „hängt"-Panel (sichern/verwerfen), Client-Downscale vor Enqueue, Einfrieren serverseitig erzwungen, 48-h-Gnadenfrist für nachgereichte Medien (410 = endgültig), `abgeschlossenAm`-Migration, WAL + busy_timeout + connection_limit=1, Beitreten-Karte gegen parallele Runden, `error.tsx`, AbschlussButton blockiert bei lokalem Puffer. Smoke-Test: `scripts/smoke-stufe1.mjs` (8/8 ✅).
- **Stufe 2: Offline-first Begehungsmodus (2026-06-11) ✅:** `/begehung` ist jetzt ein Client-Workspace (Plan-Raster + Parzellen-Erfassung in EINER Seite, Hash-Routing `#p/K12`). **Sicht = Server-Snapshot (IndexedDB) ⊕ Replay der Pending-Ops** aus der generalisierten Outbox (uploadQueue, kind "op", koalesziert). Alle Texteingaben speichern automatisch lokal (onBlur/onChange → idempotente SyncOp) und syncen im Hintergrund über `/api/sync`; Mängel/Beete haben Client-UUIDs (`uid`-Spalten, Migration + Backfill). `/api/begehung/snapshot` = Batch-Snapshot (Parzellen, Katalog, Befunde, Vorjahr, offene Mängel, Messhistorie). Acks wandern via `verarbeiteAck` in den lokalen Server-Stand (kein Flicker). Mini-Service-Worker `public/sw.js` (Shell + `_next/static` + `/api/datei` cache-first) → Offline-Reload funktioniert. Alte Route `/parzelle/[id]` → Redirect; Akte/Dokumente in die Parzellenverwaltung verschoben. Wartungsmodus: `touch /tmp/begehung-maintenance` stoppt launchd-Respawn (für Migrationen). Smoke: `scripts/smoke-stufe2.mjs` (9/9 ✅) + Stufe 1 (8/8 ✅). Offen: echter Feldtest auf iPhone/iPad (Flugmodus-Durchlauf).

### Audit-Entscheidungen (gesetzt)
- **Offline = Formular-Puffer:** online-first, aber offener Befund (Eingaben + Fotos) lokal im Browser puffern, Auto-Retry. Voll-PWA = Phase 2.
- **Historie = einfrieren:** abgeschlossene Runde unveränderlich; „behoben" via `Mangel.behobenAm` (kein Überschreiben); Befund-Snapshot inkl. Adresse.
- **Auth = Cloudflare Access (Pflicht)** zusätzlich zum gemeinsamen App-Passwort. Passwort-Vergleich `crypto.timingSafeEqual` (kein bcrypt).
- **Foto-Pipeline (MUSS beim Upload):** resize ~1600px + JPEG-Q~75 + **EXIF/Geo-Strip** (DSGVO). Treiber: bis 24 Fotos/Parzelle.
- **Schema-Politur:** Plakette in Befund-Felder aufgelöst; `soll_obst` entfernt; zentrale Wertquelle `src/lib/constants.ts` (beim Bau anlegen); Eskalationsstufe bleibt pro Befund.

## Leitprinzip
**KISS / Pareto** — 80 % Nutzen, 20 % Aufwand. Jedes Feature so schlicht wie möglich; Erweiterungen klar als **Phase 2** markieren. Scope-Creep aktiv ansprechen und einfachere Alternativen vorschlagen.

## Architektur (entschieden)
- **App:** Next.js (TypeScript, App Router) + Tailwind. Mobile-first (Handy/iPad) + Desktop.
- **DB:** SQLite (Datei `prisma/dev.db`, kein DB-Server) via Prisma 6. KISS für single-host; Backup = Datei kopieren. SQLite hat keine nativen Enums → Auswahlfelder als String mit dokumentierten Werten.
- **Datei-Speicher:** lokales Dateisystem (Fotos + PDFs). Backup → Dropbox/Time Machine.
- **Auth:** EIN gemeinsamer Login (ein Passwort) → simpler Passwort-Check + Session-Cookie. Kein Auth-Framework.
- **Hosting:** SELF-HOSTED auf Sascha's **Mac Mini M4 (16 GB)**, Glasfaser. Kein Cloud-Hoster.
- **Fernzugriff:** **Cloudflare Tunnel** (`cloudflared`) — kein DynDNS/Port-Forwarding, kostenloses TLS, funktioniert hinter CGNAT/DS-Lite. Optional **Cloudflare Access** als Zugriffsschutz.
- **Lokale KI (Phase 2):** Transkription `whisper.cpp`/`faster-whisper`; Textglättung + Brief-Entwürfe via lokales **Ollama**.
- **Datensouveränität:** alle personenbezogenen Daten bleiben lokal. Keine Cloud, kein US-Hoster.

> **Ersetzt zwei Altsysteme** (kein Code-Reuse, KEINE Datenmigration — frischer Start):
> - `gartenfreunde` (Vue3/FastAPI/Supabase) — lief produktiv (~150 Parzellen, Begehungen 2025).
> - `begehungshelfer` (geplant: Next.js + Supabase + Dropbox + OpenAI KI-Briefe) — nur Planung, nie gebaut.
> Beide unter `…/Coding/Gartenfreunde_old/`. Wir lernen vom Schema, bauen aber frisch & schlank.

## Daten
- **Parzellen-Schlüssel:** `Kürzel + Nummer + Index` → z. B. „K1", „S59a".
- **Stammdaten-Quellen (vor Import vorzuverarbeiten):**
  - Mitglieder: `/Users/saschatheissen/Downloads/April 2026 Mitgliederliste.xlsx` (Sheet „Gartenverz. & Mitgliederstatus") — Pächter, Kontakt, Adresse, Eintritt. Hunderte Wasser-Spalten ignorieren.
  - Flächen: `…/Gartenfreunde_old/Daten/Echte Daten/PArzellenfläche.xlsx` (Sheet „JR 2024-2025", `parzellengroesse` m²).
  - **Join:** `Anl. + Ga-Nr + Ind.`. Excel-Datumsserien + Formelzellen auflösen.
- **Mängelkatalog:** aus `…/Gartenfreunde_old/Daten/Muster/Formular_Gartenbegehung_neutral.pdf` (3 Bereiche, ~28 Punkte — Details in der Spec).
- **Pläne:** Silberwald + Kühwasen vorhanden (`_quelldaten/plaene/`). Anlagenliste final = nur K + S. Farbige Markierungen auf den Plänen (grün/rot/blau) sind Notizen aus anderem Kontext → **ignorieren**, Plan dient nur als statisches Orientierungsbild.
- **Regelwerk:** `…/Muster/Gartenordnung.txt`, `…/Muster/Unterpacht-Vertrag.txt`. Quote: **UPV §12 = min. 1/6 Gemüse + 1/6 Obst** (GO strebt 1/3 gesamt an).

## Bau-Reihenfolge (Phasen — jede lauffähig & verifizierbar)
0. **Fundament — ✅ FERTIG:** SQLite migriert + geseedet (153 Parzellen, 2 Anlagen, 28 Katalogpunkte).
1. **De-Risk-Prototyp — ✅ FERTIG:** Next.js 15 (App Router, TS, Tailwind v4) gescaffoldet + Foto/PDF-Durchstich verifiziert. `sharp`-Pipeline (HEIC/iPhone→JPEG via `heic-convert`, resize ~1600px, JPEG q75, EXIF/Geo-Strip nachgewiesen), Befund-Erfassung (Stufe/Notiz/Fotos), Bericht-PDF via `@react-pdf/renderer`. `src/lib/constants.ts`, `db.ts`, `storage.ts`, `pdf.tsx`.
2. **Login — ✅ FERTIG:** gemeinsames Passwort via `crypto.timingSafeEqual` + iron-session (`begehung_session`-Cookie); `src/middleware.ts` schützt alle Routen außer `/login` + Assets; Abmelden im Header.
3. **Erfassung — ✅ FERTIG:** Mängel-Menü (28 Katalogpunkte als Chips, nach Bereich gruppiert) → Mangel hinzufügen, pro Mangel Karte mit Maßnahmentext + Frist + mehrere Fotos; Gesamtansicht-Fotos (Orientierung, im PDF vorne); Befund-Stufe + Bemerkung (am Seitenende) + „Speichern & weiter" zur nächsten Parzelle; Vor/Zurück (anlagenintern); Freitext-Mangel; **Gemüsebeete (bis 5, IST vs. SOLL 1/6, UPV §12)**. PDF gruppiert Fotos je Mangel + Gemüse-Soll/Ist. **Echte Runden-Verwaltung** (Begehung starten mit Anlage+Teilnehmern, aktive Runde in Session, Karte/Plan-Bild der Anlage, Abschluss friert ein). Plan-Bild liegt unter `storage/plaene/`, `Anlage.planBild` in DB (nicht im Repo; nur Kühwasen vorhanden).
4. **Nachverfolgung — ✅ FERTIG (ohne Vorjahr):** `/maengel` listet offene/überfällige Mängel (überfällig zuerst), Filter offen/alle, „behoben"-Toggle via `behobenAm`. **Offen:** Vorjahres-Vergleich beim Erfassen (braucht Runden-Verwaltung).
5. **Dokumente & Export — ✅ FERTIG:** Akte je Parzelle (Dokument-Upload: Schreiben/E-Mail/Wertermittlung/sonstiges, beliebige Dateitypen); PDF pro Parzelle; CSV-Gesamtexport (`/api/export/csv`, UTF-8-BOM + Semikolon für Excel/DE).
6. **Produktiv:** Mac Mini always-on (launchd/pm2), Cloudflare Tunnel + Access (begehungshelfer.de), Backup (DB + storage).
🟡 **Phase 2+:** Sprachnotiz→whisper.cpp→Ollama-Glättung; KI-Briefe; interaktiver Plan; persönliche Konten; formale Nachbegehung.

## Audit-Entscheidungen (verbindlich)
- **Offline = Formular-Puffer:** online-first; offener Befund (Eingaben+Fotos) lokal im Browser puffern + Auto-Retry. Voll-PWA = Phase 2.
- **Historie = einfrieren:** abgeschlossene Runde unveränderlich; „behoben" nur via `Mangel.behobenAm` (kein Überschreiben); Befund-Snapshot inkl. Adresse.
- **Auth = Cloudflare Access (Pflicht)** + gemeinsames App-Passwort (`crypto.timingSafeEqual`, KEIN bcrypt).
- **Foto-Pipeline (Pflicht beim Upload):** resize ~1600px + JPEG-Q~75 + **EXIF/Geo-Strip** (DSGVO). Treiber: bis 24 Fotos/Parzelle.
- **String-Auswahlfelder:** EINZIGE Wertquelle in `src/lib/constants.ts` (beim Bau anlegen) — Schema-Kommentare spiegeln sie nur.
- **Pläne:** farbige Markierungen ignorieren (nur Orientierungsbild).

> Hinweis: Der ausführliche Plan + Memory liegen auf dem MacBook (Prep-Maschine), NICHT hier. Diese CLAUDE.md ist die maßgebliche Quelle auf dem Mac Mini. Bei „live state"-Zweifeln: Schema/DB/Code direkt prüfen.

## Konventionen für Claude
- **UI/Texte: Deutsch.** Antworten an Sascha: Executive Summary zuerst (siehe globale `~/.claude/CLAUDE.md`).
- Chirurgische Änderungen, bestehenden Stil treffen, kein Drive-by-Refactoring.
- Live-Stand prüfen statt Doku/Memory blind vertrauen.
- Vor „fertig": verifizieren (App starten / Funktion prüfen), nicht nur „läuft".
- Repo `themightygan/begehungshelfer`. **NIE** `data/`, `.env`, `storage/`, `*.db` committen (PII/Secrets — siehe `.gitignore`). Commits: globale `~/.claude/rules/commit-format.md`.
- Dies ist ein Vereins-/Privatprojekt (nicht MAIQ).

## Offene Punkte
- Kühwasen-Plan beschaffen; finale Anlagenliste (nur S + K?).
- Cloudflare-Domain/Hostname festlegen.
- Backup-Routine (DB-Dump + Files → Dropbox) einrichten.
- Verfügbarkeits-Risiko Feldeinsatz (Mac + Glasfaser müssen laufen, kein Offline) — bewusst akzeptiert; ggf. später PWA-Offline.
