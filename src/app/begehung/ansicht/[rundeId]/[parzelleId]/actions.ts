"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { fotoVerarbeitenUndSpeichern, dateiLoeschen } from "@/lib/storage";
import { FOTO_MAX_PRO_BEFUND, normalisiereStufe, BEFUND_STATUS_LABEL } from "@/lib/constants";
import { parzellenBericht } from "@/lib/bericht";
import { entwurfInPostfach, mailSenden, istEinzelAdresse, type MailZiel } from "@/lib/mail";

// Nachträgliche Bearbeitung einer Begehung (Entscheidung 2026-06-11: kein
// hartes Einfrieren — Texte müssen korrigierbar, Fotos löschbar/ergänzbar
// bleiben). Schreibtischarbeit, online, klassische Server Actions.

export async function aktualisiereBefund(befundId: number, pfad: string, formData: FormData) {
  const gutGemacht = formData.get("gutGemacht") === "1";
  const statusRaw = formData.get("status"); // nur schreiben, wenn Feld im Formular (alte Tabs kennen es nicht)
  await prisma.befund.update({
    where: { id: befundId },
    data: {
      // normalisieren: vor dem Deploy geöffnete Tabs haben noch die alte
      // "hinweis"-Option und würden den Alt-Wert sonst zurückschreiben.
      stufe: normalisiereStufe(String(formData.get("stufe") || "neutral")),
      // Whitelist: nur bekannte Status-Werte in die DB lassen.
      ...(statusRaw !== null && String(statusRaw) in BEFUND_STATUS_LABEL
        ? { status: String(statusRaw) }
        : {}),
      notiz: String(formData.get("notiz") ?? ""),
      gutGemacht,
      plakettenNotiz: gutGemacht ? String(formData.get("plakettenNotiz") ?? "") : "",
      diktatNachgereicht: String(formData.get("diktatNachgereicht") ?? ""),
    },
  });
  revalidatePath(pfad);
}

export async function aktualisiereKompensation(befundId: number, pfad: string, formData: FormData) {
  const zahl = (k: string) => {
    const v = parseFloat(String(formData.get(k) ?? "0").replace(",", "."));
    return Number.isFinite(v) && v >= 0 ? v : 0;
  };
  const ganz = (k: string) => {
    const v = parseInt(String(formData.get(k) ?? "0"), 10);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  };
  await prisma.befund.update({
    where: { id: befundId },
    data: {
      kompObstAnzahl: ganz("obstAnzahl"),
      kompObstFlaecheM2: zahl("obstFlaeche"),
      kompBeerenAnzahl: ganz("beerenAnzahl"),
      kompBeerenFlaecheM2: zahl("beerenFlaeche"),
      kompensationNotiz: String(formData.get("kompNotiz") ?? ""),
      kompensationAusreichend: formData.get("ausreichend") === "1",
    },
  });
  revalidatePath(pfad);
}

export async function aktualisiereMangel(mangelId: number, pfad: string, formData: FormData) {
  const fristRaw = String(formData.get("frist") ?? "").trim();
  const punktRaw = formData.get("punkt"); // nur bei Freitext-Mangel im Formular
  await prisma.mangel.update({
    where: { id: mangelId },
    data: {
      notiz: String(formData.get("notiz") ?? ""),
      frist: fristRaw ? new Date(fristRaw) : null,
      diktatNachgereicht: String(formData.get("diktatNachgereicht") ?? ""),
      ...(punktRaw !== null ? { punkt: String(punktRaw) } : {}),
    },
  });
  revalidatePath(pfad);
}

// Beet nachträglich anlegen (z. B. Korrektur aus der Mängelliste: Fläche wurde
// bei der Begehung nicht erfasst oder hat sich nach Behebung geändert).
export async function beetAnlegen(befundId: number, pfad: string, formData: FormData) {
  const v = parseFloat(String(formData.get("flaeche") ?? "0").replace(",", "."));
  await prisma.beet.create({
    data: {
      befundId,
      bezeichnung: String(formData.get("bezeichnung") ?? ""),
      flaecheM2: Number.isFinite(v) && v >= 0 ? v : 0,
    },
  });
  revalidatePath(pfad);
}

export async function aktualisiereBeet(beetId: number, pfad: string, formData: FormData) {
  const v = parseFloat(String(formData.get("flaeche") ?? "0").replace(",", "."));
  await prisma.beet.update({
    where: { id: beetId },
    data: {
      bezeichnung: String(formData.get("bezeichnung") ?? ""),
      flaecheM2: Number.isFinite(v) && v >= 0 ? v : 0,
    },
  });
  revalidatePath(pfad);
}

