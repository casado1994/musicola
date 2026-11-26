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
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from starlette.background import BackgroundTask

ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")

# m4a (AAC) primero: funciona en todos los navegadores, incluido Safari/iOS.
AUDIO_FORMAT = "bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/bestaudio"
URL_TTL = 60 * 60 * 3  # las URLs de googlevideo caducan a las ~6 h

# Protección opcional: si defines MUSICOLA_TOKEN, todas las peticiones a /api lo necesitan.
TOKEN = os.environ.get("MUSICOLA_TOKEN")

# ---- Cookies de YouTube (formato Netscape / cookies.txt) ----
# Ayudan cuando YouTube bloquea la IP del servidor ("Sign in to confirm you're not a bot").
# yt-dlp reescribe el archivo con las cookies que YouTube va renovando, así que debe ser
# un archivo escribible. Si existe la carpeta /data (disco permanente, p. ej. un volumen en
# Northflank), se guarda ahí y las renovaciones sobreviven a los reinicios.
# Formas de darlas (de más a menos prioritaria):
#   1. Página /cookies de la propia web (las guarda en el archivo de trabajo).
#   2. Archivo ya guardado en /data/cookies.txt de una vez anterior.
#   3. Secret File "cookies.txt" (Render: /etc/secrets/cookies.txt) o variable YT_COOKIES.
DATA_DIR = os.environ.get("DATA_DIR", "/data")
PERSISTENT = os.path.isdir(DATA_DIR) and os.access(DATA_DIR, os.W_OK)
WORK_COOKIES = os.path.join(DATA_DIR, "cookies.txt") if PERSISTENT else "/tmp/yt_cookies.txt"
_SECRET = "/etc/secrets/cookies.txt"
COOKIE_FILE = None


def _looks_like_cookies(text: str) -> bool:
    return "youtube.com" in text and "\t" in text


def _set_cookies(text: str):
    """Guarda unas cookies nuevas como archivo de trabajo y las activa."""
    global COOKIE_FILE
    text = text.replace("\r\n", "\n")
    if not text.startswith("# Netscape HTTP Cookie File"):
        text = "# Netscape HTTP Cookie File\n" + text
    with open(WORK_COOKIES, "w") as f:
        f.write(text if text.endswith("\n") else text + "\n")
    COOKIE_FILE = WORK_COOKIES


def _init_cookies():
    global COOKIE_FILE
    # 2. Ya hay cookies guardadas (y quizá renovadas) en el disco permanente: se usan tal cual
    if PERSISTENT and os.path.exists(WORK_COOKIES) and os.path.getsize(WORK_COOKIES) > 0:
        COOKIE_FILE = WORK_COOKIES
        return
    # 3. Secret File o variable de entorno: se copian al archivo de trabajo
    data = ""
    if os.path.exists(_SECRET) and os.path.getsize(_SECRET) > 0:
        with open(_SECRET) as src:
            data = src.read()
    elif os.environ.get("YT_COOKIES"):
        data = os.environ["YT_COOKIES"].replace("\\n", "\n")
    if data.strip():
        _set_cookies(data)


_init_cookies()


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


# ---- Estrategias para obtener el audio ----
# Se prueban en orden; la primera que funciona gana. Si una falla 3 veces seguidas,
# se salta durante 30 minutos para no hacer esperar en balde.
#
#  1. "token": cliente mweb + PO Token generado por bgutil-pot (servidor local en Rust,
#     arrancado por start.sh). Pensado para saltarse "Sign in to confirm you're not a bot"
#     SIN cookies. Se desactiva con POT=0.
#  2. "atajo": cliente visionos, sin reto JavaScript ni cookies (rápido, pero YouTube suele
#     bloquearlo desde centros de datos). Por defecto solo si no hay cookies. FAST_CLIENT=0/1.
#  3. "cookies": clientes por defecto de yt-dlp con las cookies (si las hay). Siempre al final.
POT_URL = "http://127.0.0.1:4416"
POT_ENABLED = os.environ.get("POT", "1") != "0" and os.path.exists("/usr/local/bin/bgutil-pot")
FAST_CLIENT = os.environ.get("FAST_CLIENT", "0" if COOKIE_FILE else "1") != "0"


class Strategy:
    def __init__(self, name: str, use_cookies: bool, clients: list[str] | None, enabled: bool):
        self.name, self.use_cookies, self.clients, self.enabled = name, use_cookies, clients, enabled
        self.failures = 0
        self.paused_until = 0.0
        self.ok = 0
        self.total_s = 0.0
        self.last_error = ""
        self.last_ok = 0.0  # última vez que funcionó: la más reciente se prueba primero

    def available(self) -> bool:
        return self.enabled and time.time() >= self.paused_until


STRATEGIES = [
    Strategy("token", use_cookies=False, clients=["mweb"], enabled=POT_ENABLED),
    Strategy("atajo", use_cookies=False, clients=["visionos"], enabled=FAST_CLIENT),
]
FALLBACK = Strategy("cookies", use_cookies=True, clients=None, enabled=True)


