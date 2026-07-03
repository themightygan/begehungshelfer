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
  req: NextRequest,
  { params }: { params: Promise<{ parzelleId: string }> }
) {
  const { parzelleId } = await params;
  const rundeId = Number(req.nextUrl.searchParams.get("rundeId")) || null;

  const parzelle = await prisma.parzelle.findUnique({
    where: { parzelleId },
    include: { anlage: true },
  });
  if (!parzelle) return new Response("Parzelle nicht gefunden", { status: 404 });

  // Befund der angegebenen Runde, sonst jüngster Befund dieser Parzelle.
  const befund = await prisma.befund.findFirst({
    where: rundeId
      ? { parzelleId: parzelle.id, rundeId }
      : { parzelleId: parzelle.id },
    orderBy: { zeitpunkt: "desc" },
    include: {
      runde: { select: { datum: true } },
      maengel: {
        orderBy: { id: "asc" },
        include: { katalog: true, fotos: { orderBy: { id: "asc" } } },
      },
      fotos: { where: { mangelId: null, beetId: null }, orderBy: { id: "asc" } },
      beete: {
        orderBy: { id: "asc" },
        include: { fotos: { orderBy: { id: "asc" } } },
      },
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
    datum: (befund?.runde?.datum
      ? new Date(befund.runde.datum)
      : new Date()
    ).toLocaleDateString("de-DE"),
    uebersicht,
    maengel,
    beete: await Promise.all(
      (befund?.beete ?? []).map(async (b) => ({
        bezeichnung: b.bezeichnung,
        flaecheM2: b.flaecheM2,
        fotos: await ladeFotos(b.fotos),
      }))
    ),
    beetIst: (befund?.beete ?? []).reduce((s, b) => s + b.flaecheM2, 0),
    beetSoll: parzelle.groesseM2 ? parzelle.groesseM2 / 6 : null,
    kompensationText: [
      befund?.kompObstAnzahl || befund?.kompObstFlaecheM2
        ? `Obstbäume: ${befund.kompObstAnzahl} (${befund.kompObstFlaecheM2} m²)`
        : "",
      befund?.kompBeerenAnzahl || befund?.kompBeerenFlaecheM2
        ? `Beeren/Spalierobst: ${befund.kompBeerenAnzahl} (${befund.kompBeerenFlaecheM2} m²)`
        : "",
      befund?.kompensationNotiz ?? "",
    ]
      .filter(Boolean)
      .join(" — "),
    kompensationAusreichend: befund?.kompensationAusreichend ?? false,
    gutGemacht: befund?.gutGemacht ?? false,
    plakettenNotiz: befund?.plakettenNotiz ?? "",
  });

  // Sprechender Dateiname: <AnlageParzelle>_<NACHNAME>_<YYYY_MM_DD>.pdf,
  // z. B. "S71_BAIZID_2026_07_02.pdf". Umlaute transliteriert, Rest ASCII-safe.
  const nameSafe = (parzelle.nachname || "UNBEKANNT")
    .toUpperCase()
    .replace(/Ä/g, "AE").replace(/Ö/g, "OE").replace(/Ü/g, "UE").replace(/ß/g, "SS")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Akzente (é -> E)
    .replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "UNBEKANNT";
  const datumTeil = (befund?.runde?.datum ? new Date(befund.runde.datum) : new Date())
    .toISOString().slice(0, 10).replace(/-/g, "_");
  const dateiname = `${parzelle.parzelleId}_${nameSafe}_${datumTeil}.pdf`;

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${dateiname}"`,
    },
  });
}
