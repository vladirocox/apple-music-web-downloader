import asyncio
import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path
from typing import Optional

import httpx
import yaml
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="Apple Music Downloader")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent.parent
CLI_BIN = BASE_DIR / "bin" / "amd"
WRAPPER_DIR = BASE_DIR / "wrapper"
CONFIG_PATH = BASE_DIR / "config.yaml"
DOWNLOAD_DIR = Path.home() / "Music" / "AppleMusic"
ACTIVE_DOWNLOADS: dict = {}
TOKEN_CACHE: dict = {"token": None, "expires": 0}

wrapper_process: Optional[subprocess.Popen] = None
wrapper_needs_2fa = False
wrapper_output_log: list[str] = []
WRAPPER_LOG_MAX = 500


class ConfigModel(BaseModel):
    alac_save_folder: str = str(DOWNLOAD_DIR)
    media_user_token: str = ""
    template_decrypt: bool = True
    key_server: str = "127.0.0.1:40020"
    decrypt_m3u8_port: str = "127.0.0.1:10020"
    get_m3u8_port: str = "127.0.0.1:20020"
    get_account_port: str = "127.0.0.1:30020"
    get_m3u8_from_device: bool = True
    alac_max: int = 192000
    cover_format: str = "png"
    cover_size: int = 1200
    storefront: str = "us"
    embed_lrc: bool = True
    save_lrc: bool = True
    embed_cover: bool = True
    save_cover: bool = True
    album_folder_format: str = "{AlbumName}"
    song_file_format: str = "{SongNumer}. {SongName}"
    proxy: str = ""
    auto_delete: bool = False


class AuthModel(BaseModel):
    username: str
    password: str


class TokenModel(BaseModel):
    media_user_token: str


class DownloadRequest(BaseModel):
    url: str
    format: str = "alac"  # alac, aac, atmos


class SearchRequest(BaseModel):
    query: str
    types: str = "songs,albums"
    limit: int = 25


class TwoFAModel(BaseModel):
    code: str


class DeleteRequest(BaseModel):
    path: str


def load_config() -> dict:
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH) as f:
            return yaml.safe_load(f) or {}
    return {}


def save_config(cfg: dict):
    with open(CONFIG_PATH, "w") as f:
        yaml.dump(cfg, f, default_flow_style=False, sort_keys=False)


def ensure_download_dir():
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)


def is_wrapper_running() -> bool:
    if wrapper_process is not None and wrapper_process.poll() is None:
        return True
    try:
        r = subprocess.run(
            ["pgrep", "-f", "wrapper/wrapper.*-H"],
            capture_output=True, timeout=3,
        )
        return r.returncode == 0
    except Exception:
        return False


def is_wrapper_ready() -> bool:
    if not is_wrapper_running():
        return False
    try:
        r = subprocess.run(
            ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}",
             "--connect-timeout", "2", "http://127.0.0.1:30020"],
            capture_output=True, timeout=5,
        )
        return r.stdout.decode().strip() == "200"
    except Exception:
        return False


async def get_apple_music_token() -> str:
    now = time.time()
    if TOKEN_CACHE["token"] and TOKEN_CACHE["expires"] > now:
        return TOKEN_CACHE["token"]
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(
                "https://music.apple.com/",
                headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"},
            )
            js_match = re.search(r'(/assets/index-[^"]+\.js)', resp.text)
            if js_match:
                js_resp = await client.get(f"https://music.apple.com{js_match.group(1)}")
                token_match = re.search(r'eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+', js_resp.text)
                if token_match:
                    TOKEN_CACHE["token"] = token_match.group(0)
                    TOKEN_CACHE["expires"] = now + 1800
                    return TOKEN_CACHE["token"]
    except Exception:
        pass
    cfg = load_config()
    return cfg.get("media-user-token", "")


@app.on_event("startup")
async def startup():
    ensure_download_dir()
    if not CONFIG_PATH.exists():
        save_config(ConfigModel().model_dump())


@app.get("/api/status")
async def get_status():
    return {
        "wrapper_running": is_wrapper_running(),
        "wrapper_ready": is_wrapper_ready(),
        "wrapper_needs_2fa": wrapper_needs_2fa,
        "cli_exists": CLI_BIN.exists(),
        "download_dir": str(DOWNLOAD_DIR),
        "config_exists": CONFIG_PATH.exists(),
    }


