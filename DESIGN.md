---
name: Begehungshelfer
description: Feldtaugliches Werkzeug für Gartenbegehungen — freundlich-vereinsnah, draußen lesbar
colors:
  vereinsgruen: "#047857"
  vereinsgruen-dunkel: "#065f46"
  vereinsgruen-tinte: "#064e3b"
  gruen-beet: "#ecfdf5"
  gruen-rand: "#6ee7b7"
  warn-amber: "#92400e"
  warn-beet: "#fffbeb"
  alarm-rot: "#dc2626"
  alarm-tinte: "#991b1b"
  alarm-beet: "#fef2f2"
  papier: "#fafaf9"
  flaeche: "#ffffff"
  tinte: "#1c1917"
  tinte-gedaempft: "#57534e"
  tinte-leise: "#78716c"
  rand: "#e7e5e4"
  rand-stark: "#d6d3d1"
  hauch: "#f5f5f4"
typography:
  title:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: "4px"
  lg: "8px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  section: "32px"
components:
  button-primary:
    backgroundColor: "{colors.vereinsgruen}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  button-primary-hover:
    backgroundColor: "{colors.vereinsgruen-dunkel}"
  button-secondary:
    backgroundColor: "{colors.flaeche}"
    textColor: "{colors.tinte}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  button-secondary-hover:
    backgroundColor: "{colors.hauch}"
  card:
    backgroundColor: "{colors.flaeche}"
    rounded: "{rounded.lg}"
    padding: "16px"
  chip:
    backgroundColor: "{colors.flaeche}"
    textColor: "{colors.tinte}"
    rounded: "{rounded.sm}"
    padding: "4px 12px"
  input:
    backgroundColor: "{colors.flaeche}"
    textColor: "{colors.tinte}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
---

# Design System: Begehungshelfer

## 1. Overview

**Creative North Star: „Das gepflegte Beet"**

Ordnung mit Wärme. Wie ein gut geführter Kleingarten ist die Oberfläche in klare
Reihen gegliedert — viel Luft zwischen den Blöcken, saubere Ränder, nichts wuchert.
Das satte Vereinsgrün ist die Identität und zugleich Funktionsfarbe; es markiert
Aktionen und den Zustand „in Ordnung", nie Dekoration. Gepflegt heißt nicht steril:
warme Stein-Neutrale statt kaltem Grau, weiche Rundungen, freundliches Deutsch in
jeder Beschriftung.

Das System dient zwei Welten: dem Feld (iPhone bei Sonnenlicht, eine Hand, Sekunden
pro Eingabe) und dem Schreibtisch (Berichte, Auswertung, Akte). Das Feld gewinnt
jeden Konflikt: Kontrast schlägt Eleganz, Fläche schlägt Dichte, Vertrautheit
schlägt Originalität. Es lehnt ausdrücklich ab, was PRODUCT.md ausschließt: die
verspielte Consumer-App, das altbackene Behörden-Formular und Emojis als Icon-System.

**Key Characteristics:**
- Flach und randbasiert — Tiefe durch Ränder und Tönung, fast keine Schatten
- Eine Schriftfamilie (System-Sans), enge, feste rem-Skala
- Grün/Amber/Rot ausschließlich als Zustandssprache (Eskalations-Ampel)
- Große Touch-Ziele, Auto-Save, keine dekorative Motion
- Kanonische Wertquelle sind Tailwind-Klassen (stone/emerald/amber/red); die
  Hex-Werte hier sind deren Entsprechung

## 2. Colors

Zurückhaltende warme Neutrale, ein grünes Rückgrat, Amber und Rot streng als Warnstufen.

