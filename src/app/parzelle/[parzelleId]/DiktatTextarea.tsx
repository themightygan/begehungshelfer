"use client";

import { useRef, useState } from "react";

// Textarea mit Diktat: nimmt Audio auf, schickt es an /api/transkript
// (Whisper + Ollama-Glättung) und hängt den Text an. Nicht blockierend: nach
// dem Stoppen läuft die Transkription im Hintergrund, die nächste Aufnahme kann
// sofort starten; Ergebnisse werden angehängt, sobald sie eintreffen.
export function DiktatTextarea({
  name,
  defaultValue,
  placeholder,
  rows = 2,
  className,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(0);

  function append(text: string) {
    if (!taRef.current || !text) return;
    const cur = taRef.current.value.replace(/\s*$/, "");
    taRef.current.value = cur ? `${cur} ${text}` : text;
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
          .then((r) => r.json())
          .then((j) => append(j.text))
          .catch(() => {})
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
        name={name}
        defaultValue={defaultValue}
        rows={rows}
        placeholder={placeholder}
        className={className}
      />
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={recording ? stop : start}
          className={`rounded px-3 py-1.5 text-sm font-medium ${
            recording
              ? "bg-red-600 text-white hover:bg-red-700"
              : "border border-stone-300 text-stone-700 hover:bg-stone-50"
          }`}
        >
          {recording ? "⏹ Stoppen & einfügen" : "🎤 Diktat"}
        </button>
        {transcribing > 0 && (
          <span className="text-sm text-stone-500">{transcribing} wird transkribiert…</span>
        )}
      </div>
    </div>
  );
}
