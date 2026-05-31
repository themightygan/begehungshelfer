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
- **NÄCHSTER SCHRITT (auf Mac Mini):** install → migrate → seed → Foto/PDF-Prototyp → Login → Erfassung → Export.

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
- **Pläne:** `…/Muster/Silberwald_Plan_markiert.pdf` vorhanden; Kühwasen-Plan beschaffen.
- **Regelwerk:** `…/Muster/Gartenordnung.txt`, `…/Muster/Unterpacht-Vertrag.txt`. Quote: **UPV §12 = min. 1/6 Gemüse + 1/6 Obst** (GO strebt 1/3 gesamt an).

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
