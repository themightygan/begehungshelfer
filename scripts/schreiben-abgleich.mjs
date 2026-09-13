#!/usr/bin/env node
// MESS-HARNESS: Wie nah liegt unser generierter Entwurf am tatsächlich
// versandten Schreiben? (read-only — schreibt NICHTS in DB/Storage.)
//
// Ablauf:
//   1. Korpus aus der DB bauen: 2026-Befunde mit Schreiben-Stufe (mitteilung/
//      abmahnung_1/abmahnung_2), für die ein versandtes PDF in der Akte liegt.
//   2. Für jeden: Eingabe rekonstruieren (wie schreibenErzeugen.ts, aber OHNE
//      LLM — Freitext bleibt Freitext = deterministisch/offline), baueSchreiben,
//      Brieftext lokal aus den Vorlagen rendern.
//   3. gen.json schreiben, Python-Scorer aufrufen (PDF-Text + difflib).
//
// Aufruf:  node scripts/schreiben-abgleich.mjs [--nur mitteilung|abmahnung]
// Ergebnis: Tabelle (Ähnlichkeit gesamt + je Beanstandung) + Report-Datei.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const WURZEL = "/Users/macmini/Code/begehungshelfer";
const STORAGE = resolve(WURZEL, process.env.STORAGE_DIR ?? "storage");
const AUS = "/tmp/schreiben-abgleich";
const LIB = "/tmp/schreiben-abgleich-lib";
mkdirSync(AUS, { recursive: true });

const args = process.argv.slice(2);
const nurIdx = args.indexOf("--nur");
const NUR = nurIdx >= 0 ? args[nurIdx + 1] : null; // "mitteilung" | "abmahnung"
const LLM = args.includes("--llm"); // Freitext->Baustein via Ollama (wie Produktion)

// --- App-Logik kompilieren (wie scripts/schreiben-test.mjs) ---
execFileSync(
  "npx",
  ["tsc", "src/lib/bausteine.ts", "src/lib/schreiben.ts", "src/lib/paechter.ts",
    "--outDir", LIB, "--module", "commonjs", "--target", "es2022", "--skipLibCheck"],
  { cwd: WURZEL, timeout: 90000 }
);
const require = createRequire(import.meta.url);
const { baueSchreiben } = require(join(LIB, "schreiben.js"));
const { KATALOG_ZU_BAUSTEIN } = require(join(LIB, "bausteine.js"));
const { istNeupaechter } = require(join(LIB, "paechter.js"));

const { BAUSTEINE } = require(join(LIB, "bausteine.js"));
const prisma = new PrismaClient();

