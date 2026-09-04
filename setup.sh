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
echo "  ║   Apple Music Downloader - Setup          ║"
echo "  ╚═══════════════════════════════════════════╝"
echo -e "${NC}"

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
      sudo apt install -y "$pkg"
    elif check_cmd dnf; then
      sudo dnf install -y "$pkg"
    elif check_cmd pacman; then
      sudo pacman -S --noconfirm "$pkg"
    else
      err "Cannot auto-install $pkg. Please install it manually."
      exit 1
    fi
  fi
}

install_if_missing curl curl
install_if_missing unzip unzip
install_if_missing go golang

# MP4Box (GPAC)
if check_cmd MP4Box; then
  ok "MP4Box found"
else
  warn "MP4Box not found, building from source..."
  TMPDIR=$(mktemp -d)
  git clone --depth 1 https://github.com/gpac/gpac.git "$TMPDIR/gpac" 2>/dev/null
  cd "$TMPDIR/gpac"
  ./configure --static-build --disable-jpeg --disable-png --disable-faad --disable-ffmpeg 2>/dev/null
  make -j"$(nproc)" 2>/dev/null
  sudo make install 2>/dev/null
  cd "$SCRIPT_DIR"
  rm -rf "$TMPDIR"
  ok "MP4Box installed"
fi

# ffmpeg (optional)
install_if_missing ffmpeg ffmpeg

# Python 3 + pip
if check_cmd python3; then
  ok "Python3 found: $(python3 --version 2>&1)"
else
  err "Python3 is required but not found."
  exit 1
fi

if ! python3 -c "import venv" 2>/dev/null; then
  warn "python3-venv not found, installing..."
  sudo apt install -y python3-venv 2>/dev/null || sudo dnf install -y python3-virtualenv 2>/dev/null || true
fi

# ── Build Go CLI ─────────────────────────────────────────────────────────────

info "Building Apple Music Downloader CLI..."

if [ ! -d "cli" ]; then
  info "Cloning apple-music-downloader..."
  git clone https://github.com/zhaarey/apple-music-downloader.git cli
fi

cd cli
go build -o ../bin/amd main.go
cd "$SCRIPT_DIR"
ok "CLI binary built: bin/amd"

# ── Download Wrapper ─────────────────────────────────────────────────────────

info "Setting up Wrapper (decryption engine)..."

if [ ! -f "wrapper/wrapper" ]; then
  info "Downloading Wrapper for x86_64..."
  mkdir -p wrapper
  cd wrapper
  curl -fL "https://github.com/WorldObservationLog/wrapper/releases/download/wrapper.x86_64.latest/Wrapper.x86_64.latest.zip" -o wrapper.zip
  unzip -o wrapper.zip
  chmod +x wrapper 2>/dev/null || true
  cd "$SCRIPT_DIR"
  ok "Wrapper downloaded"
else
  ok "Wrapper already present"
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

if [ ! -d "frontend/node_modules" ]; then
  cd frontend
  npm install --silent 2>/dev/null
  npx vite build 2>/dev/null
  cd "$SCRIPT_DIR"
fi
ok "Frontend built"

# ── Create Default Config ────────────────────────────────────────────────────

if [ ! -f "config.yaml" ]; then
  cat > config.yaml << 'YAML'
alac-save-folder: ~/Music/AppleMusic
atmos-save-folder: ~/Music/AppleMusic
aac-save-folder: ~/Music/AppleMusic
mv-save-folder: ~/Music/AppleMusic
media-user-token: ""
template-decrypt: true
key-server: 127.0.0.1:40020
decrypt-m3u8-port: 127.0.0.1:10020
get-m3u8-port: 127.0.0.1:20020
get-account-port: 127.0.0.1:30020
get-m3u8-from-device: true
get-m3u8-mode: all
alac-max: 192000
cover-format: png
cover-size: 1200
storefront: us
embed-lrc: true
save-lrc: true
save-lyrics-translate: false
save-lyrics-transliteration: false
lyrics-use-chinese-variant: false
lyrics-use-plain: false
embed-cover: true
save-cover: true
save-animated-artwork: false
emby-animated-artwork: false
tag-itunes-id: false
tag-sort-order: false
album-folder-format: "{AlbumName}"
song-file-format: "{SongNumer}. {SongName}"
proxy: ""
YAML
  ok "Default config.yaml created"
fi

# ── Create Download Directory ────────────────────────────────────────────────

mkdir -p ~/Music/AppleMusic
ok "Download directory ready: ~/Music/AppleMusic"

# ── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Setup complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo ""
echo "  Next steps:"
echo "    1. Start the app:  ./start.sh"
echo "    2. Open in browser: http://localhost:8000"
echo "    3. Go to Settings and enter your Apple ID to start the Wrapper"
echo ""
