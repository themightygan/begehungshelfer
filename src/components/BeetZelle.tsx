// Beet-IST-Anzeige mit Ampel (geteilt von Auswertung + Berichten):
// grün ✓ = erfüllt (>80 % vom Soll) ODER dokumentiert kompensiert (mit Label);
// gelb „knapp" = 60–80 %; rot „unter Soll" = unter 60 % ohne Kompensation.
// Wertung trägt immer Text + Farbe, nie Farbe allein (Ampel-Regel, DESIGN.md).
// IST 0 ohne Kompensation = (noch) nicht erfasst -> bewusst NICHT gewertet.
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
    komp || (ratio !== null && ratio > 0.8)
      ? { farbe: "text-emerald-700", label: " ✓" }
      : ratio !== null && ratio >= 0.6
        ? { farbe: "text-amber-800", label: " · knapp" }
        : ratio !== null
          ? { farbe: "text-red-700", label: " · unter Soll" }
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
