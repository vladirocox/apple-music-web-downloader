# Apple Music Downloader + Web Manager

A complete Apple Music ALAC (lossless) downloader with a beautiful web interface for searching, downloading, and managing your music library. Styled like Apple Music itself.

> **⚠️ Important:** This tool downloads **ALAC audio only**. Music video downloads are **not supported** in this configuration.

## Features

- **Lossless ALAC Downloads** — Download songs and albums in Apple Lossless Audio Codec (up to 192kHz/24-bit Hi-Res)
- **Web Interface** — Beautiful Apple Music-styled SPA for searching, downloading, and managing your library
- **Search** — Search Apple Music's catalog directly from the web UI
- **Library Management** — Browse, play, and organize downloaded tracks with album art
- **One-Click Download** — Click download on any search result
- **Real-Time Progress** — Watch downloads progress in real-time
- **Full Metadata** — Lyrics, cover art, album info, track numbers — all embedded automatically
- **Template Decryption** — Fast local decryption (runv4) for maximum speed
- **Apple Music Login** — Authenticate directly from the web interface
- **ALAC Fix** — Automatically patches malformed ALAC packets when enabled

## Quick Start

### Prerequisites

- Linux (x86_64) — tested on Debian/Ubuntu/Fedora
- Go 1.23+
- Python 3.10+
- Node.js 18+ (for frontend build only)
- An active **Apple Music subscription**

### One-Command Install

```bash
git clone https://github.com/YOUR_USERNAME/apple-music-web.git
cd apple-music-web
chmod +x setup.sh
./setup.sh
```

### Launch

```bash
./start.sh
```

Open **http://localhost:8000** in your browser.

### First-Time Setup

1. Go to **Settings** in the web UI
2. Enter your **Apple ID** email and password → click **Start Wrapper**
3. (Optional) Paste your **Media User Token** for full feature access
4. Go to **Search** and start downloading music!

## How It Works

```
┌──────────────────────────────────────────┐
│           Web Browser (React)            │
│    Search │ Library │ Downloads │ Settings│
└──────────────────┬───────────────────────┘
                   │ HTTP
┌──────────────────┴───────────────────────┐
│          FastAPI Backend (Python)        │
│   Wraps Go CLI, manages Wrapper, serves  │
│   library files, handles authentication  │
└───────┬──────────────────┬───────────────┘
        │                  │
 ┌──────┴──────┐   ┌───────┴──────┐
 │  Go CLI     │   │   Wrapper    │
 │  (amd)      │   │  (Decryption)│
 │  Downloads  │   │  Ports:      │
 │  ALAC files │   │  10020-40020 │
 └──────┬──────┘   └──────────────┘
        │
 ┌──────┴──────┐
 │   MP4Box    │
 │   (GPAC)    │
 └─────────────┘
```

## Usage

### Web Interface

| Page | Description |
|------|-------------|
| **Search** | Search for songs, albums, artists on Apple Music. Click download to save. |
| **Library** | Browse all downloaded albums and tracks. Click to expand and play. |
| **Downloads** | View active and completed downloads with real-time progress. |
| **Settings** | Configure Wrapper, enter Apple ID, set download options. |

### Command Line (Advanced)

You can also use the Go CLI directly:

```bash
# Download a single song
./bin/amd --alac "https://music.apple.com/us/album/song-name/123456"

# Download an entire album
./bin/amd --alac "https://music.apple.com/us/album/album-name/123456"

# Download a playlist
./bin/amd --alac "https://music.apple.com/us/playlist/playlist-name/pl.123456"

# Search from CLI (interactive)
./bin/amd --search song "Artist Name"
```

## Configuration

Edit `config.yaml` or use the web interface Settings page.

### Key Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `alac-save-folder` | `~/Music/AppleMusic` | Where downloads are saved |
| `template-decrypt` | `true` | Use fast local decryption (recommended) |
| `alac-max` | `192000` | Maximum ALAC sample rate in Hz |
| `storefront` | `us` | Apple Music storefront/country code |
| `embed-lrc` | `true` | Embed lyrics in downloaded files |
| `embed-cover` | `true` | Embed album cover art |
| `cover-size` | `1200` | Cover art resolution in pixels |
| `proxy` | `""` | SOCKS5/HTTP proxy for restricted networks |

### Template Variables

Folder and file naming supports these variables:

| Variable | Description |
|----------|-------------|
| `{AlbumName}` | Album title |
| `{ArtistName}` | Artist name |
| `{SongNumer}` | Track number |
| `{SongName}` | Song title |
| `{Quality}` | Audio quality label |
| `{Codec}` | Codec name |

## Supported Formats

| Format | Quality | Notes |
|--------|---------|-------|
| **ALAC** | CD (16/44.1) to Hi-Res (24/192) | Primary format, lossless |
| **ALAC Fix** | Same | Patches malformed ALAC packets (enable with `alac-fix: true`) |

> **⚠️ Music Video Downloads:** This configuration does **NOT** support music video downloads. The underlying CLI supports MV downloads with additional setup (mp4decrypt, media-user-token), but this web interface is optimized for ALAC audio only.

## Wrapper (Decryption Engine)

