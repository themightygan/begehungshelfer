# Product

## Register

product

## Users

Der Vorstand des Gartenfreunde Stuttgart Sillenbuch e.V. — 2 bis 8 Personen, gemischte
Technik-Affinität, teils ältere Mitglieder. Zwei Nutzungskontexte:

1. **Im Feld (primär):** Begehung der >150 Parzellen in zwei Anlagen, zu Fuß, auf
   iPhone/iPad, oft bei direktem Sonnenlicht, teils ohne Netzabdeckung (Offline-Modus).
   Eine Hand hält das Gerät, die andere zeigt/fotografiert. Zeitdruck: viele Parzellen
   pro Rundgang, wenige Sekunden pro Eingabe.
2. **Am Schreibtisch (sekundär):** Nachbearbeitung, Textkorrektur, Berichte/PDFs,
   Auswertung, Mängel-Nachverfolgung, Dokumenten-Akte — auf dem Desktop, in Ruhe.

Job to be done: Pachtverstöße rechtssicher dokumentieren (Unterpachtvertrag,
Gartenordnung, BKleingG) mit minimalem Aufwand — vom Foto im Feld bis zur Abmahnung
in der Akte.

## Product Purpose

Ersetzt Papierformulare und Doppelarbeit bei Gartenbegehungen. Erfassung je Parzelle
(Mängel, Fotos, Gemüsebeet-Quoten, Eskalationsstufe), Bericht-PDF für Akte + Pächter,
Nachverfolgung offener Mängel über Jahre. Erfolg heißt: Ein Rundgang ist ohne
Nacharbeit vollständig dokumentiert, und jeder Befund hält einer rechtlichen
Auseinandersetzung stand.

## Brand Personality

**Freundlich-vereinsnah, verlässlich, unaufgeregt.** Ein Werkzeug von Gartenfreunden
für Gartenfreunde: warm und nahbar (Grün als Identität, weiche Formen), aber in der
Sache seriös — es geht um Abmahnungen und Kündigungen. Die App darf nach Garten
klingen, nie nach Spielzeug. Ton der UI-Texte: klares, direktes Deutsch, keine
Anglizismen, keine Verniedlichung.

## Anti-references

- **Verspielte Consumer-App:** keine Gamification, keine Illustrations-Maskottchen,
  keine Marketing-Optik, kein Confetti.
- **Altbackenes Behörden-Formular:** trotz Seriosität kein 2005er-Verwaltungsportal —
  keine grauen Tabellenwüsten, keine winzigen Klickziele, kein Frame-Look.
- **Emoji als Icon-System:** die aktuellen Emojis (🔍 ⚙️ 📋 ✅ ⚠️ …) sind ein
  Provisorium und werden durch ein echtes, einheitliches Icon-Set ersetzt.
  (Ausnahme: die Stufen-Symbole dürfen bleiben, bis ein gleichwertig schnell
  erfassbarer Ersatz existiert — sie sind semantische Ampel, nicht Deko.)

## Design Principles

1. **Draußen lesbar schlägt drinnen schön.** Jede Design-Entscheidung wird gegen
   Sonnenlicht auf einem iPhone getestet, nicht gegen einen Desktop-Monitor im Büro.
2. **Sekunden zählen.** Im Feld-Modus ist jede Eingabe ein Ein-Daumen-Vorgang:
   große Ziele, wenige Schritte, Auto-Save statt Speichern-Knopf.
3. **Die Ampel ist heilig.** Eskalationsstufen und Mangel-Status sind das semantische
   Rückgrat — ihre Farben (Grün/Amber/Rot) sind Zustandssprache und werden nie
   dekorativ verwendet.
4. **Vertraut statt originell.** Standard-Affordanzen (Listen, Formulare, Chips),
   dieselbe Komponente sieht überall gleich aus. Überraschung ist ein Fehler.
5. **KISS / Pareto.** Jedes Feature so schlicht wie möglich; Konsistenz vor Neuheit,
   Weglassen vor Hinzufügen.

## Accessibility & Inclusion

**Outdoor-tauglich streng:** WCAG 2.1 AA ist Pflicht (Kontrast ≥ 4.5:1 für Text,
≥ 3:1 für große Schrift/UI-Komponenten) — und darüber hinaus bewusst hohe Kontraste,
weil bei Sonnenlicht gearbeitet wird. Touch-Ziele im Feld-Modus min. 44×44 px.
Textgrößen-Zoom (vorhandener ZoomControl) bleibt erstklassig unterstützt — ältere
Nutzer vergrößern regelmäßig. Keine Information nur über Farbe (Stufen tragen
Symbol + Label zusätzlich zur Farbe). Reduzierte Motion respektieren; die App
verzichtet ohnehin weitgehend auf Animation.
