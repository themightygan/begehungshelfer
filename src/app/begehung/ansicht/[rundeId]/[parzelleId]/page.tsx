import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { STUFE_LABEL, STUFE_SYMBOL, KOMPENSATION_FAKTOREN } from "@/lib/constants";
import { Thumb } from "@/components/Thumb";

export const dynamic = "force-dynamic";

const CARD = "rounded-lg border border-stone-200 bg-white p-4";
const m2 = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 1 });

function FotoRO({ fotos }: { fotos: { id: number; dateipfad: string }[] }) {
  if (fotos.length === 0) return null;
  return (
    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
      {fotos.map((f) => (
        <Thumb key={f.id} src={`/api/datei/${f.dateipfad}`} />
      ))}
    </div>
  );
}

export default async function AnsichtSeite({
  params,
}: {
  params: Promise<{ rundeId: string; parzelleId: string }>;
}) {
  const { rundeId: rundeIdStr, parzelleId } = await params;
  const rundeId = Number(rundeIdStr);
  const parzelle = await prisma.parzelle.findUnique({
    where: { parzelleId },
    include: { anlage: true },
  });
  if (!parzelle) notFound();
  const runde = await prisma.begehungsrunde.findUnique({ where: { id: rundeId } });
  const befund = await prisma.befund.findUnique({
    where: { rundeId_parzelleId: { rundeId, parzelleId: parzelle.id } },
    include: {
      maengel: { orderBy: { id: "asc" }, include: { katalog: true, fotos: { orderBy: { id: "asc" } } } },
      beete: { orderBy: { id: "asc" }, include: { fotos: { orderBy: { id: "asc" } } } },
      fotos: { where: { mangelId: null, beetId: null }, orderBy: { id: "asc" } },
    },
  });
  if (!runde || !befund) notFound();

  const ist = befund.beete.reduce((s, b) => s + b.flaecheM2, 0);
  const soll = parzelle.groesseM2 ? parzelle.groesseM2 / 6 : null;

  return (
    <div className="space-y-5 pb-12">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Parzelle {parzelle.parzelleId}</h1>
          <p className="text-base text-stone-500">
            {parzelle.anlage.name} · {parzelle.nachname} {parzelle.vorname}
            {parzelle.groesseM2 ? ` · ${parzelle.groesseM2} m²` : ""}
          </p>
          <p className="text-sm text-stone-400">
            {runde.bezeichnung} · {new Date(runde.datum).toLocaleDateString("de-DE")} · nur Ansicht
          </p>
        </div>
        <Link href={`/auswertung?rundeId=${rundeId}`} className="shrink-0 text-base text-emerald-700 hover:underline">
          ← Auswertung
        </Link>
      </div>

      {/* Befund */}
      <section className={CARD}>
        <h2 className="text-base font-medium text-stone-600">Befund</h2>
        <p className="mt-1 text-base">
          {STUFE_SYMBOL[befund.stufe]} Eskalationsstufe: {STUFE_LABEL[befund.stufe] ?? befund.stufe}
        </p>
        {befund.gutGemacht && (
          <p className="mt-1 text-base font-medium text-emerald-700">
            👍 „Gut gemacht"-Plakette{befund.plakettenNotiz ? ` — ${befund.plakettenNotiz}` : ""}
          </p>
        )}
        {befund.notiz.trim() !== "" && (
          <p className="mt-2 whitespace-pre-line text-base text-stone-700">{befund.notiz}</p>
        )}
      </section>

      {/* Gesamtansicht */}
      {befund.fotos.length > 0 && (
        <section className={CARD}>
          <h2 className="text-base font-medium text-stone-600">Gesamtansicht</h2>
          <FotoRO fotos={befund.fotos} />
        </section>
      )}

      {/* Gemüsebeete */}
      {(befund.beete.length > 0 || soll !== null) && (
        <section className={CARD}>
          <h2 className="text-base font-medium text-stone-600">Gemüsebeete</h2>
          <p className="text-base">
            IST {m2(ist)} m²{soll !== null ? ` · SOLL (1/6) ${m2(soll)} m²` : ""}
          </p>
          {(befund.kompensationAusreichend ||
            befund.kompensationNotiz.trim() !== "" ||
            befund.kompensationFaktoren.trim() !== "") && (
            <p className="mt-1 text-base text-emerald-800">
              Kompensation:{" "}
              {[
                befund.kompensationFaktoren
                  .split(",")
                  .filter(Boolean)
                  .map((w) => KOMPENSATION_FAKTOREN.find((f) => f.wert === w)?.label ?? w)
                  .join(", "),
                befund.kompensationNotiz,
              ]
                .filter(Boolean)
                .join(" — ")}
              {befund.kompensationAusreichend
                ? " · ausreichende kleingärtnerische Nutzung dokumentiert"
                : ""}
            </p>
          )}
          {befund.beete.map((b) => (
            <div key={b.id} className="mt-2">
              <p className="text-base">{b.bezeichnung || "Beet"}: {m2(b.flaecheM2)} m²</p>
              <FotoRO fotos={b.fotos} />
            </div>
          ))}
        </section>
      )}

      {/* Mängel */}
      <section className={CARD}>
        <h2 className="text-base font-medium text-stone-600">Festgestellte Mängel ({befund.maengel.length})</h2>
        {befund.maengel.length === 0 ? (
          <p className="mt-1 text-base text-stone-400">Keine Mängel erfasst.</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {befund.maengel.map((m) => (
              <li key={m.id} className="border-t border-stone-100 pt-2">
                <p className="text-xs uppercase tracking-wide text-stone-400">{m.bereich}</p>
                <p className="text-base font-medium">{m.punkt || "(ohne Bezeichnung)"}</p>
                {m.katalog?.referenz && <p className="text-sm text-stone-400">{m.katalog.referenz}</p>}
                {m.notiz && <p className="text-base text-stone-700">{m.notiz}</p>}
                <p className="text-sm text-stone-400">
                  {m.frist ? `Frist ${new Date(m.frist).toLocaleDateString("de-DE")} · ` : ""}
                  Status: {m.status}
                </p>
                <FotoRO fotos={m.fotos} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <a
        href={`/api/parzelle/${parzelle.parzelleId}/pdf?rundeId=${rundeId}`}
        target="_blank"
        rel="noopener"
        className="inline-block rounded border border-emerald-700 px-4 py-2 text-base font-medium text-emerald-700 hover:bg-emerald-50"
      >
        📄 Bericht-PDF
      </a>
    </div>
  );
}
