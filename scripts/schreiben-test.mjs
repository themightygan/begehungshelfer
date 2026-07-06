#!/usr/bin/env node
// Testlauf Schreiben-Generator: baut für echte Befunde die docx-Entwürfe
// (Mitteilung / 1. / 2. Abmahnung) nach /tmp/schreiben-test/ + PDF-Vorschau.
// Nutzt die App-Logik aus src/lib/{bausteine,schreiben}.ts (via tsc nach /tmp
// kompiliert) + Ollama qwen3:14b NUR für Freitext->Baustein-Zuordnung.
// Aufruf: node scripts/schreiben-test.mjs <befundId:typ> [...]
//   z. B. node scripts/schreiben-test.mjs 185:mitteilung 240:abmahnung_1 151:abmahnung_2
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const WURZEL = "/Users/macmini/Code/begehungshelfer";
const STORAGE = resolve(WURZEL, "storage");
const AUS = "/tmp/schreiben-test";
const LIB = "/tmp/schreiben-lib";
mkdirSync(AUS, { recursive: true });

// TS-Libs für Node kompilieren (CommonJS, nur für diesen Testlauf)
execFileSync("npx", ["tsc", "src/lib/bausteine.ts", "src/lib/schreiben.ts",
  "--outDir", LIB, "--module", "commonjs", "--target", "es2022", "--skipLibCheck"],
  { cwd: WURZEL, timeout: 60000 });
const require = createRequire(import.meta.url);
const { baueSchreiben } = require(join(LIB, "schreiben.js"));
const { KATALOG_ZU_BAUSTEIN, BAUSTEINE } = require(join(LIB, "bausteine.js"));

const prisma = new PrismaClient();

// --- Freitext -> Baustein via lokalem Ollama (qwen3:14b), striktes JSON ---
const KATALOG_TEXT = BAUSTEINE.map((b) => {
  const kurz = {
    G02: "Staudenrabatten vernachlässigt", G03: "Grenzabstand Anpflanzung", G04: "Zaunfreiheit (0,5 m) nicht eingehalten",
    G05: "Anpflanzung entgegen GO (unzulässige Art/Sorte/Standort/Hochstamm)", G06: "Vernachlässigter Pflegezustand",
    G07: "Obstbäume vernachlässigt", G08: "Beerensträucher vernachlässigt", G09: "Ziergehölze vernachlässigt / über 3 m",
    G10: "Wildlinge / großkronige Laubbäume", G11: "Nadelgehölze/Koniferen", G12: "Formhecken unzulässig/zu hoch",
    G13: "Rasen ungemäht mit Samenflug (Eilfall)", G14: "Invasiver Neophyt",
    B01: "Grenzabstand Baulichkeit", B02: "Laube falsche Farbe", B03: "Laube unerlaubte bauliche Veränderung",
    B04: "Laube Unfallgefahr", B05: "Terrassen-/Sitzplatzfläche überschritten", B06: "Gerätekiste",
    B07: "Pergola", B08: "Beton/Stellplatten/Ortbeton", B09: "Grill", B10: "Kompostplatz Zustand/Inhalt",
    B11: "Hochbeet", B12: "Tomatenüberdachung/Foliengewächshaus", B13: "Sonstige unerlaubte Baulichkeit",
    S01: "Müll/Sperrmüll/Altholz", S02: "Kunststoff/Mikroplastik im Boden", S03: "Tierkadaver/Speisereste",
    S04: "Gemeinschaftswege/Außenrand ungepflegt", S05: "Pachtvertrag/Wertermittlung nicht umgesetzt",
    S06: "Wasserschacht Unfallgefahr", S07: "Gartenteich", S08: "Unterverpachtung/fremde Hilfe",
    S09: "Unfallgefahr (allgemein)",
  }[b.id];
  return `${b.id} ${kurz}`;
}).join("\n");

async function zuordnen(punkt, notiz) {
  const prompt = `Du ordnest einen Freitext-Mangel aus einer Kleingarten-Begehung GENAU EINEM Baustein zu.

KATALOG:
${KATALOG_TEXT}
KEIN kein passender Baustein

REGELN: Wähle die fachlich beste ID, im Zweifel "KEIN". Antworte NUR mit JSON: {"baustein": "..."}

MANGEL: ${punkt || "(leer)"}${notiz ? ` — ${notiz}` : ""}
JSON:`;
  try {
    const r = await fetch("http://localhost:11434/api/generate", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "qwen3:14b", prompt, stream: false, format: "json", think: false, options: { temperature: 0 } }),
      signal: AbortSignal.timeout(60000),
    });
    const id = String(JSON.parse((await r.json()).response ?? "{}").baustein ?? "").slice(0, 3);
    return BAUSTEINE.some((b) => b.id === id) ? id : null;
  } catch { return null; }
}

const auftraege = process.argv.slice(2).map((a) => {
  const [id, typ] = a.split(":");
  return { befundId: Number(id), typ };
});
const erzeugteDocx = [];
if (auftraege.length === 0) {
  console.log("Aufruf: node scripts/schreiben-test.mjs <befundId:typ> ...");
  process.exit(2);
}

