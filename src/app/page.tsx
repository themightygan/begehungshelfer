import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const anlagen = await prisma.anlage.findMany({
    orderBy: { kuerzel: "asc" },
    include: {
      parzellen: { orderBy: [{ nummer: "asc" }, { index: "asc" }] },
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Parzellen</h1>
        <p className="text-sm text-stone-500">
          De-Risk-Prototyp (Phase 1): Befund mit Fotos erfassen → PDF erzeugen.
        </p>
      </div>

      {anlagen.map((anlage) => (
        <section key={anlage.id}>
          <h2 className="mb-2 text-sm font-medium text-stone-600">
            {anlage.name} ({anlage.kuerzel}) — {anlage.parzellen.length} Parzellen
          </h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {anlage.parzellen.map((p) => (
              <Link
                key={p.id}
                href={`/parzelle/${p.parzelleId}`}
                className="rounded border border-stone-200 bg-white px-2 py-1.5 text-center text-sm hover:border-emerald-400 hover:bg-emerald-50"
              >
                {p.parzelleId}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
