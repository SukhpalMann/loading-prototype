#!/bin/bash
# Fits the picture to a voice recording and writes the final video.
#   ./finish.sh <audio file> <base url of the served build> <out dir> [extra args for fit.py]
# DRAFT=1 gives a fast low-resolution pass.
set -euo pipefail
audio="$1"; url="$2"; out="$3"; shift 3
mkdir -p "$out"
python3 fit.py "$audio" --out "$out" "$@" | tee "$out/fit.log"
node rec.mjs "$url" "$out/picture.mp4" "$out/timings.json" | tee "$out/rec.log"
ffmpeg -y -loglevel error -i "$out/picture.mp4" -i "$out/voice.wav" -map 0:v:0 -map 1:a:0 \
  -c:v copy -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart "$out/Second-Attempt-video.mp4"
echo "--- final file"
ffprobe -v error -show_entries format=duration,size:stream=codec_type,codec_name,width,height,duration,channels -of default=nw=1 "$out/Second-Attempt-video.mp4"
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out/Second-Attempt-video.mp4")
python3 - "$dur" <<'PY'
import sys
d = float(sys.argv[1])
print(f"length {d:.2f}s:", "OK, under 90 seconds" if d < 90 else "TOO LONG")
PY
