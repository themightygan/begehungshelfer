// „Neupächter" = Eintritt liegt weniger als 18 Monate zurück ODER die Parzelle
// ist ausdrücklich als Neupächter markiert (`neupaechterManuell`, z. B. wenn im
// Vorjahr keine Vollbegehung stattfand). Sichtbar bei der Begehung, in der
// Parzellenliste und der Auswertung — neue Pächter werden bei der Bewertung
// anders behandelt (Aufbauphase). Der Altwert status="neupaechter" zählt weiter
// mit, damit alte Datenstände nicht still ihren Hinweis verlieren.
const NEU_MONATE = 18;

export function istNeupaechter(
  eintritt: string,
  status?: string,
  manuell?: boolean,
): boolean {
  if (manuell) return true;
  if (status === "neupaechter") return true;
  if (!eintritt) return false;
  const d = new Date(eintritt); // ISO-Text aus dem Import ("YYYY-MM-DD")
  if (isNaN(d.getTime())) return false;
  const grenze = new Date();
  grenze.setMonth(grenze.getMonth() - NEU_MONATE);
  return d > grenze;
}
