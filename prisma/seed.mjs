// Seed: Anlagen + Parzellen (aus data/parzellen.csv) + Mängelkatalog (aus dem Vereins-Formular).
// Ausführen: npx prisma db seed   (lädt .env über die Prisma-CLI)
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const prisma = new PrismaClient();
const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV = join(__dirname, "..", "data", "parzellen.csv");

// --- Minimaler CSV-Parser (RFC4180: doppelte Anführungszeichen) ---
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const ANLAGEN = { K: "Kühwasen", S: "Silberwald" };
// Statische Orientierungspläne (liegen committed unter public/plaene/).
const PLAN = { K: "/plaene/kuehwasen.jpg", S: "/plaene/silberwald.jpg" };

// --- Mängelkatalog aus Formular_Gartenbegehung_neutral.pdf ---
const KATALOG = [
  // Bereich Garten
  ["Garten", "Gemüseanbaufläche", "nicht vorhanden / verunkrautet / zu gering / nicht bestellt", "UPV §4, §12"],
  ["Garten", "Staudenrabatten", "", "UPV §4 / GO 1.2"],
  ["Garten", "Nicht eingehaltener Grenzabstand (Anpflanzung)", "", "UPV §4.2 / GO 1.2"],
  ["Garten", "Nicht eingehaltener Sitzplatz-Grenzabstand / Anpflanzung entgegen GO", "", "UPV §4.2 / GO 1.2"],
  ["Garten", "Vernachlässigter Pflegezustand", "", "UPV §4.1, §4.2, §4.5"],
  ["Garten", "Obstbaum-Bestand vernachlässigt", "", "UPV §4.2 / GO 2.1"],
  ["Garten", "Beerenobst vernachlässigt", "", "UPV §4.2 / GO 2.1"],
  ["Garten", "Ziergehölze vernachlässigt", "max. 3 m Höhe, max. 1/5 der Fläche", "UPV §4.2 / GO 2.1"],
  ["Garten", "Wildlinge / großkronige Laubbäume entgegen GO", "natürl. Höhe > 3 m unzulässig", "UPV §4.1, §4.2 / GO 1.2"],
  ["Garten", "Nadelgehölze entgegen GO", "Koniferen in der Anlage verboten", "UPV §4.2 / GO 1.2"],
  ["Garten", "Formhecken entgegen GO", "z. B. höher als 1,20 m", "UPV §4.2 / GO 1.3"],
  // Bereich Baulichkeiten und Nebenanlagen
  ["Baulichkeiten und Nebenanlagen", "Nicht eingehaltener Grenzabstand", "", "GO 4 ff."],
  ["Baulichkeiten und Nebenanlagen", "Laube – falsche Farbe", "", "UPV §4.4, §6 / GO 4.1"],
  ["Baulichkeiten und Nebenanlagen", "Laube – unerlaubte bauliche Veränderung", "", "UPV §4.4, §6 / GO 4.1"],
  ["Baulichkeiten und Nebenanlagen", "Laube – Unfallgefahr", "", "UPV §4.1 / GO 14.1"],
  ["Baulichkeiten und Nebenanlagen", "Überschreitung zulässige Terrassen-/Sitzplatzfläche", "max. 15 m²; befestigt max. 15 % der Parzelle", "UPV §4.2 / GO 4.6"],
  ["Baulichkeiten und Nebenanlagen", "Gerätekiste", "zu groß (max. 200×90×120 cm)", "UPV §4.2 / GO 4.4"],
  ["Baulichkeiten und Nebenanlagen", "Pergola", "zu groß / unerlaubte Überdachung / nicht genehmigt (max. 6 m², 2,40 m)", "UPV §4.2 / GO 4.5"],
  ["Baulichkeiten und Nebenanlagen", "Beton-Stellplatten / -Pflanzsteine", "", "UPV §4.2 / GO 4.7, 4.8"],
  ["Baulichkeiten und Nebenanlagen", "Grill", "max. 1,20×1,20×0,80 m; Abstände beachten", "UPV §4.2 / GO 4.10"],
  ["Baulichkeiten und Nebenanlagen", "Kompostplatz / -behälter", "max. 5 m², 1,00 m Höhe", "UPV §4.2 / GO 4.11"],
  ["Baulichkeiten und Nebenanlagen", "Hochbeet", "nicht genehmigt / defekt (1 m Grenzabstand)", "UPV §4.2 / GO 4.14"],
  ["Baulichkeiten und Nebenanlagen", "Tomatenüberdachung / Foliengewächshaus", "zu große Grundfläche / falsches Material (max. 6 m², 2 m, Apr–Okt)", "UPV §4.2 / GO 4.15, 4.16"],
  // Bereich Sonstiges
  ["Sonstiges", "Müll auf der Parzelle gelagert", "", "UPV §4.1"],
  ["Sonstiges", "Zustand anteilig zu betreuender Gemeinschaftswege / Außenrand", "", "UPV §4.1, §4.2, §4.5 / GO 6, 9"],
  ["Sonstiges", "Fehlende Umsetzung der Zusätze aus Pachtvertrag / Wertermittlung", "", "UPV §4.4 / §12"],
  ["Sonstiges", "Wasserschächte in schlechtem Zustand", "", "UPV §4.1 / GO 14.1"],
  ["Sonstiges", "Gartenteiche", "max. 6 m² Wasserfläche, 0,80 m Tiefe", "UPV §4.2 / GO 4.18"],
];