@app.get("/api/config")
async def get_config():
    cfg = load_config()
    if "media-user-token" in cfg:
        cfg["media_user_token"] = cfg.pop("media-user-token")
    return cfg


@app.post("/api/config")
async def update_config(config: ConfigModel):
    cfg = config.model_dump()
    mapping = {
        "alac_save_folder": "alac-save-folder",
        "media_user_token": "media-user-token",
        "template_decrypt": "template-decrypt",
        "key_server": "key-server",
        "decrypt_m3u8_port": "decrypt-m3u8-port",
        "get_m3u8_port": "get-m3u8-port",
        "get_account_port": "get-account-port",
        "get_m3u8_from_device": "get-m3u8-from-device",
        "alac_max": "alac-max",
        "cover_format": "cover-format",
        "cover_size": "cover-size",
        "embed_lrc": "embed-lrc",
        "save_lrc": "save-lrc",
        "embed_cover": "embed-cover",
        "save_cover": "save-cover",
        "album_folder_format": "album-folder-format",
        "song_file_format": "song-file-format",
    }
    out = {}
    for py_key, yaml_key in mapping.items():
        out[yaml_key] = cfg[py_key]
    out["proxy"] = cfg["proxy"]
    out["storefront"] = cfg["storefront"]
    out["auto-delete"] = cfg["auto_delete"]
    save_config(out)
    return {"ok": True}


@app.post("/api/auth/token")
async def set_token(model: TokenModel):
    cfg = load_config()
    cfg["media-user-token"] = model.media_user_token
    save_config(cfg)
    return {"ok": True}


