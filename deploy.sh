#!/bin/bash
set -e

if [ -n "$1" ]; then
  TARGET="$1"
elif ssh -o ConnectTimeout=3 -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectionAttempts=1 my-pi true 2>/dev/null; then
  TARGET=my-pi
else
  echo "⚠️  my-pi unreachable, falling back to my-pi-ext (Cloudflare Tunnel)..."
  TARGET=my-pi-ext
fi
SSH="ssh -i ~/.ssh/pi_deploy_key $TARGET"
SCP="scp -i ~/.ssh/pi_deploy_key"

echo "🔨 Building and running all backend tests..."
mvn clean verify

echo "🧬 Running mutation tests..."
mvn -pl backend pitest:mutationCoverage

# The Angular app is now what we deploy (see env-angular). ng build hashes asset
# filenames, so the old GWT ?v= cache-stamping is no longer needed. Served under /keezen:
# base-href=/keezen/ makes the browser request /keezen/* (bundles + the API/SSE/asset URLs
# the app builds from <base href> via basePath()). On the Pi the app is keezen.war in the
# shared Tomcat, whose context path /keezen is that same prefix; nginx forwards it unchanged.
echo "🅰️  Testing + building the Angular app..."
# Angular unit/component tests (vitest) run headless; a failure aborts the deploy (set -e).
# Then build. (Java/GWT tests already ran above via `mvn clean verify`.)
( cd frontend && npm ci && CI=1 npx ng test --watch=false && npm run build -- --base-href=/keezen/ )

echo "📦 Packaging the server to serve the Angular app (env-angular; no GWT unpack)..."
mvn -pl backend -am -Penv-angular -DskipTests clean package

# Angular E2E (Playwright) gate. Playwright serves the UI itself (ng serve on :4300) but
# needs a backend with the API + /test seeding hooks on :4200 — so run the WAR we just
# built there, run the suite against it, then shut it down. A failure aborts the deploy
# (set -e) before anything is uploaded. (`mvn clean verify` above already needs :4200 free,
# so it is free here too.)
echo "🎭 Running Angular E2E (Playwright)..."
E2E_WAR=backend/target/tock-exec.war
java -jar "$E2E_WAR" --server.port=4200 --spring.profiles.active=test > /tmp/keezen-e2e-backend.log 2>&1 &
E2E_BACKEND_PID=$!
trap '[ -n "${E2E_BACKEND_PID:-}" ] && kill "$E2E_BACKEND_PID" 2>/dev/null' EXIT
echo "   waiting for the E2E backend on :4200..."
for i in $(seq 1 60); do curl -sf http://localhost:4200/game-options >/dev/null 2>&1 && break; sleep 2; done
curl -sf http://localhost:4200/game-options >/dev/null 2>&1 || {
  echo "❌ E2E backend failed to start"; tail -n 80 /tmp/keezen-e2e-backend.log; exit 1; }
( cd frontend && npx playwright install chromium >/dev/null 2>&1 && npm run e2e )
kill "$E2E_BACKEND_PID" 2>/dev/null; E2E_BACKEND_PID=""; trap - EXIT

# Tomcat itself is provisioned by the GameRoom project (setup-tomcat.sh); this script only drops
# the WAR in. keezen.war is served at /keezen, the prefix the Angular app is built for.
WEBAPPS=/var/lib/tomcat10/webapps
TOMCAT_URL=http://127.0.0.1:8090
LOG_FILE=/var/log/tomcat10/keezen.log

if ! $SSH "test -d $WEBAPPS"; then
  echo "❌ No Tomcat on $TARGET. Run ./setup-tomcat.sh in the GameRoom project first."
  exit 1
fi

# Written every deploy. Tomcat's unit only lets the JVM write under /var/log/tomcat10, and a file
# of its own keeps Keezen's log apart from the other apps sharing Tomcat's console.
echo "⚙️  Writing application override config..."
$SSH "sudo mkdir -p /opt/keezen && sudo tee /opt/keezen/application-override.yaml > /dev/null << 'EOF'
logging:
  file:
    name: $LOG_FILE
EOF"

echo "📦 Uploading..."
$SCP backend/target/tock-exec.war $TARGET:/home/ubuntu/keezen.war

echo "🚀 Deploying to Tomcat..."
# Copy under a name Tomcat ignores, then rename: a same-filesystem mv is atomic, so Tomcat never
# picks up a half-written WAR. Its autodeployer notices the new file and redeploys the app.
$SSH "sudo install -o tomcat -g tomcat -m 644 /home/ubuntu/keezen.war $WEBAPPS/.keezen.war.tmp \
  && sudo mv $WEBAPPS/.keezen.war.tmp $WEBAPPS/keezen.war && rm /home/ubuntu/keezen.war"

# The exploded dir is recreated on redeploy, so 'newer than the WAR' rules out the old version
# still answering; then wait until Spring has started and serves the API.
$SSH "for i in \$(seq 1 90); do
  if [ $WEBAPPS/keezen -nt $WEBAPPS/keezen.war ] && curl -sf -o /dev/null $TOMCAT_URL/keezen/game-options; then exit 0; fi
  sleep 2
done
echo '❌ Keezen did not come up in Tomcat. See $LOG_FILE and journalctl -u tomcat10.'
exit 1"

echo "🧹 Retiring the standalone service..."
# One-time migration. Only once nginx forwards /keezen/ to Tomcat (GameRoom's nginx.conf); stopping
# it earlier would take the game offline.
$SSH "
if [ -f /etc/systemd/system/keezen.service ]; then
  if grep -q '127.0.0.1:8090/keezen/' /etc/nginx/sites-enabled/gameroom; then
    sudo systemctl disable --now keezen
    sudo rm /etc/systemd/system/keezen.service /opt/keezen/keezen.jar
    sudo systemctl daemon-reload
  else
    echo '⚠️  nginx still forwards /keezen/ to the standalone service; leaving it running.'
    echo '   Deploy the GameRoom nginx.conf, then run this script again to retire it.'
  fi
fi"

echo "✅ Done."
