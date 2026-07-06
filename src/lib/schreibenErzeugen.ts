// Kompletter Schreiben-Prozess für EINE Parzelle/Runde — gemeinsamer Kern für
// die Einzel-Karte in der Begehungsansicht und die Sammel-Erstellung aus der
// Auswertung. Typ folgt der Befund-Stufe:
//   mitteilung   -> docx -> PDF -> E-Mail-ENTWURF an Pächter (IMAP, HITL;
//                   docx UND PDF hängen an — bei Änderungen: PDF löschen,
//                   docx überarbeiten, neu als PDF exportieren)
//   abmahnung_1  -> docx -> per Mail an die VEREINSADRESSE (Word-Feinschliff)
//   abmahnung_2  -> docx -> E-Mail-ENTWURF an den BEZIRKSVERBAND (IMAP —
//                   nichts geht raus, der Verein kann Text + docx noch anpassen)
// LLM (qwen3:14b) NUR für Freitext->Baustein; alles Rechtliche ist Code.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { prisma } from "./db";
import { BAUSTEINE, KATALOG_ZU_BAUSTEIN } from "./bausteine";
import { istNeupaechter } from "./paechter";
import { baueSchreiben, nameSchoen, type SchreibenTyp } from "./schreiben";
import { rendereDocx, VORLAGEN } from "./docx";
import { entwurfInPostfach, istEinzelAdresse, mailSenden } from "./mail";
import { STORAGE_DIR } from "./storage";

const exec = promisify(execFile);
const WURZEL = "/Users/macmini/Code/begehungshelfer";
const SOFFICE = "/opt/homebrew/bin/soffice";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function stufeZuTyp(stufe: string): SchreibenTyp | null {
  if (stufe === "mitteilung") return "mitteilung";
  if (stufe === "abmahnung_1") return "abmahnung_1";
  if (stufe === "abmahnung_2") return "abmahnung_2";
  return null;
}

// Historie-Vorschlag für die 2. Abmahnung aus der Dokumenten-Akte (Vorschlag,
// kein Automatismus — im Formular änderbar).
export function historieVorschlag(
  dokumente: { typ: string; datum: Date; notiz: string }[]
): { seit: string; hinweise: string; datum1Abmahnung: string } | null {
  const schreiben = dokumente.filter((d) => d.typ === "schreiben" || d.typ === "email");
  if (!schreiben.length) return null;
  const jahre = [...new Set(schreiben.map((d) => d.datum.getFullYear()))].sort();
  const letzteAbm = schreiben.filter((d) => /abmahnung/i.test(d.notiz)).at(-1) ?? schreiben.at(-1)!;
  return {
    seit: `dem Jahr ${jahre[0]}`,
    hinweise: `in den Jahren ${jahre.join(" und ")} auf Mängel der Bewirtschaftung`,
    datum1Abmahnung: letzteAbm.datum.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" }),
  };
}

// Freitext-Mangel -> Baustein-ID via lokalem Ollama; null = kein Treffer.
async function bausteinZuordnen(punkt: string, notiz: string): Promise<string | null> {
  const katalog = BAUSTEINE.map((b) => `${b.id} ${b.label}`).join("\n");
  const prompt = `Du ordnest einen Freitext-Mangel aus einer Kleingarten-Begehung GENAU EINEM Baustein zu.

KATALOG:
${katalog}
KEIN kein passender Baustein

REGELN: Wähle die fachlich beste ID, im Zweifel "KEIN". Antworte NUR mit JSON: {"baustein": "..."}

MANGEL: ${punkt || "(leer)"}${notiz ? ` — ${notiz}` : ""}
JSON:`;
  try {
    const r = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "qwen3:14b", prompt, stream: false, format: "json",
        think: false, options: { temperature: 0 },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { response?: string };
    const id = String(JSON.parse(j.response ?? "{}").baustein ?? "").slice(0, 3);
    return BAUSTEINE.some((b) => b.id === id) ? id : null;
  } catch {
    return null; // Ollama nicht erreichbar/zu langsam -> generische Position
  }
}

