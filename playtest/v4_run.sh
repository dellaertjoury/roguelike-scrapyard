#!/bin/bash
# usage: PORT=8765 playtest/v4_run.sh v4_script.py [args]
# Serves a pinned export of commit 6c209f2 (git archive -> /home/claude/okh_6c209f2), because the working tree
# kept moving during the v4 session. Scripts and screenshots stay in playtest/.
ROOT=${ROOT:-/home/claude/okh_6c209f2}
PORT=${PORT:-8765}
if [ ! -f "$ROOT/index.html" ]; then mkdir -p "$ROOT" && (cd /home/claude/roguelike-scrapyard && git archive 6c209f2 | tar -x -C "$ROOT"); fi
cd "$ROOT"
python3 -m http.server $PORT >/dev/null 2>&1 &
SRV=$!
for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:$PORT/index.html && break; sleep 0.2; done
cd /home/claude/roguelike-scrapyard/playtest
GAME_URL=http://localhost:$PORT/index.html timeout ${T:-900} python3 "$@"
RC=$?
kill $SRV
exit $RC
