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
import { BEET_AUSREICHEND } from "./constants";

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
  gemuese: { vorhanden: boolean; istM2: number | null } | null; // null = kein Gemüse-Hinweis
  // Kompensation der geringen Gemüsefläche durch Obst ausdrücklich vermerkt
  // (Befund.kompensationAusreichend): dann Obst-Satz "wird ausgeglichen, darf
  // aber nicht kleiner werden" statt "gleicht nicht aus" (Sascha 2026-07-12).
  kompensation?: boolean;
  maengel: MangelEingabe[];
  // Nur Mitteilung: freundlicher Rahmen ("Gut gemacht"-Plakette, Neupächter-Lob)
  plakette?: boolean;
  neupaechterLob?: boolean;
  // Neupächter: andere Einleitung in der Mitteilung (Aufbauphase-Rahmen).
  neupaechter?: boolean;
  verein: {
    name: string; adresse: string; email: string; telefon: string; ort: string;
    vorsitzender: string;
    bvName: string; bvStrasse: string; bvPlzOrt: string; bezirksverbandEmail: string;
  };
  logoPfad: string | null;
  historie?: { seit: string; hinweise: string; datum1Abmahnung: string } | null;
  wiederholung?: boolean;
  vorjahre?: boolean; // Abmahnung: "wie bereits in den Vorjahren" (nur wenn Akten-Beleg)
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

