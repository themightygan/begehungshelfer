// Next.js Instrumentation: läuft einmalig beim Serverstart (nur node-Runtime).
// Startet den stündlichen Postfach-Abgleich in-process (keine Cron/launchd
// nötig): gesendete Mitteilungen/Abmahnungen mit PDF-Anhang werden in die
// Parzellen-Akte übernommen (mit Versanddatum) und damit als „versandt"
// markiert (✓✉ in der Auswertung). Siehe gesendetAbgleich in src/lib/mail.ts.
//
// Der Abgleich wird über die interne API-Route ausgelöst (NICHT direkt
// importiert): imapflow/nodemailer laufen dort im serverExternalPackages-
// Bundle; ein direkter Import in die Instrumentation würde Node-Builtins
// ("stream") in den Webpack-Build ziehen und den Build brechen.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { sealData } = await import("iron-session");
  const { sessionOptions } = await import("@/lib/session");
  const port = process.env.PORT || "3100";

  let laeuft = false; // kein überlappender Lauf, falls IMAP mal hängt
  const lauf = async () => {
    if (laeuft) return;
    laeuft = true;
    try {
      const cookie = await sealData({ loggedIn: true }, { password: sessionOptions.password });
      const r = await fetch(`http://127.0.0.1:${port}/api/mail/abgleich`, {
        method: "POST",
        headers: { cookie: `${sessionOptions.cookieName}=${cookie}` },
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; bericht?: string; neue?: unknown[] } | null;
      // Nur bei Treffern bzw. Fehler loggen (sonst still).
      if (j && (!j.ok || (j.neue?.length ?? 0) > 0)) console.log(`[abgleich] ${j.bericht}`);
    } catch (e) {
      console.error("[abgleich] Fehler:", e instanceof Error ? e.message : e);
    } finally {
      laeuft = false;
    }
  };

  // Erststart 2 min nach Boot (Server + DB oben), danach stündlich.
  setTimeout(lauf, 120_000);
  setInterval(lauf, 3_600_000);
  console.log("[abgleich] Scheduler aktiv — Postfach-Abgleich stündlich.");
}
