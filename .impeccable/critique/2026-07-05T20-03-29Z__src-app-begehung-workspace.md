---
target: Feld-Workspace (/begehung)
total_score: 27
p0_count: 0
p1_count: 3
timestamp: 2026-07-05T20-03-29Z
slug: src-app-begehung-workspace
---
# Critique: Feld-Workspace (src/app/begehung/workspace)

Method: dual-agent (A: ab2a98110401c1555 · B: ac3824f93493bc8dc)

## Design Health Score: 27/40 (Acceptable)

| # | Heuristik | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Systemstatus | 3 | Auto-Save ohne Feedback im Workspace (ParzelleAnsicht.tsx:130) |
| 2 | Reale Welt | 3 | „Datenstand"-Zeitstempel unerklärt (Workspace.tsx:209) |
| 3 | Nutzerkontrolle | 3 | Kein Undo nach Mangel-/Foto-Löschung |
| 4 | Konsistenz | 2 | Drei Knopf-Größensysteme; Chips rounded-full vs. DESIGN.md 4px |
| 5 | Fehler-Prävention | 3 | parseFlaeche macht aus „ca. 10" stumm 0 (ParzelleAnsicht.tsx:33) |
| 6 | Wiedererkennen | 3 | Katalog-Hinweis nur als title-Tooltip (ParzelleAnsicht.tsx:485) |
| 7 | Effizienz | 3 | Kein „nächste unbearbeitete Parzelle" |
| 8 | Minimalismus | 2 | ~700-Zeilen-Scroll-Wurst, Emoji-Rauschen |
| 9 | Fehler-Recovery | 3 | alert() generisch für alle Fehlerarten (Workspace.tsx:93) |
| 10 | Hilfe | 2 | Rechtliche Katalog-Referenzen in stone-400/title (533–536) |

## Anti-Patterns
LLM: kein Slop; Tells = wucherndes Emoji-Icon-System + native alert()/confirm(). Detector: 0 Findings (src/app/begehung, src/components, layout, globals). Browser-Overlay übersprungen (kein Browser-Werkzeug; Login + aktive Runde nötig).

## Priority Issues
- [P1] Zwei-Grau-Regel massiv verletzt: text-stone-400 (~2,4:1) trägt Anleitungen, rechtliche Katalog-Referenzen, Offline-Hinweis, Save-Feedback (ParzelleAnsicht.tsx:453,466,523,533–536; Workspace.tsx:56,360; AutoSaveForm.tsx:59). Fix: Sweep → Inhalt stone-600, Meta stone-500.
- [P1] Kern-Feldaktionen unter 44px: 🎤-Diktat ~32px (DiktatTextarea.tsx:109), Foto-✕ ~24px (FotoBereich.tsx:118), „✎ ändern" (Workspace.tsx:67), „pausieren/abbrechen" als text-xs-Links (Workspace.tsx:383,391 — gefährlichster Klick der App als 13px-Ziel). Fix: auf BTN-Maß/44px-Hitbox heben; abbrechen als echter destruktiver Button mit Abstand.
- [P1] Auto-Save ohne Rückmeldung: keine „✓ gespeichert"-Anzeige, keine aria-live-Region. Fix: sticky Save-Status („✓ lokal gespeichert · n warten auf Sync"), aria-live="polite".
- [P2] title-Tooltips als einziger Infoträger auf Touch (ParzelleAnsicht.tsx:485; Workspace.tsx:341; FotoBereich.tsx:120).
- [P2] text-amber-600 (~3,3:1) für Beet-Status „knapp" (BeetZelle.tsx:25 u. a.); im Raster trägt nur Farbe die Bewertung (Workspace.tsx:344–350). Fix: amber-700/800 + Symbol.

## Persona Red Flags
Casey: Prev/Next nur OBEN — nach Befund unten kein „weiter zur nächsten" (80× pro Rundgang der teuerste Flow-Bruch); Sync-Zähler außerhalb Daumenzone. Sam: Thumb = img onClick ohne role/Tastatur/Esc (Thumb.tsx:20–26); Kompensations-Inputs ohne Label-Verknüpfung (ParzelleAnsicht.tsx:384–399); keine aria-live. Älteres Vorstandsmitglied: Stufe-Select ohne Symbole/Farben — die folgenreichste Eingabe als nacktes Dropdown (ParzelleAnsicht.tsx:631–643).

## Minor
Pächtername stone-500 (Inhalt!); drei Rundungssprachen; kein active:-Feedback; 0-Mängel-Fall verschwindet statt „Parzelle in Ordnung?"; Beet-Schwellen (80/60 %) nirgends erklärt; FotoWaehlenKnopf ohne Abbruch bei Pending; scrollTo(0,0) statt Rücksprung zur Rasterzelle.

## Fragen
1. Warum führt „✓ Fertig" zum Plan statt zur nächsten unbearbeiteten Parzelle (sticky Fußleiste)?
2. Warum ist die Eskalationsstufe ein farbloses Dropdown statt farbcodierter Stufen-Buttons?
3. Was macht es mit dem Vertrauen, wenn die App nie „gespeichert" sagt?
