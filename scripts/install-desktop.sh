#!/usr/bin/env bash
# Installs Maquest as a desktop app that runs straight from this repo.
# The launcher points at the repo's build output, so after code changes
# only `pnpm build` is needed; rerun this script only if it changes.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
APP="$REPO/apps/desktop"
ELECTRON="$APP/node_modules/.bin/electron"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"

(cd "$REPO" && pnpm install --frozen-lockfile && pnpm build)

for s in 16 32 48 64 128 256 512; do
  d="$DATA/icons/hicolor/${s}x${s}/apps"; mkdir -p "$d"
  rsvg-convert -w $s -h $s "$APP/resources/icon.svg" -o "$d/maquest.png"
done
mkdir -p "$DATA/icons/hicolor/scalable/apps" "$DATA/applications"
cp "$APP/resources/icon.svg" "$DATA/icons/hicolor/scalable/apps/maquest.svg"

cat > "$DATA/applications/maquest.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Maquest
Comment=Write stories, novels, screenplays and RPG campaigns
Exec=env -u ELECTRON_RUN_AS_NODE "$ELECTRON" "$APP" %f
Path=$APP
Icon=maquest
Terminal=false
Categories=Office;TextEditor;
StartupWMClass=Maquest
StartupNotify=true
DESKTOP

gtk-update-icon-cache -q -t "$DATA/icons/hicolor" 2>/dev/null || true
update-desktop-database -q "$DATA/applications" 2>/dev/null || true
echo "Installed: $DATA/applications/maquest.desktop -> $APP"
