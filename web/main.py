"""
Musicola - reproductor personal de música de YouTube sin anuncios.

Backend FastAPI:
  GET /api/search?q=...      -> busca en YouTube (vía yt-dlp, sin API key)
  GET /api/stream/{video_id} -> proxy del audio con soporte de Range (permite avanzar/retroceder)
  GET /                      -> sirve la PWA (carpeta static/)
"""
import asyncio
import os
import re
import time
from contextlib import asynccontextmanager

import httpx
import yt_dlp
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from starlette.background import BackgroundTask

ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")

# m4a (AAC) primero: funciona en todos los navegadores, incluido Safari/iOS.
AUDIO_FORMAT = "bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/bestaudio"
URL_TTL = 60 * 60 * 3  # las URLs de googlevideo caducan a las ~6 h

# Protección opcional: si defines MUSICOLA_TOKEN, todas las peticiones a /api lo necesitan.
TOKEN = os.environ.get("MUSICOLA_TOKEN")

# Opcional: cookies de YouTube (formato Netscape/cookies.txt) en la variable YT_COOKIES.
# Ayudan cuando YouTube bloquea la IP del servidor ("Sign in to confirm you're not a bot").
# También se puede subir como "Secret File" en Render con el nombre cookies.txt
# (Render lo deja en /etc/secrets/cookies.txt). Se copia a /tmp porque yt-dlp
# necesita poder reescribir el archivo y /etc/secrets es de solo lectura.
COOKIE_FILE = None
_SECRET = "/etc/secrets/cookies.txt"
if os.path.exists(_SECRET) or os.environ.get("YT_COOKIES"):
    COOKIE_FILE = "/tmp/yt_cookies.txt"
    if os.path.exists(_SECRET):
        with open(_SECRET) as src:
            data = src.read()
    else:
        data = os.environ["YT_COOKIES"].replace("\\n", "\n")
    with open(COOKIE_FILE, "w") as f:
        f.write(data)


def _ydl_opts(**extra) -> dict:
    opts = {"quiet": True, "no_warnings": True, "skip_download": True, "noplaylist": True, **extra}
    if COOKIE_FILE:
        opts["cookiefile"] = COOKIE_FILE
    return opts

_url_cache: dict[str, tuple[float, dict]] = {}
_search_cache: dict[str, tuple[float, list]] = {}


# ---------- yt-dlp (bloqueante, se ejecuta en hilos) ----------

def _search_sync(q: str, n: int) -> list[dict]:
    with yt_dlp.YoutubeDL(_ydl_opts(extract_flat=True)) as ydl:
        res = ydl.extract_info(f"ytsearch{n}:{q}", download=False)
    out = []
    for e in res.get("entries") or []:
        vid = (e or {}).get("id")
        if not vid or not ID_RE.match(vid):
            continue
        out.append({
            "id": vid,
            "title": e.get("title") or "Sin título",
            "channel": e.get("channel") or e.get("uploader") or "",
            "duration": e.get("duration"),
            "thumb": f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg",
        })
    return out


def _radio_sync(vid: str, n: int) -> list[dict]:
    """Canciones parecidas: el "Mix" de YouTube Music para ese tema (o el Mix normal como reserva)."""
    for list_id in (f"RDAMVM{vid}", f"RD{vid}"):
        url = f"https://www.youtube.com/watch?v={vid}&list={list_id}"
        try:
            with yt_dlp.YoutubeDL(_ydl_opts(extract_flat=True, noplaylist=False, playlistend=n + 1)) as ydl:
                res = ydl.extract_info(url, download=False)
        except yt_dlp.utils.DownloadError:
            continue
        out = []
        for e in res.get("entries") or []:
            eid = (e or {}).get("id")
            if not eid or eid == vid or not ID_RE.match(eid):
                continue
            out.append({
                "id": eid,
                "title": e.get("title") or "Sin título",
                "channel": e.get("channel") or e.get("uploader") or "",
                "duration": e.get("duration"),
                "thumb": f"https://i.ytimg.com/vi/{eid}/mqdefault.jpg",
            })
        if out:
            return out[:n]
    return []


