#!/bin/bash
# IMPULSE Dashboard - First Time Setup
# Usage: bash setup.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== IMPULSE Dashboard Setup ==="
echo ""

# Create .env if missing
if [ ! -f "$SCRIPT_DIR/.env" ]; then
  cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
  echo "[!] Kreiran .env fajl - POPUNI VREDNOSTI pre pokretanja!"
  echo "    Otvori: $SCRIPT_DIR/.env"
  echo ""
fi

# Install dependencies
echo "[1/4] Installing local/backend..."
(cd "$SCRIPT_DIR/local/backend" && npm install --silent)

echo "[2/4] Installing local/frontend..."
(cd "$SCRIPT_DIR/local/frontend" && npm install --silent)

echo "[3/4] Installing web/backend..."
(cd "$SCRIPT_DIR/web/backend" && npm install --silent)

echo "[4/4] Installing web/frontend..."
(cd "$SCRIPT_DIR/web/frontend" && npm install --silent)

echo ""
echo "=== Setup gotov! ==="
echo ""
echo "  1. Popuni .env fajl ako nisi"
echo "  2. Pokreni: bash start.sh"
echo ""
