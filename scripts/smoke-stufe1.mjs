// Smoke-Test Stufe-1-Härtung (Offline/Multi-User) gegen die laufende App :3100.
// Legt Wegwerf-Runden an, prüft 410/Gnadenfrist/Stale-Mangel/Atomar-Append,
// räumt danach auf. Aufruf: node scripts/smoke-stufe1.mjs
import { sealData } from "iron-session";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3100";
const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")])
);
const prisma = new PrismaClient();

const cookieWert = await sealData({ loggedIn: true }, { password: env.SESSION_SECRET });
const COOKIE = `begehung_session=${cookieWert}`;

const jpeg = await sharp({
  create: { width: 64, height: 64, channels: 3, background: { r: 80, g: 120, b: 60 } },
})
  .jpeg()
  .toBuffer();

let fehler = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fehler++;
}

async function postFoto(felder) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(felder)) fd.append(k, String(v));
  fd.append("foto", new Blob([jpeg], { type: "image/jpeg" }), "foto");
  return fetch(`${BASE}/api/foto`, {
    method: "POST",
    body: fd,
    headers: { cookie: COOKIE },
    redirect: "manual",
  });
}

async function postNotiz(body) {
  return fetch(`${BASE}/api/notiz-append`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: COOKIE },
    body: JSON.stringify(body),
    redirect: "manual",
  });
}

// --- Testdaten: Wegwerf-Runden (Anlage K, Parzelle K1) ---
const anlage = await prisma.anlage.findUniqueOrThrow({ where: { kuerzel: "K" } });
const mk = (data) =>
  prisma.begehungsrunde.create({
    data: { anlageId: anlage.id, datum: new Date(), bezeichnung: "SMOKE-TEST", ...data },
  });
const rundeOffen = await mk({ status: "offen" });
const rundeFrisch = await mk({ status: "abgeschlossen", abgeschlossenAm: new Date() });
const rundeAlt = await mk({
  status: "abgeschlossen",
  abgeschlossenAm: new Date(Date.now() - 72 * 3600 * 1000),
});

try {
  // 1) Ohne Session: Middleware muss zum Login umleiten (Client wertet das als „warten").
  const r1 = await fetch(`${BASE}/api/foto`, { method: "POST", redirect: "manual" });
  check("ohne Session -> Redirect /login", r1.status >= 300 && r1.status < 400, `status ${r1.status}`);

  // 2) Gelöschte/unbekannte Runde -> 410 (dauerhaft unzustellbar)
  const r2 = await postFoto({ rundeId: 999999, parzelleId: "K1" });
  check("unbekannte Runde -> 410", r2.status === 410, `status ${r2.status}`);

  // 3) Abgeschlossen, Gnadenfrist abgelaufen (72 h) -> 410
  const r3 = await postFoto({ rundeId: rundeAlt.id, parzelleId: "K1" });
  check("abgeschlossen >48h -> 410", r3.status === 410, `status ${r3.status}`);

  // 4) Abgeschlossen, innerhalb Gnadenfrist -> Foto wird angenommen
  const r4 = await postFoto({ rundeId: rundeFrisch.id, parzelleId: "K1" });
  check("abgeschlossen <48h (Gnadenfrist) -> 200", r4.status === 200, `status ${r4.status}`);

  // 5) Offene Runde, gelöschter Ziel-Mangel -> Foto landet als „zustand" am Befund
  const r5 = await postFoto({ rundeId: rundeOffen.id, parzelleId: "K1", kontext: "mangel", mangelId: 999999 });
  const j5 = r5.ok ? await r5.json() : {};
  const foto5 = j5.id ? await prisma.foto.findUnique({ where: { id: j5.id } }) : null;
  check(
    "stale mangelId -> Foto als zustand gerettet",
    r5.status === 200 && foto5?.mangelId === null && foto5?.kontext === "zustand",
    `status ${r5.status}, kontext ${foto5?.kontext}`
  );

  // 6) Diktat-Append: zweimal anhängen -> atomar, mit Zeilenumbruch
  const a1 = await postNotiz({ rundeId: rundeOffen.id, parzelleId: "K1", text: "Erstes Diktat" });
  const a2 = await postNotiz({ rundeId: rundeOffen.id, parzelleId: "K1", text: "Zweites Diktat" });
  const befund = await prisma.befund.findFirst({
    where: { rundeId: rundeOffen.id },
    orderBy: { id: "desc" },
  });
  check(
    "notiz-append 2x -> beide Texte mit Newline",
    a1.status === 200 && a2.status === 200 && befund?.diktatNachgereicht === "Erstes Diktat\nZweites Diktat",
    JSON.stringify(befund?.diktatNachgereicht)
  );

  // 7) Diktat in abgelaufene Runde -> 410
  const a3 = await postNotiz({ rundeId: rundeAlt.id, parzelleId: "K1", text: "zu spät" });
  check("notiz-append abgelaufen -> 410", a3.status === 410, `status ${a3.status}`);

  // 8) Parallel-Härtetest: 12 gleichzeitige Foto-Uploads (SQLite WAL + connection_limit)
  const parallel = await Promise.all(
    Array.from({ length: 12 }, () => postFoto({ rundeId: rundeOffen.id, parzelleId: "K1" }))
  );
  const codes = parallel.map((r) => r.status);
  check("12 parallele Uploads ohne SQLITE_BUSY-5xx", codes.every((c) => c === 200), codes.join(","));
} finally {
  // Aufräumen: Wegwerf-Runden (Cascade löscht Befunde/Fotos-Zeilen)
  await prisma.begehungsrunde.deleteMany({ where: { bezeichnung: "SMOKE-TEST" } });
  await prisma.$disconnect();
}

console.log(fehler === 0 ? "\nAlle Tests bestanden." : `\n${fehler} Test(s) fehlgeschlagen.`);
process.exit(fehler === 0 ? 0 : 1);
