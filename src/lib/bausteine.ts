// Textbaustein-Katalog für Schreiben (Mitteilung / 1. / 2. Abmahnung).
// Quelle: Textbausteine_Maengel.md (juristisch geprüft, 2026-07-05).
// Die Texte hier sind die CODE-DEFAULTS; Anpassungen macht der Vorstand in
// /einstellungen → Textbausteine (TextbausteinOverride in der DB — leeres
// Feld = Default gilt). Feststellungen tragen einen {befund}-Slot: mit
// Befund wird er eingesetzt, ohne Befund wird das Segment samt Satzzeichen
// entfernt (feststellungBauen). Gemüse (G01) baut schreiben.ts gesondert
// (SOLL/IST, § 12-Weiche, Saison-Logik).

export type Baustein = {
  id: string;
  // Sortierung der Beanstandungsliste: Garten -> Baulichkeiten -> Sonstiges
  bereich: 1 | 2 | 3;
  label: string; // Anzeige in Einstellungen + LLM-Zuordnung
  norm: string; // Normverweis, erscheint als Klammerzusatz
  // Verstoß-Art für Betreff/abmahn_grund: bew = mangelhafte Bewirtschaftung
  // (§ 4 Ziff. 1 UPV), go = Verstoß gegen die Gartenordnung (§ 4 Ziff. 2 UPV)
  art: "bew" | "go";
  // Standard-Frist: Tage ab Fristbasis ODER Saisonziel 30.10. (Vegetationsruhe)
  frist: { tage: number } | { bis: "30.10." };
  bnatschg?: boolean; // Gehölz-Entnahme: Frist nie in die Sperrzeit 01.03.–30.09.
  befundPflicht?: boolean; // ohne Befundtext zu unbestimmt (§ 9 BKleingG) -> Warnung
  einzelfrist?: boolean; // Gefahr/Eilfall: kurze Frist je Position ausweisen
  feststellung: string; // mit {befund}-Slot
  aufforderung: string;
};

// {befund}-Slot füllen bzw. das Segment sauber entfernen, wenn kein Befund da.
export function feststellungBauen(vorlage: string, befund: string): string {
  const b = befund.replace(/[\s.]+$/, "");
  if (b) return vorlage.replace("{befund}", b);
  return vorlage
    .replace(/\s*[–—:;,]?\s*\(\{befund\}\)/, "")
    .replace(/\s*[–—:;,]?\s*\{befund\}/, "");
}

