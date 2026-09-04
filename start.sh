#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BACKEND_PID=""

cleanup() {
  echo ""
  info "Shutting down..."
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null
  ok "All services stopped"
  exit 0
}
trap cleanup SIGINT SIGTERM

# ── Preflight Checks ────────────────────────────────────────────────────────

if [ ! -f "bin/amd" ]; then
  err "CLI binary not found. Run ./setup.sh first."
  exit 1
fi

if [ ! -d "venv" ]; then
  err "Python venv not found. Run ./setup.sh first."
  exit 1
fi

if [ ! -f "wrapper/wrapper" ]; then
  err "Wrapper binary not found. Run ./setup.sh first."
  exit 1
fi

if [ ! -d "wrapper/rootfs" ]; then
  err "Wrapper rootfs not found. Run ./setup.sh first."
  exit 1
fi

if [ ! -d "frontend/dist" ]; then
  err "Frontend not built. Run ./setup.sh first."
  exit 1
fi

# ── Start Backend ────────────────────────────────────────────────────────────

info "Starting web server on http://localhost:8000 ..."
source venv/bin/activate
uvicorn backend.app:app --host 0.0.0.0 --port 8000 --log-level info &
BACKEND_PID=$!
deactivate

sleep 2

if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  err "Backend failed to start. Check the logs above."
  exit 1
fi

ok "Backend running (PID: $BACKEND_PID)"

echo ""
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Apple Music Downloader is running!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo ""
echo "  Open: http://localhost:8000"
echo ""
echo "  To start the Wrapper (required for downloads):"
echo "    Go to Settings → enter your Apple ID → click Start Wrapper"
echo ""
echo "  Press Ctrl+C to stop"
echo ""

wait "$BACKEND_PID"