// Foto per Drag & Drop umhängen: Gesamtansicht <-> Mangel <-> Beet <-> Kompensation.
// Ziel muss zum selben Befund gehören (Drag passiert nur innerhalb einer Seite,
// die Prüfung schützt vor veralteten/manipulierten Requests).
export async function verschiebeFoto(
  fotoId: number,
  ziel: { mangelId?: number | null; beetId?: number | null; kontext: string },
  pfad: string
) {
  const foto = await prisma.foto.findUnique({ where: { id: fotoId } });
  if (!foto) return;
  let mangelId: number | null = null;
  let beetId: number | null = null;
  let kontext = ["zustand", "kompensation"].includes(ziel.kontext) ? ziel.kontext : "zustand";
  if (ziel.mangelId != null) {
    const m = await prisma.mangel.findUnique({ where: { id: Number(ziel.mangelId) } });
    if (!m || m.befundId !== foto.befundId) return;
    mangelId = m.id;
    kontext = "mangel";
  } else if (ziel.beetId != null) {
    const b = await prisma.beet.findUnique({ where: { id: Number(ziel.beetId) } });
    if (!b || b.befundId !== foto.befundId) return;
    beetId = b.id;
    kontext = "beet";
  }
  await prisma.foto.update({ where: { id: fotoId }, data: { mangelId, beetId, kontext } });
  revalidatePath(pfad);
}

export async function loescheFotoNachtraeglich(fotoId: number, pfad: string) {
  const foto = await prisma.foto.findUnique({ where: { id: fotoId } });
  if (foto) {
    try {
      // DB zuerst: schlägt das fehl, bleibt nur eine harmlose Datei-Leiche
      // (umgekehrt zeigte eine überlebende DB-Zeile auf eine gelöschte Datei).
      await prisma.foto.delete({ where: { id: fotoId } });
      await dateiLoeschen(foto.dateipfad);
    } catch {}
  }
  revalidatePath(pfad);
}

// Zentrale Frist für die Mängel eines Befunds: ueberschreiben=false setzt nur
// Mängel OHNE Frist, true auch bereits gesetzte. Behobene Mängel bleiben
// unangetastet (deren Frist ist Doku des Ursprungszustands).
export async function setzeFristAlle(
  befundId: number,
  pfad: string,
  frist: string,
  ueberschreiben: boolean
) {
  if (!frist) return;
  await prisma.mangel.updateMany({
    where: { befundId, status: "offen", ...(ueberschreiben ? {} : { frist: null }) },
    data: { frist: new Date(frist) },
  });
  revalidatePath(pfad);
}

// Mangel nachträglich löschen (Schreibtisch-Korrektur). Foto-Zeilen kaskadieren
// in der DB; die Dateien werden NACH erfolgreichem Delete entfernt (schlägt der
// Delete fehl, bleiben die Bilder intakt statt kaputter Referenzen).
export async function loescheMangel(mangelId: number, pfad: string) {
  const mangel = await prisma.mangel.findUnique({
    where: { id: mangelId },
    include: { fotos: true },
  });
  if (mangel) {
    try {
      await prisma.mangel.delete({ where: { id: mangelId } });
      for (const f of mangel.fotos) await dateiLoeschen(f.dateipfad);
    } catch {}
  }
  revalidatePath(pfad);
}

// Mangel nachträglich ergänzen: Katalogpunkt (Snapshot bereich/punkt) oder
// Freitext, plus Notiz/Frist/Fotos in einem Schritt.
export async function mangelHinzufuegenNachtraeglich(
  befundId: number,
  pfad: string,
  formData: FormData
) {
  const katalogIdRaw = String(formData.get("katalogId") ?? "");
  const katalogId = Number(katalogIdRaw) || null;
  const katalog = katalogId
    ? await prisma.katalog.findUnique({ where: { id: katalogId } })
    : null;
  const fristRaw = String(formData.get("frist") ?? "").trim();
  const punktFrei = String(formData.get("punkt") ?? "").trim();
  // Fehlklick-Schutz: Freitext ohne Bezeichnung erzeugt keinen leeren Mangel.
  if (!katalog && !punktFrei) return;

  const mangel = await prisma.mangel.create({
    data: {
      befundId,
      katalogId: katalog?.id ?? null,
      bereich: katalog?.bereich ?? "Sonstiges",
      punkt: katalog?.punkt ?? punktFrei,
      notiz: String(formData.get("notiz") ?? ""),
      frist: fristRaw ? new Date(fristRaw) : null,
    },
  });

  const vorhanden = await prisma.foto.count({ where: { befundId } });
  const dateien = formData
    .getAll("fotos")
    .filter((f): f is File => f instanceof File && f.size > 0);
  let frei = Math.max(0, FOTO_MAX_PRO_BEFUND - vorhanden);
  for (const datei of dateien) {
    if (frei <= 0) break;
    const buf = Buffer.from(await datei.arrayBuffer());
    const gespeichert = await fotoVerarbeitenUndSpeichern(befundId, buf);
    await prisma.foto.create({
      data: { befundId, mangelId: mangel.id, kontext: "mangel", dateipfad: gespeichert },
    });
    frei--;
  }
  revalidatePath(pfad);
}

