#!/bin/bash
# Lance ce script une seule fois après avoir placé ton logo dans assets/logo.png
# Nécessite : sips (installé par défaut sur macOS)

set -e
SRC="assets/logo.png"

if [ ! -f "$SRC" ]; then
  echo "❌  Place ton logo dans assets/logo.png d'abord."
  exit 1
fi

echo "→ Génération des icônes..."
sips -z 512 512 "$SRC" --out "assets/icon-512.png"    > /dev/null
sips -z 192 192 "$SRC" --out "assets/icon-192.png"    > /dev/null
sips -z 180 180 "$SRC" --out "assets/apple-touch-icon.png" > /dev/null
sips -z 32  32  "$SRC" --out "assets/favicon-32.png"  > /dev/null
sips -z 16  16  "$SRC" --out "assets/favicon-16.png"  > /dev/null

echo "✅  Icônes générées dans assets/"
ls -lh assets/
