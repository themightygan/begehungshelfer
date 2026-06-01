// Parzellen-Bericht als PDF (@react-pdf/renderer, pure JS — kein Chromium).
// Standardfont Helvetica deckt deutsche Umlaute ab; keine Font-Registrierung nötig.
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Vereinslogo (falls vorhanden) einmalig laden für den PDF-Kopf.
const LOGO_PFAD = join(process.cwd(), "public/img/logo.png");
const LOGO: Buffer | null = existsSync(LOGO_PFAD) ? readFileSync(LOGO_PFAD) : null;

export type BerichtFoto = { data: Buffer };

export type BerichtMangel = {
  bereich: string;
  punkt: string;
  notiz: string;
  referenz: string;
  frist: string | null; // bereits formatiert
  fotos: BerichtFoto[];
};

export type BerichtDaten = {
  parzelleId: string;
  anlage: string;
  paechter: string;
  adresse: string;
  groesseM2: number | null;
  stufe: string;
  notiz: string;
  datum: string; // bereits formatiert
  uebersicht: BerichtFoto[];
  maengel: BerichtMangel[];
  beete: { bezeichnung: string; flaecheM2: number; fotos: BerichtFoto[] }[];
  beetIst: number;
  beetSoll: number | null;
  kompensationText: string;
  kompensationAusreichend: boolean;
  gutGemacht: boolean;
  plakettenNotiz: string;
};

const m2 = (n: number) =>
  n.toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " m²";

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 10, color: "#1c1917", fontFamily: "Helvetica" },
  kopf: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 52, height: 44, objectFit: "contain" },
  verein: { fontSize: 9, color: "#57534e" },
  titel: { fontSize: 18, marginTop: 4, fontFamily: "Helvetica-Bold" },
  meta: { marginTop: 2, color: "#57534e" },
  abschnitt: { marginTop: 16 },
  h2: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    borderBottom: "1pt solid #d6d3d1",
    paddingBottom: 3,
    marginBottom: 6,
  },
  zeile: { flexDirection: "row", marginBottom: 2 },
  label: { width: 110, color: "#57534e" },
  wert: { flex: 1 },
  text: { marginTop: 2, lineHeight: 1.4 },
  fotoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  foto: { width: 158, height: 118, objectFit: "cover", borderRadius: 2 },
  mangel: {
    marginTop: 10,
    paddingTop: 8,
    borderTop: "1pt solid #e7e5e4",
  },
  mangelBereich: { fontSize: 8, color: "#a8a29e", textTransform: "uppercase" },
  mangelPunkt: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  mangelMeta: { fontSize: 8, color: "#78716c" },
  fuss: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 8,
    color: "#a8a29e",
    borderTop: "1pt solid #e7e5e4",
    paddingTop: 4,
  },
});

function FotoReihe({ fotos }: { fotos: BerichtFoto[] }) {
  if (fotos.length === 0) return null;
  return (
    <View style={s.fotoGrid}>
      {fotos.map((f, i) => (
        <Image key={i} style={s.foto} src={{ data: f.data, format: "jpg" }} />
      ))}
    </View>
  );
}

