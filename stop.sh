#!/bin/bash
# IMPULSE Dashboard - Stop All Services
echo "Stopping all IMPULSE services..."
for port in 4902 4903 4904 4905; do
  pid=$(netstat -ano 2>/dev/null | grep ":$port " | grep LISTENING | awk '{print $5}' | head -1)
  if [ -n "$pid" ] && [ "$pid" != "0" ]; then
    echo "  Killing port $port (PID $pid)"
    taskkill //PID "$pid" //F >/dev/null 2>&1
  fi
done
echo "Done."
