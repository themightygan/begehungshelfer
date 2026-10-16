// Beet-IST-Anzeige mit Ampel (geteilt von Auswertung + Berichten + Ansicht):
// grün ✓ = ausreichend (>= 90 % vom Soll) ODER dokumentiert kompensiert (mit Label);
// orange „ausreichend" = 2/3 .. < 90 %; rot „zu klein" = unter 2/3 ohne Kompensation.
// Schwellen + Wertung zentral in constants.ts (Sascha 2026-07-11) — dieselbe
// 2/3-Grenze entscheidet in Mitteilung/Abmahnung, ob die Gemüsefläche angemahnt wird.
// Wertung trägt immer Text + Farbe, nie Farbe allein (Ampel-Regel, DESIGN.md).
// IST 0 ohne Kompensation = (noch) nicht erfasst -> bewusst NICHT gewertet.
// sollErmittelt = zweites SOLL aus der inoffiziell ermittelten Fläche (Luftbild/
// Wasserschächte, nur Kühwasen): kursiv in Klammern, mit eigener Wertung —
// zeigt, wo es nach Netto-Fläche gar nicht zu wenig ist. Nicht vertragsrelevant.
import { beetWertung } from "@/lib/constants";

const m2 = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 1 });

export function BeetZelle({
  ist,
  soll,
  komp,
  sollErmittelt = null,
}: {
  ist: number;
  soll: number | null;
  komp: boolean;
  sollErmittelt?: number | null;
}) {
  const sollTeil = soll !== null ? `${m2(soll)} / ` : "— / ";
  if (ist === 0 && !komp) {
    return <span className="text-stone-600">{sollTeil}nicht erfasst</span>;
  }
  const wertung = beetWertung(ist, soll, komp);
  const erm = sollErmittelt !== null ? beetWertung(ist, sollErmittelt, komp) : null;
  return (
    <span>
      {sollTeil}
      <span className={`font-medium ${wertung.farbe}`}>
        {m2(ist)}
        {komp ? " · kompensiert" : wertung.label}
      </span>
      {erm && !komp && (
        <span className={`ml-1.5 italic ${erm.farbe}`}>
          (erm. {m2(sollErmittelt!)}
          {erm.kurz ? ` · ${erm.kurz}` : ""})
        </span>
      )}
    </span>
  );
}