@app.post("/api/auth/wrapper")
async def start_wrapper(auth: AuthModel):
    global wrapper_process, wrapper_needs_2fa, wrapper_output_log

    if is_wrapper_running():
        return {"ok": True, "message": "Wrapper already running"}

    wrapper_bin = WRAPPER_DIR / "wrapper"
    if not wrapper_bin.exists():
        raise HTTPException(404, "Wrapper binary not found")

    ld_path = str(WRAPPER_DIR / "rootfs" / "system" / "lib64")
    env = {**os.environ, "LD_LIBRARY_PATH": ld_path}

    try:
        wrapper_process = subprocess.Popen(
            [str(wrapper_bin), "-L", f"{auth.username}:{auth.password}", "-H", "127.0.0.1"],
            cwd=str(WRAPPER_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            stdin=subprocess.PIPE,
            env=env,
            bufsize=0,
        )
        wrapper_needs_2fa = False
        wrapper_output_log = []

        async def read_output():
            global wrapper_needs_2fa
            while wrapper_process and wrapper_process.poll() is None:
                try:
                    line = await asyncio.wait_for(
                        asyncio.get_event_loop().run_in_executor(
                            None, wrapper_process.stdout.readline
                        ),
                        timeout=2,
                    )
                except (asyncio.TimeoutError, ValueError):
                    continue
                if not line:
                    break
                text = line.decode(errors="replace").rstrip()
                wrapper_output_log.append(text)
                if len(wrapper_output_log) > WRAPPER_LOG_MAX:
                    wrapper_output_log.pop(0)

                if "2FA: true" in text or "2FA:true" in text:
                    wrapper_needs_2fa = True
                elif "listening" in text.lower() and "10020" in text:
                    wrapper_needs_2fa = False

        asyncio.create_task(read_output())
        await asyncio.sleep(1)

        return {
            "ok": True,
            "message": "Wrapper started — check status for 2FA",
            "needs_2fa": wrapper_needs_2fa,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/auth/wrapper/stop")
async def stop_wrapper():
    global wrapper_process, wrapper_needs_2fa
    if wrapper_process and wrapper_process.poll() is None:
        wrapper_process.terminate()
        try:
            wrapper_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            wrapper_process.kill()
        wrapper_process = None
        wrapper_needs_2fa = False
        return {"ok": True, "message": "Wrapper stopped"}
    wrapper_process = None
    wrapper_needs_2fa = False
    return {"ok": True, "message": "Wrapper not running"}


@app.post("/api/auth/wrapper/2fa")
async def submit_2fa(model: TwoFAModel):
    global wrapper_needs_2fa
    if not is_wrapper_running():
        raise HTTPException(400, "Wrapper is not running")
    try:
        wrapper_process.stdin.write(f"{model.code}\n".encode())
        wrapper_process.stdin.flush()
        wrapper_needs_2fa = False
        return {"ok": True, "message": "2FA code submitted"}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/api/auth/wrapper/logs")
async def wrapper_logs():
    return {"logs": "\n".join(wrapper_output_log[-100:])}


@app.post("/api/search")
async def search(req: SearchRequest):
    token = await get_apple_music_token()
    if not token:
        raise HTTPException(400, "No Apple Music token. Set media-user-token in settings.")

    cfg = load_config()
    storefront = cfg.get("storefront", "us")
    results = {"songs": [], "albums": [], "artists": []}

    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        for search_type in req.types.split(","):
            search_type = search_type.strip().lower()
            if search_type not in ("songs", "albums", "artists"):
                continue
            api_type = search_type
            try:
                resp = await client.get(
                    f"https://amp-api.music.apple.com/v1/catalog/{storefront}/search",
                    params={"term": req.query, "types": api_type, "limit": req.limit},
                    headers={
                        "Authorization": f"Bearer {token}",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                        "Origin": "https://music.apple.com",
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    results_block = data.get("results", {})
                    for rkey in (search_type,):
                        if rkey in results_block:
                            for item in results_block[rkey].get("data", []):
                                attrs = item.get("attributes", {})
                                artwork = attrs.get("artwork", {}).get("url", "")
                                if artwork:
                                    artwork = artwork.replace("{w}", "300").replace("{h}", "300")
                                results[search_type].append({
                                    "id": item.get("id", ""),
                                    "name": attrs.get("name", "Unknown"),
                                    "artist": attrs.get("artistName", ""),
                                    "album": attrs.get("albumName", ""),
                                    "url": attrs.get("url", ""),
                                    "artwork": artwork,
                                    "type": api_type,
                                })
            except Exception:
                continue
    return results


@app.post("/api/download")
async def download_track(req: DownloadRequest):
    ensure_download_dir()
    cmd = [str(CLI_BIN), "--song"]
    if req.format == "aac":
        cmd.append("--aac")
    elif req.format == "atmos":
        cmd.append("--atmos")
    cmd.append(req.url)
    download_id = f"dl_{int(time.time())}"
    ACTIVE_DOWNLOADS[download_id] = {"url": req.url, "status": "starting", "output": ""}

    async def run_download():
        try:
            ld_path = str(WRAPPER_DIR / "rootfs" / "system" / "lib64")
            env = {**os.environ, "LD_LIBRARY_PATH": ld_path}
            proc = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT, cwd=str(BASE_DIR / "cli"),
                env=env,
            )
            ACTIVE_DOWNLOADS[download_id]["pid"] = proc.pid
            ACTIVE_DOWNLOADS[download_id]["status"] = "running"
            while True:
                try:
                    line = await asyncio.wait_for(proc.stdout.readline(), timeout=300)
                except asyncio.TimeoutError:
                    break
                if not line:
                    break
                text = line.decode().rstrip()
                ACTIVE_DOWNLOADS[download_id]["output"] += text + "\n"
                tl = text.lower()
                if "downloading" in tl:
                    ACTIVE_DOWNLOADS[download_id]["status"] = "downloading"
                elif "decrypting" in tl:
                    ACTIVE_DOWNLOADS[download_id]["status"] = "decrypting"
                elif "completed" in tl or "saved" in tl or "decrypted" in tl:
                    ACTIVE_DOWNLOADS[download_id]["status"] = "completed"
            await proc.wait()
            if ACTIVE_DOWNLOADS[download_id]["status"] not in ("completed", "failed"):
                ACTIVE_DOWNLOADS[download_id]["status"] = (
                    "completed" if proc.returncode == 0 else "failed"
                )
        except Exception as e:
            ACTIVE_DOWNLOADS[download_id]["status"] = "failed"
            ACTIVE_DOWNLOADS[download_id]["output"] += f"\nError: {e}"

    asyncio.create_task(run_download())
    return {"ok": True, "download_id": download_id}


@app.get("/api/downloads")
async def list_downloads():
    return {"downloads": ACTIVE_DOWNLOADS}


@app.get("/api/library")
async def get_library():
    ensure_download_dir()
    albums = []
    try:
        for artist_dir in sorted(DOWNLOAD_DIR.iterdir()):
            if not artist_dir.is_dir():
                continue
            for album_dir in sorted(artist_dir.iterdir()):
                if not album_dir.is_dir():
                    continue
                tracks = []
                for f in sorted(album_dir.iterdir()):
                    if f.suffix.lower() in (".m4a", ".mp4", ".flac", ".mp3"):
                        stat = f.stat()
                        tracks.append({
                            "name": f.stem, "filename": f.name, "path": str(f),
                            "size": stat.st_size, "modified": stat.st_mtime,
                        })
                if tracks:
                    cover = None
                    for ext in ("png", "jpg", "jpeg", "webp"):
                        candidate = album_dir / f"cover.{ext}"
                        if candidate.exists():
                            cover = str(candidate)
                            break
                    albums.append({
                        "name": album_dir.name, "artist": artist_dir.name,
                        "path": str(album_dir),
                        "track_count": len(tracks), "tracks": tracks, "cover": cover,
                    })
    except FileNotFoundError:
        pass
    return {"albums": albums, "total_albums": len(albums)}


@app.get("/api/library/cover")
async def get_cover(path: str):
    p = Path(path)
    if not p.exists() or not p.parent.is_relative_to(DOWNLOAD_DIR):
        raise HTTPException(404, "Cover not found")
    media_type = "image/png"
    if p.suffix in (".jpg", ".jpeg"):
        media_type = "image/jpeg"
    elif p.suffix == ".webp":
        media_type = "image/webp"
    return FileResponse(p, media_type=media_type)


@app.get("/api/library/track")
async def serve_track(path: str):
    p = Path(path)
    if not p.exists() or not p.resolve().is_relative_to(DOWNLOAD_DIR.resolve()):
        raise HTTPException(404, "Track not found")
    return FileResponse(p, media_type="audio/mp4", headers={"Accept-Ranges": "bytes"})


@app.get("/api/stream")
async def stream_track(request: Request, path: str):
    p = Path(path)
    if not p.exists():
        raise HTTPException(404, "Track not found")
    if not p.resolve().is_relative_to(DOWNLOAD_DIR.resolve()):
        raise HTTPException(403, "Access denied")

    file_size = p.stat().st_size
    content_type = "audio/mp4"
    if p.suffix == ".flac":
        content_type = "audio/flac"
    elif p.suffix == ".mp3":
        content_type = "audio/mpeg"

    range_header = request.headers.get("range")
    if range_header:
        range_match = re.match(r"bytes=(\d+)-(\d*)", range_header)
        if range_match:
            start = int(range_match.group(1))
            end = int(range_match.group(2)) if range_match.group(2) else file_size - 1
            end = min(end, file_size - 1)
            chunk_size = end - start + 1

            def iter_file():
                with open(p, "rb") as f:
                    f.seek(start)
                    remaining = chunk_size
                    while remaining > 0:
                        read_size = min(remaining, 1024 * 1024)
                        data = f.read(read_size)
                        if not data:
                            break
                        remaining -= len(data)
                        yield data

            return StreamingResponse(
                iter_file(),
                status_code=206,
                media_type=content_type,
                headers={
                    "Content-Range": f"bytes {start}-{end}/{file_size}",
                    "Accept-Ranges": "bytes",
                    "Content-Length": str(chunk_size),
                },
            )

    def iter_file():
        with open(p, "rb") as f:
            while True:
                data = f.read(1024 * 1024)
                if not data:
                    break
                yield data

    return StreamingResponse(
        iter_file(),
        media_type=content_type,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
        },
    )


@app.get("/api/download-file")
async def download_file(path: str):
    p = Path(path)
    if not p.exists():
        raise HTTPException(404, "File not found")
    if not p.resolve().is_relative_to(DOWNLOAD_DIR.resolve()):
        raise HTTPException(403, "Access denied")
    return FileResponse(
        p,
        media_type="application/octet-stream",
        filename=p.name,
    )


@app.post("/api/delete")
async def delete_track(req: DeleteRequest):
    p = Path(req.path)
    if not p.exists():
        raise HTTPException(404, "File not found")
    if not p.resolve().is_relative_to(DOWNLOAD_DIR.resolve()):
        raise HTTPException(403, "Cannot delete outside download directory")

    try:
        if p.is_file():
            p.unlink()
            album_dir = p.parent
            if not any(album_dir.iterdir()):
                album_dir.rmdir()
                artist_dir = album_dir.parent
                if not any(artist_dir.iterdir()):
                    artist_dir.rmdir()
        elif p.is_dir():
            shutil.rmtree(p)
        return {"ok": True, "message": "Deleted"}
    except Exception as e:
        raise HTTPException(500, str(e))


FRONTEND_DIR = BASE_DIR / "frontend" / "dist"
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
