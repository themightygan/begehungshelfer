// Import der inoffiziell ermittelten Parzellenflächen (Luftbild / Wasserschächte).
// Quelle: Auswertung des Vorstands anhand der parzellentrennenden Wasserleitungen;
// NICHT vertragsrelevant (die offizielle groesseM2 enthält zugeschlagene
// Gemeinschaftsflächen), aber besserer Indikator für "ist das Beet groß genug?".
// Stand: nur Kühwasen (K) erhoben. Silberwald bleibt leer -> Anzeige fällt weg.
// Ohne Flag: Dry-Run (nur Report). Mit --fix: schreibt groesseErmitteltM2.
// Ausführen: node --env-file=.env scripts/import-flaechen-luftbild.mjs [--fix]
import { PrismaClient } from "@prisma/client";

const fix = process.argv.includes("--fix");
const prisma = new PrismaClient();

// Garten-Nummer (Kühwasen) -> ermittelte Fläche in m²
const WERTE = `
54 434
5 418
55 393
56 391
3 360
53 360
4 359
51 359
34 353
16 350
52 347
6 345
18 344
7 342
31 342
32 341
2 339
17 338
30 338
69 337
33 334
40 332
39 331
27 329
66 329
21 328
41 328
70 328
8 326
68 326
38 324
64 322
71 322
15 321
23 321
65 321
57 320
22 319
1 317
35 317
50 317
63 317
10 315
20 315
36 315
29 312
11 309
26 309
37 309
12 308
45 308
9 307
43 306
28 305
42 304
14 301
46 301
13 299
19 299
62 299
61 295
49 292
58 292
44 290
24 287
67 283
40a 274
47 274
25 270
60 257
59 222
48 221
`;

const quelle = new Map();
for (const zeile of WERTE.trim().split("\n")) {
  const [nr, m2] = zeile.trim().split(/\s+/);
  quelle.set(`K${nr}`, parseInt(m2, 10));
}

const parzellen = await prisma.parzelle.findMany({
  where: { anlage: { kuerzel: "K" } },
  select: { parzelleId: true, groesseM2: true, groesseErmitteltM2: true },
  orderBy: [{ nummer: "asc" }, { index: "asc" }],
});

const fehlend = parzellen.filter((p) => !quelle.has(p.parzelleId)).map((p) => p.parzelleId);
const unbekannt = [...quelle.keys()].filter((id) => !parzellen.some((p) => p.parzelleId === id));
if (fehlend.length) console.log(`! Ohne Luftbild-Wert: ${fehlend.join(", ")}`);
if (unbekannt.length) console.log(`! Nicht in der DB: ${unbekannt.join(", ")}`);

let neu = 0, geaendert = 0, gleich = 0;
for (const p of parzellen) {
  const wert = quelle.get(p.parzelleId);
  if (wert == null) continue;
  if (p.groesseErmitteltM2 === wert) { gleich++; continue; }
  if (p.groesseErmitteltM2 == null) neu++; else geaendert++;
  const diff = p.groesseM2 ? wert - p.groesseM2 : null;
  console.log(
    `${p.parzelleId.padEnd(5)} offiziell ${String(p.groesseM2 ?? "—").padStart(4)} m²  ->  ermittelt ${String(wert).padStart(4)} m²` +
      (diff === null ? "" : `  (${diff > 0 ? "+" : ""}${diff})`) +
      (p.groesseErmitteltM2 == null ? "" : `  [war ${p.groesseErmitteltM2}]`),
  );
  if (fix) {
    await prisma.parzelle.update({
      where: { parzelleId: p.parzelleId },
      data: { groesseErmitteltM2: wert },
    });
  }
}

console.log(`\n${neu} neu, ${geaendert} geändert, ${gleich} unverändert — ${fix ? "GESCHRIEBEN" : "Dry-Run (--fix zum Schreiben)"}`);
await prisma.$disconnect();
