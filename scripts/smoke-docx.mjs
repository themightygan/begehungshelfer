#!/usr/bin/env node
// Smoke-Test docx-Rendering (scripts/render_docx.py + vorlagen/*.docx).
// Rendert drei realistische Beispiel-Schreiben nach /tmp/smoke-docx/ und prüft:
// valides ZIP/docx, keine unaufgelösten Jinja-Tags, Bilder eingebettet.
// Aufruf: node scripts/smoke-docx.mjs   (danach optional soffice -> PDF ansehen)
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const WURZEL = "/Users/macmini/Code/begehungshelfer";
const PY = `${WURZEL}/data/.venv/bin/python3`;
const AUS = "/tmp/smoke-docx";
mkdirSync(AUS, { recursive: true });

// Echte App-Assets: EXIF-gestripptes Foto (sharp) + PNG-Logo — genau die
// Formate, an denen python-docx ohne Pillow-Reencode scheitert.
const FOTO = `${WURZEL}/storage/fotos/318/7703d0ba-7980-42fc-ba83-9c8346b04308.jpg`;
const FOTO2 = `${WURZEL}/storage/fotos/318/04e597fc-bf6d-4ab7-96ed-2b9c7e2b3959.jpg`;
const LOGO = `${WURZEL}/public/img/logo.png`;

const org = {
  verein_name: "Gartenfreunde Stuttgart Sillenbuch e. V.",
  verein_strasse: "Isegrimweg 30",
  verein_plz_ort: "70619 Stuttgart",
  verein_tel: "0711 / 443161",
  verein_email: "vorstand@gartenfreunde-sillenbuch.de",
  bv_name: "Bezirksverband der Gartenfreunde Stuttgart e. V.",
  bv_strasse: "Hedelfinger Str. 95",
  bv_plz_ort: "70327 Stuttgart",
  bv_email: "info@gartenfreunde-stuttgart.de",
  ort: "Stuttgart",
  heute_datum: "6. Juli 2026",
  empf_anrede_zeile: "Frau",
  empf_name: "Erika Musterfrau",
  empf_strasse: "Musterweg 1",
  empf_plz_ort: "70619 Stuttgart",
  anrede: "Sehr geehrte Frau Musterfrau",
  parzelle: "K99",
  begehung_datum: "13. Juni 2026",
  frist_datum: "31. August 2026",
};

const faelle = [
  {
    name: "mitteilung",
    vorlage: `${WURZEL}/vorlagen/mitteilung.docx`,
    kontext: {
      ...org,
      logo: LOGO,
      anlage: "Kühwasen",
      erlaeuterung: true,
      hinweis_wiederholung: true,
      fotos_beigefuegt: true,
      unterzeichner_name: "Sascha Theißen",
      unterzeichner_funktion: "stv. Vorsitzender",
      beanstandungen: [
        {
          // SOLL/IST steckt im Text (kein eigener Platzhalter in der Vorlage!)
          text: "Ihre derzeitige Gemüseanbaufläche ist mit etwa 8 m² noch zu klein. Vertraglich sind bei Ihrer Parzelle von 320 m² rund 53 m² vereinbart (§ 12 des Unterpachtvertrages). Wir bitten Sie, die Fläche entsprechend zu vergrößern.",
          frist: "30. April 2027",
        },
        { text: "Sonderzeichen-Test: Hecke > 3 m & \"Efeu\" <überwuchert> den Zaun.", foto: "1–2" },
      ],
    },
  },
  {
    name: "abmahnung_verein",
    vorlage: `${WURZEL}/vorlagen/abmahnung_verein.docx`,
    kontext: {
      ...org,
      logo: LOGO,
      wiederholung: true,
      ersatzvornahme: true,
      lageplan: false,
      betreff_grund: "mangelhafter Bewirtschaftung der Parzelle",
      abmahn_grund: "mangelhafter Bewirtschaftung der Parzelle (§ 4 Ziff. 1 des Unterpachtvertrages)",
      unterzeichner_name: "Sascha Theißen",
      unterzeichner_funktion: "stv. Vorsitzender",
      beanstandungen: [
        {
          text: "Die Parzelle weist erhebliche Pflegerückstände auf: Beete verunkrautet, Rasen ungemäht. Stellen Sie einen ordnungsgemäßen Kulturzustand her. (§ 4 Ziff. 1 UPV)",
          bilder: [FOTO, FOTO2], // echte EXIF-gestrippte App-Fotos (identische dedupliziert docx!)
        },
        { text: "Auf der Parzelle wird Müll gelagert. Entsorgen Sie ihn fachgerecht. (§ 4 Ziff. 1 UPV)", foto: "3" },
      ],
    },
  },
  {
    name: "abmahnung_bv",
    vorlage: `${WURZEL}/vorlagen/abmahnung_bv.docx`,
    kontext: {
      ...org,
      historie: true,
      historie_seit: "dem Jahr 2023",
      historie_hinweise: "in den Jahren 2023 und 2024 auf die Mängel hingewiesen",
      datum_1_abmahnung: "7. Juni 2025",
      ersatzvornahme: false,
      lageplan: true,
      betreff_grund: "Verstößen gegen die Gartenordnung",
      abmahn_grund: "diverser Verstöße gegen die Gartenordnung (§ 4 Ziff. 2 des Unterpachtvertrages)",
      unterzeichner_name_bv: "Sabine Metzger",
      unterzeichner_funktion_bv: "Vorsitzende",
      beanstandungen: [
        { text: "In der Parzelle befinden sich unzulässige Nadelgehölze. Roden Sie diese vollständig mit der Wurzel. (GO 1.2)", bilder: [FOTO] },
      ],
    },
  },
];