export const BAUSTEINE: readonly Baustein[] = [
  // --- Bereich Garten ---
  {
    id: "G02", bereich: 1, label: "Staudenrabatten vernachlässigt",
    norm: "UPV § 4 Ziff. 1/2", art: "bew", frist: { tage: 28 }, befundPflicht: true,
    feststellung: "Die Staudenrabatten sind vernachlässigt: {befund}.",
    aufforderung: "Jäten Sie die Staudenrabatten, entfernen Sie eingewachsene Wildkräuter und Gehölz-Jahrestriebe mit der Wurzel und halten Sie die Fläche künftig dauerhaft unkrautfrei.",
  },
  {
    id: "G03", bereich: 1, label: "Grenzabstand Anpflanzung nicht eingehalten",
    norm: "UPV § 4 Ziff. 2 / GO 1 Abs. 2", art: "go", frist: { tage: 28 }, bnatschg: true, befundPflicht: true,
    feststellung: "Der nach der Gartenordnung erforderliche Grenzabstand ist nicht eingehalten: {befund}.",
    aufforderung: "Stellen Sie den vorgeschriebenen Grenzabstand her, indem Sie den betreffenden Bewuchs entsprechend zurücksetzen bzw. entfernen.",
  },
  {
    id: "G04", bereich: 1, label: "Zaunfreiheit (0,5 m) nicht eingehalten",
    norm: "UPV § 4 Ziff. 2 / GO 1 Abs. 2", art: "go", frist: { tage: 21 },
    feststellung: "Der vereinseigene Zaun ist innen bzw. außen nicht im vorgeschriebenen Abstand von 0,5 m von Bewuchs freigehalten: {befund}.",
    aufforderung: "Halten Sie den vereinseigenen Zaun innerhalb und außerhalb der Parzelle in einem Abstand von ca. 0,5 m von jeglichem Bewuchs frei, auch von Kletter- und Rankpflanzen.",
  },
  {
    id: "G05", bereich: 1, label: "Anpflanzung entgegen der Gartenordnung",
    norm: "UPV § 4 Ziff. 2 / GO 1.1, 1.3", art: "go", frist: { tage: 28 }, bnatschg: true, befundPflicht: true,
    feststellung: "Es wurden Anpflanzungen festgestellt, die der Gartenordnung widersprechen: {befund}.",
    aufforderung: "Entfernen Sie die unzulässige Anpflanzung vollständig mit der Wurzel.",
  },
  {
    id: "G06", bereich: 1, label: "Vernachlässigter Pflegezustand",
    norm: "UPV § 4 Ziff. 1/2", art: "bew", frist: { tage: 28 }, befundPflicht: true,
    feststellung: "Die Parzelle weist erhebliche Pflegerückstände auf: {befund}.",
    aufforderung: "Stellen Sie einen ordnungsgemäßen Kulturzustand her und pflegen Sie die Parzelle künftig fortlaufend fachgerecht.",
  },
  {
    id: "G07", bereich: 1, label: "Obstbäume vernachlässigt",
    norm: "UPV § 4 Ziff. 2 / GO 2.1", art: "bew", frist: { bis: "30.10." }, bnatschg: true,
    feststellung: "Die Obstbäume sind nicht fachgerecht geschnitten; {befund}.",
    aufforderung: "Führen Sie einen fachgerechten Obstbaumschnitt durch oder lassen Sie ihn durchführen und entsorgen Sie das anfallende Schnittgut. Vorhandenes Fallobst ist vollständig aufzunehmen und über die Biotonne bzw. eine Grüngutsammelstelle zu entsorgen.",
  },
  {
    id: "G08", bereich: 1, label: "Beerensträucher vernachlässigt",
    norm: "UPV § 4 Ziff. 2 / GO 2.1", art: "bew", frist: { tage: 28 },
    feststellung: "Das Beerenobst (z. B. Himbeeren, Johannisbeeren, Brombeeren) ist vernachlässigt und verunkrautet; {befund}.",
    aufforderung: "Schneiden Sie die Beerensträucher fachgerecht aus, befreien Sie den Wurzelbereich von Unkraut und binden Sie die Fruchtruten in das Spalier ein, damit sie den Weg nicht behindern.",
  },
  {
    id: "G09", bereich: 1, label: "Ziergehölze vernachlässigt / über 3 m",
    norm: "UPV § 4 Ziff. 2 / GO 2.1, 1.2", art: "go", frist: { bis: "30.10." }, bnatschg: true,
    feststellung: "Die Ziergehölze sind nicht fachgerecht gepflegt bzw. überschreiten die zulässige Höhe von 3 m; {befund}.",
    aufforderung: "Schneiden Sie die Ziergehölze fachgerecht zurück, so dass die zulässige Höhe von 3 m in der Vegetationsperiode eingehalten wird.",
  },
  {
    id: "G10", bereich: 1, label: "Wildlinge / großkronige Laubbäume",
    norm: "UPV § 4 Ziff. 1/2 / GO 1.2", art: "go", frist: { bis: "30.10." }, bnatschg: true,
    feststellung: "In der Parzelle haben sich Wildlinge heimischer Laubgehölze mit einer natürlichen Wuchshöhe von über 3 m etabliert ({befund}).",
    aufforderung: "Roden Sie alle Wildlinge großkroniger Laubgehölze vollständig mit der Wurzel.",
  },
  {
    id: "G11", bereich: 1, label: "Nadelgehölze / Koniferen",
    norm: "UPV § 4 Ziff. 2 / GO 1.2", art: "go", frist: { bis: "30.10." }, bnatschg: true,
    feststellung: "In der Parzelle befinden sich nach der Gartenordnung unzulässige Nadelgehölze/Koniferen ({befund}).",
    aufforderung: "Roden Sie die Nadelgehölze/Koniferen vollständig mit der Wurzel und entfernen Sie sie aus der Parzelle.",
  },
  {
    id: "G12", bereich: 1, label: "Formhecken unzulässig / zu hoch",
    norm: "UPV § 4 Ziff. 2 / GO 1.3", art: "go", frist: { bis: "30.10." }, bnatschg: true,
    feststellung: "Es wurden nach der Gartenordnung unzulässige Formhecken/Formgehölze festgestellt (u. a. höher als 1,20 m); {befund}.",
    aufforderung: "Schneiden Sie das Gehölz habitusgerecht zurück bzw. reduzieren Sie die Hecke auf das zulässige Maß.",
  },
  {
    id: "G13", bereich: 1, label: "Rasen ungemäht mit Samenflug (Eilfall)",
    norm: "UPV § 4 Ziff. 1/2", art: "bew", frist: { tage: 8 }, einzelfrist: true,
    feststellung: "Die Rasen-/Wiesenflächen sind nicht gemäht; die Gräser haben die Samenreife ausgebildet. Der Samenflug beeinträchtigt die kleingärtnerische Nutzung der Nachbarparzellen erheblich; {befund}.",
    aufforderung: "Mähen Sie sämtliche Gras-/Wiesenflächen innerhalb von 8 Tagen und entsorgen Sie das Schnittgut vollständig aus der Parzelle.",
  },
  {
    id: "G14", bereich: 1, label: "Invasiver Neophyt",
    norm: "UPV § 4 Ziff. 2 / GO 1.2", art: "go", frist: { tage: 28 }, befundPflicht: true,
    feststellung: "In der Parzelle hat sich ein invasiver Neophyt etabliert: {befund}.",
    aufforderung: "Roden Sie den Neophyten vollständig mit der Wurzel und hacken Sie die betroffenen Bereiche künftig regelmäßig tiefgründig, damit Nachtriebe keine Möglichkeit zur Assimilation erhalten.",
  },
  // --- Bereich Baulichkeiten und Nebenanlagen ---
  {
    id: "B01", bereich: 2, label: "Grenzabstand Baulichkeit / Sitzplatz",
    norm: "UPV § 4 Ziff. 2 / GO 4 ff.", art: "go", frist: { tage: 42 }, befundPflicht: true,
    feststellung: "Eine bauliche Anlage hält den nach der Gartenordnung vorgeschriebenen Grenzabstand nicht ein: {befund}.",
    aufforderung: "Stellen Sie den vorgeschriebenen Grenzabstand her bzw. versetzen oder entfernen Sie die bauliche Anlage entsprechend.",
  },
  {
    id: "B02", bereich: 2, label: "Laube falsche Farbe",
    norm: "UPV § 4 Ziff. 4 / § 6 / GO 4.1", art: "go", frist: { tage: 42 },
    feststellung: "Die Laube bzw. Bauteile der Laube sind nicht in einer zugelassenen Laubenfarbe gestrichen ({befund}).",
    aufforderung: "Streichen Sie die betreffenden Bauteile in einer zugelassenen Laubenfarbe gemäß der Ihnen bei der Gartenübergabe ausgehändigten Farbliste.",
  },
  {
    id: "B03", bereich: 2, label: "Laube unerlaubte bauliche Veränderung",
    norm: "UPV § 4 Ziff. 4 / § 6 / GO 4.1", art: "go", frist: { tage: 42 }, befundPflicht: true,
    feststellung: "An der Laube wurden nicht genehmigte bauliche Veränderungen vorgenommen: {befund}.",
    aufforderung: "Bauen Sie die nicht genehmigte Veränderung zurück und stellen Sie den genehmigten Zustand wieder her. Erlaubte Baulichkeiten sind in der Gartenordnung abschließend aufgezählt.",
  },
  {
    id: "B04", bereich: 2, label: "Laube Unfallgefahr",
    norm: "UPV § 4 Ziff. 1 / GO 14.1", art: "bew", frist: { tage: 14 }, befundPflicht: true, einzelfrist: true,
    feststellung: "Die Laube ist in einem Zustand, der eine Unfallgefahr darstellt: {befund}.",
    aufforderung: "Beseitigen Sie die Gefahrenstelle unverzüglich und stellen Sie einen verkehrssicheren Zustand her.",
  },
  {
    id: "B05", bereich: 2, label: "Terrassen-/Sitzplatzfläche überschritten",
    norm: "UPV § 4 Ziff. 2 / GO 4.6", art: "go", frist: { tage: 42 }, befundPflicht: true,
    feststellung: "Die zulässige Terrassen-/Sitzplatzfläche ist überschritten bzw. es wurde eine zweite befestigte Terrasse angelegt: {befund}.",
    aufforderung: "Bauen Sie die überzählige/übergroße Terrassenfläche zurück und stellen Sie den ursprünglichen Oberboden wieder her. Eine zweite befestigte Terrasse ist nicht zulässig.",
  },
  {
    id: "B06", bereich: 2, label: "Gerätekiste zu groß / zu viele",
    norm: "UPV § 4 Ziff. 2 / GO 4.4", art: "go", frist: { tage: 42 },
    feststellung: "Die Gerätekiste überschreitet die zulässigen Maße bzw. es ist mehr als eine Gerätekiste aufgestellt ({befund}). Zulässig ist nur eine Gerätekiste in der vorgegebenen Größe.",
    aufforderung: "Entfernen Sie die überzählige Gerätekiste und stellen Sie sicher, dass die verbleibende Kiste die zulässigen Maße nicht überschreitet.",
  },
  {
    id: "B07", bereich: 2, label: "Pergola zu groß / überdacht",
    norm: "UPV § 4 Ziff. 2 / GO 4.5", art: "go", frist: { tage: 42 }, befundPflicht: true,
    feststellung: "Die Pergola überschreitet das zulässige Maß bzw. wurde unzulässig überdacht: {befund}.",
    aufforderung: "Bauen Sie die Pergola auf das zulässige Maß zurück und entfernen Sie die unzulässige Überdachung.",
  },
  {
    id: "B08", bereich: 2, label: "Beton / Stellplatten / Ortbeton",
    norm: "UPV § 4 Ziff. 2 / GO 4.7, 4.8", art: "go", frist: { tage: 42 }, befundPflicht: true,
    feststellung: "Es wurden nicht genehmigte Beton-/Stellplatten, -Pflanzsteine oder Ortbeton eingebracht: {befund}.",
    aufforderung: "Entfernen Sie die betonierten Bereiche bzw. Stellplatten vollständig und stellen Sie den ursprünglichen Oberboden wieder her. Die Verwendung von Ortbeton ist nicht zulässig.",
  },
  {
    id: "B09", bereich: 2, label: "Grillanlage",
    norm: "UPV § 4 Ziff. 2 / GO 4.10", art: "go", frist: { tage: 42 }, befundPflicht: true,
    feststellung: "Die festgestellte Grillanlage entspricht nicht den Vorgaben der Gartenordnung: {befund}.",
    aufforderung: "Passen Sie die Grillanlage an die Vorgaben der Gartenordnung an bzw. entfernen Sie die unzulässige Anlage.",
  },
  {
    id: "B10", bereich: 2, label: "Kompostplatz Zustand / Inhalt",
    norm: "UPV § 4 Ziff. 2 / GO 4.11, 3.2", art: "go", frist: { tage: 28 },
    feststellung: "Der Kompostplatz entspricht nicht den Vorgaben (Zustand/Grenzabstand) bzw. der Kompostinhalt ist mit Wurzelunkräutern durchdrungen und nicht mehr verwendbar; {befund}.",
    aufforderung: "Entsorgen Sie den unbrauchbaren Kompostinhalt vollständig und betreiben Sie künftig eine ordnungsgemäße Kompostwirtschaft. Ein Kompostplatz dient ausschließlich der Humusproduktion.",
  },
  {
    id: "B11", bereich: 2, label: "Hochbeet nicht genehmigt / defekt",
    norm: "UPV § 4 Ziff. 2 / GO 4.14", art: "go", frist: { tage: 42 }, befundPflicht: true,
    feststellung: "Das Hochbeet ist nicht genehmigt bzw. defekt: {befund}.",
    aufforderung: "Entfernen Sie das nicht genehmigte bzw. defekte Hochbeet oder stellen Sie den genehmigungsfähigen Zustand her.",
  },
  {
    id: "B12", bereich: 2, label: "Tomatenüberdachung / Foliengewächshaus",
    norm: "UPV § 4 Ziff. 2 / GO 4.15, 4.16", art: "go", frist: { tage: 14 },
    feststellung: "Die Tomatenüberdachung/das Foliengewächshaus entspricht nicht den Vorgaben der Gartenordnung (Grundfläche/Material/Zeitraum): {befund}.",
    aufforderung: "Bauen Sie die Überdachung auf das zulässige Maß zurück bzw. verwenden Sie ein zulässiges Material; außerhalb des zulässigen Zeitraums ist das Foliengewächshaus abzubauen.",
  },
  {
    id: "B13", bereich: 2, label: "Sonstige unerlaubte Baulichkeit",
    norm: "UPV § 4 Ziff. 2 / GO 4 ff.", art: "go", frist: { tage: 42 }, befundPflicht: true,
    feststellung: "Es wurde eine nach der Gartenordnung nicht zulässige Baulichkeit festgestellt: {befund}. Erlaubte Baulichkeiten sind in der Gartenordnung abschließend aufgezählt.",
    aufforderung: "Entfernen Sie die unzulässige Baulichkeit samt Inhalt vollständig aus der Parzelle.",
  },
  // --- Bereich Sonstiges ---
  {
    id: "S01", bereich: 3, label: "Müll / Sperrmüll / Altholz",
    norm: "UPV § 4 Ziff. 1", art: "bew", frist: { tage: 21 }, befundPflicht: true,
    feststellung: "Auf der Parzelle wird Müll bzw. Sperrmüll gelagert: {befund}.",
    aufforderung: "Räumen Sie Müll, Sperrmüll und Altholz vollständig aus der Parzelle und entsorgen Sie sie fachgerecht, z. B. über eine städtische Sammelstelle.",
  },
  {
    id: "S02", bereich: 3, label: "Kunststoff / Mikroplastik im Boden",
    norm: "UPV § 4 Ziff. 1 / GO 4.7", art: "go", frist: { tage: 21 }, befundPflicht: true,
    feststellung: "Im Parzellenboden bzw. in den Beeten wurde unzulässiges Kunststoff-/Verpackungsmaterial festgestellt: {befund} (Mikroplastik-Gefahr).",
    aufforderung: "Entfernen Sie das Kunststoffmaterial vollständig. Kunststoffprodukte sind zur Verwendung im Kleingarten nicht zugelassen.",
  },
  {
    id: "S03", bereich: 3, label: "Tierkadaver / Speisereste",
    norm: "UPV § 4 Ziff. 1 / GO 3.1, 3.2", art: "go", frist: { tage: 14 }, befundPflicht: true,
    feststellung: "Im Gartenboden bzw. Kompost wurden Tierkadaver/-knochen oder tierische Speisereste festgestellt: {befund}.",
    aufforderung: "Entfernen Sie die Rückstände fachgerecht. Eine Tierkörperbeseitigung im Kleingarten sowie tierische Speisereste auf dem Kompost oder im Boden sind nicht zulässig.",
  },
  {
    id: "S04", bereich: 3, label: "Gemeinschaftswege / Außenrand ungepflegt",
    norm: "UPV § 4 Ziff. 1/2 / GO 6, 9", art: "bew", frist: { tage: 21 }, befundPflicht: true,
    feststellung: "Der von Ihnen anteilig zu betreuende Gemeinschaftsweg bzw. Außenrand ist nicht gepflegt: {befund}.",
    aufforderung: "Pflegen Sie den anteilig zugeordneten Gemeinschaftsweg/Außenrand und halten Sie ihn dauerhaft in ordnungsgemäßem Zustand.",
  },
  {
    id: "S05", bereich: 3, label: "Pachtvertrag / Wertermittlung nicht umgesetzt",
    norm: "UPV § 4 Ziff. 4 / § 12", art: "go", frist: { tage: 42 }, befundPflicht: true,
    feststellung: "Zusagen aus dem Pachtvertrag bzw. der Wertermittlung bei Gartenübernahme wurden nicht umgesetzt: {befund}.",
    aufforderung: "Setzen Sie die vertraglich bzw. im Rahmen der Wertermittlung vereinbarten Maßnahmen um.",
  },
  {
    id: "S06", bereich: 3, label: "Wasserschacht Unfallgefahr",
    norm: "UPV § 4 Ziff. 1 / GO 14.1", art: "bew", frist: { tage: 14 }, einzelfrist: true,
    feststellung: "Der Wasserschacht befindet sich in einem schlechten Zustand und stellt eine Unfallgefahr dar ({befund}).",
    aufforderung: "Setzen Sie den Wasserschacht instand bzw. sichern Sie ihn, so dass keine Unfallgefahr mehr besteht.",
  },
  {
    id: "S07", bereich: 3, label: "Gartenteich",
    norm: "UPV § 4 Ziff. 2 / GO 4.18", art: "go", frist: { tage: 14 }, befundPflicht: true, einzelfrist: true,
    feststellung: "Der Gartenteich entspricht nicht den Vorgaben bzw. stellt eine Unfallgefahr dar: {befund}.",
    aufforderung: "Passen Sie den Gartenteich an die Vorgaben der Gartenordnung an bzw. sichern Sie ihn gegen die Unfallgefahr.",
  },
  {
    id: "S08", bereich: 3, label: "Unterverpachtung / fremde Hilfe",
    norm: "UPV § 7", art: "go", frist: { tage: 21 }, befundPflicht: true,
    feststellung: "Es bestehen Anhaltspunkte für eine unzulässige Nutzung durch Dritte bzw. eine dauerhafte Inanspruchnahme fremder Hilfe: {befund}.",
    aufforderung: "Stellen Sie die persönliche Bewirtschaftung sicher. Eine Unterverpachtung ist nicht gestattet; die dauerhafte Inanspruchnahme fremder Hilfe ist anzeige- und genehmigungspflichtig (§ 7 UPV).",
  },
  {
    // NEU 2026-07-06 (Sascha): generische Unfallgefahr — Katalogpunkt 31.
    id: "S09", bereich: 3, label: "Unfallgefahr (allgemein)",
    norm: "UPV § 4 Ziff. 1 / GO 14.1", art: "bew", frist: { tage: 14 }, befundPflicht: true, einzelfrist: true,
    feststellung: "Auf der Parzelle besteht eine Unfallgefahr: {befund}.",
    aufforderung: "Beseitigen Sie die Gefahrenstelle unverzüglich und stellen Sie einen verkehrssicheren Zustand her.",
  },
  {
    // NEU 2026-07-06 (Sascha, GO 8.2): Bienenhaltung ohne Genehmigung.
    // Naturschutzbehörde: Honigbienen verdrängen Wildbienen -> derzeit werden
    // keine neuen Genehmigungen erteilt (auch nicht genehmigungsfähig).
    id: "S10", bereich: 3, label: "Bienenhaltung ohne Genehmigung",
    norm: "UPV § 4 Ziff. 2 / GO 8.2", art: "go", frist: { tage: 42 },
    feststellung: "Auf der Parzelle werden Honigbienenvölker ohne die nach der Gartenordnung erforderliche Genehmigung gehalten ({befund}). Neue Genehmigungen werden nach Mitteilung der Naturschutzbehörde derzeit nicht erteilt, da Honigbienenvölker die Wildbienen verdrängen; die Haltung ist damit aktuell auch nicht genehmigungsfähig.",
    aufforderung: "Stellen Sie die Bienenhaltung ein und entfernen Sie die Bienenvölker samt Beuten aus der Parzelle.",
  },
  {
    // NEU 2026-07-06 (Sascha, GO 8.2): mehr Völker als genehmigt/zulässig.
    id: "S11", bereich: 3, label: "Bienenhaltung: zu viele Völker",
    norm: "UPV § 4 Ziff. 2 / GO 8.2", art: "go", frist: { tage: 42 },
    feststellung: "Auf der Parzelle werden mehr Honigbienenvölker gehalten, als genehmigt bzw. nach der Gartenordnung zulässig sind ({befund}).",
    aufforderung: "Reduzieren Sie die Zahl der Bienenvölker auf das genehmigte bzw. zulässige Maß und entfernen Sie die überzähligen Völker samt Beuten aus der Parzelle.",
  },
] as const;