export type SchreibenAuftrag = {
  rundeId: number;
  parzelleId: string; // "K8"
  typ?: SchreibenTyp; // fehlt -> aus Befund.stufe
  historie?: { seit: string; hinweise: string; datum1Abmahnung: string } | null;
  wiederholung?: boolean;
  ersatzvornahme?: boolean;
};

export type SchreibenErgebnis = { ok?: string; fehler?: string; warnungen?: string[] };

export async function erzeugeUndSendeSchreiben(a: SchreibenAuftrag): Promise<SchreibenErgebnis> {
  const parzelle = await prisma.parzelle.findUnique({
    where: { parzelleId: a.parzelleId },
    include: { anlage: true, dokumente: { orderBy: { datum: "asc" } } },
  });
  if (!parzelle) return { fehler: "Parzelle nicht gefunden." };
  const befund = await prisma.befund.findUnique({
    where: { rundeId_parzelleId: { rundeId: a.rundeId, parzelleId: parzelle.id } },
    include: {
      runde: true,
      beete: true,
      maengel: { include: { katalog: true, fotos: true }, orderBy: { id: "asc" } },
    },
  });
  if (!befund) return { fehler: "Kein Befund in dieser Runde." };

  const typ = a.typ ?? stufeZuTyp(befund.stufe);
  if (!typ) return { fehler: `Stufe „${befund.stufe}" sieht kein Schreiben vor.` };

  const verein = await prisma.verein.findUnique({ where: { id: 1 } });
  if (!verein?.name) return { fehler: "Vereinsdaten fehlen (Einstellungen → Verein)." };
  const overrideZeilen = await prisma.textbausteinOverride.findMany();
  const overrides = Object.fromEntries(overrideZeilen.map((o) => [o.id, o]));

  // Mängel aufbereiten: Gemüse gesondert, Freitexte via LLM zuordnen
  const gemueseMangel = befund.maengel.find((m) => m.katalog?.punkt.startsWith("Gemüseanbau"));
  const istM2 = befund.beete.length
    ? befund.beete.reduce((s, t) => s + t.flaecheM2, 0)
    : null;
  const maengel = [];
  for (const m of befund.maengel) {
    if (m === gemueseMangel) continue;
    const istKatalog = m.katalogId !== null;
    let bausteinId = istKatalog ? (KATALOG_ZU_BAUSTEIN[m.katalog?.punkt ?? m.punkt] ?? null) : null;
    if (!istKatalog && (m.punkt.trim() || m.notiz.trim())) {
      bausteinId = await bausteinZuordnen(m.punkt.trim(), m.notiz.trim());
    }
    maengel.push({
      punkt: m.punkt.trim(),
      notiz: m.notiz.trim(),
      istKatalog,
      bausteinId,
      fotoPfade: m.fotos.map((f) => join(STORAGE_DIR, f.dateipfad)).filter((p) => existsSync(p)),
    });
  }

  const logoPfad =
    typ === "abmahnung_2"
      ? null // BV-Logo liegt uns nicht vor
      : verein.logoPfad && existsSync(join(STORAGE_DIR, verein.logoPfad))
        ? join(STORAGE_DIR, verein.logoPfad)
        : join(WURZEL, "public/img/logo.png");

  const { vorlage, kontext, warnungen } = baueSchreiben({
    typ,
    begehungDatum: befund.runde.datum,
    parzelle: {
      parzelleId: parzelle.parzelleId,
      anlageName: parzelle.anlage.name,
      vorname: parzelle.vorname,
      nachname: parzelle.nachname,
      strasse: parzelle.strasse,
      plz: parzelle.plz,
      ort: parzelle.ort,
      anrede: parzelle.anrede,
      anredeStil: parzelle.anredeStil,
      eintritt: parzelle.eintritt,
      groesseM2: parzelle.groesseM2,
    },
    gemuese: gemueseMangel ? { vorhanden: true, istM2 } : null,
    maengel,
    plakette: befund.gutGemacht,
    neupaechterLob:
      istNeupaechter(parzelle.eintritt, parzelle.status) &&
      (befund.gutGemacht || befund.plakettenNotiz.trim() !== ""),
    verein,
    logoPfad,
    historie: typ === "abmahnung_2" ? (a.historie ?? historieVorschlag(parzelle.dokumente)) : null,
    wiederholung: a.wiederholung ?? typ !== "mitteilung",
    ersatzvornahme: a.ersatzvornahme ?? false,
    overrides,
  });
  if ((kontext.beanstandungen as unknown[]).length === 0) {
    return { fehler: "Keine Beanstandungen vorhanden — es gibt nichts zu beanstanden.", warnungen };
  }

  // docx rendern (+ PDF für die Mitteilung)
  const datumKurz = new Date().toISOString().slice(0, 10);
  const nachname = (parzelle.nachname || "Paechter").replace(/[^A-Za-zÄÖÜäöüß-]/g, "");
  const typName = typ === "mitteilung" ? "Mitteilung" : typ === "abmahnung_1" ? "Abmahnung1" : "Abmahnung2";
  const basisName = `${typName}_${parzelle.parzelleId}_${nachname}_${datumKurz}`;
  const dir = await mkdtemp(join(tmpdir(), "schreiben-"));
  try {
    const docxPfad = join(dir, `${basisName}.docx`);
    await rendereDocx(VORLAGEN[vorlage], docxPfad, kontext as Parameters<typeof rendereDocx>[2]);
    const docx = await readFile(docxPfad);

    const begehungDatum = new Date(befund.runde.datum).toLocaleDateString("de-DE");

    if (typ === "mitteilung") {
      // docx -> PDF (eigenes soffice-Profil gegen Parallel-Lock)
      await exec(SOFFICE, [
        "--headless", `-env:UserInstallation=file://${dir}/soffice`,
        "--convert-to", "pdf", "--outdir", dir, docxPfad,
      ], { timeout: 60_000 });
      const pdf = await readFile(join(dir, `${basisName}.pdf`));

      const anGueltig = parzelle.email !== "" && istEinzelAdresse(parzelle.email);
      const gruss = String(kontext.anrede ?? "Sehr geehrte Damen und Herren");
      const text = [
        `${gruss},`,
        "",
        `im Anhang finden Sie unsere Mitteilung zur diesjährigen Gartenbegehung vom ${begehungDatum} mit einigen Hinweisen zu Ihrer Parzelle ${parzelle.parzelleId}.`,
        "",
        "Wir gehen davon aus, dass sich die genannten Punkte gut umsetzen lassen, und stehen Ihnen bei Rückfragen gerne zur Verfügung.",
        "",
        "Mit freundlichen Grüßen",
        "Der Vorstand",
        verein.name,
        "", // Leerzeile vor den Anhängen
      ].join("\n");
      const fehler = await entwurfInPostfach({
        an: anGueltig ? parzelle.email : "",
        betreff: `Mitteilung zur Gartenbegehung – Parzelle ${parzelle.parzelleId} ${parzelle.anlage.name}`,
        text,
        // PDF = Versandfassung; docx dazu, damit Änderungen möglich bleiben
        // (dann: PDF-Anhang löschen, docx überarbeiten, neu als PDF anhängen).
        anhaenge: [
          { dateiname: `${basisName}.pdf`, inhalt: pdf },
          { dateiname: `${basisName}.docx`, inhalt: docx, contentType: DOCX_MIME },
        ],
        ordner: "Entwürfe Mitteilungen",
      });
      if (fehler) return { fehler, warnungen };
      return {
        ok: anGueltig
          ? `Mitteilungs-Entwurf (PDF + docx) liegt im Ordner 'Entwürfe Mitteilungen' (An: ${parzelle.email}).`
          : "Mitteilungs-Entwurf liegt im Ordner 'Entwürfe Mitteilungen' — keine gültige Pächter-E-Mail, Empfänger im Mail-Programm ergänzen.",
        warnungen,
      };
    }

    const paechter = [nameSchoen(parzelle.nachname), parzelle.vorname].filter(Boolean).join(", ");
    if (typ === "abmahnung_1") {
      // 1. Abmahnung: docx an die eigene Vereinsadresse (Word-Feinschliff, Postversand)
      const fehler = await mailSenden("vorstand", {
        betreff: `ENTWURF 1. Abmahnung – Parzelle ${parzelle.parzelleId}${paechter ? ` (${paechter})` : ""}`,
        text: [
          `ENTWURF zur Prüfung — 1. Abmahnung betreffend Parzelle ${parzelle.parzelleId}${paechter ? ` (${paechter})` : ""}, Begehung vom ${begehungDatum}.`,
          "",
          "Das Schreiben liegt als Word-Datei bei: bitte prüfen, bei Bedarf in Word anpassen,",
          "drucken und per Post oder ggf. als (Einwurf-)Einschreiben versenden. Das versandte",
          "Schreiben danach in der Parzellen-Akte ablegen.",
          warnungen.length ? "\nHinweise der App:\n- " + warnungen.join("\n- ") : "",
        ].join("\n"),
        anhang: { dateiname: `${basisName}.docx`, inhalt: docx, contentType: DOCX_MIME },
      });
      if (fehler) return { fehler, warnungen };
      return { ok: "1. Abmahnung (docx) an die Vereinsadresse gesendet — Feinschliff in Word.", warnungen };
    }

    // 2. Abmahnung: ENTWURF im Postfach, an den BV adressiert — es geht nichts
    // raus, der Verein kann Anschreiben und docx noch anpassen und sendet selbst.
    // Liegt die 1. Abmahnung des Vereins in der Akte, geht sie zur Kenntnis mit.
    const bvAdresse = verein.bezirksverbandEmail;
    const anhaenge = [{ dateiname: `${basisName}.docx`, inhalt: docx, contentType: DOCX_MIME }];
    const ersteAbmahnung = parzelle.dokumente
      .filter((d) => d.typ === "schreiben" && /abmahnung/i.test(d.notiz))
      .at(-1);
    if (ersteAbmahnung && existsSync(join(STORAGE_DIR, ersteAbmahnung.dateipfad))) {
      const ext = ersteAbmahnung.dateipfad.split(".").pop() ?? "pdf";
      anhaenge.push({
        dateiname: `Abmahnung_Verein_${ersteAbmahnung.datum.toISOString().slice(0, 10)}.${ext}`,
        inhalt: await readFile(join(STORAGE_DIR, ersteAbmahnung.dateipfad)),
        contentType: ext === "pdf" ? "application/pdf" : "application/octet-stream",
      });
    }
    const fehler = await entwurfInPostfach({
      an: istEinzelAdresse(bvAdresse) ? bvAdresse : "",
      betreff: `Parzelle ${parzelle.parzelleId}${paechter ? ` (${paechter})` : ""} — Bitte um 2. Abmahnung durch den Bezirksverband`,
      text: [
        "Sehr geehrte Damen und Herren,",
        "",
        `bei der Gartenbegehung vom ${begehungDatum} wurden auf der Parzelle ${parzelle.parzelleId}${paechter ? ` (${paechter})` : ""} erneut erhebliche Mängel festgestellt. Eine Abmahnung durch den Verein ist bereits erfolgt.`,
        "",
        "Wir bitten Sie als Verpächter, die Angelegenheit zu übernehmen und die Abmahnung",
        "auszusprechen. Einen Entwurf des Abmahnschreibens mit dem dokumentierten Sachverhalt",
        "und der Fotodokumentation fügen wir als Word-Datei bei.",
        ...(ersteAbmahnung
          ? ["", "Die vom Verein ausgesprochene Abmahnung fügen wir zu Ihrer Kenntnis ebenfalls bei."]
          : []),
        "",
        "Mit freundlichen Grüßen",
        "Der Vorstand",
        verein.name,
        "",
      ].join("\n"),
      anhaenge,
      ordner: "Entwürfe 2. Abmahnungen",
    });
    if (fehler) return { fehler, warnungen };
    return {
      ok: istEinzelAdresse(bvAdresse)
        ? `Entwurf an den Bezirksverband (${bvAdresse}) liegt im Ordner 'Entwürfe 2. Abmahnungen' — prüfen und selbst senden.`
        : "Entwurf liegt im Ordner 'Entwürfe 2. Abmahnungen' — BV-E-Mail fehlt/ungültig, Empfänger im Mail-Programm ergänzen.",
      warnungen,
    };
  } catch (e) {
    return {
      fehler: `Schreiben-Erzeugung fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`,
      warnungen,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