// Fotos nachträglich ergänzen (z. B. von der Kamera nachgereichte Bilder).
export async function fotosNachtraeglich(
  befundId: number,
  ziel: { mangelId?: number | null; beetId?: number | null; kontext: string },
  pfad: string,
  formData: FormData
) {
  const vorhanden = await prisma.foto.count({ where: { befundId } });
  const dateien = formData
    .getAll("fotos")
    .filter((f): f is File => f instanceof File && f.size > 0);
  let frei = Math.max(0, FOTO_MAX_PRO_BEFUND - vorhanden);
  for (const datei of dateien) {
    if (frei <= 0) break;
    const buf = Buffer.from(await datei.arrayBuffer());
    const gespeichert = await fotoVerarbeitenUndSpeichern(befundId, buf);
    await prisma.foto.create({
      data: {
        befundId,
        mangelId: ziel.mangelId ?? null,
        beetId: ziel.beetId ?? null,
        kontext: ziel.kontext,
        dateipfad: gespeichert,
      },
    });
    frei--;
  }
  revalidatePath(pfad);
}

// --- E-Mail-Aktionen (HITL — siehe src/lib/mail.ts) ---
// Mitteilung = ENTWURF im Postfach (App sendet nie an Pächter);
// Abmahnungs-Entwurf = Versand NUR an Vorstand selbst oder Bezirksverband.
// Befund.status wird bewusst NICHT automatisch geändert (Schreibtisch-Entscheidung).

export type MailErgebnis = { ok?: string; fehler?: string };

async function mailGrundlagen(rundeId: number, parzelleId: string) {
  const [parzelle, runde, verein, bericht] = await Promise.all([
    prisma.parzelle.findUnique({ where: { parzelleId } }),
    prisma.begehungsrunde.findUnique({ where: { id: rundeId } }),
    prisma.verein.findUnique({ where: { id: 1 } }),
    parzellenBericht(parzelleId, rundeId),
  ]);
  if (!parzelle || !runde) return "Parzelle oder Runde nicht gefunden.";
  if (!bericht?.hatBefund) return "Kein Befund in dieser Runde — es gibt nichts zu berichten.";
  const datum = new Date(runde.datum).toLocaleDateString("de-DE");
  return { parzelle, runde, verein, bericht, datum };
}

export async function mitteilungsEntwurf(
  rundeId: number,
  parzelleId: string,
  _prev: MailErgebnis,
  _formData: FormData
): Promise<MailErgebnis> {
  const g = await mailGrundlagen(rundeId, parzelleId);
  if (typeof g === "string") return { fehler: g };
  const { parzelle, verein, bericht, datum } = g;

  const anrede = [parzelle.vorname, parzelle.nachname].filter(Boolean).join(" ");
  const text = [
    anrede ? `Sehr geehrte/r ${anrede},` : "Sehr geehrte Pächterin, sehr geehrter Pächter,",
    "",
    `anbei erhalten Sie den Bericht der Gartenbegehung vom ${datum} zu Ihrer Parzelle ${parzelle.parzelleId}.`,
    "Bitte beachten Sie die im Bericht genannten Punkte und gegebenenfalls gesetzte Fristen.",
    "",
    "Mit freundlichen Grüßen",
    verein?.vorsitzender ?? "",
    verein?.name ?? "",
  ].filter((z, i, a) => z !== "" || a[i - 1] !== "").join("\n");

  // Nur eine einzelne gültige Pächter-Adresse vorbefüllen — sonst leerer
  // Empfänger + ehrlicher Hinweis (entwurfInPostfach verwirft Ungültiges eh).
  const anGueltig = parzelle.email !== "" && istEinzelAdresse(parzelle.email);
  const fehler = await entwurfInPostfach({
    an: anGueltig ? parzelle.email : "",
    betreff: `Gartenbegehung ${datum} – Parzelle ${parzelle.parzelleId}`,
    text,
    anhang: { dateiname: bericht.dateiname, inhalt: bericht.pdf },
  });
  if (fehler) return { fehler };
  return {
    ok: anGueltig
      ? `Entwurf liegt im Postfach (An: ${parzelle.email}) — bitte im Mail-Programm prüfen und selbst senden.`
      : parzelle.email
        ? `Entwurf liegt im Postfach — Achtung: Pächter-E-Mail „${parzelle.email}" ist keine einzelne gültige Adresse, Empfänger im Mail-Programm ergänzen.`
        : "Entwurf liegt im Postfach — Achtung: keine Pächter-E-Mail hinterlegt, Empfänger im Mail-Programm ergänzen.",
  };
}