for (const auftrag of auftraege) {
  const b = await prisma.befund.findUniqueOrThrow({
    where: { id: auftrag.befundId },
    include: {
      runde: true,
      parzelle: { include: { anlage: true, dokumente: { orderBy: { datum: "asc" } } } },
      beete: true,
      maengel: { include: { katalog: true, fotos: true }, orderBy: { id: "asc" } },
    },
  });
  const verein = await prisma.verein.findUniqueOrThrow({ where: { id: 1 } });
  const p = b.parzelle;

  // Gemüse-Mangel abtrennen (wird deterministisch aus Beeten gebaut)
  const gemueseMangel = b.maengel.find((m) => m.katalog?.punkt.startsWith("Gemüseanbau"));
  const istM2 = b.beete.length ? b.beete.reduce((s, t) => s + t.flaecheM2, 0) : null;

  const maengel = [];
  for (const m of b.maengel) {
    if (m === gemueseMangel) continue;
    const istKatalog = m.katalogId !== null;
    let bausteinId = istKatalog ? (KATALOG_ZU_BAUSTEIN[m.katalog?.punkt ?? m.punkt] ?? null) : null;
    if (!istKatalog && (m.punkt.trim() || m.notiz.trim())) {
      bausteinId = await zuordnen(m.punkt.trim(), m.notiz.trim());
      console.log(`  LLM: "${(m.punkt || m.notiz).slice(0, 50)}" -> ${bausteinId ?? "KEIN"}`);
    }
    maengel.push({
      punkt: m.punkt.trim(), notiz: m.notiz.trim(), istKatalog, bausteinId,
      fotoPfade: m.fotos.map((f) => join(STORAGE, f.dateipfad)).filter((pf) => existsSync(pf)),
    });
  }

  // Historie (nur Abmahnung 2): Vorschlag aus der Dokumenten-Akte
  let historie = null;
  if (auftrag.typ === "abmahnung_2" && p.dokumente.length) {
    const jahre = [...new Set(p.dokumente.filter((d) => d.typ === "schreiben").map((d) => d.datum.getFullYear()))];
    const letzteAbm = p.dokumente.filter((d) => /abmahnung/i.test(d.notiz)).at(-1);
    historie = {
      seit: `dem Jahr ${jahre[0] ?? p.dokumente[0].datum.getFullYear()}`,
      hinweise: `in den Jahren ${jahre.join(" und ")} auf Mängel der Bewirtschaftung`,
      datum1Abmahnung: (letzteAbm ?? p.dokumente.at(-1)).datum.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" }),
    };
  }

  const { vorlage, kontext, warnungen } = baueSchreiben({
    typ: auftrag.typ,
    begehungDatum: b.runde.datum,
    parzelle: {
      parzelleId: p.parzelleId, anlageName: p.anlage.name,
      vorname: p.vorname, nachname: p.nachname,
      strasse: p.strasse, plz: p.plz, ort: p.ort,
      anrede: p.anrede, anredeStil: p.anredeStil, eintritt: p.eintritt,
      groesseM2: p.groesseM2,
    },
    gemuese: gemueseMangel ? { vorhanden: true, istM2 } : null,
    maengel,
    verein,
    logoPfad: auftrag.typ === "abmahnung_2" ? null : join(WURZEL, "public/img/logo.png"),
    unterzeichner: { name: "Sascha Theißen", funktion: "stv. Vorsitzender" },
    unterzeichnerBv: { name: "N. N.", funktion: "Vorstand" },
    historie,
    wiederholung: auftrag.typ !== "mitteilung",
    ersatzvornahme: false,
  });

  const name = `${auftrag.typ}_${p.parzelleId}`;
  const jobPfad = join(AUS, `${name}.job.json`);
  const docx = join(AUS, `${name}.docx`);
  writeFileSync(jobPfad, JSON.stringify({ vorlage: join(WURZEL, "vorlagen", `${vorlage}.docx`), ausgabe: docx, kontext }));
  execFileSync(join(WURZEL, "data/.venv/bin/python3"), [join(WURZEL, "scripts/render_docx.py"), jobPfad], { timeout: 60000 });
  erzeugteDocx.push(docx);
  console.log(`✓ ${name}.docx (${b.maengel.length} Mängel, ${maengel.reduce((s, m) => s + m.fotoPfade.length, 0)} Fotos)`);
  for (const warnung of warnungen) console.log(`  ⚠ ${warnung}`);
}

await prisma.$disconnect();
// PDF-Vorschau zum Anschauen (das docx bleibt das eigentliche Arbeitsdokument)
execFileSync("/opt/homebrew/bin/soffice", ["--headless", "-env:UserInstallation=file:///tmp/soffice-schreiben",
  "--convert-to", "pdf", "--outdir", AUS, ...erzeugteDocx], { timeout: 120000 });
console.log(`\nFertig — Entwürfe (docx + pdf) in ${AUS}`);
