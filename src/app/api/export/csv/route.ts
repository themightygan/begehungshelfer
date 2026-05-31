import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { STUFE_LABEL } from "@/lib/constants";

// CSV-Gesamtexport: eine Zeile je Mangel; Parzellen mit Befund aber ohne Mangel
// erscheinen als eine Zusammenfassungszeile. Semikolon + UTF-8-BOM (Excel/DE).
function feld(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const iso = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export async function GET(req: NextRequest) {
  const rundeId = Number(req.nextUrl.searchParams.get("rundeId")) || null;
  const befunde = await prisma.befund.findMany({
    where: rundeId ? { rundeId } : {},
    include: {
      parzelle: { include: { anlage: true } },
      maengel: { include: { _count: { select: { fotos: true } } } },
      beete: true,
      _count: { select: { fotos: true } },
    },
    orderBy: { parzelle: { parzelleId: "asc" } },
  });

  const kopf = [
    "Parzelle", "Anlage", "Paechter", "Adresse", "Flaeche_m2", "Stufe",
    "Bemerkung", "Bereich", "Mangel", "Mangel_Notiz", "Frist", "Status",
    "BehobenAm", "Fotos", "Gemuese_IST_m2", "Gemuese_SOLL_m2",
  ];
  const zeilen: string[] = [kopf.join(";")];

  for (const b of befunde) {
    // Nur tatsächlich begutachtete Parzellen (leere "nur geöffnet"-Befunde überspringen).
    const hatDaten =
      b.stufe !== "neutral" ||
      b.maengel.length > 0 ||
      b.beete.length > 0 ||
      b._count.fotos > 0 ||
      b.gutGemacht ||
      b.notiz.trim() !== "";
    if (!hatDaten) continue;
    const p = b.parzelle;
    const adresse = [p.strasse, [p.plz, p.ort].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", ");
    const ist = b.beete.reduce((s, x) => s + x.flaecheM2, 0);
    const soll = p.groesseM2 ? p.groesseM2 / 6 : null;
    const basis = [
      p.parzelleId, p.anlage.name, `${p.nachname} ${p.vorname}`.trim(), adresse,
      p.groesseM2 ?? "", STUFE_LABEL[b.stufe] ?? b.stufe, b.notiz,
    ];
    const gemuese = [
      ist ? ist.toFixed(1) : "0",
      soll !== null ? soll.toFixed(1) : "",
    ];

    if (b.maengel.length === 0) {
      zeilen.push([...basis, "", "", "", "", "", "", "", ...gemuese].map(feld).join(";"));
    } else {
      for (const m of b.maengel) {
        zeilen.push(
          [
            ...basis, m.bereich, m.punkt, m.notiz, iso(m.frist), m.status,
            iso(m.behobenAm), m._count.fotos, ...gemuese,
          ].map(feld).join(";")
        );
      }
    }
  }

  const csv = "﻿" + zeilen.join("\r\n") + "\r\n";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="begehung_export${rundeId ? `_runde${rundeId}` : ""}.csv"`,
    },
  });
}
