#!/usr/bin/env bash
# Make executable: chmod +x deploy/setup.sh
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

WIPP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WIPP_HOME="$HOME/.wipp"

info "Wipp Setup Script"
info "Project directory: $WIPP_DIR"
info "Data directory: $WIPP_HOME"

# Check if running on Raspberry Pi
if [ -f /proc/device-tree/model ]; then
  MODEL=$(tr -d '\0' < /proc/device-tree/model)
  info "Detected: $MODEL"
else
  warn "Not running on a Raspberry Pi (or /proc/device-tree/model not found)."
  warn "Continuing anyway — wipp can run on any Linux system."
fi

# Check Node.js
if command -v node &>/dev/null; then
  NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VERSION" -lt 22 ]; then
    warn "Node.js version $(node --version) is too old. Need v22+."
    info "Installing Node.js 22 via NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  else
    info "Node.js $(node --version) ✓"
  fi
else
  info "Installing Node.js 22 via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# Install dependencies
info "Installing npm dependencies..."
cd "$WIPP_DIR"
npm install --production

# Build TypeScript
info "Building TypeScript..."
npm run build

# Create data directory
info "Creating $WIPP_HOME..."
mkdir -p "$WIPP_HOME"
mkdir -p "$WIPP_HOME/skills"
mkdir -p "$WIPP_HOME/sessions"
mkdir -p "$HOME/repos"

# Copy .env template if needed
if [ ! -f "$WIPP_HOME/.env" ]; then
  cp "$WIPP_DIR/.env.example" "$WIPP_HOME/.env"
  info "Created $WIPP_HOME/.env from template"
else
  info "$WIPP_HOME/.env already exists, skipping"
fi

# Install systemd user service
info "Installing systemd user service..."
mkdir -p "$HOME/.config/systemd/user"

# Customize service file with actual paths
sed "s|/home/pi/wipp|$WIPP_DIR|g; s|/home/pi/.wipp|$WIPP_HOME|g; s|/home/pi/repos|$HOME/repos|g" \
  "$WIPP_DIR/deploy/wipp.service" > "$HOME/.config/systemd/user/wipp.service"

systemctl --user daemon-reload
systemctl --user enable wipp.service
info "Service installed and enabled"

echo ""
info "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Edit $WIPP_HOME/.env with your tokens:"
echo "     - DISCORD_BOT_TOKEN (from Discord Developer Portal)"
echo "     - DISCORD_AUTHORIZED_USER_ID (your Discord user ID)"
echo "     - GITHUB_TOKEN (PAT with repo scope)"
echo ""
echo "  2. Authenticate Copilot CLI:"
echo "     copilot login"
echo ""
echo "  3. Start wipp:"
echo "     systemctl --user start wipp"
echo ""
echo "  4. Check status:"
echo "     systemctl --user status wipp"
echo "     journalctl --user -u wipp -f"
echo ""
