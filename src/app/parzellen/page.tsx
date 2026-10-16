import Link from "next/link";
import { Download } from "lucide-react";
import { prisma } from "@/lib/db";
import { PARZELLE_STATUS_LABEL } from "@/lib/constants";
import { istNeupaechter } from "@/lib/paechter";
import { ParzellenTabelle, type ParzellenZeile } from "./ParzellenTabelle";

export const dynamic = "force-dynamic";

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

  const zeilen: ParzellenZeile[] = parzellen.map((p) => ({
    parzelleId: p.parzelleId,
    nummer: p.nummer,
    index: p.index,
    anlage: p.anlage.kuerzel,
    nachname: p.nachname,
    vorname: p.vorname,
    neupaechter: istNeupaechter(p.eintritt, p.status, p.neupaechterManuell),
    ort: p.ort,
    groesseM2: p.groesseM2,
    groesseErmitteltM2: p.groesseErmitteltM2,
    status: p.status,
    statusLabel: PARZELLE_STATUS_LABEL[p.status] ?? p.status,
  }));

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
            className="inline-flex items-center gap-1.5 rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100"
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden /> Mitgliederliste (xlsx)
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

      <ParzellenTabelle zeilen={zeilen} />
    </div>
  );
}
