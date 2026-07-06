// Deterministischer Schreiben-Bau: Begehungsdaten -> docx-Kontext für
// vorlagen/*.docx (via src/lib/docx.ts). KEIN LLM hier — Baustein-Zuordnung
// von Freitexten passiert vorher (Aufrufer), alles Rechtliche ist Code.
// Pure Functions ohne DB/IO: testbar, vom Test-Skript und später von den
// Server-Actions gleich benutzbar.
import {
  BAUSTEIN_MAP,
  effektiverBaustein,
  feststellungBauen,
  type Baustein,
  type BausteinOverride,
} from "./bausteine";

export type SchreibenTyp = "mitteilung" | "abmahnung_1" | "abmahnung_2";

export type MangelEingabe = {
  punkt: string; // Katalog-Snapshot oder Freitext-Bezeichnung
  notiz: string;
  istKatalog: boolean;
  bausteinId: string | null; // aus KATALOG_ZU_BAUSTEIN bzw. LLM; null = generisch
  fotoPfade: string[]; // absolute Pfade (werden eingebettet)
};

export type SchreibenEingabe = {
  typ: SchreibenTyp;
  begehungDatum: Date;
  parzelle: {
    parzelleId: string; anlageName: string;
    vorname: string; nachname: string;
    strasse: string; plz: string; ort: string;
    anrede: string; anredeStil: string; eintritt: string;
    groesseM2: number | null;
  };
  gemuese: { vorhanden: boolean; istM2: number | null } | null; // null = kein Gemüse-Mangel
  maengel: MangelEingabe[];
  // Nur Mitteilung: freundlicher Rahmen ("Gut gemacht"-Plakette, Neupächter-Lob)
  plakette?: boolean;
  neupaechterLob?: boolean;
  verein: {
    name: string; adresse: string; email: string; telefon: string; ort: string;
    bvName: string; bvStrasse: string; bvPlzOrt: string; bezirksverbandEmail: string;
  };
  logoPfad: string | null;
  historie?: { seit: string; hinweise: string; datum1Abmahnung: string } | null;
  wiederholung?: boolean;
  ersatzvornahme?: boolean;
  overrides?: Record<string, BausteinOverride>; // Text-Overrides aus /einstellungen
  heute?: Date; // testbar; default = jetzt
};

type Beanstandung = {
  text: string;
  frist: string | null;
  bilder: string[];
  // intern für Sortierung/Fristen: _eigen = Frist wird je Position ausgewiesen
  // (Gefahr/Eilfall oder Saisonziel) und zählt NICHT für die zentrale Brieffrist
  _bereich: number; _id: string; _datum: Date | null; _eigen: boolean;
};

const datumDe = (d: Date) =>
  d.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });

const plusTage = (d: Date, t: number) => new Date(d.getTime() + t * 86400000);

// Immer als vollständiger Satz enden (Befunde/Freitexte kommen ohne Punkt).
const satz = (s: string) => s.replace(/[\s.]+$/, "") + ".";

// "A, B und C" bzw. "A, B sowie C" — kein gestottertes "und ... und".
const aufzaehlung = (teile: string[], letztes: string) =>
  teile.length <= 1
    ? (teile[0] ?? "")
    : `${teile.slice(0, -1).join(", ")} ${letztes} ${teile.at(-1)}`;

// Namen aus dem Import sind GROSSBUCHSTABEN ("THEIßEN", "SINGH-KAUR") ->
// für Anrede/Adressfeld in normale Schreibung wandeln (wortweise, Bindestrich).
export function nameSchoen(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s-])(\S)/g, (_, davor: string, buchst: string) => davor + buchst.toUpperCase());
}

// Akademischer Titel steckt im Vornamen-Feld ("Dr. Sascha") — gehört in die
// Anrede ("Sehr geehrter Herr Dr. Theißen"), nicht in die Du-Form.
const TITEL_RE = /^((?:Dr\.|Prof\.|Prof\. Dr\.)\s+)/;
export function vornameTitel(vorname: string): { titel: string; rufname: string } {
  const m = vorname.match(TITEL_RE);
  return {
    titel: m ? m[1].trim() : "",
    rufname: vorname.replace(TITEL_RE, "").trim().split(/\s+/)[0] ?? "",
  };
}