let fehler = 0;
for (const f of faelle) {
  const ausgabe = join(AUS, `${f.name}.docx`);
  const job = join(AUS, `${f.name}.job.json`);
  writeFileSync(job, JSON.stringify({ vorlage: f.vorlage, ausgabe, kontext: f.kontext }));
  try {
    execFileSync(PY, [`${WURZEL}/scripts/render_docx.py`, job], { timeout: 60000 });
  } catch (e) {
    console.log(`✗ ${f.name}: Renderer-Fehler: ${e.stderr?.toString().trim() || e.message}`);
    fehler++;
    continue;
  }
  if (!existsSync(ausgabe) || statSync(ausgabe).size < 10000) {
    console.log(`✗ ${f.name}: Ausgabe fehlt/zu klein`);
    fehler++;
    continue;
  }
  // Validierung: docx lesbar, keine Jinja-Reste, Bilder wirklich drin
  const pruef = execFileSync(PY, ["-c", `
import re, sys, zipfile
from docx import Document
z = zipfile.ZipFile(${JSON.stringify(ausgabe)})
xml = z.read("word/document.xml").decode("utf-8")
text = re.sub(r"<[^>]+>", "", xml)
assert "{{" not in text and "{%" not in text, "unaufgelöste Jinja-Tags"
d = Document(${JSON.stringify(ausgabe)})  # python-docx kann Ergebnis öffnen
# Bild-PLATZIERUNGEN zählen (<a:blip>) — Media-Dateien dedupliziert docx bei
# identischen Bildern, die Referenzanzahl muss trotzdem stimmen.
print(len(re.findall(r"<a:blip ", xml)))
`], { timeout: 30000 }).toString().trim();
  const erwarteteBilder = (f.kontext.logo ? 1 : 0) + f.kontext.beanstandungen.reduce((n, b) => n + (b.bilder?.length ?? 0), 0);
  if (Number(pruef) < erwarteteBilder) {
    console.log(`✗ ${f.name}: nur ${pruef} Bild-Referenzen im docx, erwartet >= ${erwarteteBilder}`);
    fehler++;
    continue;
  }
  console.log(`✓ ${f.name} (${statSync(ausgabe).size} Bytes, ${pruef} Bilder)`);
}
console.log(fehler === 0 ? `\nAlle ${faelle.length} Renders OK — Ausgaben in ${AUS}` : `\n${fehler} Fehler`);
process.exit(fehler === 0 ? 0 : 1);