export async function abmahnungsEntwurfSenden(
  rundeId: number,
  parzelleId: string,
  ziel: MailZiel,
  _prev: MailErgebnis,
  _formData: FormData
): Promise<MailErgebnis> {
  if (ziel !== "vorstand" && ziel !== "bezirksverband") return { fehler: "Unbekanntes Ziel." };
  const g = await mailGrundlagen(rundeId, parzelleId);
  if (typeof g === "string") return { fehler: g };
  const { parzelle, bericht, datum } = g;

  const paechter = [parzelle.nachname, parzelle.vorname].filter(Boolean).join(", ");
  const text = [
    `ENTWURF zur Prüfung — Abmahnung betreffend Parzelle ${parzelle.parzelleId}${paechter ? ` (${paechter})` : ""}.`,
    "",
    `Der Begehungsbericht vom ${datum} liegt als PDF bei.`,
    "",
    "Diese Nachricht wurde vom Begehungshelfer erstellt und nur an Vereins-/Verbandsadressen versendet.",
  ].join("\n");

  const fehler = await mailSenden(ziel, {
    betreff: `ENTWURF Abmahnung – Parzelle ${parzelle.parzelleId} (Begehung ${datum})`,
    text,
    anhang: { dateiname: bericht.dateiname, inhalt: bericht.pdf },
  });
  if (fehler) return { fehler };
  return {
    ok:
      ziel === "vorstand"
        ? "Entwurf an die Vereinsadresse gesendet (zur Prüfung im eigenen Postfach)."
        : "Entwurf an den Bezirksverband gesendet (Kopie an die Vereinsadresse).",
  };
}

// --- Schreiben erzeugen (docx aus Vorlagen + Bausteinen) und versenden ---
// Voller Prozess je Typ (siehe src/lib/schreibenErzeugen.ts). HITL bleibt:
// Mitteilung = Entwurf im Postfach, Abmahnungen = docx an Verein/BV.

export type SchreibenFormErgebnis = { ok?: string; fehler?: string; warnungen?: string[] };

export async function schreibenErstellen(
  rundeId: number,
  parzelleId: string,
  _prev: SchreibenFormErgebnis,
  formData: FormData
): Promise<SchreibenFormErgebnis> {
  const { erzeugeUndSendeSchreiben } = await import("@/lib/schreibenErzeugen");
  const feld = (n: string) => String(formData.get(n) ?? "").trim();

  const typ = feld("typ");
  if (typ !== "mitteilung" && typ !== "abmahnung_1" && typ !== "abmahnung_2") {
    return { fehler: "Unbekannter Schreiben-Typ." };
  }

  // Fehlende Anrede kann direkt im Formular nachgetragen werden (1x anfassen).
  const anrede = feld("anrede");
  if (anrede === "herr" || anrede === "frau") {
    await prisma.parzelle.update({ where: { parzelleId }, data: { anrede } });
  }

  const historieSeit = feld("historie_seit");
  const historie =
    typ === "abmahnung_2" && historieSeit
      ? {
          seit: historieSeit,
          hinweise: feld("historie_hinweise"),
          datum1Abmahnung: feld("historie_datum1"),
        }
      : undefined;

  const ergebnis = await erzeugeUndSendeSchreiben({
    rundeId,
    parzelleId,
    typ,
    historie,
    wiederholung: formData.get("wiederholung") === "1",
    ersatzvornahme: formData.get("ersatzvornahme") === "1",
  });
  revalidatePath(`/begehung/ansicht/${rundeId}/${parzelleId}`);
  return ergebnis;
}