export const BAUSTEIN_MAP: Record<string, Baustein> = Object.fromEntries(
  BAUSTEINE.map((b) => [b.id, b])
);

// Katalogpunkt (DB, Stand 2026-07: 31 Punkte) -> Baustein-ID.
// "Gemüseanbau: …" fehlt bewusst: G01 wird in schreiben.ts gesondert gebaut.
export const KATALOG_ZU_BAUSTEIN: Record<string, string> = {
  "Staudenrabatten": "G02",
  "Nicht eingehaltener Grenzabstand (Anpflanzung)": "G03",
  "Nicht eingehaltener Sitzplatz-Grenzabstand": "B01",
  "Anpflanzung entgegen GO": "G05",
  "Mangelnde Zaunfreiheit": "G04",
  "Vernachlässigter Pflegezustand": "G06",
  "Obstbaum-Bestand vernachlässigt": "G07",
  "Beerenobst vernachlässigt": "G08",
  "Ziergehölze vernachlässigt": "G09",
  "Wildlinge / großkronige Laubbäume entgegen GO": "G10",
  "Nadelgehölze entgegen GO": "G11",
  "Formhecken entgegen GO": "G12",
  "Nicht eingehaltener Grenzabstand": "B01",
  "Laube – falsche Farbe": "B02",
  "Laube – unerlaubter Bau / bauliche Veränderung": "B03",
  "Laube – Unfallgefahr": "B04",
  "Überschreitung zulässige Terrassen-/Sitzplatzfläche": "B05",
  "Gerätekiste": "B06",
  "Pergola": "B07",
  "Beton-Stellplatten / -Pflanzsteine": "B08",
  "Grill": "B09",
  "Kompostplatz / -behälter": "B10",
  "Hochbeet": "B11",
  "Tomatenüberdachung / Foliengewächshaus": "B12",
  "Müll auf der Parzelle gelagert": "S01",
  "Zustand anteilig zu betreuender Gemeinschaftswege / Außenrand": "S04",
  "Fehlende Umsetzung der Zusätze aus Pachtvertrag / Wertermittlung": "S05",
  "Wasserschächte in schlechtem Zustand": "S06",
  "Gartenteiche": "S07",
  "Unfallgefahr": "S09",
};

// Texte, die der Vorstand in /einstellungen überschreiben kann (leer = Default).
export type BausteinOverride = { feststellung?: string; aufforderung?: string; norm?: string };

// Effektiven Baustein bilden: Code-Default + evtl. DB-Override.
export function effektiverBaustein(b: Baustein, o?: BausteinOverride): Baustein {
  if (!o) return b;
  return {
    ...b,
    feststellung: o.feststellung?.trim() ? o.feststellung : b.feststellung,
    aufforderung: o.aufforderung?.trim() ? o.aufforderung : b.aufforderung,
    norm: o.norm?.trim() ? o.norm : b.norm,
  };
}