def _extract_audio(vid: str, use_cookies: bool, clients: list[str] | None) -> dict:
    yt_args = {"skip": ["hls", "dash", "translated_subs"]}
    if clients:
        yt_args["player_client"] = clients
    extractor_args = {"youtube": yt_args}
    if POT_ENABLED:
        extractor_args["youtubepot-bgutilhttp"] = {"base_url": [POT_URL]}
    opts = _ydl_opts(format=AUDIO_FORMAT, extractor_args=extractor_args)
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
    # Primero la vía que funcionó más recientemente (sin perder tiempo en las que fallan)
    for st in sorted(STRATEGIES, key=lambda x: -x.last_ok):
        if not st.available():
            continue
        t0 = time.time()
        try:
            data = _extract_audio(vid, st.use_cookies, st.clients)
            st.failures = 0
            st.ok += 1
            st.total_s += time.time() - t0
            st.last_ok = time.time()
            print(f"[musicola] {vid}: '{st.name}' OK en {time.time() - t0:.1f}s", flush=True)
            return data
        except Exception as e:
            st.failures += 1
            st.last_error = str(e).splitlines()[0][:160]
            msg = str(e).splitlines()[0][:150]
            print(f"[musicola] {vid}: '{st.name}' falló en {time.time() - t0:.1f}s ({msg})", flush=True)
            if st.failures >= 3:
                st.paused_until = time.time() + 30 * 60
                st.failures = 0
                print(f"[musicola] '{st.name}' en pausa 30 min tras 3 fallos seguidos", flush=True)
    t0 = time.time()
    data = _extract_audio(vid, FALLBACK.use_cookies, FALLBACK.clients)
    FALLBACK.ok += 1
    FALLBACK.total_s += time.time() - t0
    print(f"[musicola] {vid}: 'cookies' OK en {time.time() - t0:.1f}s", flush=True)
    return data


_inflight: dict[str, asyncio.Future] = {}


# ---- Vía rápida (la misma que la extensión de Chrome) ----
# UNA petición directa al reproductor de YouTube con un cliente que no necesita JavaScript,
# sin pasar por yt-dlp (que además descarga la página del vídeo). Muy ligera en CPU.
# Si falla (p. ej. YouTube pide cuenta), se usa la cadena de yt-dlp de siempre.
# Datos de los clientes copiados de yt-dlp (yt_dlp/extractor/youtube/_base.py).
FAST_DIRECT = os.environ.get("FAST_DIRECT", "1") != "0"
DIRECT_CLIENTS = [
    {
        "key": "visionos", "name": "VISIONOS", "id": 101, "version": "1.02",
        "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
        "ctx": {"deviceMake": "Apple", "deviceModel": "RealityDevice17,1", "osName": "visionOS", "osVersion": "26.5.23O471"},
    },
    {
        "key": "android_vr", "name": "ANDROID_VR", "id": 28, "version": "1.65.10",
        "ua": "com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
        "ctx": {"deviceMake": "Oculus", "deviceModel": "Quest 3", "androidSdkVersion": 32, "osName": "Android", "osVersion": "12L"},
    },
]
DIRECT = Strategy("rapida", use_cookies=False, clients=None, enabled=FAST_DIRECT)
_direct_http: httpx.AsyncClient | None = None


_visitor = {"data": None, "exp": 0.0}


async def _visitor_data(refresh: bool = False) -> str | None:
    """Identificador de visitante de YouTube (como hace yt-dlp al visitar la página antes de pedir el audio)."""
    if not refresh and _visitor["data"] and _visitor["exp"] > time.time():
        return _visitor["data"]
    try:
        r = await _direct_http.get("https://www.youtube.com/", timeout=10,
                                   headers={"User-Agent": DESKTOP_UA, "Accept-Language": "es-ES,es;q=0.9"})
        m = re.search(r'"VISITOR_DATA":"([^"]+)"', r.text) or re.search(r'"visitorData":"([^"]+)"', r.text)
        if m:
            _visitor.update(data=m.group(1), exp=time.time() + 6 * 3600)
            return m.group(1)
    except Exception as e:
        print(f"[musicola] no se pudo obtener visitorData: {e}", flush=True)
    return _visitor["data"]


async def _direct_player(vid: str, c: dict) -> dict:
    visitor = await _visitor_data()
    client_ctx = {"clientName": c["name"], "clientVersion": c["version"], "hl": "es", "gl": "ES", **c["ctx"]}
    if visitor:
        client_ctx["visitorData"] = visitor
    body = {
        "context": {"client": client_ctx},
        "videoId": vid, "contentCheckOk": True, "racyCheckOk": True,
        "playbackContext": {"contentPlaybackContext": {"html5Preference": "HTML5_PREF_WANTS"}},
    }
    headers = {
        "User-Agent": c["ua"], "X-YouTube-Client-Name": str(c["id"]),
        "X-YouTube-Client-Version": c["version"], "Origin": "https://www.youtube.com",
    }
    if visitor:
        headers["X-Goog-Visitor-Id"] = visitor
    r = await _direct_http.post("https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
                                json=body, headers=headers, timeout=15)
    if r.status_code != 200:
        raise RuntimeError(f"YouTube respondió {r.status_code}")
    j = r.json()
    st = j.get("playabilityStatus") or {}
    if st.get("status") != "OK":
        raise RuntimeError(st.get("reason") or st.get("status") or "vídeo no reproducible")
    fmts = [f for f in (j.get("streamingData") or {}).get("adaptiveFormats") or []
            if str(f.get("mimeType", "")).startswith("audio/") and f.get("url")]
    if not fmts:
        raise RuntimeError("sin audio disponible")
    pool = [f for f in fmts if not f.get("audioTrack") or f["audioTrack"].get("audioIsDefault")] or fmts
    mp4 = [f for f in pool if f["mimeType"].startswith("audio/mp4")]
    best = max(mp4 or pool, key=lambda f: f.get("bitrate") or 0)
    return {"url": best["url"], "headers": {"User-Agent": c["ua"]}, "mime": best["mimeType"].split(";")[0]}


async def _resolve_direct(vid: str) -> dict:
    last = None
    for c in list(DIRECT_CLIENTS):
        try:
            data = await _direct_player(vid, c)
            if DIRECT_CLIENTS[0] is not c:  # el que funcionó pasa a ser el primero
                DIRECT_CLIENTS.remove(c)
                DIRECT_CLIENTS.insert(0, c)
            return data
        except Exception as e:
            last = e
    raise RuntimeError(str(last))


# ---- Búsqueda y radio directas (igual que la extensión: extension/yt.js) ----
WEB_CLIENT = {"name": "WEB", "id": 1, "version": "2.20260708.00.00"}
MUSIC_CLIENT = {"name": "WEB_REMIX", "id": 67, "version": "1.20260707.12.00"}
DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"


