#!/usr/bin/env python3
# Transkribiert eine Audiodatei (Deutsch) via faster-whisper. Gibt den Text auf stdout.
# Aufruf: python3 transcribe.py <audiodatei>
import sys
from faster_whisper import WhisperModel

audio = sys.argv[1]
# "small" = guter Kompromiss Deutsch/Geschwindigkeit auf dem Mac (CPU/int8).
model = WhisperModel("small", device="cpu", compute_type="int8")
segments, _info = model.transcribe(audio, language="de", vad_filter=True)
print("".join(seg.text for seg in segments).strip())