async function main() {
  // Anlagen
  const anlageId = {};
  for (const [kuerzel, name] of Object.entries(ANLAGEN)) {
    const a = await prisma.anlage.upsert({
      where: { kuerzel },
      update: { name, planBild: PLAN[kuerzel] },
      create: { kuerzel, name, planBild: PLAN[kuerzel] },
    });
    anlageId[kuerzel] = a.id;
  }

  // Parzellen
  const rows = parseCsv(readFileSync(CSV, "utf8"));
  const header = rows[0];
  const col = (name) => header.indexOf(name);
  const c = {
    id: col("parzelle_id"), anl: col("anlage_kuerzel"), nr: col("nummer"), idx: col("index"),
    nachname: col("nachname"), vorname: col("vorname"), email: col("email"), tel: col("telefon"),
    str: col("strasse"), plz: col("plz"), ort: col("ort"), ein: col("eintritt"), m2: col("groesse_m2"),
  };
  let n = 0;
  for (const r of rows.slice(1)) {
    if (!r[c.id] || !ANLAGEN[r[c.anl]]) continue;
    const groesse = r[c.m2] ? parseInt(r[c.m2], 10) : null;
    const data = {
      anlageId: anlageId[r[c.anl]], nummer: parseInt(r[c.nr], 10) || 0, index: r[c.idx] || "",
      nachname: r[c.nachname] || "", vorname: r[c.vorname] || "", email: r[c.email] || "",
      telefon: r[c.tel] || "", strasse: r[c.str] || "", plz: r[c.plz] || "", ort: r[c.ort] || "",
      eintritt: r[c.ein] || "", groesseM2: Number.isNaN(groesse) ? null : groesse,
    };
    await prisma.parzelle.upsert({
      where: { parzelleId: r[c.id] }, update: data, create: { parzelleId: r[c.id], ...data },
    });
    n++;
  }

  // Mängelkatalog (nur seeden, wenn leer — überschreibt keine Anpassungen)
  const katalogCount = await prisma.katalog.count();
  if (katalogCount === 0) {
    await prisma.katalog.createMany({
      data: KATALOG.map(([bereich, punkt, hinweis, referenz], i) => ({
        bereich, punkt, hinweis, referenz, sortierung: i,
      })),
    });
  }

  // Vorstand (Teilnehmerliste + optionale Logins). update: {} — nie E-Mail/
  // Passwort/aktiv überschreiben (Pflege via /einstellungen). Auf der Prod-DB
  // läuft der Erst-Seed über die Migration stufen_status_vorstand.
  const VORSTAND = [
    "Sabine Metzger", "Dr. Sascha Theißen", "Sonja Theißen", "Nicole Boine",
    "Erika Strack", "Adrian Jörreßen", "Sadullah Ödes", "Tomasz Weidler",
    "Dr. Ralf Riekers",
  ];
  for (let i = 0; i < VORSTAND.length; i++) {
    await prisma.vorstand.upsert({
      where: { name: VORSTAND[i] },
      update: {},
      create: { name: VORSTAND[i], sortierung: i + 1 },
    });
  }

  const counts = {
    anlagen: await prisma.anlage.count(),
    parzellen: await prisma.parzelle.count(),
    katalog: await prisma.katalog.count(),
    vorstand: await prisma.vorstand.count(),
  };
  console.log(`Seed fertig: ${n} Parzellen verarbeitet.`, counts);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