// Sommerferien-Regel (Sascha 2026-07-12): In den Sommerferien enden keine
// Fristen. Fällt eine automatisch berechnete Frist in den August oder die erste
// Septemberhälfte (< 15.09.), wird sie auf den 15.09. desselben Jahres gesetzt.
// Betrifft die Fristen der Abmahnungen (Mitteilungen nennen keine Fristen).
// August = Monat 7, September = Monat 8 (0-basiert).
function sommerVerschiebung(d: Date): Date {
  const m = d.getMonth();
  if (m === 7 || (m === 8 && d.getDate() < 15)) {
    return new Date(d.getFullYear(), 8, 15); // 15.09.
  }
  return d;
}

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

  // --- Gemüse (G01): SOLL/IST deterministisch ---
  // Erst aufbereiten, Platzierung (prominent vs. Schluss-Hinweis) folgt unten,
  // wenn die Zahl der übrigen Beanstandungen feststeht.
  let gemueseVoll: Beanstandung | null = null; // Abmahnung: prominente 1. Beanstandung
  let gemueseKurz: string | null = null; // Abmahnung: kurzer Schluss-Hinweis (Rohtext)
  let gemueseSchlussText: string | null = null; // gewählte Schluss-Variante (für Kontext)
  let gemueseVollZentraleFrist = false;
  if (e.gemuese) {
    const qm = e.parzelle.groesseM2;
    if (!qm) {
      w.push("Gemüse-Hinweis, aber Parzellenfläche fehlt — Position übersprungen.");
    } else {
      const soll = Math.round(qm / 6);
      const ist = e.gemuese.istM2 === null ? null : Math.round(e.gemuese.istM2);
      // Keine Beete erfasst (null) ODER Beet ohne Größe (0) -> Fläche unbekannt:
      // kein "0 m²" ins Schreiben, sondern ein Platzhalter zum Nachtragen (Sascha).
      const istUnklar = ist === null || ist === 0;
      const PLATZHALTER = "(BEETGRÖSSE UNKLAR – noch zu ermitteln)";
      const folgejahr = e.begehungDatum.getFullYear() + 1;
      const frist2 = new Date(folgejahr, 3, 30); // 30.04. Folgejahr
      // Ab 2/3 vom Soll gilt die Fläche als ausreichend (Sascha 2026-07-11) —
      // dann wird sie NICHT angemahnt (deckt sich mit der orangen Beet-Ampel).
      const ausreichend = Math.round(soll * BEET_AUSREICHEND);
      if (ist !== null && ist >= ausreichend) {
        w.push(`Gemüse: IST ${ist} m² >= 2/3 vom SOLL (${ausreichend} m²) — als ausreichend gewertet, Position übersprungen.`);
      } else {
        if (istUnklar) w.push("Gemüse: Beetgröße unbekannt — Platzhalter im Schreiben, bitte im Word-Dokument nachtragen.");
        // Gemeinsamer Kern für Mitteilung UND Abmahnung (Vorstands-/Muster-
        // Formulierung K3, § 1; Sascha 2026-07-12). Der Obst-Satz variiert je
        // nachdem, ob ausdrücklich eine Kompensation durch Obst vermerkt ist.
        const grad = ist !== null && ist > 0 && ist < soll / 3 ? "viel zu klein" : "zu klein";
        const feststellung = istUnklar
          ? `Die Anbaufläche für einjährige Gemüsekulturen ist ${grad} ${PLATZHALTER}.`
          : `Die Anbaufläche für einjährige Gemüsekulturen ist mit derzeit ca. ${ist} m² ${grad}.`;
        const erklaerung = `Laut § 1 des Unterpachtvertrages pachten Sie die Parzelle zur sog. kleingärtnerischen Nutzung. Dazu zählt zwingend der Anbau von Obst und Gemüse auf jeweils mindestens einem Sechstel der Parzellenfläche. Bei Ihrer Parzelle von ${qm} m² sind das für den Gemüseanbau rund ${soll} m².`;
        const obst = e.kompensation
          ? `Die zu geringe Gemüsefläche wird derzeit noch durch den umfangreichen Anbau von Obst ausgeglichen; die Gemüseanbaufläche darf jedoch nicht weiter verkleinert werden.`
          : `Auf Grund der Art und Weise, wie Sie den Obstanbau im Garten betreiben, ist dieser nicht geeignet, fehlende Gemüseanbauflächen auszugleichen.`;
        if (!abmahnung) {
          // MITTEILUNG: freundliche Aufforderung, KEINE Datums-Frist (Sascha
          // 2026-07-12: Mitteilungen werden im laufenden Jahr nicht kontrolliert;
          // Ziel ist die kommende Gartensaison).
          const aufforderung = e.kompensation
            ? `→ Bitte erhalten Sie die Gemüseanbaufläche mindestens im derzeitigen Umfang und bauen Sie sie möglichst bis zur kommenden Gartensaison (Frühjahr ${folgejahr}) auf rund ${soll} m² aus.`
            : `→ Bitte vergrößern Sie die Gemüseanbaufläche bis zur kommenden Gartensaison (Frühjahr ${folgejahr}) auf mindestens ${soll} m², bepflanzen Sie sie dann mit einjährigen Gemüsekulturen und halten Sie sie in einem guten Kulturzustand.`;
          positionen.push({
            text: `${feststellung} ${erklaerung} ${obst} ${aufforderung}`,
            frist: null, bilder: [], _bereich: 0, _id: "G01", _datum: null, _eigen: true,
          });
          hatNutzung = true;
        } else {
          // ABMAHNUNG: Sofort-/Frist-Logik unverändert.
          // Bis Ende Juli ist die Fläche noch DIESE Saison herstellbar (zentrale
          // Frist, mind. 4 Wochen; Sofort-Ziel = 2/3 vom Soll). Ab August: 30.04. Folgejahr.
          const nochDiesesJahr = fristBasis.getMonth() <= 6;
          const sofort = nochDiesesJahr
            ? `Bitte legen Sie innerhalb der genannten Frist eine Gemüseanbaufläche mit mindestens ${ausreichend} m² an und bepflanzen Sie sie noch in dieser Saison mit späten Kulturen (z. B. Buschbohnen, Herbstlauch) oder einer Gründüngung (z. B. Phacelia). Ab der Gartensaison ${folgejahr} ist die Fläche vollständig mit einjährigen Gemüsekulturen zu bestellen, in einem guten Kulturzustand zu halten und bedarfsgerecht zu bewirtschaften.`
            : `Vergrößern Sie die Gemüseanbaufläche bis zum ${datumDe(frist2)} auf mindestens ${soll} m² und bepflanzen Sie sie im Laufe der Vegetationsperiode mit einjährigen Gemüsekulturen.`;
          gemueseVoll = {
            text: `${feststellung} ${erklaerung} ${obst} ${sofort}`,
            frist: nochDiesesJahr ? null : datumDe(frist2), bilder: [],
            _bereich: 0, _id: "G01", _datum: null, _eigen: true,
          };
          gemueseVollZentraleFrist = nochDiesesJahr;
          gemueseKurz = `Zudem weisen wir Sie darauf hin, dass die Anbaufläche für einjährige Gemüsekulturen ${istUnklar ? `zu klein ist ${PLATZHALTER}` : `mit derzeit ca. ${ist} m² zu klein ist`}. ${erklaerung} ${obst}`;
          hatNutzung = true;
        }
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
    let { datum, saisonal } = bausteinFrist(eff, fristBasis);
    // Obstbaumschnitt in MITTEILUNGEN: Ziel ist der Winterschnitt — Frist
    // stets der 31.03. (Sascha 2026-07-06). Abmahnungen behalten den 30.10.
    if (!abmahnung && eff.id === "G07") {
      datum = new Date(fristBasis.getFullYear(), 2, 31);
      if (datum.getTime() < plusTage(fristBasis, 14).getTime()) {
        datum = new Date(fristBasis.getFullYear() + 1, 2, 31);
      }
      saisonal = true;
    }
    // Abmahnung: Imperativ + Norm-Verweis (Klammerzusatz). Mitteilung: weicher
    // Bitte-Stil "→ Bitte …", keine Paragrafen (Sascha 2026-07-12). Abmahnungen
    // bleiben ausdrücklich unverändert.
    const auff = abmahnung
      ? `${eff.aufforderung} (${eff.norm})`
      : `→ Bitte ${eff.aufforderung.charAt(0).toLowerCase()}${eff.aufforderung.slice(1)}`;
    positionen.push({
      text: `${satz(feststellungBauen(eff.feststellung, befund))} ${auff}`,
      frist: null, bilder: m.fotoPfade,
      _bereich: eff.bereich, _id: eff.id, _datum: datum,
      _eigen: !!eff.einzelfrist || saisonal,
    });
    if (eff.art === "bew") hatBew = true; else hatGO = true;
  }

  // Gemüse-Platzierung (Abmahnung): prominent als 1. Beanstandung nur, wenn es
  // das Hauptthema ist (höchstens 2 weitere Punkte); sonst kurzer Schluss-Hinweis
  // nach dem Kündigungs-Absatz (Sascha 2026-07-11). Bei Bedarf im Word-Dokument
  // umstellbar.
  if (gemueseVoll) {
    const andere = positionen.length;
    if (andere <= 2) {
      positionen.push(gemueseVoll);
      if (gemueseVollZentraleFrist) gemueseZentraleFrist = true;
      w.push(`Gemüse als vorrangige Beanstandung eingefügt (${andere} weitere Punkte) — bei Bedarf ans Ende verschieben.`);
    } else {
      gemueseSchlussText = gemueseKurz;
      w.push(`Gemüse als Schluss-Hinweis gesetzt (${andere} weitere Beanstandungen) — bei Bedarf prominent voranstellen.`);
    }
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
  const brieffrist = sommerVerschiebung(
    standard.length ? new Date(Math.max(...standard)) : plusTage(fristBasis, 28)
  );
  // Mitteilungen nennen KEINE Beseitigungsfristen (Sascha 2026-07-12: werden im
  // laufenden Jahr nicht kontrolliert). Nur Abmahnungen weisen Einzel-/Saison-
  // fristen je Position aus (ebenfalls mit Sommerferien-Regel).
  for (const p of positionen) {
    if (p._datum && p._eigen && abmahnung) p.frist = datumDe(sommerVerschiebung(p._datum));
  }

  // --- Betreff + Abmahn-Grund (deterministisch aus den Verstoß-Arten) ---
  const betreffTeile: string[] = [];
  if (hatGO) betreffTeile.push("Verstößen gegen die Gartenordnung");
  if (hatBew) betreffTeile.push("mangelhafter Bewirtschaftung der Parzelle");
  if (hatNutzung) betreffTeile.push("unzureichender kleingärtnerischer Nutzung");
  const betreffGrund = aufzaehlung(betreffTeile, "und") || "festgestellter Mängel";

  // Einleitungssatz-Arten (Vorstands-Stil 2026-07-11): "erhebliche
  // Gartenordnungsverstöße und Bewirtschaftungsmängel". Nutzung erscheint nicht
  // im Einleitungssatz, sondern erst im Abmahn-Grund.
  const artenTeile: string[] = [];
  if (hatGO) artenTeile.push("Gartenordnungsverstöße");
  if (hatBew) artenTeile.push("Bewirtschaftungsmängel");
  if (!artenTeile.length && hatNutzung) artenTeile.push("Mängel bei der kleingärtnerischen Nutzung");
  const verstossArten = aufzaehlung(artenTeile, "und") || "Mängel";

  // Abmahn-Grund (Vorstands-Stil 2026-07-11): Bewirtschaftung zuerst, dann GO,
  // die Nutzung als "damit einhergehend"; nur EIN §-Verweis am Ende. Bei nur
  // einer Verstoß-Art deren eigener Verweis.
  const grundArten: string[] = [];
  if (hatBew) grundArten.push("mangelhafter Bewirtschaftung der Parzelle");
  if (hatGO) grundArten.push("diverser Verstöße gegen die Gartenordnung");
  let abmahnGrund: string;
  if (hatNutzung) {
    const vor = aufzaehlung(grundArten, "und");
    const kern = vor
      ? `${vor} sowie damit einhergehender unzureichender kleingärtnerischer Nutzung`
      : "unzureichender kleingärtnerischer Nutzung";
    abmahnGrund = `${kern} (§ 1, § 4 Ziff. 5 des Unterpachtvertrages)`;
  } else if (grundArten.length) {
    const ref =
      hatGO && !hatBew
        ? "§ 4 Ziff. 2 des Unterpachtvertrages"
        : hatBew && !hatGO
          ? "§ 4 Ziff. 1 des Unterpachtvertrages"
          : "§ 4 Ziff. 1 und 2 des Unterpachtvertrages";
    abmahnGrund = `${aufzaehlung(grundArten, "und")} (${ref})`;
  } else {
    abmahnGrund = betreffGrund;
  }

  // --- Empfänger/Anrede ---
  // Adressfeld trägt nur den Namen (ohne "Herrn"/"Frau", Sascha 2026-07-10);
  // die Anrede (herr/frau) wird weiterhin für den Gruß gebraucht.
  const p = e.parzelle;
  if (p.anrede !== "herr" && p.anrede !== "frau") {
    w.push("Anrede (Herr/Frau) fehlt an der Parzelle — bitte in der Verwaltung setzen.");
  }
  const du = e.typ === "mitteilung" && p.anredeStil === "du";
  // "THEIßEN" -> "Theißen"; Titel ("Dr.") wandert aus dem Vornamen in die
  // förmliche Anrede, die Du-Form nutzt den Rufnamen ohne Titel.
  // Mitteilungen grüßen freundlich ("Lieber Herr X"), Abmahnungen förmlich
  // ("Sehr geehrter Herr X") — Sascha 2026-07-10.
  const nachnameSchoen = nameSchoen(p.nachname);
  const { titel, rufname } = vornameTitel(p.vorname);
  const titelTeil = titel ? `${titel} ` : "";
  const lieb = e.typ === "mitteilung";
  const gruss = du
    ? `${p.anrede === "frau" ? "Liebe" : "Lieber"} ${rufname}`.trim()
    : p.anrede === "frau"
      ? `${lieb ? "Liebe" : "Sehr geehrte"} Frau ${titelTeil}${nachnameSchoen}`
      : p.anrede === "herr"
        ? `${lieb ? "Lieber" : "Sehr geehrter"} Herr ${titelTeil}${nachnameSchoen}`
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
    vorsitzender: e.verein.vorsitzender,
    heute_datum: datumDe(new Date()),
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
        logo: null, // Briefkopf-Vorlage trägt das Logo bereits (Kopfzeile)
        anlage: p.anlageName,
        betreff_zusatz: null,
        anrede_form: du ? "Du" : "Sie",
        // Neupächter erhalten die Aufbau-Einleitung; der Verpflichtungs-Absatz
        // ("Mit der Unterzeichnung …") entfällt dann (Sascha 2026-07-12).
        erlaeuterung: !e.neupaechter,
        // Neupächter: keine Abmahnungs-Androhung (Aufbauphase; Sascha 2026-07-12).
        hinweis_wiederholung: !e.neupaechter,
        fotos_beigefuegt: false, // Fotos sind direkt eingebettet
        // Freundlicher Rahmen: Plakette-Lob + Neupächter-Ermutigung
        plakette: !!e.plakette,
        plakette_jahr: String(e.begehungDatum.getFullYear()),
        hinweis_anzahl_text:
          beanstandungen.length === 1 ? "den folgenden Hinweis" : "die folgenden Hinweise",
        neupaechter_lob: !!e.neupaechterLob && !e.plakette, // nicht doppelt loben
        neupaechter: !!e.neupaechter, // andere Einleitung (Aufbauphase-Rahmen)
      },
      warnungen: w,
    };
  }
  if (e.typ === "abmahnung_1") {
    return {
      vorlage: "abmahnung_verein",
      kontext: {
        ...basis,
        logo: null, // Briefkopf-Vorlage trägt das Logo bereits (Kopfzeile)
        betreff_grund: betreffGrund,
        abmahn_grund: abmahnGrund,
        verstoss_arten: verstossArten,
        vorjahre: !!e.vorjahre,
        gemuese_schluss: gemueseSchlussText,
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
      // Aufrufer liefert das BV-Logo (vorlagen/logo_bv.jpg); quadratisch,
      // daher schmaler als das Vereins-Logo (48 mm Standard).
      logo_mm: 35,
      betreff_grund: betreffGrund,
      abmahn_grund: abmahnGrund,
      gemuese_schluss: gemueseSchlussText,
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
