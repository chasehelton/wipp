#!/usr/bin/env bash
# Run this on the Pi after pulling latest: bash deploy/update.sh
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

WIPP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$WIPP_DIR"

info "Wipp Update Script"
info "Project directory: $WIPP_DIR"

# Pull latest from main
info "Pulling latest from main..."
git pull --ff-only origin main || error "git pull failed — resolve conflicts manually first"

# Install/update dependencies
info "Installing npm dependencies..."
npm install

# Rebuild TypeScript
info "Building TypeScript..."
npm run build

# Sync systemd unit file (always regenerate from template to pick up any changes)
info "Syncing systemd unit file..."
UNIT_DIR="$HOME/.config/systemd/user"
UNIT_FILE="$UNIT_DIR/wipp.service"
mkdir -p "$UNIT_DIR"
GENERATED=$(sed "s|/home/pi/wipp|$WIPP_DIR|g; s|/home/pi/.wipp|$HOME/.wipp|g; s|/home/pi/repos|$HOME/repos|g" \
  "$WIPP_DIR/deploy/wipp.service")
if [ ! -f "$UNIT_FILE" ] || [ "$GENERATED" != "$(cat "$UNIT_FILE")" ]; then
  echo "$GENERATED" > "$UNIT_FILE"
  systemctl --user daemon-reload
  systemctl --user enable wipp
  info "Service file updated and reloaded"
else
  info "Service file unchanged"
fi

# Restart (or start if stopped) the daemon
info "Restarting wipp service..."
systemctl --user restart wipp

# Wait and confirm it's running
sleep 3
if systemctl --user is-active --quiet wipp; then
  info "wipp is running ✓"
  echo ""
  echo "  Logs: journalctl --user -u wipp -f"
else
  error "wipp failed to start — check logs: journalctl --user -u wipp -n 50"
fi
