import Link from "next/link";
import { Download, ThumbsUp } from "lucide-react";
import { prisma } from "@/lib/db";
import { istNeupaechter } from "@/lib/paechter";
import { hatDaten, summary, stufeRang, neuesteBefundeJeParzelle } from "@/lib/auswertung";
import { nameSchoen } from "@/lib/schreiben";
import { sammelSchreiben } from "./actions";
import { AuswertungsTabelle, type Zeile } from "./AuswertungsTabelle";

export const dynamic = "force-dynamic";

// Tab-Navigation der Auswertung: Übersicht (Begehungen) vs. Plaketten-Liste.
function TabNav({ aktiv }: { aktiv: "uebersicht" | "plaketten" }) {
  const T = ({ href, k, label }: { href: string; k: string; label: string }) => (
    <Link
      href={href}
      className={`-mb-px border-b-2 px-3 py-2 text-base ${
        aktiv === k
          ? "border-emerald-700 font-medium text-emerald-800"
          : "border-transparent text-stone-600 hover:text-stone-900"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex gap-1 border-b border-stone-200">
      <T href="/auswertung" k="uebersicht" label="Übersicht" />
      <T href="/auswertung?ansicht=plaketten" k="plaketten" label="Plaketten" />
    </div>
  );
}

function Zusammenfassung({ s }: { s: ReturnType<typeof summary> }) {
  return (
    <p className="text-sm text-stone-600">
      {s.begutachtet} begutachtet · {s.mitMaengel} mit Mängeln · {s.ohneMaengel} ohne Mängel ·{" "}
      {s.plaketten} {s.plaketten === 1 ? "Plakette" : "Plaketten"}
    </p>
  );
}

// Shape der Befunde aus dem `inc`-Include unten (für Zeilen-Bau).
type BefundInc = {
  stufe: string;
  notiz: string;
  bemerkungGeprueft: boolean;
  gutGemacht: boolean;
  kompensationAusreichend: boolean;
  _count: { maengel: number; fotos: number };
  beete: { flaecheM2: number }[];
  parzelle: {
    parzelleId: string;
    nummer: number;
    index: string;
    nachname: string;
    vorname: string;
    groesseM2: number | null;
    eintritt: string;
    status: string;
  };
};

function zeileAusBefund(b: BefundInc, rundeId: number, von?: string): Zeile {
  const p = b.parzelle;
  const vonSuffix = von ? `?von=${encodeURIComponent(von)}` : "";
  return {
    parzelleId: p.parzelleId,
    rundeId,
    nummer: p.nummer,
    index: p.index,
    nachname: p.nachname,
    vorname: p.vorname,
    neupaechter: istNeupaechter(p.eintritt, p.status),
    beetIst: b.beete.reduce((x, y) => x + y.flaecheM2, 0),
    beetSoll: p.groesseM2 ? p.groesseM2 / 6 : null,
    komp: b.kompensationAusreichend,
    stufe: b.stufe,
    stufeRang: stufeRang(b.stufe),
    plakette: b.gutGemacht,
    maengel: b._count.maengel,
    bemerkungOffen: !b.bemerkungGeprueft && b.notiz.trim() !== "",
    ansichtHref: `/begehung/ansicht/${rundeId}/${p.parzelleId}${vonSuffix}`,
    pdfHref: `/api/parzelle/${p.parzelleId}/pdf?rundeId=${rundeId}`,
    schreibenErledigt: null,
  };
}

// "Schreiben erledigt" = in der Akte liegt ein Schreiben/eine E-Mail mit Datum
// ab dem Begehungstag (Gesendet-Abgleich bzw. manueller Abmahnungs-Upload).
// Solche Zeilen sind von der Sammel-Erstellung ausgenommen (Doppelversand).
async function markiereSchreibenErledigt(zeilen: Zeile[], datumVonRunde: Map<number, Date>) {
  if (zeilen.length === 0) return;
  const doks = await prisma.dokument.findMany({
    where: {
      typ: { in: ["schreiben", "email"] },
      parzelle: { parzelleId: { in: zeilen.map((z) => z.parzelleId) } },
    },
    select: { datum: true, parzelle: { select: { parzelleId: true } } },
  });
  const proParzelle = new Map<string, Date[]>();
  for (const d of doks) {
    const liste = proParzelle.get(d.parzelle.parzelleId) ?? [];
    liste.push(d.datum);
    proParzelle.set(d.parzelle.parzelleId, liste);
  }
  for (const z of zeilen) {
    const rd = datumVonRunde.get(z.rundeId);
    if (!rd) continue;
    const tag = new Date(rd);
    tag.setHours(0, 0, 0, 0);
    const treffer = (proParzelle.get(z.parzelleId) ?? [])
      .filter((d) => d.getTime() >= tag.getTime())
      .sort((a, b) => a.getTime() - b.getTime())[0];
    if (treffer) z.schreibenErledigt = treffer.toLocaleDateString("de-DE");
  }
}

export default async function AuswertungSeite({
  searchParams,
}: {
  searchParams: Promise<{ rundeId?: string; jahr?: string; anlage?: string; ansicht?: string }>;
}) {
  const sp = await searchParams;
  const rundeIdParam = Number(sp.rundeId) || null;
  const jahrParam = Number(sp.jahr) || null;
  const anlageParam = (sp.anlage ?? "").trim();
  const ansichtParam = (sp.ansicht ?? "").trim();

  // --- Plaketten-Liste: je Jahr (neueste zuerst) -> Anlage -> Gärten ---
  if (ansichtParam === "plaketten") {
    const befunde = await prisma.befund.findMany({
      where: { gutGemacht: true },
      include: {
        runde: { select: { datum: true, anlage: { select: { kuerzel: true, name: true } } } },
        parzelle: { select: { parzelleId: true, nummer: true, index: true, nachname: true } },
      },
    });
    type Gart = { parzelleId: string; nummer: number; index: string; nachname: string };
    const proJahr = new Map<number, Map<string, { name: string; gaerten: Gart[] }>>();
    for (const b of befunde) {
      const jahr = new Date(b.runde.datum).getFullYear();
      let anl = proJahr.get(jahr);
      if (!anl) proJahr.set(jahr, (anl = new Map()));
      let a = anl.get(b.runde.anlage.kuerzel);
      if (!a) anl.set(b.runde.anlage.kuerzel, (a = { name: b.runde.anlage.name, gaerten: [] }));
      // Eine Parzelle kann in einem Jahr mehrere Runden haben -> nur einmal listen.
      if (!a.gaerten.some((g) => g.parzelleId === b.parzelle.parzelleId)) a.gaerten.push(b.parzelle);
    }
    const jahre = [...proJahr.keys()].sort((x, z) => z - x);

    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-2xl font-semibold">Auswertung</h1>
          <Link href="/" className="shrink-0 text-base text-emerald-700 hover:underline">Start</Link>
        </div>
        <TabNav aktiv="plaketten" />
        {jahre.map((jahr) => {
          const anl = proJahr.get(jahr)!;
          return (
            <section key={jahr} className="rounded-lg border border-stone-200 bg-white p-4">
              <h2 className="flex items-center gap-1.5 text-lg font-semibold">
                <ThumbsUp className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden /> Plaketten {jahr}
              </h2>
              {[...anl.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([kuerzel, a]) => {
                  const g = [...a.gaerten].sort(
                    (x, y) => x.nummer - y.nummer || x.index.localeCompare(y.index)
                  );
                  return (
                    <div key={kuerzel} className="mt-3 border-t border-stone-100 pt-2">
                      <p className="text-sm font-medium text-stone-700">
                        {a.name} ({g.length})
                      </p>
                      <p className="mt-0.5 text-base leading-7">
                        {g.map((x, i) => (
                          <span key={x.parzelleId}>
                            <Link href={`/parzellen/${x.parzelleId}`} className="font-medium text-emerald-700 hover:underline">
                              {x.parzelleId}
                            </Link>
                            {x.nachname ? <span className="text-stone-600"> {nameSchoen(x.nachname)}</span> : null}
                            {i < g.length - 1 ? ", " : ""}
                          </span>
                        ))}
                      </p>
                    </div>
                  );
                })}
            </section>
          );
        })}
        {jahre.length === 0 && <p className="text-base text-stone-600">Noch keine Plaketten vergeben.</p>}
      </div>
    );
  }

  const inc = {
    parzelle: {
      select: {
        parzelleId: true,
        nummer: true,
        index: true,
        nachname: true,
        vorname: true,
        groesseM2: true,
        eintritt: true,
        status: true,
      },
    },
    beete: { select: { flaecheM2: true } },
    _count: { select: { maengel: true, fotos: true } },
  } as const;

  // --- Tabelle einer Begehung ---
  if (rundeIdParam) {
    const runde = await prisma.begehungsrunde.findUnique({
      where: { id: rundeIdParam },
      include: { befunde: { include: inc, orderBy: { parzelle: { nummer: "asc" } } } },
    });
    if (!runde) {
      return (
        <div className="space-y-2">
          <p className="text-stone-600">Begehung nicht gefunden.</p>
          <Link href="/auswertung" className="text-base text-emerald-700 hover:underline">
            ← Übersicht
          </Link>
        </div>
      );
    }
    const zeilen = runde.befunde.filter(hatDaten).map((b) => zeileAusBefund(b, runde.id));
    await markiereSchreibenErledigt(zeilen, new Map([[runde.id, runde.datum]]));
    const s = summary(runde.befunde);

    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">Auswertung</h1>
            <p className="text-base text-stone-500">{runde.bezeichnung}</p>
            {runde.teilnehmende && (
              <p className="text-sm text-stone-600">Teilnehmer: {runde.teilnehmende}</p>
            )}
            <Zusammenfassung s={s} />
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Link href="/auswertung" className="text-base text-emerald-700 hover:underline">
              ← Übersicht
            </Link>
            <a
              href={`/api/export/csv?rundeId=${runde.id}`}
              className="inline-flex items-center gap-1.5 rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100"
            >
              <Download className="h-4 w-4 shrink-0" aria-hidden /> als CSV
            </a>
          </div>
        </div>

        <AuswertungsTabelle zeilen={zeilen} schreibenAction={sammelSchreiben} />
      </div>
    );
  }

  // --- Kombinierte Jahres-Ansicht einer Anlage (alle Runden Jahr+Anlage) ---
  if (jahrParam && anlageParam) {
    const runden = await prisma.begehungsrunde.findMany({
      where: {
        anlage: { kuerzel: anlageParam },
        datum: { gte: new Date(jahrParam, 0, 1), lt: new Date(jahrParam + 1, 0, 1) },
      },
      // neueste zuerst -> Merge nimmt je Parzelle den jüngsten Befund mit Daten
      orderBy: [{ datum: "desc" }, { id: "desc" }],
      include: { anlage: true, befunde: { include: inc } },
    });
    if (runden.length === 0) {
      return (
        <div className="space-y-2">
          <p className="text-stone-500">Keine Begehungen gefunden.</p>
          <Link href="/auswertung" className="text-base text-emerald-700 hover:underline">← Übersicht</Link>
        </div>
      );
    }
    const von = `jahr=${jahrParam}&anlage=${anlageParam}`;
    const gemergt = neuesteBefundeJeParzelle(runden);
    const zeilen = gemergt.map((e) => zeileAusBefund(e.befund, e.rundeId, von));
    await markiereSchreibenErledigt(zeilen, new Map(runden.map((r) => [r.id, r.datum])));
    const s = summary(gemergt.map((e) => e.befund));

    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">
              Begehungen {runden[0].anlage.name} {jahrParam}
            </h1>
            <p className="text-base text-stone-500">
              {runden.length === 1
                ? "1 Begehung"
                : `${runden.length} Begehungen kombiniert — je Parzelle zählt der neueste Befund`}
            </p>
            <Zusammenfassung s={s} />
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Link href="/auswertung" className="text-base text-emerald-700 hover:underline">
              ← Übersicht
            </Link>
            <a
              href={`/api/export/csv?jahr=${jahrParam}&anlage=${encodeURIComponent(anlageParam)}`}
              className="inline-flex items-center gap-1.5 rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100"
            >
              <Download className="h-4 w-4 shrink-0" aria-hidden /> als CSV
            </a>
          </div>
        </div>

        <AuswertungsTabelle zeilen={zeilen} schreibenAction={sammelSchreiben} />
      </div>
    );
  }

  // --- Übersicht: je Kalenderjahr aggregiert + Anlagen + Begehungen ---
  // Tiebreak id desc: gleiche Merge-Reihenfolge wie die kombinierte Ansicht,
  // damit die Anlagen-Zeilen exakt die Zahlen der Zielseite zeigen.
  const runden = await prisma.begehungsrunde.findMany({
    orderBy: [{ datum: "desc" }, { id: "desc" }],
    include: { anlage: true, befunde: { include: inc } },
  });
  const jahre = new Map<number, typeof runden>();
  for (const r of runden) {
    const j = new Date(r.datum).getFullYear();
    let arr = jahre.get(j);
    if (!arr) jahre.set(j, (arr = []));
    arr.push(r);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-2">
        <h1 className="text-2xl font-semibold">Auswertung</h1>
        <Link href="/" className="shrink-0 text-base text-emerald-700 hover:underline">Start</Link>
      </div>
      <TabNav aktiv="uebersicht" />

      {[...jahre.entries()].map(([jahr, rs]) => {
        const alle = rs.flatMap((r) => r.befunde);
        const s = summary(alle);
        // Anlagen-Aggregat: gleiche Merge-Logik wie die Zielseite -> Zahlen passen.
        const anlagen = new Map<string, { name: string; runden: typeof rs }>();
        for (const r of rs) {
          let a = anlagen.get(r.anlage.kuerzel);
          if (!a) anlagen.set(r.anlage.kuerzel, (a = { name: r.anlage.name, runden: [] }));
          a.runden.push(r);
        }
        return (
          <section key={jahr} className="rounded-lg border border-stone-200 bg-white p-4">
            <h2 className="text-lg font-semibold">{jahr}</h2>
            <p className="text-sm font-medium text-stone-700">Jahr gesamt:</p>
            <Zusammenfassung s={s} />
            <p className="mt-3 text-sm font-medium text-stone-700">
              Anlagen — Jahr kombiniert:
            </p>
            <ul className="space-y-1">
              {[...anlagen.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([kuerzel, a]) => {
                  const sa = summary(neuesteBefundeJeParzelle(a.runden).map((e) => e.befund));
                  return (
                    <li key={kuerzel} className="border-t border-stone-100">
                      <Link
                        href={`/auswertung?jahr=${jahr}&anlage=${kuerzel}`}
                        className="flex flex-col gap-0.5 py-2 text-sm hover:bg-stone-50 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
                      >
                        <span className="min-w-0 font-medium text-emerald-700">
                          Begehungen {a.name} {jahr}
                        </span>
                        <span className="text-stone-600 sm:shrink-0">
                          {sa.begutachtet} begutachtet · {sa.mitMaengel} mit Mängeln ·{" "}
                          {sa.plaketten} {sa.plaketten === 1 ? "Plakette" : "Plaketten"}
                        </span>
                      </Link>
                    </li>
                  );
                })}
            </ul>
            <p className="mt-3 text-sm font-medium text-stone-700">Einzelne Begehungen:</p>
            <ul className="space-y-1">
              {rs.map((r) => {
                const rs2 = summary(r.befunde);
                return (
                  <li key={r.id} className="border-t border-stone-100">
                    <Link
                      href={`/auswertung?rundeId=${r.id}`}
                      className="flex flex-col gap-0.5 py-2 text-sm hover:bg-stone-50 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
                    >
                      <div className="min-w-0">
                        <span className="font-medium text-emerald-700">{r.bezeichnung}</span>
                        {r.teilnehmende && (
                          <p className="text-stone-500">Teilnehmer: {r.teilnehmende}</p>
                        )}
                      </div>
                      <span className="text-stone-600 sm:shrink-0">
                        {rs2.begutachtet} begutachtet · {rs2.mitMaengel} mit Mängeln ·{" "}
                        {rs2.plaketten} {rs2.plaketten === 1 ? "Plakette" : "Plaketten"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {jahre.size === 0 && <p className="text-base text-stone-600">Noch keine Begehungen.</p>}
    </div>
  );
}
