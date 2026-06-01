import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { PARZELLE_STATUS } from "@/lib/constants";

// Mitglieder-/Gartenverzeichnis als xlsx (Format der Vereins-Mitgliederliste:
// zwei Tabs — nach Parzelle und alphabetisch).
const STATUS = Object.fromEntries(PARZELLE_STATUS.map((s) => [s.wert, s.label]));
const HEADERS = [
  "Anl.", "Ga-Nr", "Ind.", "Name", "Vorname", "Eintritt", "Straße", "PLZ",
  "Wohnort", "Telefon", "e-mail", "Status", "Fläche (m²)",
];

type P = {
  nummer: number; index: string; nachname: string; vorname: string;
  eintritt: string; strasse: string; plz: string; ort: string;
  telefon: string; email: string; status: string; groesseM2: number | null;
  anlage: { kuerzel: string };
};

function zeile(p: P) {
  return [
    p.anlage.kuerzel, p.nummer, p.index, p.nachname, p.vorname, p.eintritt,
    p.strasse, p.plz, p.ort, p.telefon, p.email,
    STATUS[p.status] ?? p.status, p.groesseM2 ?? "",
  ];
}

function fuelle(ws: ExcelJS.Worksheet, daten: P[]) {
  ws.addRow(HEADERS);
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  daten.forEach((p) => ws.addRow(zeile(p)));
  ws.columns.forEach((c) => {
    c.width = 16;
  });
}

export async function GET() {
  const parz = (await prisma.parzelle.findMany({
    include: { anlage: { select: { kuerzel: true } } },
    orderBy: [{ anlageId: "asc" }, { nummer: "asc" }, { index: "asc" }],
  })) as unknown as P[];

  const wb = new ExcelJS.Workbook();
  fuelle(wb.addWorksheet("Gartenverzeichnis"), parz);
  const alpha = [...parz].sort(
    (a, b) =>
      a.nachname.localeCompare(b.nachname, "de") ||
      a.vorname.localeCompare(b.vorname, "de")
  );
  fuelle(wb.addWorksheet("Mitgliederliste"), alpha);

  const buf = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="mitgliederliste.xlsx"`,
    },
  });
}
