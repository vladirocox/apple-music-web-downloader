#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${CYAN}"
echo "  ╔═══════════════════════════════════════════╗"
echo "  ║   Apple Music Downloader - Rebuild        ║"
echo "  ╚═══════════════════════════════════════════╝"
echo -e "${NC}"

# Rebuild CLI
info "Rebuilding Go CLI..."
cd cli
go build -o ../bin/amd main.go
cd "$SCRIPT_DIR"
ok "CLI binary rebuilt"

# Rebuild frontend
info "Rebuilding frontend..."
cd frontend
npx vite build 2>/dev/null
cd "$SCRIPT_DIR"
ok "Frontend rebuilt"

# Update Python deps
info "Updating Python dependencies..."
source venv/bin/activate
pip install -q -r backend/requirements.txt
deactivate
ok "Dependencies updated"

echo ""
ok "Rebuild complete! Run ./start.sh to launch."