function Bericht({ d }: { d: BerichtDaten }) {
  return (
    <Document title={`Begehungsbericht ${d.parzelleId}`}>
      <Page size="A4" style={s.page}>
        <View style={s.kopf}>
          {LOGO && <Image style={s.logo} src={{ data: LOGO, format: "png" }} />}
          <View>
            <Text style={s.verein}>Gartenfreunde Stuttgart Sillenbuch e.V.</Text>
            <Text style={s.titel}>Begehungsbericht — Parzelle {d.parzelleId}</Text>
            <Text style={s.meta}>
              {d.anlage} · Datum der Begehung: {d.datum}
            </Text>
          </View>
        </View>

        <View style={s.abschnitt}>
          <Text style={s.h2}>Parzelle / Pächter</Text>
          <View style={s.zeile}>
            <Text style={s.label}>Pächter</Text>
            <Text style={s.wert}>{d.paechter || "—"}</Text>
          </View>
          <View style={s.zeile}>
            <Text style={s.label}>Adresse</Text>
            <Text style={s.wert}>{d.adresse || "—"}</Text>
          </View>
          <View style={s.zeile}>
            <Text style={s.label}>Fläche</Text>
            <Text style={s.wert}>{d.groesseM2 ? `${d.groesseM2} m²` : "—"}</Text>
          </View>
        </View>

        {d.gutGemacht && (
          <View style={s.abschnitt}>
            <Text style={s.h2}>„Gut gemacht"</Text>
            <Text style={s.text}>
              Vorbildlich gepflegte Parzelle.
              {d.plakettenNotiz ? ` ${d.plakettenNotiz}` : ""}
            </Text>
          </View>
        )}

        {d.notiz.trim() !== "" && (
          <View style={s.abschnitt}>
            <Text style={s.h2}>Allgemeine Bemerkung</Text>
            <Text style={s.text}>{d.notiz}</Text>
          </View>
        )}

        {d.uebersicht.length > 0 && (
          <View style={s.abschnitt}>
            <Text style={s.h2}>Gesamtansicht</Text>
            <FotoReihe fotos={d.uebersicht} />
          </View>
        )}

        {(d.beete.length > 0 || d.beetSoll !== null) && (
          <View style={s.abschnitt}>
            <Text style={s.h2}>Gemüseanbaufläche</Text>
            {d.beete.map((b, i) => (
              <View key={i} wrap={false}>
                <View style={s.zeile}>
                  <Text style={s.label}>{b.bezeichnung || `Beet ${i + 1}`}</Text>
                  <Text style={s.wert}>{m2(b.flaecheM2)}</Text>
                </View>
                <FotoReihe fotos={b.fotos} />
              </View>
            ))}
            <Text style={s.text}>
              IST: {m2(d.beetIst)}
              {d.beetSoll !== null
                ? ` · SOLL (1/6): ${m2(d.beetSoll)} · ${
                    d.beetIst >= d.beetSoll ? "erfüllt" : "nicht erfüllt"
                  }`
                : ""}
            </Text>
            {(d.kompensationAusreichend || d.kompensationText.trim() !== "") && (
              <Text style={s.text}>
                Kompensation: {d.kompensationText}
                {d.kompensationAusreichend
                  ? " — ausreichende kleingärtnerische Nutzung dokumentiert (Anbau gesamt mind. 1/3)"
                  : ""}
              </Text>
            )}
          </View>
        )}

        <View style={s.abschnitt}>
          <Text style={s.h2}>Festgestellte Mängel ({d.maengel.length})</Text>
          {d.maengel.length === 0 ? (
            <Text style={s.text}>Keine Mängel erfasst.</Text>
          ) : (
            d.maengel.map((m, i) => (
              <View key={i} style={s.mangel} wrap={false}>
                <Text style={s.mangelBereich}>{m.bereich}</Text>
                <Text style={s.mangelPunkt}>
                  {i + 1}. {m.punkt || "(ohne Bezeichnung)"}
                </Text>
                {(m.referenz || m.frist) && (
                  <Text style={s.mangelMeta}>
                    {m.referenz}
                    {m.referenz && m.frist ? " · " : ""}
                    {m.frist ? `Frist: ${m.frist}` : ""}
                  </Text>
                )}
                {m.notiz.trim() !== "" && <Text style={s.text}>{m.notiz}</Text>}
                <FotoReihe fotos={m.fotos} />
              </View>
            ))
          )}
        </View>

        <Text style={s.fuss} fixed>
          Erstellt mit Begehungshelfer · {d.anlage} · Parzelle {d.parzelleId}
        </Text>
      </Page>
    </Document>
  );
}

export async function berichtPdfBuffer(d: BerichtDaten): Promise<Buffer> {
  return renderToBuffer(<Bericht d={d} />);
}
