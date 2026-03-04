#!/bin/bash
# IMPULSE Dashboard - Stop All Services
echo "Stopping all IMPULSE services..."
for port in 3002 3003 5174 5175; do
  pid=$(netstat -ano 2>/dev/null | grep ":$port " | grep LISTENING | awk '{print $5}' | head -1)
  if [ -n "$pid" ] && [ "$pid" != "0" ]; then
    echo "  Killing port $port (PID $pid)"
    taskkill //PID "$pid" //F >/dev/null 2>&1
  fi
done
echo "Done."