# ---- Atajo rápido ----
# El cliente "visionos" de YouTube no exige resolver el reto JavaScript (lo más lento en el
# plan gratuito). No admite cookies, así que si YouTube lo bloquea se usa el método normal.
# Se puede desactivar con la variable FAST_CLIENT=0.
FAST_CLIENT = os.environ.get("FAST_CLIENT", "1") != "0"
FAST_CLIENTS = ["visionos"]
_fast_failures = 0          # fallos seguidos del atajo
_fast_paused_until = 0.0    # tras varios fallos seguidos, se deja de intentar un rato


def _extract_audio(vid: str, use_cookies: bool, clients: list[str] | None) -> dict:
    yt_args = {"skip": ["hls", "dash", "translated_subs"]}
    if clients:
        yt_args["player_client"] = clients
    opts = _ydl_opts(format=AUDIO_FORMAT, extractor_args={"youtube": yt_args})
    if not use_cookies:
        opts.pop("cookiefile", None)
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(f"https://www.youtube.com/watch?v={vid}", download=False)
    return {
        "url": info["url"],
        "headers": info.get("http_headers") or {},
        "mime": "audio/mp4" if info.get("ext") == "m4a" else f"audio/{info.get('ext', 'webm')}",
    }


def _resolve_sync(vid: str) -> dict:
    global _fast_failures, _fast_paused_until
    if FAST_CLIENT and time.time() >= _fast_paused_until:
        t0 = time.time()
        try:
            data = _extract_audio(vid, use_cookies=False, clients=FAST_CLIENTS)
            _fast_failures = 0
            print(f"[musicola] {vid}: atajo OK en {time.time() - t0:.1f}s", flush=True)
            return data
        except Exception as e:
            _fast_failures += 1
            msg = str(e).splitlines()[0][:150]
            print(f"[musicola] {vid}: atajo falló en {time.time() - t0:.1f}s ({msg})", flush=True)
            if _fast_failures >= 3:
                _fast_paused_until = time.time() + 30 * 60
                _fast_failures = 0
                print("[musicola] atajo en pausa 30 min tras 3 fallos seguidos", flush=True)
    # Método normal: clientes por defecto de yt-dlp + cookies (si las hay)
    return _extract_audio(vid, use_cookies=True, clients=None)


_inflight: dict[str, asyncio.Future] = {}


async def resolve(vid: str, force: bool = False) -> dict:
    now = time.time()
    hit = _url_cache.get(vid)
    if hit and not force and hit[0] > now:
        return hit[1]
    # Si ya se está resolviendo (p. ej. por la precarga), se espera a esa misma tarea
    # en vez de lanzar otra: en el plan gratuito la CPU es muy escasa.
    fut = _inflight.get(vid)
    if fut is None or force:
        fut = asyncio.ensure_future(_resolve_timed(vid))
        _inflight[vid] = fut
        fut.add_done_callback(lambda f, v=vid: _inflight.pop(v) if _inflight.get(v) is f else None)
    try:
        data = await asyncio.shield(fut)
    except yt_dlp.utils.DownloadError as e:
        raise HTTPException(502, f"No se pudo obtener el audio: {e}") from e
    _url_cache[vid] = (time.time() + URL_TTL, data)
    return data


async def _resolve_timed(vid: str) -> dict:
    t0 = time.time()
    try:
        return await asyncio.to_thread(_resolve_sync, vid)
    finally:
        print(f"[musicola] {vid} resuelto en {time.time() - t0:.1f}s", flush=True)


# ---------- App ----------

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http = httpx.AsyncClient(timeout=httpx.Timeout(30, read=60), follow_redirects=True)
    tasks = [asyncio.create_task(_warm_up())]
    if KEEP_ALIVE_URL:
        tasks.append(asyncio.create_task(_keep_alive(app.state.http)))
    yield
    for t in tasks:
        t.cancel()
    await app.state.http.aclose()


# En Render, el servicio gratuito se duerme tras 15 min sin visitas y tarda ~1 min en despertar.
# Si KEEP_ALIVE no es "0", el propio servidor se visita cada 10 min para no dormirse.
# (Un solo servicio despierto todo el mes cabe en las 750 h gratuitas de Render.)
KEEP_ALIVE_URL = None
if os.environ.get("KEEP_ALIVE", "1") != "0" and os.environ.get("RENDER_EXTERNAL_URL"):
    KEEP_ALIVE_URL = os.environ["RENDER_EXTERNAL_URL"].rstrip("/") + "/healthz"


async def _keep_alive(client: httpx.AsyncClient):
    while True:
        await asyncio.sleep(600)
        try:
            await client.get(KEEP_ALIVE_URL, timeout=20)
        except Exception:
            pass


