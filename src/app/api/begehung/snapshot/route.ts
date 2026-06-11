import { prisma } from "@/lib/db";
import { getAktiveRunde } from "@/lib/runde";
import { istNeupaechter } from "@/lib/paechter";
import type {
  SnapBefund,
  SnapFoto,
  SnapParzelle,
  SnapVorMangel,
  WorkspaceSnapshot,
} from "@/lib/workspaceTypes";

// Runden-Snapshot für den Offline-Begehungsmodus: ALLE Daten, die die Erfassung
// im Feld braucht (Parzellen, Katalog, Befunde der Runde, Vorjahres-Vergleich,
// offene frühere Mängel, Beet-Messhistorie) in EINEM Request. Der Client hält
// das Ergebnis in IndexedDB und arbeitet darauf lokal weiter.
//
// Batch-Queries statt der Per-Parzelle-Queries der alten Detailseite —
// 153 Parzellen × Einzelabfragen wären hier zu teuer.

const fristStr = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const datumStr = (d: Date) => new Date(d).toLocaleDateString("de-DE");
const foto = (f: { id: number; dateipfad: string }): SnapFoto => ({ id: f.id, pfad: f.dateipfad });

export async function GET() {
  const runde = await getAktiveRunde();
  if (!runde) {
    return Response.json({ error: "Keine aktive Begehung" }, { status: 409 });
  }

  const [anlage, parzellen, katalog, befunde, altBefunde] = await Promise.all([
    prisma.anlage.findUniqueOrThrow({ where: { id: runde.anlageId } }),
    prisma.parzelle.findMany({
      where: { anlageId: runde.anlageId },
      orderBy: [{ nummer: "asc" }, { index: "asc" }],
    }),
    prisma.katalog.findMany({ where: { aktiv: true }, orderBy: { sortierung: "asc" } }),
    prisma.befund.findMany({
      where: { rundeId: runde.id },
      include: {
        maengel: { orderBy: { id: "asc" }, include: { fotos: { orderBy: { id: "asc" } } } },
        beete: { orderBy: { id: "asc" }, include: { fotos: { orderBy: { id: "asc" } } } },
        fotos: { orderBy: { id: "asc" } },
      },
    }),
    // Frühere Begehungen derselben Anlage (neueste zuerst) — Quelle für
    // Vorjahres-Vergleich, Plaketten-Jahre, offene Mängel und Messhistorie.
    prisma.befund.findMany({
      where: { parzelle: { anlageId: runde.anlageId }, rundeId: { not: runde.id } },
      include: {
        runde: { select: { datum: true } },
        maengel: { orderBy: { id: "asc" }, include: { fotos: { orderBy: { id: "asc" } } } },
        beete: { orderBy: { id: "asc" } },
      },
      orderBy: { runde: { datum: "desc" } },
    }),
  ]);

  const befundByParzelle = new Map(befunde.map((b) => [b.parzelleId, b]));
  const altByParzelle = new Map<number, typeof altBefunde>();
  for (const b of altBefunde) {
    const liste = altByParzelle.get(b.parzelleId) ?? [];
    liste.push(b);
    altByParzelle.set(b.parzelleId, liste);
  }

  const snapParzellen: SnapParzelle[] = parzellen.map((p) => {
    const b = befundByParzelle.get(p.id);
    const alt = altByParzelle.get(p.id) ?? [];

    let befund: SnapBefund | null = null;
    if (b) {
      befund = {
        stufe: b.stufe,
        notiz: b.notiz,
        diktatNachgereicht: b.diktatNachgereicht,
        gutGemacht: b.gutGemacht,
        plakettenNotiz: b.plakettenNotiz,
        kompObstAnzahl: b.kompObstAnzahl,
        kompObstFlaecheM2: b.kompObstFlaecheM2,
        kompBeerenAnzahl: b.kompBeerenAnzahl,
        kompBeerenFlaecheM2: b.kompBeerenFlaecheM2,
        kompensationNotiz: b.kompensationNotiz,
        kompensationAusreichend: b.kompensationAusreichend,
        maengel: b.maengel.map((m) => ({
          uid: m.uid!,
          katalogId: m.katalogId,
          bereich: m.bereich,
          punkt: m.punkt,
          notiz: m.notiz,
          frist: fristStr(m.frist),
          diktatNachgereicht: m.diktatNachgereicht,
          fotos: m.fotos.map(foto),
        })),
        beete: b.beete.map((x) => ({
          uid: x.uid!,
          bezeichnung: x.bezeichnung,
          flaecheM2: x.flaecheM2,
          fotos: x.fotos.map(foto),
        })),
        zustandFotos: b.fotos
          .filter((f) => f.mangelId === null && f.beetId === null && f.kontext === "zustand")
          .map(foto),
        kompFotos: b.fotos.filter((f) => f.kontext === "kompensation").map(foto),
      };
    }

    const vor = alt[0];
    const vorjahr = vor
      ? {
          datum: datumStr(vor.runde.datum),
          stufe: vor.stufe,
          notiz: vor.notiz,
          maengel: vor.maengel.map(
            (m): SnapVorMangel => ({
              katalogId: m.katalogId,
              punkt: m.punkt,
              notiz: m.notiz,
              frist: fristStr(m.frist),
              status: m.status,
              fotos: m.fotos.map(foto),
            })
          ),
        }
      : null;

    return {
      id: p.id,
      parzelleId: p.parzelleId,
      paechter: [p.nachname, p.vorname].filter(Boolean).join(" "),
      neupaechter: istNeupaechter(p.eintritt, p.status),
      groesseM2: p.groesseM2,
      befund,
      vorjahr,
      plakettenJahre: [
        ...new Set(
          alt.filter((x) => x.gutGemacht).map((x) => new Date(x.runde.datum).getFullYear())
        ),
      ],
      offeneFruehere: alt.flatMap((x) =>
        x.maengel
          .filter((m) => m.status === "offen")
          .map((m) => ({
            uid: m.uid!,
            punkt: m.punkt,
            notiz: m.notiz,
            frist: fristStr(m.frist),
            behoben: false,
            rundeDatum: datumStr(x.runde.datum),
          }))
      ),
      messHistorie: alt
        .filter((x) => x.beete.length > 0)
        .map((x) => ({
          datum: datumStr(x.runde.datum),
          summe: x.beete.reduce((s, beet) => s + beet.flaecheM2, 0),
          beete: x.beete.map((beet) => ({
            bezeichnung: beet.bezeichnung,
            flaecheM2: beet.flaecheM2,
          })),
        })),
    };
  });

  const snapshot: WorkspaceSnapshot = {
    stand: new Date().toISOString(),
    runde: {
      id: runde.id,
      bezeichnung: runde.bezeichnung,
      art: runde.art,
      teilnehmende: runde.teilnehmende,
      anlageName: anlage.name,
      planBild: anlage.planBild,
    },
    katalog: katalog.map((k) => ({
      id: k.id,
      bereich: k.bereich,
      punkt: k.punkt,
      hinweis: k.hinweis,
      referenz: k.referenz,
    })),
    parzellen: snapParzellen,
  };

  return Response.json(snapshot);
}