// Standard-Frist eines Bausteins als Datum (inkl. BNatSchG-Sperrzeit 01.03.–30.09.:
// Gehölz-Fristen werden auf den 01.10. geschoben statt in die Sperrzeit zu fallen).
// saisonal = Frist ist ein Saisonziel (30.10. bzw. BNatSchG-verschoben) und wird
// je Position ausgewiesen statt die zentrale Brieffrist nach hinten zu ziehen.
function bausteinFrist(b: Baustein, basis: Date): { datum: Date; saisonal: boolean } {
  let f: Date;
  let saisonal = false;
  if ("bis" in b.frist) {
    f = new Date(basis.getFullYear(), 9, 30); // 30.10.
    if (f.getTime() < plusTage(basis, 14).getTime()) f = new Date(basis.getFullYear() + 1, 9, 30);
    saisonal = true;
  } else {
    f = plusTage(basis, b.frist.tage);
  }
  if (b.bnatschg) {
    const m = f.getMonth(); // 0-basiert: März=2 … September=8
    if (m >= 2 && m <= 8) {
      f = new Date(f.getFullYear(), 9, 1); // 01.10.
      saisonal = true;
    }
  }
  return { datum: f, saisonal };
}

// Adress-Zeilen aus der mehrzeiligen Vereins-Adresse ("c/o …\nStraße\nPLZ Ort"
// oder "Straße, PLZ Ort") — Briefkopf braucht Straße + PLZ/Ort getrennt.
export function vereinAdresse(adresse: string): { strasse: string; plzOrt: string } {
  const teile = adresse.split(/[\n,]/).map((t) => t.trim()).filter(Boolean);
  const plzOrt = teile.find((t) => /^\d{5}\s/.test(t)) ?? teile.at(-1) ?? "";
  const strasse = teile.filter((t) => t !== plzOrt && !/^c\/o/i.test(t)).at(-1) ?? "";
  return { strasse, plzOrt };
}

