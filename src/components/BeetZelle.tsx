// Beet-IST-Anzeige mit Ampel (geteilt von Auswertung + Berichten):
// grün = erfüllt (>80 % vom Soll) ODER dokumentiert kompensiert (mit Label);
// gelb = knapp (60–80 %); rot = unter 60 % ohne Kompensation.
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
    return <span className="text-stone-400">{sollTeil}nicht erfasst</span>;
  }
  const ratio = soll ? ist / soll : null;
  const farbe =
    komp || (ratio !== null && ratio > 0.8)
      ? "text-emerald-700"
      : ratio !== null && ratio >= 0.6
        ? "text-amber-600"
        : ratio !== null
          ? "text-red-600"
          : "text-stone-700"; // keine Parzellenfläche -> kein Soll, keine Wertung
  return (
    <span>
      {sollTeil}
      <span className={`font-medium ${farbe}`}>
        {m2(ist)}
        {komp ? " · kompensiert" : ""}
      </span>
    </span>
  );
}