// Freitext -> Baustein via lokalem Ollama (identisch zu schreibenErzeugen.ts).
const KATALOG_TEXT = BAUSTEINE.map((b) => `${b.id} ${b.label}`).join("\n");
async function zuordnen(punkt, notiz) {
  if (/eternit/i.test(`${punkt} ${notiz}`)) return "S12";
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

const STUFE_ZU_TYP = { mitteilung: "mitteilung", abmahnung_1: "abmahnung_1", abmahnung_2: "abmahnung_2" };
const artVonTyp = (t) => (t === "mitteilung" ? "mitteilung" : "abmahnung");

// ------- Brieftext aus dem docx-Kontext rendern (spiegelt vorlagen/*.docx) -------
const P = (form, sie, du) => (form === "Du" ? du : sie);
function renderMitteilung(k) {
  // EXPERIMENT-Schalter (nur Messung, ändern NICHT die Produktionslogik):
  // simulieren, was ein Wegfall einzelner Floskel-Blöcke für die Ähnlichkeit
  // bringt. Env: EXP_NO_ERLAEUTERUNG / EXP_NO_WARNUNG / EXP_NO_AUFLISTUNG.
  if (process.env.EXP_NO_ERLAEUTERUNG) k = { ...k, erlaeuterung: false };
  if (process.env.EXP_NO_WARNUNG) k = { ...k, hinweis_wiederholung: false };
  if (process.env.EXP_NO_AUFLISTUNG) k = { ...k, auflistung: false };
  const f = k.anrede_form;
  const L = [];
  L.push(`${k.anrede},`);
  if (k.neupaechter) {
    L.push(
      `wie wir ${P(f, "Ihnen", "Dir")} beim Informationsabend und vermutlich auch bei der Gartenübergabe mitgeteilt haben, muss jeder Vorstand eines Ortsvereins stellvertretend für die Stadt Stuttgart als Verpächter sämtliche Parzellen jährlich begehen und danach schauen, ob die Regeln des Pachtvertrags und der Gartenordnung bei der Bewirtschaftung durch den Pächter eingehalten werden. Bei der diesjährigen Gartenbegehung am ${k.begehung_datum} haben der Vorstand und die Fachberatung des Vereins auch ${P(f, "Ihre", "Deine")} Parzelle besucht. Dabei sind uns die nachstehenden Punkte aufgefallen, die hiermit nicht in Einklang stehen und bei denen wir ${P(f, "Sie", "Dich")} – auch im Sinne einer guten Entwicklung ${P(f, "Ihres", "Deines")} Gartens – um Abhilfe bitten:`
    );
  } else {
    L.push(
      `bei der diesjährigen Gartenbegehung am ${k.begehung_datum} haben der Vorstand und die Fachberatung des Vereins auch ${P(f, "Ihre", "Deine")} Parzelle besucht. Dabei sind uns einige Punkte aufgefallen, auf die wir ${P(f, "Sie", "Dich")} – auch im Sinne einer guten Entwicklung ${P(f, "Ihres", "Deines")} Gartens – gerne hinweisen möchten.`
    );
  }
  if (k.plakette)
    L.push(`Die Parzelle präsentiert sich insgesamt sehr vorbildlich – dafür erteilen wir sehr gerne die „Gut gemacht“-Plakette ${k.plakette_jahr}. Dennoch erlauben wir uns ${k.hinweis_anzahl_text}.`);
  if (k.neupaechter_lob)
    L.push(`Wir sehen eine sehr positive Entwicklung der Parzelle, was uns sehr freut. Die folgenden Punkte sind als konstruktive Hinweise gedacht, damit die weiteren Bemühungen in die richtige Richtung laufen.`);
  if (k.erlaeuterung)
    L.push(`Mit der Unterzeichnung des Unterpachtvertrages ${P(f, "haben Sie sich", "hast Du Dich")} zur Einhaltung der Gartenordnung verpflichtet, die die kleingärtnerische Nutzung der Parzelle näher regelt.`);
  if (k.auflistung) L.push(`Wir bitten ${P(f, "Sie", "Dich")} daher, folgende Punkte anzugehen:`);
  k.beanstandungen.forEach((b, i) => L.push(`${i + 1}. ${b.text}${b.frist ? ` – Frist: ${b.frist}` : ""}`));
  if (k.hinweis_wiederholung)
    L.push(`Wir gehen davon aus, dass sich diese Punkte unkompliziert beheben lassen. Sollten wir bei der nächsten Begehung dieselben Feststellungen treffen müssen, können wir es allerdings nicht mehr bei einer Mitteilung wie dieser belassen, sondern müssten eine Abmahnung aussprechen.`);
  L.push(`Für Rückfragen stehen wir ${P(f, "Ihnen", "Dir")} gerne zur Verfügung. ${P(f, "Sie erreichen", "Du erreichst")} uns per E-Mail unter ${k.verein_email}.`);
  L.push(`Mit freundlichen Grüßen`);
  L.push(`${k.vorsitzender}, 1. Vorsitzende`);
  L.push(`${k.verein_name}`);
  return L.join("\n");
}
function renderAbmahnungVerein(k) {
  const L = [];
  L.push(`${k.anrede},`);
  L.push(
    `im Auftrag des Verpächters, ${k.bv_name}, wurde die o. g. Parzelle am ${k.begehung_datum} durch Vertreter des Vorstands und des Beirates begangen. Dabei wurden${k.wiederholung ? " erneut" : ""}${k.vorjahre ? ", wie bereits in den Vorjahren," : ""} erhebliche ${k.verstoss_arten} festgestellt.`
  );
  L.push(`Daher mahnen wir Sie hiermit wegen ${k.abmahn_grund} ab.`);
  L.push(`Wir geben Ihnen Gelegenheit, die nachfolgenden Beanstandungen bis zum ${k.frist_datum} vollständig zu beseitigen:`);
  k.beanstandungen.forEach((b, i) => L.push(`${i + 1}. ${b.text}${b.frist ? ` – Frist: ${b.frist}` : ""}`));
  L.push(`Sollten die Mängel nach Ablauf der genannten Frist nicht vollständig beseitigt sein oder sich diese oder vergleichbare Mängel künftig erneut einstellen, werden wir die Angelegenheit dem Verpächter (${k.bv_name}) zur Einleitung des Kündigungsverfahrens vorlegen.`);
  if (k.ersatzvornahme)
    L.push(`Ferner weisen wir darauf hin, dass der Verpächter berechtigt ist, die Parzelle nach fruchtlosem Fristablauf und vorheriger Ankündigung der Ersatzvornahme auf Ihre Kosten ordnungsgemäß instand setzen zu lassen (§ 10 des Unterpachtvertrages).`);
  if (k.gemuese_schluss) L.push(k.gemuese_schluss);
  L.push(`Mit freundlichen Grüßen`);
  L.push(`${k.verein_name}`);
  L.push(`${k.vorsitzender}, 1. Vorsitzende`);
  return L.join("\n");
}
function renderAbmahnungBv(k) {
  const L = [];
  L.push(`${k.anrede},`);
  L.push(
    `als Verpächter der o. g. Parzelle wurden wir darüber informiert, dass die Vorstandschaft der ${k.verein_name} bei der Gartenbegehung am ${k.begehung_datum} erneut die im beigefügten Mitteilungsbogen dokumentierten Mängel festgestellt und dokumentiert hat.`
  );
  if (k.historie)
    L.push(`Zu derartigen Feststellungen kommt es seit ${k.historie_seit}. So wurden Sie bereits ${k.historie_hinweise} angeschrieben. Zuletzt wurden Sie am ${k.datum_1_abmahnung} schriftlich abgemahnt. Wie wir feststellen müssen, hatte dies leider keine anhaltende Wirkung.`);
  L.push(`Daher sprechen wir hiermit die zweite Abmahnung wegen ${k.abmahn_grund} aus.`);
  L.push(`Wir geben Ihnen nochmals Gelegenheit, die nachfolgenden Beanstandungen bis zum ${k.frist_datum} vollständig zu beseitigen:`);
  k.beanstandungen.forEach((b, i) => L.push(`${i + 1}. ${b.text}${b.frist ? ` – Frist: ${b.frist}` : ""}`));
  L.push(`Sollten die genannten Mängel nach Ablauf der Frist nicht vollständig beseitigt sein oder sich diese oder vergleichbare Mängel künftig erneut einstellen, sind die Voraussetzungen für eine Kündigung des Unterpachtvertrages nach § 9 Abs. 1 Nr. 1 BKleingG erfüllt. Wir werden die Kündigung in diesem Fall ohne weitere vorherige Ankündigung aussprechen.`);
  if (k.ersatzvornahme)
    L.push(`Ferner weisen wir darauf hin, dass der Verpächter berechtigt ist, die Parzelle nach fruchtlosem Fristablauf und vorheriger Ankündigung der Ersatzvornahme auf Ihre Kosten ordnungsgemäß instand setzen zu lassen (§ 10 des Unterpachtvertrages).`);
  if (k.gemuese_schluss) L.push(k.gemuese_schluss);
  L.push(`Mit freundlichen Grüßen`);
  L.push(`${k.bv_name}`);
  return L.join("\n");
}
const RENDER = { mitteilung: renderMitteilung, abmahnung_verein: renderAbmahnungVerein, abmahnung_bv: renderAbmahnungBv };

// versandtes PDF in der Akte finden, das zum Befund/Typ passt
function findePdf(dokumente, art, rundeDatum) {
  const kand = dokumente
    .filter((d) => {
      const t = `${d.notiz} ${d.dateipfad}`;
      const istAbm = /abmah|kündig|kuendig/i.test(t);
      const istMit = /mitteilung/i.test(t);
      if (art === "abmahnung") return d.typ === "schreiben" && istAbm;
      return istMit; // mitteilung (i. d. R. typ email)
    })
    .filter((d) => existsSync(join(STORAGE, d.dateipfad)))
    .sort((a, b) => +new Date(a.datum) - +new Date(b.datum));
  // Brief MUSS der Begehung folgen (kein Rückgriff auf Vorjahres-Schreiben);
  // frühestes passendes PDF ab Rundendatum (−3 Tage Slack).
  const slack = +new Date(rundeDatum) - 3 * 86400000;
  return kand.find((d) => +new Date(d.datum) >= slack) ?? null;
}

// ------- Korpus aufbauen -------
const befunde = await prisma.befund.findMany({
  where: { stufe: { in: ["mitteilung", "abmahnung_1", "abmahnung_2"] }, runde: { erstelltAm: { gte: new Date("2026-01-01") } } },
  include: {
    runde: true,
    beete: true,
    parzelle: { include: { anlage: true, dokumente: { orderBy: { datum: "asc" } } } },
    maengel: { include: { katalog: true, fotos: true }, orderBy: { id: "asc" } },
  },
});

const eintraege = [];
const uebersprungen = [];
for (const b of befunde) {
  const typ = STUFE_ZU_TYP[b.stufe];
  if (NUR && artVonTyp(typ) !== (NUR === "abmahnung" ? "abmahnung" : "mitteilung")) continue;
  const p = b.parzelle;
  const pdf = findePdf(p.dokumente, artVonTyp(typ), b.runde.datum);
  if (!pdf) { uebersprungen.push(`${p.parzelleId} (${typ}): kein versandtes PDF in der Akte`); continue; }

  const gemueseMangel = b.maengel.find((m) => m.katalog?.punkt.startsWith("Gemüseanbau"));
  const istM2 = b.beete.length ? b.beete.reduce((s, t) => s + t.flaecheM2, 0) : null;
  const gemueseWertVorhanden = istM2 !== null && istM2 > 0;

  let freitextRoh = 0;
  const maengel = [];
  for (const m of b.maengel) {
    if (m === gemueseMangel) continue;
    const istKatalog = m.katalogId !== null;
    // DETERMINISTISCH (kein LLM): Katalog -> Baustein-Map; Eternit -> S12;
    // sonstiger Freitext bleibt ohne Baustein (Passthrough) und wird gezählt.
    let bausteinId = istKatalog ? (KATALOG_ZU_BAUSTEIN[m.katalog?.punkt ?? m.punkt] ?? null) : null;
    if (!istKatalog && /eternit/i.test(`${m.punkt} ${m.notiz}`)) bausteinId = "S12";
    // --llm: Freitext wie in der Produktion per qwen3 zuordnen (sonst Passthrough).
    if (LLM && !istKatalog && !bausteinId && (m.punkt.trim() || m.notiz.trim())) {
      bausteinId = await zuordnen(m.punkt.trim(), m.notiz.trim());
    }
    if (!istKatalog && !bausteinId && (m.punkt.trim() || m.notiz.trim())) freitextRoh++;
    maengel.push({ punkt: m.punkt.trim(), notiz: m.notiz.trim(), istKatalog, bausteinId, fotoPfade: [] });
  }

  let historie = null;
  if (typ === "abmahnung_2" && p.dokumente.length) {
    const jahre = [...new Set(p.dokumente.filter((d) => d.typ === "schreiben").map((d) => new Date(d.datum).getFullYear()))].sort();
    const letzteAbm = p.dokumente.filter((d) => /abmahnung/i.test(d.notiz)).at(-1) ?? p.dokumente.at(-1);
    historie = {
      seit: `dem Jahr ${jahre[0] ?? new Date(p.dokumente[0].datum).getFullYear()}`,
      hinweise: `in den Jahren ${jahre.join(" und ")} auf Mängel der Bewirtschaftung`,
      datum1Abmahnung: new Date(letzteAbm.datum).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" }),
    };
  }

  let res;
  try {
    res = baueSchreiben({
      typ,
      begehungDatum: b.runde.datum,
      parzelle: {
        parzelleId: p.parzelleId, anlageName: p.anlage.name, vorname: p.vorname, nachname: p.nachname,
        strasse: p.strasse, plz: p.plz, ort: p.ort, anrede: p.anrede, anredeStil: p.anredeStil,
        eintritt: p.eintritt, groesseM2: p.groesseM2,
      },
      gemuese: gemueseMangel || gemueseWertVorhanden ? { vorhanden: true, istM2 } : null,
      kompensation: b.kompensationAusreichend,
      maengel,
      plakette: b.gutGemacht,
      neupaechter: istNeupaechter(p.eintritt, p.status),
      neupaechterLob: istNeupaechter(p.eintritt, p.status) && (b.gutGemacht || b.plakettenNotiz.trim() !== ""),
      verein: {
        name: "Gartenfreunde Sillenbuch e.V.", adresse: "Isegrimweg 30, 70619 Stuttgart",
        email: "vorstand@gartenfreunde-sillenbuch.de", telefon: "0711/443161", ort: "Stuttgart",
        vorsitzender: "Sabine Metzger",
        bvName: "Bezirksverband der Gartenfreunde Stuttgart e.V.", bvStrasse: "Hedelfinger Str. 95", bvPlzOrt: "70327 Stuttgart",
        bezirksverbandEmail: "info@gartenfreunde-stuttgart.de",
      },
      logoPfad: null,
      historie,
      wiederholung: typ !== "mitteilung",
      vorjahre: p.dokumente.some((d) => (d.typ === "schreiben" || d.typ === "email") && new Date(d.datum).getFullYear() < new Date(b.runde.datum).getFullYear()),
      overrides: {},
    });
  } catch (e) { uebersprungen.push(`${p.parzelleId} (${typ}): Fehler ${e.message}`); continue; }

  if (!res.kontext.beanstandungen?.length) { uebersprungen.push(`${p.parzelleId} (${typ}): 0 Beanstandungen`); continue; }
  const genText = RENDER[res.vorlage](res.kontext);
  eintraege.push({
    parzelle: p.parzelleId, typ, befundId: b.id, freitextRoh,
    anzahlMaengel: res.kontext.beanstandungen.length,
    generated: genText,
    beanstandungen: res.kontext.beanstandungen.map((x) => x.text),
    finalPdf: join(STORAGE, pdf.dateipfad),
    finalNotiz: pdf.notiz,
  });
}

await prisma.$disconnect();
writeFileSync(join(AUS, "gen.json"), JSON.stringify({ eintraege, uebersprungen }, null, 2));
console.log(`Korpus: ${eintraege.length} Paare, ${uebersprungen.length} übersprungen.\n`);

// Python-Scorer aufrufen (PDF-Text + OCR-Fallback + difflib)
const py = join(WURZEL, "data/.venv/bin/python");
execFileSync(py, [join(WURZEL, "scripts/schreiben_abgleich_score.py"), join(AUS, "gen.json")], {
  stdio: "inherit", env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` },
});