async def _innertube(host: str, endpoint: str, client: dict, body: dict) -> dict:
    payload = {"context": {"client": {"clientName": client["name"], "clientVersion": client["version"],
                                      "hl": "es", "gl": "ES"}}, **body}
    origin = f"https://{host}"
    r = await _direct_http.post(
        f"https://{host}/youtubei/v1/{endpoint}?prettyPrint=false", json=payload, timeout=15,
        headers={"User-Agent": DESKTOP_UA, "X-YouTube-Client-Name": str(client["id"]),
                 "X-YouTube-Client-Version": client["version"], "Origin": origin, "Referer": origin + "/"})
    if r.status_code != 200:
        raise RuntimeError(f"YouTube respondió {r.status_code}")
    return r.json()


def _walk(o, fn):
    if isinstance(o, list):
        for x in o:
            _walk(x, fn)
    elif isinstance(o, dict):
        fn(o)
        for v in o.values():
            _walk(v, fn)


def _text(x) -> str:
    if not x:
        return ""
    if isinstance(x, str):
        return x
    return x.get("simpleText") or x.get("content") or "".join(r.get("text", "") for r in x.get("runs") or [])


def _secs(s):
    if not s or not re.fullmatch(r"\d+(:\d{2}){1,2}", s):
        return None
    t = 0
    for p in s.split(":"):
        t = t * 60 + int(p)
    return t


