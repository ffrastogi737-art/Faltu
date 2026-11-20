#!/bin/bash
# SessionStart hook (Faltu repo): puts the Jarvis brain into the session context, so no run starts blind.
# Prints BRAIN.md in full and the run-critical FACTORY.md sections (P, DECIDE, REPORT). Never fails the session.
D="${CLAUDE_PROJECT_DIR:-$(pwd)}/shorts-out"
echo "== JARVIS BRAIN (auto-loaded by .claude/hooks/jarvis-brain.sh; CLAUDE.md is auto-loaded by Claude Code) =="
if [ -f "$D/BRAIN.md" ]; then cat "$D/BRAIN.md"; else echo "⚠️ shorts-out/BRAIN.md missing"; fi
echo
echo "== FACTORY.md: run-critical sections (other sections: read when you reach that step) =="
if [ -f "$D/FACTORY.md" ]; then
  awk '/^## 00\. /{p=1} /^## P\. /{p=1} /^## 0\. /{p=0} /^## DECIDE/{p=1} /^## BUILD/{p=0} /^## REPORT/{p=1} p' "$D/FACTORY.md"
else echo "⚠️ shorts-out/FACTORY.md missing"; fi
exit 0