### Primary
- **Vereinsgrün** (#047857, `emerald-700`): primäre Aktionen (Knöpfe), aktive
  Auswahl, Marken-Akzente. Hover dunkelt auf **Vereinsgrün Dunkel** (#065f46,
  `emerald-800`) ab. Auf grünen Tönungsflächen schreibt **Grün-Tinte** (#064e3b,
  `emerald-900`).
- **Grün-Beet** (#ecfdf5, `emerald-50`): Tönungsfläche für positive Hinweise und
  aktive Bereiche, mit **Grün-Rand** (#6ee7b7, `emerald-300`) als Kontur.

### Secondary
- **Warn-Amber** (#92400e auf #fffbeb, `amber-800` auf `amber-50`): Warnzustände —
  Fristen, Stufe „Abmahnung", Hinweise mit Handlungsbedarf.
- **Alarm-Rot** (#dc2626, `red-600`; Tinte #991b1b auf Beet #fef2f2): Fehler,
  Überfälliges, Stufe „Kündigung", destruktive Aktionen.

### Neutral
- **Papier** (#fafaf9, `stone-50`): Seitenhintergrund.
- **Fläche** (#ffffff): Karten, Formulare, Header.
- **Tinte** (#1c1917, `stone-900`): Fließtext und Überschriften.
- **Tinte gedämpft** (#57534e, `stone-600`): Sekundärtext und Feld-Beschriftungen —
  die EINZIGE gedämpfte Textfarbe für lesbaren Inhalt.
- **Tinte leise** (#78716c, `stone-500`): nur Meta-Angaben (Zeitstempel, Zähler)
  und Platzhalter; nie für Inhalte, die man lesen muss.
- **Rand** (#e7e5e4, `stone-200`) und **Rand stark** (#d6d3d1, `stone-300`):
  Konturen von Karten bzw. Interaktivem; **Hauch** (#f5f5f4, `stone-100`) als
  Hover-Tönung.

### Named Rules
**Die Ampel-Regel.** Grün, Amber und Rot sind Zustandssprache der Eskalationsstufen
und Mangel-Status. Sie werden niemals dekorativ eingesetzt. Wer eine Fläche „zur
Auflockerung" einfärben will, hat verloren.

**Die Zwei-Grau-Regel.** Lesbarer Text kennt genau zwei Stufen: Tinte (#1c1917) und
Tinte gedämpft (#57534e). `stone-400` und heller sind für Text verboten (Kontrast
< 3:1 auf Weiß — draußen unlesbar); `stone-500` nur für Meta-Angaben.

**Die Kein-Grau-auf-Farbe-Regel.** Auf getönten oder farbigen Flächen schreibt
immer die dunkle Tinte derselben Farbfamilie (z. B. #064e3b auf Grün-Beet) oder
Weiß auf Vollton — nie ein neutrales Grau.

## 3. Typography

**Body Font:** System-Sans (ui-sans-serif, system-ui — auf iOS: SF Pro)

**Character:** Eine einzige, vertraute Familie in wenigen Gewichten. Die Schrift
ist unsichtbares Werkzeug: native Anmutung auf jedem Gerät, sofort lesbar, nie
Selbstzweck. Feste rem-Größen (kein clamp) — der vorhandene Textgrößen-Zoom
skaliert die Wurzel.

### Hierarchy
- **Title** (600, 1.125rem/1.4): Seiten- und Kartentitel. Bewusst bescheiden —
  die App schreit nicht.
- **Body** (400, 1rem/1.5): Fließtext, Eingabefelder (min. 16px gegen iOS-Zoom).
- **Label** (500, 0.875rem/1.4): Feld-Beschriftungen, Knöpfe, Tabellen, Chips —
  das Arbeitstier der UI.

### Named Rules
**Die 16-Pixel-Regel.** Eingabefelder haben mindestens 1rem Schriftgröße, sonst
zoomt iOS beim Fokus die ganze Seite.

## 4. Elevation

Flach mit Rand. Tiefe entsteht durch 1-Pixel-Konturen (Rand/Rand stark) und
Flächen-Tönung (Papier → Fläche → Hauch), nicht durch Schatten. Schatten sind die
Ausnahme für echte Überlagerung: schwebende Panels und Dialoge (`shadow-lg`),
sonst nichts.

### Named Rules
**Die Flach-mit-Rand-Regel.** Ruht ein Element auf der Seite, trägt es einen Rand
und keinen Schatten. Schwebt es über der Seite (Dialog, Panel), trägt es einen
Schatten. Es gibt nichts dazwischen.

## 5. Components

Ruhig und griffig — wie gutes Gartenwerkzeug: unaufgeregt, liegt gut in der Hand.
Große Ziele (im Feld min. 44×44px), klare Kanten mit weicher Rundung, flächige Farben.

### Buttons
- **Shape:** dezent gerundet (4px)
- **Primary:** Vereinsgrün-Vollton, weißer Label-Text (500, 0.875rem),
  Padding 6×12px (im Feld-Kontext größer: min. 44px Höhe)
- **Hover / Focus:** Abdunkeln auf Vereinsgrün Dunkel; sichtbarer Fokusring
- **Secondary:** weiße Fläche, Rand stark (#d6d3d1), Hover tönt auf Hauch
- **Destruktiv:** Alarm-Rot-Tinte, nie Vollton-Rot als Fläche für Sekundäres

### Chips
- **Style:** weiße Fläche, 1px Rand stark, 4px Rundung, Padding 4×12px
  (Mängelkatalog-Auswahl, Filter)
- **State:** ausgewählt = Grün-Beet-Fläche mit Grün-Rand und Grün-Tinte

### Cards / Containers
- **Corner Style:** 8px (rounded-lg)
- **Background:** Fläche (weiß); Zustands-Callouts als Beet-Tönung
  (Grün-/Warn-/Alarm-Beet) mit passendem Rand
- **Shadow Strategy:** keiner (siehe Flach-mit-Rand-Regel)
- **Border:** 1px Rand (#e7e5e4)
- **Internal Padding:** 16px

### Inputs / Fields
- **Style:** weiße Fläche, 1px Rand stark, 4px Rundung, min. 1rem Schrift
- **Focus:** Fokusring in Vereinsgrün
- **Verhalten:** Auto-Save (onBlur/onChange) — sichtbare Speichern-Knöpfe sind
  die Ausnahme, nicht die Regel

### Navigation
- **Style:** weißer Header mit 1px Rand unten, Vereinslogo + Wortmarke in
  Vereinsgrün; Werkzeugleiste als Secondary-Chips. Kein Seitenmenü — flache
  Navigation über Startseite und Direktlinks.

### Stufen-Ampel (Signature)
Die Eskalationsstufe (ok → Gespräch → Mitteilung → Abmahnung → Kündigung) und die
Beet-Quote erscheinen überall als kompakte Ampel: Symbol + Label + Farbfamilie
(Grün/Amber/Rot). Identische Darstellung in Erfassung, Auswertung, Berichten
(geteilte Komponenten wie `BeetZelle`). Farbe ist nie der einzige Träger —
Symbol und Text stehen immer daneben.

## 6. Do's and Don'ts

### Do:
- **Do** Kontrast vor Eleganz: lesbarer Text nur in Tinte (#1c1917) oder Tinte
  gedämpft (#57534e) — die App wird bei Sonnenlicht benutzt.
- **Do** Touch-Ziele im Feld-Modus min. 44×44px; Eingabefelder min. 1rem Schrift.
- **Do** dieselbe Komponente überall gleich: ein Primary-Button, eine Chip-Form,
  eine Karten-Kontur — Wiedererkennung ist ein Feature.
- **Do** Zustands-Callouts als getönte Beet-Fläche mit Rand und dunkler Tinte
  derselben Farbfamilie.
- **Do** deutsches, direktes UI-Wording ohne Anglizismen („Begehung fortsetzen",
  nicht „Continue Session").

### Don't:
- **Don't** Grau auf Farbflächen schreiben (Kein-Grau-auf-Farbe-Regel) — grauer
  Text auf Grün wirkt ausgewaschen und fällt im Detector durch.
- **Don't** die verspielte Consumer-App bauen: keine Gamification, keine
  Maskottchen, kein Confetti, keine dekorative Motion.
- **Don't** das altbackene Behörden-Formular bauen: keine grauen Tabellenwüsten,
  keine winzigen Klickziele, kein Inhalt hinter verschachtelten Menüs.
- **Don't** neue Emojis als Icons einführen — das bestehende Emoji-Provisorium
  wird durch ein echtes Icon-Set abgelöst, nicht erweitert. (Stufen-Symbole sind
  bis zum gleichwertigen Ersatz ausgenommen.)
- **Don't** Grün, Amber oder Rot dekorativ verwenden (Ampel-Regel).
- **Don't** Schatten auf ruhenden Elementen, Seitenstreifen-Ränder (border-left
  > 1px als Akzent), Gradient-Text oder Karten-in-Karten.
