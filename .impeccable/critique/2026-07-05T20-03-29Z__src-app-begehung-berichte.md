---
target: Berichte
total_score: 21
p0_count: 0
p1_count: 2
timestamp: 2026-07-05T20-03-29Z
slug: src-app-begehung-berichte
---
# Critique: Berichte (src/app/begehung/berichte)

Method: dual-agent (A: a4c60c21329035e33 · B: ac28e5f95a8ccc52c)

## Design Health Score: 21/40 (Acceptable, unterste Fläche)

| # | Heuristik | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Systemstatus | 2 | „Status: aktiv" = roher DB-Wert (page.tsx:44); keine Unterscheidung laufend/abgeschlossen |
| 2 | Reale Welt | 3 | „3 Mangel" — Plural-Bug (:94) |
| 3 | Nutzerkontrolle | 2 | Kein Querlink zur Auswertung derselben Runde |
| 4 | Konsistenz | 2 | Stufe hier graues Kleingedrucktes vs. eigene Zelle in Auswertung |
| 5 | Fehlervermeidung | 3 | Saubere Balken/PDF-Trennung (:79–105) |
| 6 | Wiedererkennen | 2 | Hilfetext „Balken öffnet die Ansicht" = Eingeständnis fehlender Affordanz (:64–66) |
| 7 | Effizienz | 1 | >70 Balken: keine Sortierung, kein Filter, kein Sammel-PDF |
| 8 | Minimalismus | 2 | 🛑 Kündigung sieht exakt so ruhig aus wie ✅ OK; lautestes Element = Parzellen-ID |
| 9 | Fehler-Recovery | 2 | Leerzustand ohne Handlungsangebot (:69–72) |
| 10 | Hilfe | 2 | Nur der eine Inline-Hinweis |

## Anti-Patterns
LLM: kein Slop, aber unfertigste Fläche — die „heilige Ampel" ist hier zu grauem Kleingedruckten degradiert. Detector: 0 Findings (berichte + ansicht). Browser übersprungen (kein Werkzeug, Login nötig).

## Priority Issues
- [P1] Ampel nicht heilig: Eskalationsstufe als Emoji+Label in text-sm text-stone-500 (:89–96) — keine Farbfamilie, kein Gewicht. Fix: Stufe als eigenes Element in Tinte der Farbfamilie; optional Alarm-Beet-Tönung für Zeilen ≥ Abmahnung; Default-Sortierung nach Eskalation absteigend.
- [P1] Zwei-Grau-Verstöße: stone-400 für Teilnehmer/Status/Leerzustand (:42,44,70); stone-500 trägt die komplette Inhaltszeile; amber-600 in BeetZelle. Fix: Inhalt stone-600, Meta stone-500, amber-800.
- [P2] Keine Scan-/Filterhilfe bei >70 Zeilen; Sortierung fest nach nummer (:21). Fix (KISS): nach Stufe absteigend gruppieren + Summenzeile (summary() existiert).
- [P2] Rohwert-Leak „Status: aktiv" + Plural-Bug „3 Mangel" (:44, :94) — Seriositätsrisiko. Fix: Label-Map/Badge + Plural wie in ansicht:403.
- [P3] BeetZelle farb-only (geteilt — Fix wirkt überall).

## Persona Red Flags
Jordan: „Status: aktiv" unverständlich; Balken sieht nicht klickbar aus; 🪄 KI-Korrektur ohne Erklärung neben rechtsrelevanten Berichten; editierbare Ansicht ohne Auto-Save-Warnung (Hinweis in stone-400, ansicht:135–138). Sam: Stufen-Emoji ohne aria-Semantik; PDF-Link 70× identisch „📄 PDF" ohne Parzellenbezug; Thumb-Lightbox ohne Fokus-Trap/Esc; Kontrast-Fails.

## Minor
orderBy nummer ignoriert Index-Buchstaben (K12a vs. K12); Doppelpunkt-Fragment (:64); 👍 ohne Label (:91); Leerzustand ohne Link; BeetZelle-Kommentar vs. Grenzfälle (exakt 80 % = gelb); kein Hinweis ob PDF dem letzten Stand entspricht.

## Fragen
1. Warum gibt es diese Seite überhaupt — wäre „Berichte" nicht die Auswertung mit PDF-Spalte?
2. Warum ist die Stufe das visuell schwächste Element der Zeile?
3. Sagt die Seite je, ob seit Abschluss editiert wurde (PDF-Stand)?
