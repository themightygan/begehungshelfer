// „Neupächter" = Eintritt liegt weniger als 18 Monate zurück (oder der
// Parzellen-Status ist explizit "neupaechter"). Sichtbar bei der Begehung,
// in der Parzellenliste und der Auswertung — neue Pächter werden bei der
// Bewertung anders behandelt (Aufbauphase).
const NEU_MONATE = 18;

export function istNeupaechter(eintritt: string, status?: string): boolean {
  if (status === "neupaechter") return true;
  if (!eintritt) return false;
  const d = new Date(eintritt); // ISO-Text aus dem Import ("YYYY-MM-DD")
  if (isNaN(d.getTime())) return false;
  const grenze = new Date();
  grenze.setMonth(grenze.getMonth() - NEU_MONATE);
  return d > grenze;
}
