#!/bin/bash
# IMPULSE Dashboard - Start All Services
# Usage: bash start.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== IMPULSE Dashboard ==="
echo ""

# Kill any existing processes on our ports
for port in 3002 3003 5174 5175; do
  pid=$(netstat -ano 2>/dev/null | grep ":$port " | grep LISTENING | awk '{print $5}' | head -1)
  if [ -n "$pid" ] && [ "$pid" != "0" ]; then
    echo "[cleanup] Killing PID $pid on port $port"
    taskkill //PID "$pid" //F >/dev/null 2>&1
  fi
done

sleep 1

# Load environment variables from .env
if [ -f "$SCRIPT_DIR/.env" ]; then
  export $(grep -v '^#' "$SCRIPT_DIR/.env" | xargs)
else
  echo "[WARN] .env fajl ne postoji! Kopiraj .env.example u .env i popuni vrednosti."
fi

# Start Local Backend (port 3002)
echo "[1/4] Starting Local Backend (port 3002)..."
(cd "$SCRIPT_DIR/local/backend" && nohup node server.js > /dev/null 2>&1 &)

# Start Web Backend (port 3003)
echo "[2/4] Starting Web Backend (port 3003)..."
(cd "$SCRIPT_DIR/web/backend" && nohup node server.js > /dev/null 2>&1 &)

sleep 2

# Start Local Frontend (port 5174)
echo "[3/4] Starting Local Frontend (port 5174)..."
(cd "$SCRIPT_DIR/local/frontend" && nohup node node_modules/vite/bin/vite.js --port 5174 > /dev/null 2>&1 &)

# Start Web Frontend (port 5175)
echo "[4/4] Starting Web Frontend (port 5175)..."
(cd "$SCRIPT_DIR/web/frontend" && nohup node node_modules/vite/bin/vite.js --port 5175 > /dev/null 2>&1 &)

sleep 3

# Verify
echo ""
OK=0
for port in 3002 3003 5174 5175; do
  pid=$(netstat -ano 2>/dev/null | grep ":$port " | grep LISTENING | awk '{print $5}' | head -1)
  if [ -n "$pid" ]; then
    echo "  [OK] Port $port (PID $pid)"
    OK=$((OK+1))
  else
    echo "  [FAIL] Port $port - not running!"
  fi
done

echo ""
if [ $OK -eq 4 ]; then
  echo "=== All 4 services running ==="
else
  echo "=== WARNING: Only $OK/4 services started ==="
fi
echo ""
echo "  Local App:  http://localhost:5174  (no login)"
echo "  Web App:    http://localhost:5175  (password: impulse123)"
echo ""
echo "To stop: bash stop.sh"
