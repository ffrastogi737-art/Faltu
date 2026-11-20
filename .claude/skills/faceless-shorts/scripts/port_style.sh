#!/bin/bash
# Scaffold a lightweight 2D style from an existing engine, so no strong script is held back by a missing template.
#   bash port_style.sh <style-id> [base-style]     base defaults to comic-pop (auto-vertical engine: kinds I Q S C, kit, SFX, captions)
# Copies <base>/auto-vertical-example (or example/) to styles/<id>/example and writes a STYLE.md stub. Then: edit
# example/src/shots.js (new look + shot kinds), write example/make_script.py, `estimate.py` + `capture.mjs check`, and
# add the id to LOCAL and PORTED in shorts-out/pick_style.py. Never copy a library source file into the repo.
set -eu
ID="${1:?usage: port_style.sh <style-id> [base-style]}"; BASE="${2:-comic-pop}"
SK="$(cd "$(dirname "$0")/.." && pwd)/styles"
SRC="$SK/$BASE/auto-vertical-example"; [ -d "$SRC" ] || SRC="$SK/$BASE/example"
[ -d "$SRC" ] || { echo "no base engine for $BASE" >&2; exit 2; }
DST="$SK/$ID/example"; [ -e "$DST" ] && { echo "$DST already exists" >&2; exit 2; }
mkdir -p "$SK/$ID" && cp -R "$SRC" "$DST" && rm -rf "$DST/renders" "$DST/review" && rm -f "$DST/data/narration.wav" "$DST/data/mix.wav"
cat > "$SK/$ID/STYLE.md" <<MD
# $ID: (what it makes in one line), 9:16

Scaffolded from $BASE by port_style.sh. Fill in: look rules, shot kinds, kit, QA pitfalls (same sections as comic-pop/STYLE.md).
MD
echo "scaffolded $SK/$ID (base $BASE); next: edit example/src/shots.js, make_script.py, STYLE.md"
