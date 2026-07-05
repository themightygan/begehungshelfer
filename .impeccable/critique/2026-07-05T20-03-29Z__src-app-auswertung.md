---
target: Auswertung
total_score: 23
p0_count: 0
p1_count: 3
timestamp: 2026-07-05T20-03-29Z
slug: src-app-auswertung
---
# Critique: Auswertung (src/app/auswertung)

Method: dual-agent (A: acb101360875c1357 · B: a6e9b3391bae3ff48)

## Design Health Score: 23/40 (Acceptable)

| # | Heuristik | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Systemstatus | 3 | Leere Tabelle rendert nur Header, keine Meldung |
| 2 | Reale Welt | 3 | „Beet SOLL/IST (m²)" Controlling-Jargon |
| 3 | Nutzerkontrolle | 2 | „Begehung nicht gefunden." ohne Rück-Link (page.tsx:93); Sortierung nicht in URL |
| 4 | Konsistenz | 2 | „mit Mängeln" vs. „m. Mängeln"; amber-600 statt amber-800; sky im NeupaechterTag |
| 5 | Fehler-Prävention | 3 | Drei Klickziele pro Zeile millimeterdicht (AuswertungsTabelle.tsx:117–130) |
| 6 | Wiedererkennen | 2 | Inaktive Header ohne Sortier-Affordanz (nur title, :84); zwei unbeschriftete Listen in Übersicht (page.tsx:210–254) |
| 7 | Effizienz | 2 | Kein Filter/Suche bei >150 Zeilen; kein Sticky-Header; Cmd-Klick öffnet keinen Tab (KlickZeile.tsx:24–27) |
| 8 | Minimalismus | 3 | emerald-700 doppelt belegt: Link UND Ampel „erfüllt" in derselben Zeile |
| 9 | Fehler-Recovery | 2 | Fehlermeldung ohne Aktion; leere gefilterte Tabelle schweigt |
| 10 | Hilfe | 1 | Beet-Ampel-Schwellen (80/60 %) nur im Code-Kommentar (BeetZelle.tsx:1–4) |

## Anti-Patterns
LLM: kein Slop, aber Tabelle = ungestylter Default, driftet Richtung Anti-Referenz „graue Tabellenwüste". Detector: 0 Findings. Browser übersprungen (kein Werkzeug, Login nötig).

## Priority Issues
- [P1] WCAG-AA-Brüche Beet-Ampel: amber-600 ~3,2:1 (BeetZelle.tsx:25), stone-400 „nicht erfasst" ~2,5:1 (BeetZelle.tsx:18). Fix: amber-800 + stone-600.
- [P1] Ampel-Regel verletzt: Beet-Zustand NUR über Farbe (BeetZelle) — Verstoß gegen „Farbe nie einziger Träger". Fix: Symbol/Kurzlabel/Prozent in geteilter Komponente.
- [P1] KlickZeile schluckt Cmd/Ctrl-Klick + Tastatur (KlickZeile.tsx:24–27). Fix: Modifier-Guard (1 Zeile) + tabIndex/Enter.
- [P2] 150-Zeilen-Tabelle ohne Sticky-Header/Filter; CSV-Knopf UNTER der Tabelle (page.tsx:163–168). Fix: sticky thead, CSV nach oben, Client-Textfilter.
- [P2] Sortierbarkeit unsichtbar + stumm: kein ↕ an inaktiven Headern, kein aria-sort, kein scope="col" (AuswertungsTabelle.tsx:76–105).

## Persona Red Flags
Alex: Cmd-Klick tot; Sortierung weg nach Rücksprung (useState only, :64); keine Suche; CSV erst nach Komplett-Scroll. Sam: Kontrast-Fails; Beet-Wertung farb-only; dünne Tabellen-Semantik; klickbare tr ohne Fokus; bei 200 % Zoom verschwindet die Parzellen-ID (kein sticky first column).

## Minor
Spaltenköpfe stone-500 → stone-600; „Plakette(n)" Behördenton; 👍/📄/⬇-Emojis; stufeRang(hinweis)=-1 sortiert vor neutral (auswertung.ts:42–44); Stufe neutral zeigt „ —" mit führendem Leerzeichen.

## Fragen
1. Warum kann die Schreibtisch-Zentrale nicht suchen (10 Zeilen Client-Code)?
2. Sind 80/60 %-Schwellen Vorstandsentscheidung oder Code-Folklore? Muss ins UI + PDF.
3. Ist die eigentliche Startsicht die Runden-Liste oder die Jahres-Anlagen-Sicht?