The Wrapper is a required component that handles FairPlay/Apple DRM decryption. It runs as a local service using PRoot to emulate an Android environment with Apple's native decryption libraries.

### Ports

| Port | Purpose |
|------|---------|
| 10020 | Sample decryption (binary) — decrypts encrypted audio |
| 20020 | M3U8 stream URL (binary) — returns stream URLs |
| 30020 | Account info (HTTP/JSON) — music token, storefront |
| 40020 | Key service / template (HTTP/JSON) — decryption template |

### Running Wrapper

**Via Web UI (recommended):**
1. Go to Settings
2. Enter Apple ID credentials
3. Click "Start Wrapper"
4. If prompted, enter 2FA code

**Manually:**
```bash
cd wrapper
LD_LIBRARY_PATH=$(pwd)/rootfs/system/lib64 ./wrapper -L 'your@email.com:your_password'
```

Keep the terminal open while using Wrapper. Closing it stops all decryption services.

### Wrapper Safety

> ⚠️ Wrapper requires your Apple ID credentials. Only run it on a trusted computer. Do not share your password, 2FA code, or cached account information.

## Media User Token

Some features (lyrics, AAC-LC streams, device-quality M3U8) require a `media-user-token`. The Wrapper provides this automatically when running, but you can also obtain it manually:

1. Open [music.apple.com](https://music.apple.com) in your browser
2. Open Developer Tools (F12) → Network tab
3. Play any song
4. Look for requests to `amp-api.music.apple.com`
5. Find the `Authorization` header — the value after `Bearer ` is your token
6. Paste it in the web UI Settings page

## Proxy Setup

Apple blocks datacenter IPs. If you're running on a cloud server, you need a proxy:

```yaml
# config.yaml
proxy: "socks5://127.0.0.1:1080"
```

Recommended: [Cloudflare WARP](https://1.1.1.1/) (free, sets up a local SOCKS5 proxy).

## Project Structure

```
apple-music-web/
├── setup.sh              # One-command installer
├── start.sh              # Launch everything
├── rebuild.sh            # Rebuild after changes
├── config.yaml           # Configuration file
├── bin/
│   └── amd               # Go CLI binary
├── cli/                  # Go source (apple-music-downloader)
│   ├── main.go
│   ├── go.mod
│   └── utils/
├── wrapper/              # Wrapper decryption engine (runs natively)
│   ├── wrapper           # Wrapper binary
│   └── rootfs/           # Android libraries (LD_LIBRARY_PATH)
├── backend/
│   ├── app.py            # FastAPI application
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── index.css     # Apple Music-style CSS
│   │   └── pages/
│   │       ├── Search.tsx
│   │       ├── Library.tsx
│   │       ├── Downloads.tsx
│   │       └── Settings.tsx
│   ├── dist/             # Built frontend (served by FastAPI)
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

## Rebuilding

After making changes:

```bash
./rebuild.sh
```

Or manually:

```bash
# Rebuild Go CLI
cd cli && go build -o ../bin/amd main.go

# Rebuild frontend
cd frontend && npx vite build

# Update Python deps
source venv/bin/activate && pip install -r backend/requirements.txt
```

## Troubleshooting

### Wrapper won't start
- Make sure your Apple ID credentials are correct
- Check if ports 10020-40020 are already in use: `lsof -i :10020`
- If 2FA is enabled, check the terminal output for a verification code prompt
- Try running the wrapper manually to see detailed output

### Downloads fail
- Ensure the Wrapper is running (check Settings → System Status)
- Verify `MP4Box` is installed: `MP4Box -version`
- Check your Apple Music subscription is active
- Try a proxy if you're on a datacenter/cloud IP: `proxy: socks5://127.0.0.1:1080`
- Check that the download directory exists and is writable

### No search results
- Check your internet connection
- Try a different storefront in settings (e.g., `us`, `gb`, `jp`)
- The search may be rate-limited — wait a few seconds and retry
- Ensure the Apple Music token is valid (check Settings)

### Build errors
- Run `./rebuild.sh` to rebuild everything
- Ensure Go 1.23+, Python 3.10+, Node.js 18+ are installed
- Check versions: `go version`, `python3 --version`, `node --version`

### MP4Box not found
- The setup script builds it from source automatically
- Or install manually: `sudo apt install gpac` (if available) or build from [gpac.io](https://gpac.io)

## Credits

- [zhaarey/apple-music-downloader](https://github.com/zhaarey/apple-music-downloader) — The Go CLI that powers the downloads
- [WorldObservationLog/wrapper](https://github.com/WorldObservationLog/wrapper) — The decryption engine (FairPlay/Widevine)
- [GPAC/MP4Box](https://gpac.io) — MP4 processing and tagging
- Original decryption approach by "Sorrow"
- [AlecAivazis/survey](https://github.com/AlecAivazis/survey) — Interactive CLI prompts
- [go-mp4tag](https://github.com/zhaarey/go-mp4tag) — MP4 metadata writing

## License

This project is for educational purposes. Respect Apple's Terms of Service and copyright laws in your jurisdiction.

## Disclaimer

This software is provided as-is for educational and research purposes. The authors are not responsible for any misuse. Users are responsible for ensuring they have the right to download content. Always support artists by using legitimate services.