async def _warm_up():
    """Al arrancar, resuelve un vídeo cualquiera para que yt-dlp descargue y deje en caché
    el reproductor de YouTube y su reto JavaScript: así la primera canción real va más rápida."""
    await asyncio.sleep(2)
    try:
        await asyncio.to_thread(_resolve_sync, "jNQXAC9IVRw")
    except Exception as e:
        print(f"[musicola] calentamiento fallido: {e}", flush=True)


app = FastAPI(title="Musicola", lifespan=lifespan)


@app.middleware("http")
async def token_guard(request: Request, call_next):
    if TOKEN and request.url.path.startswith("/api/"):
        given = request.query_params.get("t") or request.headers.get("x-token")
        if given != TOKEN:
            return JSONResponse({"detail": "Token incorrecto"}, status_code=401)
    return await call_next(request)


@app.get("/api/search")
async def search(q: str = Query(..., min_length=1, max_length=200), n: int = Query(20, ge=1, le=40)):
    key = f"{n}:{q.strip().lower()}"
    hit = _search_cache.get(key)
    if hit and hit[0] > time.time():
        return hit[1]
    try:
        results = await asyncio.to_thread(_search_sync, q, n)
    except yt_dlp.utils.DownloadError as e:
        raise HTTPException(502, f"Error buscando: {e}") from e
    _search_cache[key] = (time.time() + 600, results)
    return results


_radio_cache: dict[str, tuple[float, list]] = {}


@app.get("/api/radio/{vid}")
async def radio(vid: str, n: int = Query(25, ge=1, le=50)):
    if not ID_RE.match(vid):
        raise HTTPException(400, "ID no válido")
    hit = _radio_cache.get(vid)
    if hit and hit[0] > time.time():
        return hit[1][:n]
    results = await asyncio.to_thread(_radio_sync, vid, n)
    if results:
        _radio_cache[vid] = (time.time() + 1800, results)
    return results


PASS_HEADERS = ("content-length", "content-range", "accept-ranges", "last-modified", "etag")


@app.get("/api/stream/{vid}")
async def stream(vid: str, request: Request):
    if not ID_RE.match(vid):
        raise HTTPException(400, "ID no válido")

    client: httpx.AsyncClient = request.app.state.http
    rng = request.headers.get("range")

    for attempt in range(2):
        info = await resolve(vid, force=attempt > 0)
        headers = dict(info["headers"])
        if rng:
            headers["Range"] = rng
        upstream = await client.send(client.build_request("GET", info["url"], headers=headers), stream=True)
        if upstream.status_code in (403, 410) and attempt == 0:
            await upstream.aclose()  # URL caducada: la volvemos a pedir
            continue
        break

    if upstream.status_code >= 400:
        await upstream.aclose()
        raise HTTPException(502, f"YouTube respondió {upstream.status_code}")

    out_headers = {k: upstream.headers[k] for k in PASS_HEADERS if k in upstream.headers}
    out_headers.setdefault("accept-ranges", "bytes")
    out_headers["cache-control"] = "no-store"
    return StreamingResponse(
        upstream.aiter_bytes(64 * 1024),
        status_code=upstream.status_code,
        media_type=info["mime"],
        headers=out_headers,
        background=BackgroundTask(upstream.aclose),
    )


@app.get("/api/prefetch/{vid}")
async def prefetch(vid: str):
    """Resuelve la URL del audio por adelantado (para que la siguiente canción empiece al instante)."""
    if not ID_RE.match(vid):
        raise HTTPException(400, "ID no válido")
    asyncio.create_task(_safe_resolve(vid))
    return {"ok": True}


async def _safe_resolve(vid: str):
    try:
        await resolve(vid)
    except Exception:
        pass


@app.get("/healthz")
async def healthz():
    return {
        "ok": True,
        "cookies": bool(COOKIE_FILE),
        "atajo": FAST_CLIENT and time.time() >= _fast_paused_until,
    }


@app.get("/")
async def index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


@app.get("/sw.js")
async def service_worker():
    # El service worker debe servirse desde la raíz para controlar toda la app.
    return FileResponse(os.path.join(STATIC_DIR, "sw.js"), media_type="application/javascript")


app.mount("/", StaticFiles(directory=STATIC_DIR), name="static")
