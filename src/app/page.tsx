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
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          <Link
            href="/maengel"
            className="rounded border border-stone-300 px-3 py-1 hover:bg-stone-100"
          >
            📋 Mängel-Nachverfolgung
          </Link>
          <a
            href="/api/export/csv"
            className="rounded border border-stone-300 px-3 py-1 hover:bg-stone-100"
          >
            ⬇ CSV-Export
          </a>
        </div>
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
