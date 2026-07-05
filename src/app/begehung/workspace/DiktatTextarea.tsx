"use client";

import { useRef, useState } from "react";
import { Hourglass, Mic, Square } from "lucide-react";
import { enqueue } from "@/lib/uploadQueue";

// Textarea mit Diktat für den Offline-Workspace. Der Text wird beim Verlassen
// des Felds (onBlur) bzw. nach erfolgreicher Online-Transkription über onCommit
// in den lokalen Store übernommen (Auto-Save, kein Speichern-Knopf nötig).
//
// Offline-/Fehler-Fall: schlägt die sofortige Transkription fehl, wird das Audio
// lokal gepuffert (IndexedDB). MediaSync transkribiert es nach Sync und hängt den
// Text serverseitig an „Nachgereichte Diktate" an (append-only, kein Clobber).
export function DiktatTextarea({
  defaultValue,
  placeholder,
  rows = 2,
  className,
  rundeId,
  parzelleId,
  mangelUid,
  onCommit,
}: {
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
  className?: string;
  rundeId: number;
  parzelleId: string;
  mangelUid?: string;
  onCommit: (text: string) => void;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(0);
  const [gepuffert, setGepuffert] = useState(false);

  function append(text: string) {
    if (!taRef.current || !text) return;
    const cur = taRef.current.value.replace(/\s*$/, "");
    taRef.current.value = cur ? `${cur} ${text}` : text;
    onCommit(taRef.current.value);
  }

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: mr.mimeType || "audio/webm" });
        const fd = new FormData();
        fd.append("audio", blob, "diktat");
        setTranscribing((n) => n + 1);
        fetch("/api/transkript", { method: "POST", body: fd })
          .then((r) => {
            if (r.redirected || !r.ok) throw new Error("transkript fehlgeschlagen");
            return r.json();
          })
          .then((j) => append(j.text))
          .catch(async () => {
            // Offline/Fehler: Audio puffern, später transkribieren + nachreichen.
            await enqueue({
              kind: "audio",
              rundeId,
              parzelleId,
              mangelUid,
              blob,
              mime: blob.type || "audio/webm",
            });
            setGepuffert(true);
          })
          .finally(() => setTranscribing((n) => n - 1));
      };
      mrRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      alert("Mikrofon nicht verfügbar oder Zugriff verweigert.");
    }
  }

  function stop() {
    mrRef.current?.stop();
    setRecording(false);
  }

  return (
    <div>
      <textarea
        ref={taRef}
        defaultValue={defaultValue}
        rows={rows}
        placeholder={placeholder}
        className={className}
        onBlur={(e) => {
          if (e.target.value !== (defaultValue ?? "")) onCommit(e.target.value);
        }}
      />
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={recording ? stop : start}
          className={`inline-flex min-h-11 items-center gap-1.5 rounded px-4 py-2.5 text-sm font-medium ${
            recording
              ? "bg-red-600 text-white hover:bg-red-700"
              : "border border-stone-300 text-stone-700 hover:bg-stone-50"
          }`}
        >
          {recording ? (
            <>
              <Square className="h-4 w-4 shrink-0 fill-current" aria-hidden /> Stoppen & einfügen
            </>
          ) : (
            <>
              <Mic className="h-4 w-4 shrink-0" aria-hidden /> Diktat
            </>
          )}
        </button>
        {transcribing > 0 && (
          <span className="text-sm text-stone-500">{transcribing} wird transkribiert…</span>
        )}
        {gepuffert && (
          <span className="text-sm text-amber-800">
            <Hourglass className="mr-1 inline h-3.5 w-3.5 align-text-bottom" aria-hidden />
            offline gepuffert — Text erscheint nach Sync unter „Nachgereichte Diktate".
          </span>
        )}
      </div>
    </div>
  );
}