def _track(vid, title, channel, duration):
    return {"id": vid, "title": title or "Sin título", "channel": channel or "", "duration": duration,
            "thumb": f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg"}


def _dedupe(items):
    seen, out = set(), []
    for t in items:
        if t["id"] not in seen and ID_RE.match(t["id"]):
            seen.add(t["id"])
            out.append(t)
    return out


async def _direct_search(q: str) -> list[dict]:
    out = []
    # 1) Filtro "Canciones" de YouTube Music
    try:
        j = await _innertube("music.youtube.com", "search", MUSIC_CLIENT,
                             {"query": q, "params": "EgWKAQIIAWoMEA4QChADEAQQCRAF"})

        def song(o):
            r = o.get("musicResponsiveListItemRenderer")
            if not r:
                return
            vid = (r.get("playlistItemData") or {}).get("videoId")
            if not vid:
                found = []
                _walk(r, lambda x: found.append(x["watchEndpoint"]["videoId"])
                      if isinstance(x.get("watchEndpoint"), dict) and x["watchEndpoint"].get("videoId") else None)
                vid = found[0] if found else None
            if not vid:
                return
            cols = [[run.get("text", "") for run in
                     ((c.get("musicResponsiveListItemFlexColumnRenderer") or {}).get("text") or {}).get("runs") or []]
                    for c in r.get("flexColumns") or []]
            title = "".join(cols[0]) if cols else ""
            sub = [x for x in (cols[1] if len(cols) > 1 else []) if x.strip() and x.strip() != "•"]
            dur = next((x for x in reversed(sub) if _secs(x) is not None), None)
            artist = (sub[1] if len(sub) > 1 else "") if sub and sub[0] in ("Canción", "Song", "Vídeo", "Video") \
                else (sub[0] if sub else "")
            out.append(_track(vid, title, artist, _secs(dur)))

        _walk(j, song)
    except Exception as e:
        print(f"[musicola] búsqueda de canciones falló: {e}", flush=True)
    # 2) Reserva: vídeos de YouTube normal
    if not out:
        j = await _innertube("www.youtube.com", "search", WEB_CLIENT, {"query": q, "params": "EgIQAQ=="})

        def video(o):
            v = o.get("videoRenderer")
            if v and v.get("videoId"):
                out.append(_track(v["videoId"], _text(v.get("title")),
                                  _text(v.get("ownerText") or v.get("longBylineText")), _secs(_text(v.get("lengthText")))))

        _walk(j, video)
    return _dedupe(out)


def _panel(j: dict, seed: str) -> list[dict]:
    out = []

    def item(o):
        v = o.get("playlistPanelVideoRenderer")
        if v and v.get("videoId") and v["videoId"] != seed:
            by = (v.get("shortBylineText") or v.get("longBylineText") or {}).get("runs") or [{}]
            out.append(_track(v["videoId"], _text(v.get("title")), by[0].get("text", ""), _secs(_text(v.get("lengthText")))))

    _walk(j, item)
    return _dedupe(out)


async def _direct_radio(vid: str) -> list[dict]:
    try:
        j = await _innertube("music.youtube.com", "next", MUSIC_CLIENT,
                             {"videoId": vid, "playlistId": "RDAMVM" + vid, "isAudioOnly": True})
        res = _panel(j, vid)
        if res:
            return res
    except Exception as e:
        print(f"[musicola] radio (Music) falló: {e}", flush=True)
    j = await _innertube("www.youtube.com", "next", WEB_CLIENT, {"videoId": vid, "playlistId": "RD" + vid})
    return _panel(j, vid)


_VIDEO_ERRORS = ("edad", "age", "privad", "private", "no está disponible", "unavailable",
                 "not available", "eliminado", "removed", "copyright", "miembros", "members", "en directo", "live")


def _video_specific(msg: str) -> bool:
    m = msg.lower()
    return any(k in m for k in _VIDEO_ERRORS)


async def _resolve_any(vid: str) -> dict:
    if DIRECT.available() and _direct_http is not None:
        t0 = time.time()
        try:
            data = await _resolve_direct(vid)
            DIRECT.failures = 0
            DIRECT.ok += 1
            DIRECT.total_s += time.time() - t0
            DIRECT.last_ok = time.time()
            print(f"[musicola] {vid}: 'rapida' OK en {time.time() - t0:.1f}s", flush=True)
            return data
        except Exception as e:
            DIRECT.last_error = str(e)[:160]
            if _video_specific(str(e)):
                # Problema de ESE vídeo (edad, privado...): no dice nada de la vía rápida
                print(f"[musicola] {vid}: 'rapida' no sirve para este vídeo ({str(e)[:100]})", flush=True)
                return await _resolve_timed(vid)
            DIRECT.failures += 1
            print(f"[musicola] {vid}: 'rapida' falló en {time.time() - t0:.1f}s ({str(e)[:150]})", flush=True)
            _visitor["exp"] = 0  # la próxima vez, identificador de visitante nuevo
            if DIRECT.failures >= 3:
                DIRECT.paused_until = time.time() + 30 * 60
                DIRECT.failures = 0
                print("[musicola] 'rapida' en pausa 30 min tras 3 fallos seguidos", flush=True)
    return await _resolve_timed(vid)  # reserva: yt-dlp


async def resolve(vid: str, force: bool = False) -> dict:
    now = time.time()
    hit = _url_cache.get(vid)
    if hit and not force and hit[0] > now:
        return hit[1]
    # Si ya se está resolviendo (p. ej. por la precarga), se espera a esa misma tarea
    # en vez de lanzar otra: en el plan gratuito la CPU es muy escasa.
    fut = _inflight.get(vid)
    if fut is None or force:
        fut = asyncio.ensure_future(_resolve_any(vid))
        _inflight[vid] = fut
        fut.add_done_callback(lambda f, v=vid: _inflight.pop(v) if _inflight.get(v) is f else None)
    try:
        data = await asyncio.shield(fut)
    except yt_dlp.utils.DownloadError as e:
        raise HTTPException(502, f"No se pudo obtener el audio: {e}") from e
    _url_cache[vid] = (time.time() + URL_TTL, data)
    _trim(_url_cache, 300)
    return data


def _trim(cache: dict, max_items: int):
    """Evita que las cachés crezcan sin límite (borra las entradas más antiguas)."""
    while len(cache) > max_items:
        cache.pop(next(iter(cache)))


# Solo una extracción a la vez: cada una puede arrancar Deno (JavaScript), que consume
# mucha memoria, y el plan gratuito de Render solo tiene 512 MB.
def _mem_limit_mb() -> int | None:
    try:
        with open("/sys/fs/cgroup/memory.max") as f:
            v = f.read().strip()
        return None if v == "max" else int(v) // 1048576
    except Exception:
        return None


# Con 1 GB o más se preparan 2 canciones a la vez (se puede fijar con EXTRACT_PARALLEL)
_lim = _mem_limit_mb()
EXTRACT_PARALLEL = int(os.environ.get("EXTRACT_PARALLEL", "2" if (_lim or 0) >= 900 else "1"))
_extract_lock = asyncio.Semaphore(EXTRACT_PARALLEL)


async def _resolve_timed(vid: str) -> dict:
    async with _extract_lock:
        t0 = time.time()
        try:
            return await asyncio.to_thread(_resolve_sync, vid)
        finally:
            print(f"[musicola] {vid} resuelto en {time.time() - t0:.1f}s", flush=True)


# ---------- App ----------

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _direct_http
    app.state.http = httpx.AsyncClient(timeout=httpx.Timeout(30, read=60), follow_redirects=True)
    _direct_http = httpx.AsyncClient(http2=False, follow_redirects=True)
    tasks = [asyncio.create_task(_warm_up()), asyncio.create_task(_prefetch_worker())]
    if KEEP_ALIVE_URL:
        tasks.append(asyncio.create_task(_keep_alive(app.state.http)))
    yield
    for t in tasks:
        t.cancel()
    await app.state.http.aclose()
    await _direct_http.aclose()


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
    if DIRECT.available():
        try:
            await _resolve_direct("jNQXAC9IVRw")
            print("[musicola] vía rápida disponible: no hace falta calentar yt-dlp", flush=True)
            return
        except Exception as e:
            print(f"[musicola] vía rápida no disponible al arrancar ({str(e)[:100]})", flush=True)
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
    results = []
    if FAST_DIRECT and _direct_http is not None:
        try:
            results = (await _direct_search(q))[:n]  # como la extensión: directo a YouTube Music
        except Exception as e:
            print(f"[musicola] búsqueda directa falló, uso yt-dlp: {e}", flush=True)
    if not results:
        try:
            results = await asyncio.to_thread(_search_sync, q, n)
        except yt_dlp.utils.DownloadError as e:
            raise HTTPException(502, f"Error buscando: {e}") from e
    _search_cache[key] = (time.time() + 600, results)
    _trim(_search_cache, 100)
    return results


_radio_cache: dict[str, tuple[float, list]] = {}


@app.get("/api/radio/{vid}")
async def radio(vid: str, n: int = Query(25, ge=1, le=50)):
    if not ID_RE.match(vid):
        raise HTTPException(400, "ID no válido")
    hit = _radio_cache.get(vid)
    if hit and hit[0] > time.time():
        return hit[1][:n]
    results = []
    if FAST_DIRECT and _direct_http is not None:
        try:
            results = (await _direct_radio(vid))[:n]
        except Exception as e:
            print(f"[musicola] radio directa falló, uso yt-dlp: {e}", flush=True)
    if not results:
        results = await asyncio.to_thread(_radio_sync, vid, n)
    if results:
        _radio_cache[vid] = (time.time() + 1800, results)
        _trim(_radio_cache, 100)
    return results


PASS_HEADERS = ("content-length", "content-range", "accept-ranges", "last-modified", "etag")
CHUNK = 64 * 1024


# ---- Almacén de audio en el servidor (como Spotify) ----
# Cada canción se guarda como un archivo con sus primeros N bytes seguidos (de 0 en adelante).
#  - La precarga guarda los primeros ~512 KB (~30 s): al pulsar, el servidor los envía al
#    instante y pide el resto a YouTube mientras tanto.
#  - Al escuchar una canción entera, queda guardada completa: la próxima vez no se pide a YouTube.
# Límite: AUDIO_CACHE_MB (300 por defecto); al llenarse se borra lo escuchado hace más tiempo.
class AudioStore:
    def __init__(self, folder: str, max_bytes: int):
        self.dir = folder
        self.max = max_bytes
        self.meta: dict[str, dict] = {}   # id -> {"total": int, "mime": str, "used": float}
        self.writing: set[str] = set()    # ids con una escritura en curso (solo una a la vez)
        try:
            os.makedirs(folder, exist_ok=True)
            for f in os.listdir(folder):  # empieza limpio: sin metadatos no sabemos qué hay
                os.remove(os.path.join(folder, f))
            self.enabled = True
        except OSError:
            self.enabled = False

    def path(self, vid: str) -> str:
        return os.path.join(self.dir, vid)

    def have(self, vid: str) -> int:
        """Bytes seguidos guardados desde el principio."""
        try:
            return os.path.getsize(self.path(vid)) if vid in self.meta else 0
        except OSError:
            return 0

    def info(self, vid: str):
        m = self.meta.get(vid)
        if m:
            m["used"] = time.time()
        return m

    def remember(self, vid: str, total: int | None, mime: str):
        if total:
            m = self.meta.setdefault(vid, {"total": total, "mime": mime, "used": time.time()})
            m["total"], m["mime"] = total, mime

    def forget(self, vid: str):
        self.meta.pop(vid, None)
        try:
            os.remove(self.path(vid))
        except OSError:
            pass

    def size(self) -> int:
        return sum(self.have(v) for v in list(self.meta))

    def evict(self):
        total = self.size()
        for vid in sorted(self.meta, key=lambda v: self.meta[v]["used"]):
            if total <= self.max:
                break
            if vid in self.writing:
                continue
            total -= self.have(vid)
            self.forget(vid)


AUDIO = AudioStore(os.environ.get("AUDIO_CACHE_DIR", "/tmp/musicola-audio"),
                   int(os.environ.get("AUDIO_CACHE_MB", "300")) * 1024 * 1024)
PREFETCH_BYTES = 512 * 1024  # ~3 fragmentos de 10 s: lo que Safari (HLS) descarga antes de empezar


def _parse_range(h: str | None):
    m = re.fullmatch(r"bytes=(\d+)-(\d*)", (h or "").strip())
    if not m:
        return 0, None
    return int(m.group(1)), (int(m.group(2)) if m.group(2) else None)


async def _open_upstream(client: httpx.AsyncClient, vid: str, start: int, end: int | None):
    """Abre la descarga desde YouTube a partir de 'start' (reintenta una vez si la URL caducó)."""
    for attempt in range(2):
        info = await resolve(vid, force=attempt > 0)
        headers = dict(info["headers"])
        headers["Range"] = f"bytes={start}-{'' if end is None else end}"
        up = await client.send(client.build_request("GET", info["url"], headers=headers), stream=True)
        if up.status_code in (403, 410) and attempt == 0:
            await up.aclose()
            continue
        if up.status_code >= 400:
            await up.aclose()
            raise HTTPException(502, f"YouTube respondió {up.status_code}")
        total = None
        cr = up.headers.get("content-range", "")
        if "/" in cr and cr.rsplit("/", 1)[1].isdigit():
            total = int(cr.rsplit("/", 1)[1])
        elif up.status_code == 200 and up.headers.get("content-length", "").isdigit():
            total = int(up.headers["content-length"])
        AUDIO.remember(vid, total, info["mime"])
        return up, info, total
    raise HTTPException(502, "No se pudo abrir el audio")


async def _relay(up: httpx.Response, vid: str, offset: int, limit: int | None):
    """Reenvía bytes de YouTube y, si continúan justo donde acaba lo guardado, los guarda también."""
    write = (AUDIO.enabled and vid in AUDIO.meta and vid not in AUDIO.writing
             and offset == AUDIO.have(vid))
    f = None
    if write:
        AUDIO.writing.add(vid)
        f = open(AUDIO.path(vid), "ab")
    sent = 0
    try:
        async for chunk in up.aiter_bytes(CHUNK):
            if limit is not None and sent + len(chunk) > limit:
                chunk = chunk[: limit - sent]
            if f:
                f.write(chunk)
                f.flush()  # visible al momento para quien esté leyendo el archivo a la vez
            sent += len(chunk)
            yield chunk
            if limit is not None and sent >= limit:
                break
    finally:
        if f:
            f.close()
            AUDIO.writing.discard(vid)
            AUDIO.evict()
        await up.aclose()


def _read_file(vid: str, start: int, end_excl: int):
    with open(AUDIO.path(vid), "rb") as f:
        f.seek(start)
        left = end_excl - start
        while left > 0:
            data = f.read(min(CHUNK, left))
            if not data:
                break
            left -= len(data)
            yield data


# ---- HLS para Safari ----
# El audio de YouTube viene troceado en fragmentos (MP4 fragmentado). Chrome lo reproduce
# directamente, pero Safari recorre TODOS los fragmentos antes de empezar (unos 6 s).
# Solución: dar a Safari una lista HLS (su formato nativo) que dice dónde está cada fragmento,
# sacada del índice "sidx" que YouTube pone al principio del archivo. Así Safari pide el
# primer fragmento y empieza a sonar, sin recorrer nada.
import struct
import mp4split


def _mp4_index(head: bytes):
    """Devuelve (fin_de_cabecera, [(offset, tamaño, segundos), ...]) a partir del índice sidx."""
    i, init_end = 0, None
    while i + 8 <= len(head):
        size, typ = struct.unpack(">I4s", head[i:i + 8])
        if size == 1 and i + 16 <= len(head):
            size = struct.unpack(">Q", head[i + 8:i + 16])[0]
        if size < 8:
            return None
        if typ == b"sidx":
            if i + size > len(head):
                return None
            init_end = init_end or i
            b = head[i + 8:i + size]
            version = b[0]
            timescale = struct.unpack(">I", b[8:12])[0]
            if version == 0:
                first_offset = struct.unpack(">I", b[16:20])[0]
                p = 20
            else:
                first_offset = struct.unpack(">Q", b[20:28])[0]
                p = 28
            count = struct.unpack(">H", b[p + 2:p + 4])[0]
            p += 4
            offset = i + size + first_offset
            segs = []
            for _ in range(count):
                ref, dur = struct.unpack(">II", b[p:p + 8])
                p += 12
                if ref >> 31:  # referencia a otro índice: no soportado
                    return None
                length = ref & 0x7FFFFFFF
                segs.append((offset, length, dur / timescale))
                offset += length
            return init_end, segs
        if typ == b"moof":
            return None  # fragmentos sin índice previo
        if typ in (b"ftyp", b"moov", b"free", b"styp"):
            pass
        i += size
    return None


_hls_cache: dict[str, list] = {}


def _hls_parts(vid: str, init_end: int, segs: list):
    """Trozos de ~2 s del primer fragmento (o None si no se puede: se usa el fragmento entero)."""
    if vid in _hls_cache:
        return _hls_cache[vid]
    parts = None
    off, length, _ = segs[0]
    if AUDIO.have(vid) >= off + length:
        try:
            with open(AUDIO.path(vid), "rb") as f:
                buf = f.read(off + length)
            res = mp4split.split_first_fragment(buf, init_end, off, length, 2.0)
            parts = res[0] if res else None
        except Exception as e:
            print(f"[musicola] no se pudo trocear {vid}: {e}", flush=True)
    _hls_cache[vid] = parts
    _trim(_hls_cache, 60)
    return parts


@app.get("/api/hls/{vid}/p{n}.m4s")
async def hls_part(vid: str, n: int):
    if not ID_RE.match(vid):
        raise HTTPException(400, "ID no válido")
    parts = _hls_cache.get(vid)
    if not parts or not (0 <= n < len(parts)):
        raise HTTPException(404, "Trozo no disponible")
    return Response(parts[n][0], media_type="audio/mp4", headers={"cache-control": "no-store"})


@app.get("/api/hls/{vid}.m3u8")
async def hls_playlist(vid: str, request: Request):
    if not ID_RE.match(vid):
        raise HTTPException(400, "ID no válido")
    if AUDIO.have(vid) < 16384:
        await _prefetch_audio(vid)  # la cabecera y el índice están en los primeros KB
        for _ in range(200):  # por si otra precarga lo está escribiendo
            if AUDIO.have(vid) >= 16384 or vid not in AUDIO.writing:
                break
            await asyncio.sleep(0.02)
    have = AUDIO.have(vid)
    if have < 1024:
        raise HTTPException(502, "No se pudo obtener el audio")
    with open(AUDIO.path(vid), "rb") as f:
        head = f.read(min(have, PREFETCH_BYTES))
    idx = _mp4_index(head)
    if not idx:
        raise HTTPException(415, "Este audio no tiene índice: se usa la reproducción normal")
    init_end, segs = idx
    tok = request.query_params.get("t")
    q = f"?t={tok}" if tok else ""
    uri = f"/api/stream/{vid}" + q
    # El primer fragmento (~10 s) se trocea en partes de ~2 s: Safari arranca bajando menos datos
    parts = _hls_parts(vid, init_end, segs)
    lines = [
        "#EXTM3U", "#EXT-X-VERSION:7",
        f"#EXT-X-TARGETDURATION:{max(1, int(max(d for _, _, d in segs) + 0.999))}",
        "#EXT-X-PLAYLIST-TYPE:VOD", "#EXT-X-INDEPENDENT-SEGMENTS",
        f'#EXT-X-MAP:URI="{uri}",BYTERANGE="{init_end}@0"',
    ]
    rest = segs
    if parts:
        for n, (_, dur) in enumerate(parts):
            lines += [f"#EXTINF:{dur:.3f},", f"/api/hls/{vid}/p{n}.m4s{q}"]
        rest = segs[1:]
    for off, length, dur in rest:
        lines += [f"#EXTINF:{dur:.3f},", f"#EXT-X-BYTERANGE:{length}@{off}", uri]
    lines.append("#EXT-X-ENDLIST")
    return Response("\n".join(lines) + "\n", media_type="application/vnd.apple.mpegurl",
                    headers={"cache-control": "no-store"})


# ---- Diagnóstico: qué piden los navegadores y cuánto tarda (página /debug) ----
import collections
_debug_server = collections.deque(maxlen=80)
_debug_client = collections.deque(maxlen=40)


def _browser_name(ua: str) -> str:
    if "iPhone" in ua or "iPad" in ua:
        return "Chrome iPhone" if "CriOS" in ua else "Safari iPhone"
    if "Android" in ua:
        return "Android"
    if "Edg/" in ua:
        return "Edge"
    if "Chrome/" in ua:
        return "Chrome"
    if "Safari/" in ua:
        return "Safari Mac"
    return ua[:30]


def _traced(gen, entry: dict, t0: float):
    async def wrapped():
        n = 0
        try:
            async for chunk in gen:
                if n == 0:
                    entry["primer_byte_ms"] = round((time.time() - t0) * 1000)
                n += len(chunk)
                yield chunk
        finally:
            entry["kb_enviados"] = n // 1024
            entry["total_ms"] = round((time.time() - t0) * 1000)
    return wrapped()


@app.get("/api/stream/{vid}")
async def stream(vid: str, request: Request):
    if not ID_RE.match(vid):
        raise HTTPException(400, "ID no válido")
    client: httpx.AsyncClient = request.app.state.http
    start, end = _parse_range(request.headers.get("range"))
    t0 = time.time()
    entry = {"hora": time.strftime("%H:%M:%S"), "video": vid,
             "navegador": _browser_name(request.headers.get("user-agent", "")),
             "rango": request.headers.get("range", "(todo)"), "guardado_kb": AUDIO.have(vid) // 1024}
    _debug_server.appendleft(entry)
    # Si piden el principio de una canción no guardada, se guardan primero sus primeros segundos
    # y se contesta desde ahí. Safari (iPhone) y otros navegadores móviles piden el audio en
    # varias peticiones seguidas (primero 2 bytes, luego el resto): así solo la primera va a
    # YouTube y las demás salen al instante del almacén.
    if AUDIO.enabled and start < PREFETCH_BYTES and AUDIO.have(vid) <= start:
        # Se lanza la precarga (si no estaba en marcha) y se responde en cuanto llega el
        # primer trozo, sin esperar a los 256 KB enteros: el resto se envía según llega.
        task = None
        if vid not in AUDIO.writing:
            task = asyncio.create_task(_prefetch_audio(vid))
        for _ in range(300):  # hasta 15 s
            if AUDIO.have(vid) > start or (task and task.done()):
                break
            if not task and vid not in AUDIO.writing:
                break
            await asyncio.sleep(0.02)

    meta = AUDIO.info(vid)
    have = AUDIO.have(vid)

    # 1) Lo pedido empieza dentro de lo guardado: se envía al instante y el resto, de YouTube
    if meta and start < have:
        total = meta["total"]
        last = total - 1 if end is None else min(end, total - 1)
        headers = {"content-range": f"bytes {start}-{last}/{total}", "accept-ranges": "bytes",
                   "content-length": str(last - start + 1), "cache-control": "no-store"}

        async def body():
            pos = start
            # Lo guardado, siguiendo el archivo mientras la precarga lo va llenando
            while pos <= last:
                avail = min(AUDIO.have(vid), last + 1)
                if avail > pos:
                    for chunk in _read_file(vid, pos, avail):
                        yield chunk
                    pos = avail
                    continue
                if vid not in AUDIO.writing:
                    break
                await asyncio.sleep(0.02)
            from_file_end = pos
            if from_file_end <= last:  # falta el resto: se pide a YouTube desde donde acaba lo guardado
                up, _, _ = await _open_upstream(client, vid, from_file_end, last)
                async for chunk in _relay(up, vid, from_file_end, last - from_file_end + 1):
                    yield chunk

        entry["origen"] = "almacén" + (" + YouTube" if have <= last else "")
        entry["espera_ms"] = round((time.time() - t0) * 1000)
        return StreamingResponse(_traced(body(), entry, t0), status_code=206, media_type=meta["mime"], headers=headers)

    # 2) Nada guardado en ese punto: directo de YouTube (guardando si continúa lo que ya hay)
    up, info, total = await _open_upstream(client, vid, start, end)
    out_headers = {k: up.headers[k] for k in PASS_HEADERS if k in up.headers}
    out_headers.setdefault("accept-ranges", "bytes")
    out_headers["cache-control"] = "no-store"
    entry["origen"] = "YouTube"
    entry["espera_ms"] = round((time.time() - t0) * 1000)
    return StreamingResponse(_traced(_relay(up, vid, start, None), entry, t0), status_code=up.status_code,
                             media_type=info["mime"], headers=out_headers)


async def _prefetch_audio(vid: str):
    """Guarda en el servidor los primeros segundos de audio de una canción."""
    if not AUDIO.enabled or AUDIO.have(vid) >= PREFETCH_BYTES or vid in AUDIO.writing:
        return
    try:
        have = AUDIO.have(vid)
        up, _, _ = await _open_upstream(app.state.http, vid, have, PREFETCH_BYTES - 1)
        async for _ in _relay(up, vid, have, PREFETCH_BYTES - have):
            pass
    except Exception as e:
        print(f"[musicola] precarga de audio de {vid} falló: {str(e)[:120]}", flush=True)


@app.get("/api/prefetch/{vid}")
async def prefetch(vid: str, audio: int = 0):
    """Resuelve la URL del audio por adelantado (para que la siguiente canción empiece al instante)."""
    if not ID_RE.match(vid):
        raise HTTPException(400, "ID no válido")
    # La precarga nunca compite con lo que el usuario está escuchando:
    # si ya hay una extracción en marcha (o ya está en caché), no hace nada.
    busy = _extract_lock.locked() and not DIRECT.available()  # la vía rápida apenas consume
    if busy:
        return {"ok": True, "skipped": True}
    if audio:  # además de la URL, los primeros segundos de audio
        asyncio.create_task(_prefetch_audio(vid))
        return {"ok": True, "audio": True}
    hit = _url_cache.get(vid)
    if (hit and hit[0] > time.time()) or vid in _inflight:
        return {"ok": True, "skipped": True}
    asyncio.create_task(_safe_resolve(vid))
    return {"ok": True}


# ---- Cola de precarga (como Spotify: prepara todo lo que tienes a la vista) ----
# Se procesa de una en una, así lo que el usuario pulsa nunca espera detrás de muchas
# precargas (como mucho, detrás de la que está en curso). Lo último pedido va primero.
_pending: list[str] = []
_pending_event = asyncio.Event()
MAX_PENDING = 12


def _enqueue_prefetch(ids: list[str]):
    ids = [v for v in ids if ID_RE.match(v) and AUDIO.have(v) < PREFETCH_BYTES]
    rest = [v for v in _pending if v not in ids]
    _pending[:] = (ids + rest)[:MAX_PENDING]
    if _pending:
        _pending_event.set()


def _youtube_blocking() -> bool:
    """¿YouTube nos está pidiendo "demostrar que no somos un bot"? Entonces no hay que insistir."""
    errs = [st.last_error.lower() for st in [DIRECT, *STRATEGIES] if st.last_error]
    vias_ok = DIRECT.available() or any(st.available() for st in STRATEGIES)
    return (not vias_ok) and any("bot" in e for e in errs)


async def _prefetch_worker():
    while True:
        await _pending_event.wait()
        while _pending:
            if _youtube_blocking():
                # YouTube nos ha bloqueado: se descartan las precargas para no empeorarlo
                _pending.clear()
                break
            vid = _pending.pop(0)
            if AUDIO.have(vid) >= PREFETCH_BYTES or vid in AUDIO.writing:
                continue
            await _prefetch_audio(vid)
            # Ritmo prudente: muchas peticiones seguidas desde una IP hacen que YouTube nos tome por bot
            await asyncio.sleep(1.0)
        _pending_event.clear()


@app.get("/api/prefetch_many")
async def prefetch_many(ids: str = Query(..., max_length=2000)):
    """Precarga los primeros segundos de varias canciones, en el orden recibido."""
    _enqueue_prefetch([v for v in ids.split(",") if v][:MAX_PENDING])
    return {"ok": True, "pendientes": len(_pending)}


async def _safe_resolve(vid: str):
    try:
        await resolve(vid)
    except Exception:
        pass


COOKIES_PAGE = """<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Musicola · Cookies</title>
<style>body{font:15px system-ui,sans-serif;background:#0f0f12;color:#ececf1;max-width:720px;margin:0 auto;padding:20px}
textarea,input{width:100%;box-sizing:border-box;background:#18181d;color:#ececf1;border:1px solid #2a2a31;border-radius:8px;padding:10px;font:12px monospace}
textarea{height:300px}button{margin-top:12px;background:#ff4d6d;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:15px}
p{color:#8b8b96}#r{margin-top:12px}a{color:#ff4d6d}</style></head><body>
<h2>Actualizar cookies de YouTube</h2>
<p>Exporta las cookies en una ventana de incógnito (extensión «Get cookies.txt LOCALLY»), ciérrala y pega aquí el contenido del archivo.</p>
<p>Estado actual: <b>__ESTADO__</b></p>
<input id="t" type="password" placeholder="Contraseña de Musicola"><br><br>
<textarea id="c" placeholder="# Netscape HTTP Cookie File ..."></textarea>
<button onclick="enviar()">Guardar cookies</button><div id="r"></div>
<p><a href="/">← Volver a Musicola</a></p>
<script>
document.getElementById("t").value = localStorage.getItem("token") || "";
async function enviar(){
  const t=document.getElementById("t").value.trim(), r=document.getElementById("r");
  const res=await fetch("/api/cookies?t="+encodeURIComponent(t),{method:"POST",headers:{"Content-Type":"text/plain"},body:document.getElementById("c").value});
  const j=await res.json().catch(()=>({}));
  r.textContent = res.ok ? "✔ Cookies guardadas. Ya puedes volver a la música." : "Error: "+(j.detail||res.status);
  if(res.ok){localStorage.setItem("token",t);document.getElementById("c").value="";}
}
</script></body></html>"""


@app.get("/cookies")
async def cookies_page():
    estado = "sin cookies"
    if COOKIE_FILE:
        estado = "cookies cargadas" + (" (guardadas en disco permanente)" if PERSISTENT else " (se pierden al reiniciar)")
    return HTMLResponse(COOKIES_PAGE.replace("__ESTADO__", estado))


@app.post("/api/cookies")
async def upload_cookies(request: Request):
    if not TOKEN:
        raise HTTPException(403, "Define MUSICOLA_TOKEN en el servidor para poder subir cookies")
    text = (await request.body()).decode("utf-8", "replace")
    if len(text) > 500_000 or not _looks_like_cookies(text):
        raise HTTPException(400, "Eso no parece un cookies.txt de YouTube")
    _set_cookies(text)
    _url_cache.clear()
    for st in [DIRECT, *STRATEGIES, FALLBACK]:
        st.failures, st.paused_until = 0, 0.0
    return {"ok": True, "persistente": PERSISTENT}


@app.post("/api/debug/client")
async def debug_client(request: Request):
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(400, "JSON no válido")
    data["navegador"] = _browser_name(request.headers.get("user-agent", ""))
    data["hora"] = time.strftime("%H:%M:%S")
    _debug_client.appendleft({k: data[k] for k in list(data)[:20]})
    return {"ok": True}


@app.get("/api/debug")
async def debug_data():
    return {"reproductor": list(_debug_client), "servidor": list(_debug_server)}


@app.get("/debug")
async def debug_page():
    return FileResponse(os.path.join(STATIC_DIR, "debug.html"))


@app.get("/healthz")
async def healthz(request: Request):
    pot = None
    if POT_ENABLED:
        try:
            r = await request.app.state.http.get(POT_URL + "/ping", timeout=3)
            pot = r.status_code == 200
        except Exception:
            pot = False
    return {
        "generador_tokens": pot,
        "ok": True,
        "cookies": bool(COOKIE_FILE),
        "disco_permanente": PERSISTENT,
        "estrategias": {
            st.name: ("activa" if st.available() else "en pausa" if st.enabled else "desactivada")
            + f" ({st.ok} OK" + (f", media {st.total_s / st.ok:.1f}s" if st.ok else "") + ")"
            for st in [DIRECT, *STRATEGIES, FALLBACK]
        },
        "ultimos_errores": {st.name: st.last_error for st in [DIRECT, *STRATEGIES, FALLBACK] if st.last_error},
        "precargas_pendientes": len(_pending),
        "memoria_mb": _mem_mb(),
        "audio_guardado": f"{len(AUDIO.meta)} canciones, {AUDIO.size() // 1048576} MB de {AUDIO.max // 1048576} MB"
        if AUDIO.enabled else "desactivado",
        "memoria_limite_mb": _lim,
        "en_paralelo": EXTRACT_PARALLEL,
    }


def _mem_mb():
    try:
        with open("/sys/fs/cgroup/memory.current") as f:  # memoria total del contenedor
            return round(int(f.read()) / 1048576)
    except Exception:
        return None


@app.get("/")
async def index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


@app.get("/sw.js")
async def service_worker():
    # El service worker debe servirse desde la raíz para controlar toda la app.
    return FileResponse(os.path.join(STATIC_DIR, "sw.js"), media_type="application/javascript")


app.mount("/", StaticFiles(directory=STATIC_DIR), name="static")
