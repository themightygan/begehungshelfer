import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { dateiLesen } from "@/lib/storage";
import {
  berichtPdfBuffer,
  type BerichtFoto,
  type BerichtMangel,
} from "@/lib/pdf";

async function ladeFotos(
  fotos: { dateipfad: string }[]
): Promise<BerichtFoto[]> {
  const out: BerichtFoto[] = [];
  for (const f of fotos) {
    const data = await dateiLesen(f.dateipfad);
    if (data) out.push({ data });
  }
  return out;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ parzelleId: string }> }
) {
  const { parzelleId } = await params;

  const parzelle = await prisma.parzelle.findUnique({
    where: { parzelleId },
    include: { anlage: true },
  });
  if (!parzelle) return new Response("Parzelle nicht gefunden", { status: 404 });

  // Jüngsten Befund dieser Parzelle nehmen (Prototyp: i. d. R. genau einer).
  const befund = await prisma.befund.findFirst({
    where: { parzelleId: parzelle.id },
    orderBy: { zeitpunkt: "desc" },
    include: {
      maengel: {
        orderBy: { id: "asc" },
        include: { katalog: true, fotos: { orderBy: { id: "asc" } } },
      },
      fotos: { where: { mangelId: null }, orderBy: { id: "asc" } },
    },
  });

  const uebersicht = befund ? await ladeFotos(befund.fotos) : [];
  const maengel: BerichtMangel[] = [];
  for (const m of befund?.maengel ?? []) {
    maengel.push({
      bereich: m.bereich,
      punkt: m.punkt,
      notiz: m.notiz,
      referenz: m.katalog?.referenz ?? "",
      frist: m.frist ? new Date(m.frist).toLocaleDateString("de-DE") : null,
      fotos: await ladeFotos(m.fotos),
    });
  }

  const adresse = [
    parzelle.strasse,
    [parzelle.plz, parzelle.ort].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  const pdf = await berichtPdfBuffer({
    parzelleId: parzelle.parzelleId,
    anlage: parzelle.anlage.name,
    paechter: [parzelle.nachname, parzelle.vorname].filter(Boolean).join(" "),
    adresse,
    groesseM2: parzelle.groesseM2,
    stufe: befund?.stufe ?? "neutral",
    notiz: befund?.notiz ?? "",
    datum: new Date().toLocaleDateString("de-DE"),
    uebersicht,
    maengel,
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Bericht_${parzelle.parzelleId}.pdf"`,
    },
  });
}
