// Beet-IST-Anzeige mit Ampel (geteilt von Auswertung + Berichten):
// grün ✓ = ausreichend (>= 90 % vom Soll) ODER dokumentiert kompensiert (mit Label);
// orange „ausreichend" = 2/3 .. < 90 %; rot „zu klein" = unter 2/3 ohne Kompensation.
// Schwellen zentral in constants.ts (Sascha 2026-07-11) — dieselbe 2/3-Grenze
// entscheidet in Mitteilung/Abmahnung, ob die Gemüsefläche angemahnt wird.
// Wertung trägt immer Text + Farbe, nie Farbe allein (Ampel-Regel, DESIGN.md).
// IST 0 ohne Kompensation = (noch) nicht erfasst -> bewusst NICHT gewertet.
import { BEET_AUSREICHEND, BEET_GUT } from "@/lib/constants";

const m2 = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 1 });

export function BeetZelle({
  ist,
  soll,
  komp,
}: {
  ist: number;
  soll: number | null;
  komp: boolean;
}) {
  const sollTeil = soll !== null ? `${m2(soll)} / ` : "— / ";
  if (ist === 0 && !komp) {
    return <span className="text-stone-600">{sollTeil}nicht erfasst</span>;
  }
  const ratio = soll ? ist / soll : null;
  const wertung =
    komp || (ratio !== null && ratio >= BEET_GUT)
      ? { farbe: "text-emerald-700", label: " ✓" }
      : ratio !== null && ratio >= BEET_AUSREICHEND
        ? { farbe: "text-amber-800", label: " · ausreichend" }
        : ratio !== null
          ? { farbe: "text-red-700", label: " · zu klein" }
          : { farbe: "text-stone-700", label: "" }; // keine Parzellenfläche -> kein Soll, keine Wertung
  return (
    <span>
      {sollTeil}
      <span className={`font-medium ${wertung.farbe}`}>
        {m2(ist)}
        {komp ? " · kompensiert" : wertung.label}
      </span>
    </span>
  );
}
