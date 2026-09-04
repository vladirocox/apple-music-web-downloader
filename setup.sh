#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${CYAN}"
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║   Apple Music Downloader - Setup              ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo -e "${NC}"

# ── Detect Architecture ──────────────────────────────────────────────────────

ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64)  ARCH_NAME="x86_64" ;;
  aarch64|arm64) ARCH_NAME="arm64" ;;
  *)             err "Unsupported architecture: $ARCH"; exit 1 ;;
esac
info "Detected architecture: $ARCH_NAME"

# ── Check / Install System Dependencies ──────────────────────────────────────

info "Checking system dependencies..."

check_cmd() {
  command -v "$1" &>/dev/null
}

install_if_missing() {
  local cmd="$1" pkg="$2"
  if check_cmd "$cmd"; then
    ok "$cmd found"
  else
    warn "$cmd not found, installing $pkg..."
    if check_cmd apt; then
      sudo apt-get update -qq && sudo apt-get install -y -qq "$pkg"
    elif check_cmd dnf; then
      sudo dnf install -y "$pkg"
    elif check_cmd pacman; then
      sudo pacman -S --noconfirm "$pkg"
    elif check_cmd brew; then
      brew install "$pkg"
    else
      err "Cannot auto-install $pkg. Please install it manually."
      exit 1
    fi
  fi
}

install_if_missing curl curl
install_if_missing git git
install_if_missing unzip unzip

# Go
if check_cmd go; then
  ok "Go found: $(go version 2>&1)"
else
  warn "Go not found, installing..."
  if check_cmd apt; then
    sudo apt-get install -y -qq golang
  elif check_cmd dnf; then
    sudo dnf install -y golang
  elif check_cmd pacman; then
    sudo pacman -S --noconfirm go
  elif check_cmd brew; then
    brew install go
  else
    err "Go is required. Install from https://go.dev/dl/"
    exit 1
  fi
  ok "Go installed: $(go version 2>&1)"
fi

# MP4Box (GPAC)
if check_cmd MP4Box; then
  ok "MP4Box found"
else
  warn "MP4Box not found, building from source (this may take a few minutes)..."
  TMPDIR_BUILD=$(mktemp -d)
  git clone --depth 1 https://github.com/gpac/gpac.git "$TMPDIR_BUILD/gpac" 2>/dev/null
  cd "$TMPDIR_BUILD/gpac"
  ./configure --static-build --disable-jpeg --disable-png --disable-faad --disable-ffmpeg 2>/dev/null
  make -j"$(nproc)" 2>/dev/null
  sudo make install 2>/dev/null
  cd "$SCRIPT_DIR"
  rm -rf "$TMPDIR_BUILD"
  ok "MP4Box installed"
fi

# ffmpeg (optional)
if check_cmd ffmpeg; then
  ok "ffmpeg found"
else
  warn "ffmpeg not found (optional, for audio conversion). Installing..."
  install_if_missing ffmpeg ffmpeg || true
fi

# Python 3
if check_cmd python3; then
  ok "Python3 found: $(python3 --version 2>&1)"
else
  err "Python3 is required but not found."
  exit 1
fi

# python3-venv
if ! python3 -c "import venv" 2>/dev/null; then
  warn "python3-venv not found, installing..."
  sudo apt-get install -y python3-venv 2>/dev/null || sudo dnf install -y python3-virtualenv 2>/dev/null || true
fi

# Node.js
if check_cmd node; then
  ok "Node.js found: $(node --version 2>&1)"
else
  warn "Node.js not found, installing..."
  if check_cmd apt; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - 2>/dev/null
    sudo apt-get install -y -qq nodejs
  elif check_cmd dnf; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash - 2>/dev/null
    sudo dnf install -y nodejs
  elif check_cmd brew; then
    brew install node
  else
    err "Node.js is required. Install from https://nodejs.org/"
    exit 1
  fi
  ok "Node.js installed: $(node --version 2>&1)"
fi

# ── Build Go CLI ─────────────────────────────────────────────────────────────

info "Building Apple Music Downloader CLI..."

