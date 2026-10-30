#!/usr/bin/env bash
# Scene 6: animasi riwayat commit (Gource) → video_assets/s06-gource-commit-history.mp4
#
#   bash scripts/video/render-s06-gource.sh            # tanpa nama pengguna (default)
#   SHOW_NAMES=1 bash scripts/video/render-s06-gource.sh
#
# Gource membuka jendela sebentar selama render (tidak punya mode headless).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/video_assets"
GOURCE="${GOURCE:-$LOCALAPPDATA/Gource/gource.exe}"
mkdir -p "$OUT"

HIDE="mouse,progress,filenames"
SUFFIX=""
if [ "${SHOW_NAMES:-0}" != "1" ]; then
  HIDE="$HIDE,usernames"
else
  SUFFIX="-names"
fi

"$GOURCE" "$ROOT" \
  --viewport 1920x1080 --output-framerate 30 --multi-sampling --no-vsync \
  --seconds-per-day 0.55 --auto-skip-seconds 0.25 --stop-at-end \
  --file-idle-time 0 --max-file-lag 0.25 --time-scale 1.0 \
  --camera-mode overview --padding 1.25 \
  --background-colour 0f241d --font-colour e2ece8 --dir-colour 9cc3b3 \
  --highlight-colour f2f6f4 --selection-colour 356152 \
  --bloom-multiplier 0.9 --bloom-intensity 0.55 \
  --font-size 22 --date-format "%d %B %Y" \
  --title "Amwal: Aplikasi Manajemen Wakaf Aman dan Legal  ·  riwayat pengembangan" \
  --key --hide "$HIDE" \
  --output-ppm-stream - |
  ffmpeg -y -loglevel error -f image2pipe -vcodec ppm -r 30 -i - \
    -vf "format=yuv420p" -c:v libx264 -preset slow -crf 17 -movflags +faststart \
    "$OUT/s06-gource-commit-history$SUFFIX.mp4"

ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 \
  "$OUT/s06-gource-commit-history$SUFFIX.mp4"
