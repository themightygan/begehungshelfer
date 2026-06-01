import Link from "next/link";
import { prisma } from "@/lib/db";
import { PARZELLE_STATUS } from "@/lib/constants";

export const dynamic = "force-dynamic";

const STATUS_LABEL = Object.fromEntries(PARZELLE_STATUS.map((s) => [s.wert, s.label]));

export default async function ParzellenSeite({
  searchParams,
}: {
  searchParams: Promise<{ anlage?: string; q?: string }>;
}) {
  const { anlage, q } = await searchParams;
  const anlagen = await prisma.anlage.findMany({ orderBy: { kuerzel: "asc" } });

  const alle = await prisma.parzelle.findMany({
    where: anlage === "K" || anlage === "S" ? { anlage: { kuerzel: anlage } } : {},
    orderBy: [{ anlageId: "asc" }, { nummer: "asc" }, { index: "asc" }],
    include: { anlage: true },
  });
  const suche = (q ?? "").trim().toLowerCase();
  const parzellen = suche
    ? alle.filter(
        (p) =>
          p.parzelleId.toLowerCase().includes(suche) ||
          `${p.nachname} ${p.vorname}`.toLowerCase().includes(suche)
      )
    : alle;

  const tab = (wert: string, label: string) => {
    const params = new URLSearchParams();
    if (wert) params.set("anlage", wert);
    if (q) params.set("q", q);
    const aktiv = (anlage ?? "") === wert;
    return (
      <Link
        href={`/parzellen${params.toString() ? `?${params}` : ""}`}
        className={`rounded-full px-3 py-1 text-sm ${aktiv ? "bg-emerald-700 text-white" : "border border-stone-300"}`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Parzellenverwaltung</h1>
          <p className="text-sm text-stone-500">
            {parzellen.length} von {alle.length} Parzellen
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <a
            href="/api/export/mitglieder"
            className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100"
          >
            ⬇ Mitgliederliste (xlsx)
          </a>
          <Link href="/" className="text-base text-emerald-700 hover:underline">
            Start
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {tab("", "Alle")}
        {anlagen.map((a) => (
          <span key={a.id}>{tab(a.kuerzel, `${a.name} (${a.kuerzel})`)}</span>
        ))}
        <form className="ml-auto flex items-center gap-2">
          {anlage && <input type="hidden" name="anlage" value={anlage} />}
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Suche Name oder Nummer…"
            className="rounded border border-stone-300 px-3 py-1.5 text-base"
          />
          <button className="rounded bg-emerald-700 px-3 py-1.5 text-base font-medium text-white hover:bg-emerald-800">
            Suchen
          </button>
        </form>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-stone-300 text-left text-stone-500">
              <th className="py-2 pr-3">Nr.</th>
              <th className="py-2 pr-3">Anlage</th>
              <th className="py-2 pr-3">Pächter</th>
              <th className="py-2 pr-3">Ort</th>
              <th className="py-2 pr-3">Fläche</th>
              <th className="py-2 pr-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {parzellen.map((p) => (
              <tr key={p.id} className="border-b border-stone-100 hover:bg-stone-50">
                <td className="py-2 pr-3 font-medium">
                  <Link href={`/parzellen/${p.parzelleId}`} className="text-emerald-700 hover:underline">
                    {p.parzelleId}
                  </Link>
                </td>
                <td className="py-2 pr-3">{p.anlage.kuerzel}</td>
                <td className="py-2 pr-3">{`${p.nachname} ${p.vorname}`.trim() || "—"}</td>
                <td className="py-2 pr-3">{p.ort || "—"}</td>
                <td className="py-2 pr-3">{p.groesseM2 ? `${p.groesseM2} m²` : "—"}</td>
                <td className="py-2 pr-3">{STATUS_LABEL[p.status] ?? p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
