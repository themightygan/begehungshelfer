// Gemeinsame Typen für den Offline-Begehungsmodus (Stufe 2).
//
// WorkspaceSnapshot = alles, was die Erfassung einer Runde offline braucht
// (einmal beim Beitreten/Öffnen geladen, in IndexedDB gehalten).
// SyncOp = eine idempotente Änderungs-Operation aus der Op-Outbox; der Server
// (/api/sync) wendet sie einzeln und in ts-Reihenfolge an. Mängel/Beete werden
// über Client-UUIDs (uid) referenziert — dadurch sind Upserts wiederholbar und
// offline angelegte Einträge können von Fotos/Diktaten referenziert werden.

export type SnapFoto = { id: number; pfad: string };

export type SnapMangel = {
  uid: string;
  katalogId: number | null;
  bereich: string;
  punkt: string;
  notiz: string;
  frist: string | null; // "YYYY-MM-DD"
  diktatNachgereicht: string;
  fotos: SnapFoto[];
};

export type SnapBeet = {
  uid: string;
  bezeichnung: string;
  flaecheM2: number;
  fotos: SnapFoto[];
};

export type SnapBefund = {
  stufe: string;
  notiz: string;
  diktatNachgereicht: string;
  gutGemacht: boolean;
  plakettenNotiz: string;
  kompObstAnzahl: number;
  kompObstFlaecheM2: number;
  kompBeerenAnzahl: number;
  kompBeerenFlaecheM2: number;
  kompensationNotiz: string;
  kompensationAusreichend: boolean;
  maengel: SnapMangel[];
  beete: SnapBeet[];
  zustandFotos: SnapFoto[];
  kompFotos: SnapFoto[];
};

export type SnapVorMangel = {
  katalogId: number | null;
  punkt: string;
  notiz: string;
  frist: string | null;
  status: string;
  fotos: SnapFoto[];
};

export type SnapOffenerMangel = {
  uid: string;
  punkt: string;
  notiz: string;
  frist: string | null;
  behoben: boolean;
  rundeDatum: string; // "DD.MM.YYYY" (Anzeige)
};

export type SnapParzelle = {
  id: number;
  parzelleId: string;
  paechter: string;
  neupaechter: boolean; // Eintritt < 18 Monate -> bei der Begehung anzeigen
  groesseM2: number | null;
  befund: SnapBefund | null;
  vorjahr: {
    datum: string; // "DD.MM.YYYY"
    stufe: string;
    notiz: string;
    maengel: SnapVorMangel[];
  } | null;
  // Letzte Abmahnung/Kündigung aus früheren Begehungen (Nachbegehung hebt
  // hervor). Optional: alte IndexedDB-Snapshots kennen das Feld noch nicht.
  eskalation?: {
    stufe: string; // abmahnung_1 | abmahnung_2 | kuendigung
    datum: string; // "DD.MM.YYYY"
    fristen: string[]; // ISO-Daten der gesetzten Mangel-Fristen
  } | null;
  plakettenJahre: number[];
  offeneFruehere: SnapOffenerMangel[];
  messHistorie: {
    datum: string;
    summe: number;
    beete: { bezeichnung: string; flaecheM2: number }[];
  }[];
};

export type SnapKatalog = {
  id: number;
  bereich: string;
  punkt: string;
  hinweis: string;
  referenz: string;
};

export type WorkspaceSnapshot = {
  stand: string; // ISO-Zeitpunkt des Snapshots
  runde: {
    id: number;
    bezeichnung: string;
    art: string; // begehung | nachbegehung
    teilnehmende: string;
    anlageName: string;
    planBild: string | null;
  };
  katalog: SnapKatalog[];
  parzellen: SnapParzelle[];
};

// --- Op-Outbox ---

export type SyncOp =
  | { art: "befund"; stufe: string; notiz: string; gutGemacht: boolean; plakettenNotiz: string }
  | {
      art: "kompensation";
      obstAnzahl: number;
      obstFlaecheM2: number;
      beerenAnzahl: number;
      beerenFlaecheM2: number;
      notiz: string;
      ausreichend: boolean;
    }
  | {
      art: "mangelUpsert";
      uid: string;
      katalogId: number | null;
      bereich: string;
      punkt: string;
      notiz: string;
      frist: string | null;
    }
  | { art: "mangelLoeschen"; uid: string }
  | { art: "beetUpsert"; uid: string; bezeichnung: string; flaecheM2: number }
  | { art: "beetLoeschen"; uid: string }
  | { art: "behobenToggle"; uid: string; behoben: boolean }
  | { art: "fotoLoeschen"; fotoId: number };
