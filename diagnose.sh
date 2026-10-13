#!/bin/bash
SSH="ssh -i ~/.ssh/pi_deploy_key my-pi"

echo "=== Tomcat status (Keezen runs as keezen.war inside it) ==="
$SSH "systemctl status tomcat10 --no-pager" 2>&1 || true

echo ""
echo "=== last 50 log lines ==="
$SSH "sudo tail -n 50 /var/log/tomcat10/keezen.log" 2>&1 || true

echo ""
echo "=== errors in log ==="
$SSH "sudo tac /var/log/tomcat10/keezen.log | grep -E -m 5 -A 3 -B 5 'Z[[:space:]]+(ERROR|WARN)[[:space:]]+[0-9]+' | tac | awk 'NR==1{n=1; printf \"--- error %d ---\n\", n} /^--\$/{n++; printf \"\n--- error %d ---\n\", n; next} /Z[[:space:]]+(ERROR|WARN)/{print \">>> \" \$0; next} {print}'" 2>&1 || true

echo ""
echo "=== war file ==="
$SSH "ls -lh /var/lib/tomcat10/webapps/keezen.war" 2>&1 || true

echo ""
echo "=== override config ==="
$SSH "cat /opt/keezen/application-override.yaml" 2>&1 || true

echo ""
echo "=== java version ==="
$SSH "java -version" 2>&1 || true

echo ""
echo "=== all listening ports and programs ==="
$SSH "sudo ss -tlnp" 2>&1 || true

echo ""
echo "=== disk space ==="
$SSH "df -h /opt" 2>&1 || true

echo ""
echo "=== memory ==="
$SSH "free -h" 2>&1 || true