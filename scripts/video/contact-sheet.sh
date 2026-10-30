#!/usr/bin/env bash
# QA: lembar kontak 4 frame (20/40/60/85% durasi) per klip → <out>/<nama>.jpg
#   bash contact-sheet.sh <out_dir> video_assets/s04-*.mp4
set -euo pipefail
out="$1"; shift
mkdir -p "$out"
for f in "$@"; do
  d=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$f")
  name=$(basename "$f" .mp4)
  args=()
  for p in 0.2 0.4 0.6 0.85; do
    args+=(-ss "$(awk "BEGIN{print $d*$p}")" -i "$f")
  done
  ffmpeg -y -loglevel error "${args[@]}" \
    -filter_complex "[0:v]scale=640:-2[a];[1:v]scale=640:-2[b];[2:v]scale=640:-2[c];[3:v]scale=640:-2[e];[a][b][c][e]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0" \
    -frames:v 1 "$out/$name.jpg"
  printf '%-40s %6.1fs  %s\n' "$name" "$d" "$(ffprobe -v error -select_streams v -show_entries stream=width,height,r_frame_rate -of csv=p=0 "$f")"
done
