# Plan: Offline-/Puffer-Upload für Fotos & Audio (Stufe A)

> Ziel: Begehung bleibt **flüssig erfassbar trotz schlechtem/keinem Netz**.
> Fotos und Audio werden **lokal gepuffert** und im Hintergrund hochgeladen —
> die UI blockiert nie. Mängel/Text bleiben vorerst Server Actions (Stufe B = später).

## Problem-Diagnose (verifiziert)
Foto-Uploads laufen aktuell als **Server Actions**. Next.js arbeitet Server
Actions **streng seriell** pro Client ab und blockiert die UI bis zur Antwort.
Ein langsamer Upload belegt die Queue → jede weitere Aktion (Mangel hinzufügen,
Text speichern, „Speichern & weiter") ist ebenfalls eine Server Action und
**hängt dahinter**. Reines Tippen geht (rein lokal). → Medien müssen vom
Server-Action-Pfad **entkoppelt** und **lokal gepuffert** werden.

## Entscheidungen (abgestimmt)
- **Umfang:** Stufe A — nur **Medien** (Fotos + Audio) puffern/entkoppeln.
  Mängel/Beete/Befund-Text bleiben Server Actions (Stufe B = volles Offline später).
- **Technik:** **IndexedDB-Queue + In-Page-Sync** (kein Service Worker). Sync läuft,
  solange die App offen ist: beim Laden, bei `online`-Event, periodisch (~20 s),
  nach jedem Enqueue. Persistenz via IndexedDB → übersteht App-Neustart.
- **Audio** zusammen mit Fotos in diesem Schritt.

## iOS-Realität
Service Worker / Background Sync auf iOS-Safari nur eingeschränkt → bewusst NICHT
genutzt. Modell: App offen lassen; Uploads „rieseln" bei Empfang hoch; Rest beim
nächsten Öffnen. IndexedDB-Blobs überleben Schließen/Neustart.

## Architektur / Bausteine

### 1. `src/lib/uploadQueue.ts` — BEREITS ANGELEGT (prüfen/auditieren)
IndexedDB-Store `begehung-media/queue` + In-Memory-Spiegel `mirror` für
synchrone Snapshots (`useSyncExternalStore`). API:
`enqueue(item)`, `removeItem(id)`, `bumpAttempt(id)`, `getItems()`,
`subscribe(cb)`, `loadQueue()`. Item:
`{id, kind:"foto"|"audio", parzelleId, kontext?, mangelId?, beetId?, blob, mime, ts, attempts}`.
**Audit-Punkte:** Blob-Persistenz in IDB (structured clone ok), stabile
Snapshot-Referenz (mirror nur bei Änderung neu zuweisen — erfüllt), Fehler still
schlucken statt UI brechen.

### 2. API-Routen (statt Server Actions, damit nicht blockierend)
- **`POST /api/foto`** (`src/app/api/foto/route.ts`): FormData
  `{parzelleId, kontext, mangelId?, beetId?, foto:File}`. Liest Session
  (`getSession`, `rundeId` muss existieren), upsert Befund (rundeId+parzelleId,
  Snapshot wie `ensureBefund`), prüft `FOTO_MAX_PRO_BEFUND`, verarbeitet via
  `fotoVerarbeitenUndSpeichern` (HEIC→JPEG, resize, EXIF-Strip), `foto.create`
  mit `kontext/mangelId/beetId`. Antwort `{id, dateipfad}`. **Kein revalidate**
  (Client steuert UI via router.refresh nach Sync).
- **`POST /api/notiz-append`** (`src/app/api/notiz-append/route.ts`): JSON
  `{parzelleId, mangelId?, text}`. Hängt `text` an `mangel.notiz` (falls mangelId)
  bzw. an `befund.notiz` (sonst, via Session-Runde + upsert) an (neue Zeile).
  Für nachträglich transkribierte Audios.

### 3. `src/app/MediaSync.tsx` (client) — Sync-Worker + Badge
- `useSyncExternalStore(subscribe, getItems, ()=>EMPTY)` (EMPTY = konstante []!).
- `useEffect`: `loadQueue()`; `drain()` bei Mount, `online`-Event, Interval 20 s,
  Queue-Change. `drain()`: nur wenn `navigator.onLine` und nicht bereits laufend;
  Items **sequenziell** senden; Erfolg → `removeItem`; Netzfehler → `bumpAttempt`
  + **abbrechen** (später erneut). Nach erfolgreichem Upload `router.refresh()`.
- `sendItem`: foto → POST `/api/foto`; audio → POST `/api/transkript` →
  `{text}` → POST `/api/notiz-append`.
- Badge „⏳ N Uploads offen", sonst `null`. **In `layout.tsx` einbinden**
  (neben ZoomControl), damit appweit aktiv.

### 4. `FotoBereich` umbauen (`src/app/parzelle/[parzelleId]/FotoBereich.tsx`)
- Props: `{parzelleId, fotos, kontext, mangelId?, beetId?, deleteAction}`
  (statt `uploadAction`).
- Auswahl → `enqueue({kind:"foto", parzelleId, kontext, mangelId, beetId, blob, mime})`
  (kein Netzaufruf, kein Blockieren).
- Anzeige: Server-Fotos (props, `Thumb` + ✕ `deleteAction`) **+** gepufferte
  Items dieses Ziels (Filter parzelleId+kontext+mangelId+beetId) als
  Vorschau aus lokalem Blob mit „⏳". `useSyncExternalStore` zum Re-Render.
  Object-URLs pro Item memoisieren + bei Unmount `revokeObjectURL`.

### 5. `DiktatTextarea` umbauen (`.../DiktatTextarea.tsx`)
- Neue Props: `parzelleId`, `mangelId?`.
- Bei Stop: **erst sofort** `/api/transkript` versuchen → Erfolg: Text in Textarea
  einfügen (wie bisher). **Fehler/offline:** `enqueue({kind:"audio", parzelleId,
  mangelId, blob, mime})` + kurzer Hinweis „⏳ offline gepuffert — Text erscheint
  nach Sync in der Bemerkung". (Server-seitiges Anhängen via notiz-append.)

### 6. Verdrahtung `page.tsx` + `BefundForm.tsx`
- `FotoBereich`-Aufrufe: `uploadAction` ersetzen durch `kontext` (+ `mangelId`/
  `beetId`): Übersicht `kontext="zustand"`, Mangel `kontext="mangel" mangelId`,
  Beet `kontext="beet" beetId`, Kompensation `kontext="kompensation"`.
  `deleteAction={loescheFoto}` bleibt.
- `DiktatTextarea`-Aufrufe: `parzelleId` (+ `mangelId` beim Mangel) ergänzen;
  `BefundForm` bekommt `parzelleId` durchgereicht.
- Server Actions `uploadUebersichtFotos/uploadMangelFotos/uploadBeetFotos/
  uploadKompensationFotos` werden dann nicht mehr genutzt (entfernen oder lassen).

## Verifikation (am laufenden Produktionsdienst)
- Build + `next-server` neu (KeepAlive respawnt; App ist System-Daemon, kein sudo
  nötig — `npm run build` + `pkill -f next-server`).
- Foto-Endpunkt: `POST /api/foto` mit Cookie + Datei (auch große HEIC) → `{id}`,
  Foto in DB/Storage, korrekt am Befund/Mangel/Beet.
- notiz-append: hängt Text an richtigen Befund/Mangel.
- UI-Render: FotoBereich zeigt Kamera/Mediathek + Queue-Badge; DiktatTextarea
  Fallback-Puffer.
- Offline-Simulation: Server kurz stoppen → Foto auswählen → Item bleibt in Queue
  (Badge „1 offen") → Server an → drain lädt hoch, Thumbnail erscheint.
- Body-Limit (30 MB) bleibt; sequenzielle Verarbeitung schützt vor Engpass.

## Aktueller Stand (zum Restart)
- `src/lib/uploadQueue.ts` ist bereits angelegt (Schritt 1) — auditieren.
- Alles andere (API-Routen, MediaSync, FotoBereich/DiktatTextarea-Umbau,
  Verdrahtung) **noch offen**. Working tree hat nur die neue Datei (uncommittet).

## Nicht in diesem Schritt (Stufe B / später)
- Volles Offline für Mängel/Beete/Befund-Text (lokales Datenmodell + Sync/Konflikt).
- Service Worker / installierbare PWA / Background-Sync nach App-Schließen.
- „Fotos nachreichen"-Flow ergibt sich automatisch aus dem Puffer (Mediathek wählen).