if [ ! -d "cli" ]; then
  info "Cloning apple-music-downloader..."
  git clone https://github.com/zhaarey/apple-music-downloader.git cli 2>&1
fi

mkdir -p bin
cd cli
go build -o ../bin/amd main.go
cd "$SCRIPT_DIR"
ok "CLI binary built: bin/amd"

# ── Download Wrapper ─────────────────────────────────────────────────────────

info "Setting up Wrapper (decryption engine)..."

WRAPPER_ZIP_URL="https://github.com/WorldObservationLog/wrapper/releases/download/wrapper.${ARCH_NAME}.latest/Wrapper.${ARCH_NAME}.latest.zip"

if [ ! -f "wrapper/wrapper" ] || [ ! -d "wrapper/rootfs" ]; then
  info "Downloading Wrapper for ${ARCH_NAME}..."
  mkdir -p wrapper
  TMPDIR_WRAP=$(mktemp -d)

  if ! curl -fL "$WRAPPER_ZIP_URL" -o "$TMPDIR_WRAP/wrapper.zip" 2>/dev/null; then
    err "Failed to download Wrapper. Check your internet connection."
    rm -rf "$TMPDIR_WRAP"
    exit 1
  fi

  info "Extracting Wrapper..."
  unzip -o "$TMPDIR_WRAP/wrapper.zip" -d wrapper/ >/dev/null 2>&1
  chmod +x wrapper/wrapper 2>/dev/null || true

  rm -rf "$TMPDIR_WRAP"
  ok "Wrapper downloaded and extracted"
else
  ok "Wrapper already present"
fi

# Verify wrapper
if [ ! -f "wrapper/wrapper" ]; then
  err "Wrapper binary not found after extraction!"
  exit 1
fi
if [ ! -d "wrapper/rootfs" ]; then
  err "Wrapper rootfs not found after extraction!"
  exit 1
fi

# ── Setup Python Backend ─────────────────────────────────────────────────────

info "Setting up Python backend..."

if [ ! -d "venv" ]; then
  python3 -m venv venv
fi
source venv/bin/activate
pip install -q --upgrade pip
pip install -q -r backend/requirements.txt
deactivate
ok "Python backend ready"

# ── Setup Frontend ───────────────────────────────────────────────────────────

info "Setting up frontend..."

cd frontend
if [ ! -d "node_modules" ]; then
  npm install --silent 2>/dev/null
fi
npx vite build 2>/dev/null
cd "$SCRIPT_DIR"
ok "Frontend built"

# ── Create Default Config ────────────────────────────────────────────────────

if [ ! -f "config.yaml" ]; then
  cat > config.yaml << 'YAML'
alac-save-folder: ~/Music/AppleMusic
media-user-token: ""
template-decrypt: true
key-server: 127.0.0.1:40020
decrypt-m3u8-port: 127.0.0.1:10020
get-m3u8-port: 127.0.0.1:20020
get-account-port: 127.0.0.1:30020
get-m3u8-from-device: true
alac-max: 192000
cover-format: png
cover-size: 1200
storefront: us
embed-lrc: false
save-lrc: false
embed-cover: true
save-cover: true
album-folder-format: "{AlbumName}"
song-file-format: "{SongNumer}. {SongName}"
proxy: ""
YAML
  ok "Default config.yaml created"
fi

# ── Create Download Directory ────────────────────────────────────────────────

mkdir -p ~/Music/AppleMusic
ok "Download directory ready: ~/Music/AppleMusic"

# ── Make Scripts Executable ──────────────────────────────────────────────────

chmod +x start.sh run-server.sh rebuild.sh 2>/dev/null || true

# ── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Setup complete!${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}Next steps:${NC}"
echo "    1. Start the app:     ./start.sh"
echo "    2. Open in browser:   http://localhost:8000"
echo "    3. Go to Settings → enter your Apple ID → start the Wrapper"
echo "    4. Search and download music!"
echo ""
echo -e "  ${BOLD}Notes:${NC}"
echo "    - First download requires 2FA verification from Apple"
echo "    - Lossless (ALAC) is the default format — no extra config needed"
echo "    - AAC and Atmos formats are also available in the search page"
echo ""
