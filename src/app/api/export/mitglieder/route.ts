import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { PARZELLE_STATUS } from "@/lib/constants";

// Mitglieder-/Gartenverzeichnis als xlsx (Format der Vereins-Mitgliederliste:
// zwei Tabs — nach Parzelle und alphabetisch) inkl. Flächen aus der jüngsten Begehung.
const STATUS = Object.fromEntries(PARZELLE_STATUS.map((s) => [s.wert, s.label]));
const HEADERS = [
  "Anl.", "Ga-Nr", "Ind.", "Name", "Vorname", "Eintritt", "Straße", "PLZ",
  "Wohnort", "Telefon", "e-mail", "Status", "Fläche (m²)",
  "Beetfläche (m²)", "Obst-Fläche (m²)", "Beeren-Fläche (m²)", "Anbau gesamt (m²)",
];

type Zeile = (string | number)[];

function fuelle(ws: ExcelJS.Worksheet, daten: Zeile[]) {
  ws.addRow(HEADERS);
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  daten.forEach((z) => ws.addRow(z));
  ws.columns.forEach((c) => {
    c.width = 15;
  });
}

export async function GET() {
  const parz = await prisma.parzelle.findMany({
    include: {
      anlage: { select: { kuerzel: true } },
      befunde: {
        orderBy: { runde: { datum: "desc" } },
        take: 1,
        include: { beete: { select: { flaecheM2: true } } },
      },
    },
    orderBy: [{ anlageId: "asc" }, { nummer: "asc" }, { index: "asc" }],
  });

  const r1 = (n: number) => Math.round(n * 10) / 10;
  const zeilen: { sort: string; nummer: number; z: Zeile }[] = parz.map((p) => {
    const b = p.befunde[0];
    const beet = b ? b.beete.reduce((s, x) => s + x.flaecheM2, 0) : 0;
    const obst = b?.kompObstFlaecheM2 ?? 0;
    const beeren = b?.kompBeerenFlaecheM2 ?? 0;
    const anbau = beet + obst + beeren;
    return {
      sort: `${p.nachname} ${p.vorname}`.toLowerCase(),
      nummer: p.nummer,
      z: [
        p.anlage.kuerzel, p.nummer, p.index, p.nachname, p.vorname, p.eintritt,
        p.strasse, p.plz, p.ort, p.telefon, p.email,
        STATUS[p.status] ?? p.status, p.groesseM2 ?? "",
        b ? r1(beet) : "", b ? r1(obst) : "", b ? r1(beeren) : "", b ? r1(anbau) : "",
      ],
    };
  });

  const wb = new ExcelJS.Workbook();
  fuelle(wb.addWorksheet("Gartenverzeichnis"), zeilen.map((x) => x.z));
  const alpha = [...zeilen].sort((a, b) => a.sort.localeCompare(b.sort, "de"));
  fuelle(wb.addWorksheet("Mitgliederliste"), alpha.map((x) => x.z));

  const buf = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="mitgliederliste.xlsx"`,
    },
  });
}