export function baueSchreiben(e: SchreibenEingabe): {
  vorlage: "mitteilung" | "abmahnung_verein" | "abmahnung_bv";
  kontext: Record<string, unknown>;
  warnungen: string[];
} {
  const w: string[] = [];
  const abmahnung = e.typ !== "mitteilung";
  // Fristen ab Begehung rechnen, aber nie in der Vergangenheit landen:
  // wird das Schreiben Wochen später erstellt, ist HEUTE die Fristbasis.
  const heute = e.heute ?? new Date();
  const fristBasis = heute.getTime() > e.begehungDatum.getTime() ? heute : e.begehungDatum;
  const positionen: Beanstandung[] = [];
  let hatBew = false, hatGO = false, hatNutzung = false;
  let gemueseZentraleFrist = false; // Beet-Neuanlage über die Brieffrist (mind. 28 Tage)

  // --- Gemüse (G01): SOLL/IST deterministisch, § 12-Weiche nach Vertragsdatum ---
  if (e.gemuese) {
    const qm = e.parzelle.groesseM2;
    if (!qm) {
      w.push("Gemüse-Mangel, aber Parzellenfläche fehlt — Position übersprungen.");
    } else {
      const soll = Math.round(qm / 6);
      const ist = e.gemuese.istM2 === null ? null : Math.round(e.gemuese.istM2);
      // Vorgaben zur Beetgröße stehen erst seit Mai 2024 ausdrücklich in § 12 UPV;
      // Altverträge: Herleitung über § 1 (kleingärtnerische Nutzung).
      const neuvertrag = e.parzelle.eintritt >= "2024-05-01";
      const norm = neuvertrag
        ? "§ 12 des Unterpachtvertrages"
        : "§ 1 des Unterpachtvertrages – kleingärtnerische Nutzung";
      const folgejahr = e.begehungDatum.getFullYear() + 1;
      const frist2 = new Date(folgejahr, 3, 30); // 30.04. Folgejahr

      if (ist !== null && ist >= soll) {
        w.push(`Gemüse: IST ${ist} m² >= SOLL ${soll} m² — Position übersprungen, bitte prüfen.`);
      } else {
        const basis = neuvertrag
          ? `Vertraglich ist vereinbart, dass mindestens ein Sechstel der Parzellenfläche für den Anbau einjähriger Gemüsekulturen genutzt wird`
          : `Nach dem Unterpachtvertrag ist die Parzelle kleingärtnerisch zu nutzen; dazu gehört der Anbau einjähriger Gemüsekulturen auf mindestens einem Sechstel der Parzellenfläche`;
        const feststellung =
          ist === null
            ? `Zum Zeitpunkt der Begehung war keine für einjährige Gemüsekulturen bestellte Fläche erkennbar. ${basis} – bei Ihrer Parzelle von ${qm} m² sind das rund ${soll} m² (${norm}).`
            : `Die für einjährige Gemüsekulturen bestellte Fläche ist mit derzeit ca. ${ist} m² zu klein. ${basis} – bei Ihrer Parzelle von ${qm} m² sind das rund ${soll} m² (${norm}).`;
        if (ist === null) w.push("Gemüse: keine Beete erfasst — Variante 'nicht bestellt' verwendet, bitte bestätigen.");
        // Mitteilung: Beetvergrößerung ist Regelfall fürs Folgejahr (30.04.).
        // Abmahnung: bis Ende Juli ist die Fläche noch DIESES Jahr herzustellen
        // (zentrale Frist, mind. 4 Wochen) und mit späten Kulturen/Gründüngung
        // zu bepflanzen; ab August greift auch hier die Folgejahrs-Frist.
        const nochDiesesJahr = abmahnung && fristBasis.getMonth() <= 6; // Jan–Jul
        let aufforderung: string;
        let posFrist: Date | null;
        if (!abmahnung) {
          aufforderung = `Wir bitten Sie, die Gemüseanbaufläche bis zum ${datumDe(frist2)} auf mindestens ${soll} m² zu vergrößern und im Laufe der Vegetationsperiode mit einjährigen Gemüsekulturen zu bepflanzen.`;
          posFrist = frist2;
        } else if (nochDiesesJahr) {
          aufforderung = `Legen Sie die Gemüseanbaufläche innerhalb der genannten Frist auf mindestens ${soll} m² an und bepflanzen Sie sie noch in dieser Saison mit späten Kulturen (z. B. Buschbohnen, Herbstlauch) oder einer Gründüngung (z. B. Phacelia). Ab der Gartensaison ${folgejahr} ist die Fläche vollständig mit einjährigen Gemüsekulturen zu bestellen.`;
          posFrist = null; // zentrale Brieffrist gilt (mind. 4 Wochen, s. u.)
        } else {
          aufforderung = `Vergrößern Sie die Gemüseanbaufläche bis zum ${datumDe(frist2)} auf mindestens ${soll} m² und bepflanzen Sie sie im Laufe der Vegetationsperiode mit einjährigen Gemüsekulturen.`;
          posFrist = frist2;
        }
        positionen.push({
          text: `${feststellung} ${aufforderung}`,
          frist: posFrist ? datumDe(posFrist) : null, bilder: [],
          _bereich: 0, _id: "G01", _datum: null, _eigen: true,
        });
        if (nochDiesesJahr) gemueseZentraleFrist = true;
        hatBew = true; hatNutzung = true;
      }
    }
  }

  // --- Übrige Mängel über den Baustein-Katalog ---
  for (const m of e.maengel) {
    const b = m.bausteinId ? BAUSTEIN_MAP[m.bausteinId] : undefined;
    // Freitext: die Bezeichnung IST der Befund; Katalog-Mangel: Notiz = Befund.
    const befund = (m.istKatalog ? m.notiz : [m.punkt, m.notiz].filter(Boolean).join(" — ")).trim();
    if (!b) {
      if (!befund) { w.push("Leerer Freitext-Mangel übersprungen."); continue; }
      w.push(`Ohne Baustein/Normverweis übernommen (bitte prüfen): „${befund.slice(0, 50)}…"`);
      positionen.push({
        text: satz(befund), frist: null, bilder: m.fotoPfade,
        _bereich: 4, _id: "ZZZ", _datum: null, _eigen: false,
      });
      hatGO = true;
      continue;
    }
    const eff = effektiverBaustein(b, e.overrides?.[b.id]);
    if (eff.befundPflicht && !befund && abmahnung) {
      w.push(`${eff.id} (${m.punkt}): Pflicht-Befund fehlt (§ 9 BKleingG Bestimmtheit) — Standardtext verwendet, bitte konkretisieren.`);
    }
    const { datum, saisonal } = bausteinFrist(eff, fristBasis);
    positionen.push({
      text: `${satz(feststellungBauen(eff.feststellung, befund))} ${eff.aufforderung} (${eff.norm})`,
      frist: null, bilder: m.fotoPfade,
      _bereich: eff.bereich, _id: eff.id, _datum: datum,
      _eigen: !!eff.einzelfrist || saisonal,
    });
    if (eff.art === "bew") hatBew = true; else hatGO = true;
  }

  if (positionen.length === 0) w.push("KEINE Beanstandungen — Schreiben kann nicht erzeugt werden.");

  // Reihenfolge: Gemüse -> Garten -> Baulichkeiten -> Sonstiges -> ohne Baustein
  positionen.sort((a, z) => a._bereich - z._bereich || a._id.localeCompare(z._id));

  // ZENTRALE Brieffrist = späteste der regulären Tages-Fristen (Sascha-Modell:
  // eine Frist für alles). Saisonziele (30.10./BNatSchG) und Gefahr-Eilfristen
  // werden je Position gesondert ausgewiesen und ziehen die Brieffrist NICHT.
  // Beet-Neuanlage in der Abmahnung braucht mind. 4 Wochen (angemessene Frist).
  const standard = positionen.filter((p) => p._datum && !p._eigen).map((p) => p._datum!.getTime());
  if (gemueseZentraleFrist) standard.push(plusTage(fristBasis, 28).getTime());
  const brieffrist = standard.length
    ? new Date(Math.max(...standard))
    : plusTage(fristBasis, 28);
  for (const p of positionen) {
    if (p._datum && p._eigen) p.frist = datumDe(p._datum);
  }

  // --- Betreff + Abmahn-Grund (deterministisch aus den Verstoß-Arten) ---
  const betreffTeile: string[] = [];
  if (hatGO) betreffTeile.push("Verstößen gegen die Gartenordnung");
  if (hatBew) betreffTeile.push("mangelhafter Bewirtschaftung der Parzelle");
  if (hatNutzung) betreffTeile.push("unzureichender kleingärtnerischer Nutzung");
  const betreffGrund = aufzaehlung(betreffTeile, "und") || "festgestellter Mängel";
  const grundTeile: string[] = [];
  if (hatGO) grundTeile.push("diverser Verstöße gegen die Gartenordnung (§ 4 Ziff. 2 des Unterpachtvertrages)");
  if (hatBew) grundTeile.push("mangelhafter Bewirtschaftung der Parzelle (§ 4 Ziff. 1 des Unterpachtvertrages)");
  if (hatNutzung) grundTeile.push("unzureichender kleingärtnerischer Nutzung (§ 1, § 4 Ziff. 5 des Unterpachtvertrages)");
  const abmahnGrund = aufzaehlung(grundTeile, "sowie") || betreffGrund;

  // --- Empfänger/Anrede ---
  const p = e.parzelle;
  const anredeZeile = p.anrede === "herr" ? "Herrn" : p.anrede === "frau" ? "Frau" : "";
  if (!anredeZeile) w.push("Anrede (Herr/Frau) fehlt an der Parzelle — bitte in der Verwaltung setzen.");
  const du = e.typ === "mitteilung" && p.anredeStil === "du";
  // "THEIßEN" -> "Theißen"; Titel ("Dr.") wandert aus dem Vornamen in die
  // förmliche Anrede, die Du-Form nutzt den Rufnamen ohne Titel.
  const nachnameSchoen = nameSchoen(p.nachname);
  const { titel, rufname } = vornameTitel(p.vorname);
  const titelTeil = titel ? `${titel} ` : "";
  const gruss = du
    ? `${p.anrede === "frau" ? "Liebe" : "Lieber"} ${rufname}`.trim()
    : p.anrede === "frau"
      ? `Sehr geehrte Frau ${titelTeil}${nachnameSchoen}`
      : p.anrede === "herr"
        ? `Sehr geehrter Herr ${titelTeil}${nachnameSchoen}`
        : "Sehr geehrte Damen und Herren";
  if (!p.strasse || !p.plz) w.push("Empfänger-Adresse unvollständig — bitte Stammdaten prüfen.");

  const va = vereinAdresse(e.verein.adresse);
  const beanstandungen = positionen.map(({ text, frist, bilder }) => ({
    text, frist, bilder: bilder.length ? bilder : undefined, foto: null,
  }));

  const basis: Record<string, unknown> = {
    verein_name: e.verein.name,
    verein_strasse: va.strasse,
    verein_plz_ort: va.plzOrt,
    verein_tel: e.verein.telefon,
    verein_email: e.verein.email,
    bv_name: e.verein.bvName,
    bv_strasse: e.verein.bvStrasse,
    bv_plz_ort: e.verein.bvPlzOrt,
    bv_email: e.verein.bezirksverbandEmail,
    ort: e.verein.ort,
    heute_datum: datumDe(new Date()),
    empf_anrede_zeile: anredeZeile,
    empf_name: `${p.vorname} ${nachnameSchoen}`.trim(),
    empf_strasse: p.strasse,
    empf_plz_ort: `${p.plz} ${p.ort}`.trim(),
    anrede: gruss,
    parzelle: p.parzelleId,
    begehung_datum: datumDe(e.begehungDatum),
    frist_datum: datumDe(brieffrist),
    beanstandungen,
    logo: e.logoPfad,
  };

  if (e.typ === "mitteilung") {
    return {
      vorlage: "mitteilung",
      kontext: {
        ...basis,
        anlage: p.anlageName,
        betreff_zusatz: null,
        anrede_form: du ? "Du" : "Sie",
        erlaeuterung: true,
        hinweis_wiederholung: true,
        fotos_beigefuegt: false, // Fotos sind direkt eingebettet
        // Freundlicher Rahmen: Plakette-Lob + Neupächter-Ermutigung
        plakette: !!e.plakette,
        plakette_jahr: String(e.begehungDatum.getFullYear()),
        hinweis_anzahl_text:
          beanstandungen.length === 1 ? "den folgenden Hinweis" : "die folgenden Hinweise",
        neupaechter_lob: !!e.neupaechterLob && !e.plakette, // nicht doppelt loben
      },
      warnungen: w,
    };
  }
  if (e.typ === "abmahnung_1") {
    return {
      vorlage: "abmahnung_verein",
      kontext: {
        ...basis,
        betreff_grund: betreffGrund,
        abmahn_grund: abmahnGrund,
        wiederholung: !!e.wiederholung,
        ersatzvornahme: !!e.ersatzvornahme,
        lageplan: false,
      },
      warnungen: w,
    };
  }
  // 2. Abmahnung (Bezirksverband)
  if (!e.historie) w.push("Abmahnung 2 ohne Historie (seit/Hinweise/Datum 1. Abmahnung) — bitte ergänzen.");
  return {
    vorlage: "abmahnung_bv",
    kontext: {
      ...basis,
      logo: null, // BV-Logo liegt uns nicht vor — Kopf fällt auf den BV-Namen zurück
      betreff_grund: betreffGrund,
      abmahn_grund: abmahnGrund,
      historie: !!e.historie,
      historie_seit: e.historie?.seit ?? "",
      historie_hinweise: e.historie?.hinweise ?? "",
      datum_1_abmahnung: e.historie?.datum1Abmahnung ?? "",
      ersatzvornahme: !!e.ersatzvornahme,
      lageplan: false,
    },
    warnungen: w,
  };
}
