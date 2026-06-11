// Minimaler Service Worker für den Offline-Begehungsmodus (Stufe 2).
// Bewusst klein gehalten (KISS): nur drei Regeln, kein Framework.
//  1. Build-Assets (/_next/static, Hash im Namen)  -> cache-first
//  2. Foto-/Plan-Dateien (/api/datei, UUID-Namen)  -> cache-first
//     (macht bereits angesehene Vorjahres-Fotos + Anlagenplan offline nutzbar)
//  3. Workspace-Shell (/begehung als Navigation)   -> network-first mit
//     Cache-Fallback: Reload im Funkloch lädt die App-Shell aus dem Cache,
//     der Workspace zieht seine Daten dann aus IndexedDB.
// Alles andere geht unverändert ans Netz.

const CACHE = "begehung-shell-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })()
  );
});

async function cacheFirst(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && !res.redirected) c.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const c = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    // Redirects (z. B. Login) nicht cachen — sonst „klemmt" die Shell.
    if (res.ok && !res.redirected) c.put(req, res.clone());
    return res;
  } catch {
    const hit = await c.match(req);
    if (hit) return hit;
    return new Response("Offline — Seite noch nicht im Cache.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/api/datei/")) {
    e.respondWith(cacheFirst(req));
  } else if (req.mode === "navigate" && url.pathname === "/begehung") {
    e.respondWith(networkFirst(req));
  }
});
