// Musicola (extensión): habla con YouTube directamente desde tu navegador, con tu conexión.
// Así YouTube no pide cookies (no ve un servidor de centro de datos) y no hace falta servidor.
//
// Los datos de los clientes de YouTube vienen de yt-dlp (yt_dlp/extractor/youtube/_base.py).
// Si YouTube cambia algo, normalmente basta con actualizar estos valores.
"use strict";

const YT = (() => {
  const _fetch = window.fetch.bind(window); // fetch original (app.js lo intercepta después)

  // Clientes que no necesitan resolver el reto JavaScript de YouTube (como en yt-dlp)
  const PLAYER_CLIENTS = {
    visionos: {
      name: "VISIONOS", id: 101, version: "1.02",
      ctx: { deviceMake: "Apple", deviceModel: "RealityDevice17,1", osName: "visionOS", osVersion: "26.5.23O471" },
    },
    android_vr: {
      name: "ANDROID_VR", id: 28, version: "1.65.10",
      ctx: { deviceMake: "Oculus", deviceModel: "Quest 3", androidSdkVersion: 32, osName: "Android", osVersion: "12L" },
    },
  };
  const WEB = { name: "WEB", id: 1, version: "2.20260708.00.00" };
  const MUSIC = { name: "WEB_REMIX", id: 67, version: "1.20260707.12.00" };

  let order = ["visionos", "android_vr"]; // el que funcionó por última vez va primero
  let visitorData = null;

  // "mc=..." marca nuestras peticiones para que las reglas de background.js les pongan
  // las cabeceras correctas (User-Agent del cliente, Origin de youtube.com).
  let innertube = async function (host, endpoint, client, tag, body) {
    const url = `https://${host}/youtubei/v1/${endpoint}?prettyPrint=false&mc=${tag}`;
    const headers = {
      "Content-Type": "application/json",
      "X-YouTube-Client-Name": String(client.id),
      "X-YouTube-Client-Version": client.version,
    };
    if (visitorData) headers["X-Goog-Visitor-Id"] = visitorData;
    const r = await _fetch(url, {
      method: "POST",
      credentials: "omit", // nunca se envían tus cookies de Google
      headers,
      body: JSON.stringify({
        context: {
          client: {
            clientName: client.name, clientVersion: client.version, hl: "es", gl: "ES",
            ...(client.ctx || {}), ...(visitorData ? { visitorData } : {}),
          },
        },
        ...body,
      }),
    });
    if (!r.ok) throw new Error(`YouTube respondió ${r.status}`);
    return r.json();
  };
  // Errores de red con un mensaje entendible
  const _rawInnertube = innertube;
  innertube = async (...args) => {
    try { return await _rawInnertube(...args); }
    catch (e) { throw e instanceof TypeError ? new Error("no se pudo conectar con YouTube (¿sin internet?)") : e; }
  };

  async function loadVisitorData() {
    try {
      const html = await (await _fetch("https://www.youtube.com/?mc=web", { credentials: "omit" })).text();
      const m = html.match(/"VISITOR_DATA":"([^"]+)"/) || html.match(/"visitorData":"([^"]+)"/);
      if (m) visitorData = m[1];
    } catch (e) { /* sin visitorData también suele funcionar */ }
  }

  // ---------- Audio ----------
  const cache = new Map();     // id -> {url, exp}
  const inflight = new Map();  // id -> Promise
  const lastError = new Map();

  async function audioUrlWith(id, key) {
    const j = await innertube("www.youtube.com", "player", PLAYER_CLIENTS[key], key, {
      videoId: id, contentCheckOk: true, racyCheckOk: true,
      playbackContext: { contentPlaybackContext: { html5Preference: "HTML5_PREF_WANTS" } },
    });
    const st = j.playabilityStatus || {};
    if (st.status !== "OK") throw new Error(st.reason || st.status || "vídeo no reproducible");
    const fmts = (j.streamingData?.adaptiveFormats || []).filter((f) => f.mimeType?.startsWith("audio/") && f.url);
    if (!fmts.length) throw new Error("sin audio disponible");
    const original = fmts.filter((f) => !f.audioTrack || f.audioTrack.audioIsDefault); // evita doblajes automáticos
    const pool = original.length ? original : fmts;
    const mp4 = pool.filter((f) => f.mimeType.startsWith("audio/mp4"));
    return (mp4.length ? mp4 : pool).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0].url;
  }

  function streamUrl(id) {
    const hit = cache.get(id);
    if (hit && hit.exp > Date.now()) return Promise.resolve(hit.url);
    if (inflight.has(id)) return inflight.get(id);
    const p = (async () => {
      let err;
      for (let round = 0; round < 2; round++) {
        for (const key of [...order]) {
          try {
            const url = await audioUrlWith(id, key);
            order = [key, ...order.filter((k) => k !== key)];
            cache.set(id, { url, exp: Date.now() + 4 * 3600 * 1000 }); // caducan a las ~6 h
            lastError.delete(id);
            console.log(`[musicola] ${id}: cliente ${key} OK`);
            return url;
          } catch (e) {
            err = e;
            console.warn(`[musicola] ${id}: cliente ${key} falló:`, e.message);
          }
        }
        if (round === 0 && !visitorData) await loadVisitorData(); // segundo intento con identificador de visitante
        else break;
      }
      lastError.set(id, err?.message || "error desconocido");
      throw err || new Error("error desconocido");
    })().finally(() => inflight.delete(id));
    inflight.set(id, p);
    return p;
  }

  // ---------- Utilidades para leer las respuestas de YouTube ----------
  const text = (x) => !x ? "" : typeof x === "string" ? x : x.simpleText || x.content
    || (x.runs ? x.runs.map((r) => r.text).join("") : "");
  const toSeconds = (s) => {
    if (!s || !/^\d+(:\d{2}){1,2}$/.test(s)) return null;
    return s.split(":").map(Number).reduce((a, b) => a * 60 + b, 0);
  };
  const walk = (o, fn) => {
    if (Array.isArray(o)) o.forEach((x) => walk(x, fn));
    else if (o && typeof o === "object") { fn(o); for (const k in o) walk(o[k], fn); }
  };
  const track = (id, title, channel, duration) => ({
    id, title: title || "Sin título", channel: channel || "", duration: duration || null,
    thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
  });
  const dedupe = (list) => { const seen = new Set(); return list.filter((t) => !seen.has(t.id) && seen.add(t.id)); };
  const firstWatchId = (o) => { let id = null; walk(o, (x) => { if (!id && x.watchEndpoint?.videoId) id = x.watchEndpoint.videoId; }); return id; };

  // ---------- Búsqueda ----------
  async function searchSongs(q) {
    // Filtro "Canciones" de YouTube Music
    const j = await innertube("music.youtube.com", "search", MUSIC, "music", { query: q, params: "EgWKAQIIAWoMEA4QChADEAQQCRAF" });
    const out = [];
    walk(j, (o) => {
      const r = o.musicResponsiveListItemRenderer;
      if (!r) return;
      const id = r.playlistItemData?.videoId || firstWatchId(r);
      if (!id) return;
      const cols = (r.flexColumns || []).map((c) => (c.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []).map((x) => x.text));
      const title = (cols[0] || []).join("");
      const sub = (cols[1] || []).filter((s) => s.trim() && s.trim() !== "•");
      const dur = [...sub].reverse().find((s) => toSeconds(s) != null);
      const artist = ["Canción", "Song", "Vídeo", "Video"].includes(sub[0]) ? sub[1] : sub[0];
      out.push(track(id, title, artist, toSeconds(dur)));
    });
    return dedupe(out);
  }

  async function searchVideos(q) {
    const j = await innertube("www.youtube.com", "search", WEB, "web", { query: q, params: "EgIQAQ==" });
    const out = [];
    walk(j, (o) => {
      const v = o.videoRenderer;
      if (v?.videoId) out.push(track(v.videoId, text(v.title), text(v.ownerText || v.longBylineText), toSeconds(text(v.lengthText))));
    });
    return dedupe(out);
  }

  async function search(q) {
    let res = [];
    try { res = await searchSongs(q); } catch (e) { console.warn("[musicola] búsqueda de canciones falló:", e.message); }
    if (!res.length) res = await searchVideos(q);
    return res.slice(0, 25);
  }

  // ---------- Radio (canciones parecidas) ----------
  function parsePanel(j, seed) {
    const out = [];
    walk(j, (o) => {
      const v = o.playlistPanelVideoRenderer;
      if (v?.videoId && v.videoId !== seed) {
        out.push(track(v.videoId, text(v.title), (v.shortBylineText?.runs || v.longBylineText?.runs || [])[0]?.text, toSeconds(text(v.lengthText))));
      }
    });
    return dedupe(out);
  }

  async function radio(id, n = 25) {
    try {
      const j = await innertube("music.youtube.com", "next", MUSIC, "music", { videoId: id, playlistId: "RDAMVM" + id, isAudioOnly: true });
      const res = parsePanel(j, id);
      if (res.length) return res.slice(0, n);
    } catch (e) { console.warn("[musicola] radio (Music) falló:", e.message); }
    const j = await innertube("www.youtube.com", "next", WEB, "web", { videoId: id, playlistId: "RD" + id });
    return parsePanel(j, id).slice(0, n);
  }

  return {
    search, radio, streamUrl,
    invalidate: (id) => cache.delete(id),
    lastError: (id) => lastError.get(id),
  };
})();

// La interfaz (app.js) es la misma que la de la web y llama a /api/...:
// aquí se responden esas llamadas localmente, sin servidor.
window.fetch = ((realFetch) => async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  if (!url.startsWith("/api/")) return realFetch(input, init);
  const u = new URL(url, location.origin);
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  let m;
  try {
    if (u.pathname === "/api/search") return json(await YT.search(u.searchParams.get("q") || ""));
    if ((m = u.pathname.match(/^\/api\/radio\/([\w-]{11})$/))) return json(await YT.radio(m[1], +(u.searchParams.get("n") || 25)));
    if ((m = u.pathname.match(/^\/api\/prefetch\/([\w-]{11})$/))) { YT.streamUrl(m[1]).catch(() => {}); return json({ ok: true }); }
    if ((m = u.pathname.match(/^\/api\/stream\/([\w-]{11})$/))) {
      try { await YT.streamUrl(m[1]); return json({ ok: true }); }
      catch (e) { return json({ detail: e.message }, 502); }
    }
    return json({ detail: "No encontrado" }, 404);
  } catch (e) {
    return json({ detail: e.message }, 502);
  }
})(window.fetch.bind(window));
