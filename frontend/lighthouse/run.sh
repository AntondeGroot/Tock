#!/bin/bash
# Lighthouse audit of the game board, as the production build serves it.
#
# Needs the backend running the Angular WAR with the `test` profile (for the /test seeding hooks):
#   cd frontend && npm run build
#   cd .. && mvn -pl backend -am -Penv-angular -DskipTests package
#   java -jar backend/target/tock-exec.war --server.port=4200 --spring.profiles.active=test
# Not `ng serve`: Lighthouse would score its unminified development build.
#
# Seeds a fresh three-player game, then audits its board as player0. Thresholds: lighthouserc.cjs.
set -euo pipefail
cd "$(dirname "$0")/.."

API="${LHCI_API_URL:-http://localhost:4200}"

session_id=$(curl -sf -X POST "$API/games" -H 'Content-Type: application/json' \
  -d '{"roomName":"lighthouse","maxPlayers":3}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).sessionId')
for i in 0 1 2; do
  curl -sf -o /dev/null -X POST "$API/games/$session_id/players" -H 'Content-Type: application/json' \
    -d "{\"id\":\"player$i\",\"name\":\"player$i\"}"
done
curl -sf -o /dev/null -X POST "$API/test/start-game/$session_id"

export LHCI_URL="$API/?sessionid=$session_id&playerid=player0"
echo "Auditing $LHCI_URL"
npx lhci autorun
