#!/bin/bash
# Copies the SOURCE of a build (not renders, not audio) from /root/faceless-shorts/<proj> into shorts-out/formats/<proj>/,
# so a container reset never loses the work. Run it in DELIVER after every finished render.
set -eu
P="${1:?usage: backup_project.sh <project-name>}"
SRC="/root/faceless-shorts/$P"
DST="$(cd "$(dirname "$0")" && pwd)/formats/$P"
[ -d "$SRC" ] || { echo "no project at $SRC" >&2; exit 1; }
for f in script.json make_script.py src/shots.js src/main.js data/words.json data/lines.json; do
  [ -f "$SRC/$f" ] || continue
  mkdir -p "$DST/$(dirname "$f")"
  cp "$SRC/$f" "$DST/$f"
done
echo "backed up $P -> $DST"
