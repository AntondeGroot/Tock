#!/bin/bash
# Regenerates the board preview images (readme-images/game-*.png) and the auto-generated block in
# README.md by screenshotting the real Angular app served by ng serve against a real backend — so
# the pictures always track the current board styling.
#
# It boots the backend on :4200 with the `test` Spring profile (that is what exposes the /test/**
# seeding hooks the generator uses to create the 2/4/6-player games), then runs the guarded
# Playwright spec frontend/e2e/readme-images.spec.ts. Playwright starts ng serve itself.
#
# Everything in the shot is pinned (seats, pawns, and the viewer's hand via /test/set-hand), so a
# rerun on the same machine reproduces the same images — a clean `git status` after running this
# means the previews are still up to date. Run it whenever the board styling or the set of previewed
# games changes, then commit readme-images/ + README.md.
set -e

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_URL="${E2E_API_URL:-http://localhost:4200}"
BACKEND_PID=""

# The port to free on the way out, parsed off the URL (host:PORT[/path]); 4200 when it has none.
BACKEND_PORT="${BACKEND_URL##*:}"
BACKEND_PORT="${BACKEND_PORT%%/*}"
case "$BACKEND_PORT" in
  ''|*[!0-9]*) BACKEND_PORT=4200 ;;
esac

# Kill a process and everything under it, deepest first.
kill_tree() {
  local pid="$1" child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
}

# Wait for the port to come free, escalating if something clings to it.
release_port() {
  local listeners attempt
  for attempt in $(seq 1 20); do
    listeners="$(lsof -t -iTCP:"$BACKEND_PORT" -sTCP:LISTEN 2>/dev/null || true)"
    [ -z "$listeners" ] && return 0
    # shellcheck disable=SC2086 # deliberate word splitting: lsof lists one pid per line
    if [ "$attempt" -lt 15 ]; then kill $listeners 2>/dev/null || true;
    else kill -9 $listeners 2>/dev/null || true; fi
    sleep 0.5
  done
  echo "⚠️  Port $BACKEND_PORT is still in use — backend tests will fail to bind it."
}

# Only ever tears down a backend WE started; one you were already running is left alone.
#
# `kill $BACKEND_PID` alone is not enough: that pid is the subshell, and Maven and the JVM inside
# it are children that outlive it. The orphan keeps holding the port, and every later backend test
# then dies with "Failed to start bean 'webServerStartStop'" because it cannot bind 4200.
cleanup() {
  if [ -n "$BACKEND_PID" ]; then
    echo "🛑 Stopping the backend we started (pid $BACKEND_PID) and its children…"
    kill_tree "$BACKEND_PID"
    release_port
  fi
}
trap cleanup EXIT

if curl -sf "$BACKEND_URL/game-options" >/dev/null 2>&1; then
  echo "♻️  Reusing the backend already running on $BACKEND_URL"
else
  LOG="$(mktemp -t keezen-backend)"
  echo "🚀 Booting the backend on $BACKEND_URL (profile: test) — log: $LOG"
  # -Denv=dev skips the env-prod app unpack: the browser loads Angular from ng serve, not from the
  # backend's static resources. Same invocation the e2e CI job uses, plus fork=false so the app runs
  # inside the Maven JVM — a forked one would outlive the kill below and hold :4200 hostage.
  (
    cd "$REPO_ROOT"
    mvn -B -Denv=dev -pl backend -am spring-boot:run \
      -Dspring-boot.run.fork=false \
      -Dspring-boot.run.arguments="--server.port=4200 --spring.profiles.active=test --spring.devtools.restart.enabled=false" \
      >"$LOG" 2>&1
  ) &
  BACKEND_PID=$!

  for _ in $(seq 1 150); do
    curl -sf "$BACKEND_URL/game-options" >/dev/null 2>&1 && break
    sleep 2
  done
  curl -sf "$BACKEND_URL/game-options" >/dev/null 2>&1 || {
    echo "❌ Backend failed to start; last 100 log lines:"
    tail -n 100 "$LOG"
    exit 1
  }
  echo "✅ Backend up"
fi

echo "🖼  Screenshotting the board (Playwright starts ng serve; the first compile is slow)…"
cd "$REPO_ROOT/frontend"
npm run generate:readme-images

echo "✅ Done. Review the changes:"
echo "   git status readme-images README.md"