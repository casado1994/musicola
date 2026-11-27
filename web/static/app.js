// Musicola - frontend
const $ = (s) => document.querySelector(s);
const audio = $("#audio");

// Token opcional: abre la app una vez como /?t=TU_TOKEN y se recuerda.
const SHARED_ID = new URLSearchParams(location.search).get("v"); // enlace compartido (?v=ID)
const urlToken = new URLSearchParams(location.search).get("t");
if (urlToken) { localStorage.setItem("token", urlToken); history.replaceState(null, "", "/"); }
const TOKEN = localStorage.getItem("token") || "";
const withToken = (u) => TOKEN ? u + (u.includes("?") ? "&" : "?") + "t=" + encodeURIComponent(TOKEN) : u;

// ---------- Iconos (SVG propios: se ven igual en todos los dispositivos) ----------
const ICON = {
  play: "M8 5v14l11-7z",
  pause: "M6 19h4V5H6v14zm8-14v14h4V5h-4z",
  prev: "M6 6h2v12H6zm3.5 6l8.5 6V6z",
  next: "M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z",
  shuffle: "M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z",
  repeat: "M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z",
  repeatOne: "M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z",
  radio: "M3.24 6.15C2.51 6.43 2 7.17 2 8v12c0 1.1.89 2 2 2h16c1.11 0 2-.9 2-2V8c0-1.11-.89-2-2-2H8.3l8.26-3.34L15.88 1 3.24 6.15zM7 20c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm13-8h-2v-2h-2v2H4V8h16v4z",
  fav: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
  favOff: "M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z",
  add: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  more: "M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z",
  listAdd: "M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z",
  list: "M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z",
  back: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
  edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
  trash: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
  check: "M9 16.17L4.83 12l-1.42 1.42L9 19 21 7l-1.41-1.41z",
  share: "M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z",
  playNext: "M21 3H3c-1.11 0-2 .89-2 2v12c0 1.1.89 2 2 2h5v2h8v-2h2v-2H3V5h18v8h2V5c0-1.11-.9-2-2-2zm-8 7V7h-2v3H8v2h3v3h2v-3h3v-2h-3zm11 8l-4.5 4.5L18 21l3-3-3-3 1.5-1.5L24 18z",
  close: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  up: "M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z",
  volUp: "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z",
  volDown: "M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z",
  volOff: "M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z",
};
const icon = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[n]}"/></svg>`;

// ---------- Estado persistente ----------
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const state = {
  queue: load("queue", []),
  index: load("index", -1),
  favs: load("favs", []),
  playlists: load("playlists", []), // [{id, name, tracks:[…]}]
  shuffle: load("shuffle", false),
  repeat: load("repeat", "off"), // off | all | one
  radio: load("radio", false),
  mode: load("mode", "songs"), // "songs" (YouTube Music) o "videos" (YouTube)
  played: load("played", []), // ids escuchados recientemente (para que la radio no repita)
  results: [],
};
const persist = () => {
  save("queue", state.queue); save("index", state.index); save("favs", state.favs); save("playlists", state.playlists);
  save("shuffle", state.shuffle); save("repeat", state.repeat);
  save("radio", state.radio); save("mode", state.mode); save("played", state.played.slice(-300));
};

// ---------- Utilidades ----------
const fmt = (s) => {
  if (!isFinite(s) || s == null) return "0:00";
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isFav = (id) => state.favs.some((t) => t.id === id);
const current = () => state.queue[state.index];
const setStatus = (t) => { $("#status").textContent = t || ""; };

// ---------- Render ----------
function renderList(el, tracks, mode) {
  const cur = current();
  el.innerHTML = tracks.map((t, i) => `
    <li class="item ${cur && cur.id === t.id && (mode !== "queue" || i === state.index) ? "playing" : ""}" data-i="${i}">
      <img src="${esc(t.thumb)}" alt="" loading="lazy" data-act="play">
      <div class="meta" data-act="play">
        <div class="title">${esc(t.title)}</div>
        <div class="sub">${esc(t.channel)}${t.duration ? " · " + fmt(t.duration) : ""}${t.fromRadio ? `<span class="radio-tag">${icon("radio")} radio</span>` : ""}</div>
      </div>
      <div class="actions">
        ${mode === "queue" || mode === "pl"
          ? `<button data-act="up" title="Subir">${icon("up")}</button><button data-act="remove" title="${mode === "pl" ? "Quitar de la lista" : "Quitar"}">${icon("close")}</button>`
          : `<button data-act="fav" class="${isFav(t.id) ? "on" : ""}" title="Favorito">${icon(isFav(t.id) ? "fav" : "favOff")}</button>`}
        <button data-act="more" title="Más opciones">${icon("more")}</button>
      </div>
    </li>`).join("");
}
function renderAll() {
  renderList($("#results"), state.results, "results");
  renderList($("#queue"), state.queue, "queue");
  renderList($("#favs"), state.favs, "favs");
  renderPlaylists();
  $("#lists-count").textContent = state.playlists.length ? `(${state.playlists.length})` : "";
  $("#queue-count").textContent = state.queue.length ? `(${state.queue.length})` : "";
  updateQueueBar();
  const t = current();
  $("#np-title").textContent = t ? t.title : "Nada sonando";
  $("#np-channel").textContent = t ? t.channel : "";
  if (t) $("#np-thumb").src = t.thumb; else $("#np-thumb").removeAttribute("src");
  $("#btn-fav").innerHTML = icon(t && isFav(t.id) ? "fav" : "favOff");
  $("#btn-fav").classList.toggle("on", !!(t && isFav(t.id)));
  $("#btn-shuffle").classList.toggle("on", state.shuffle);
  $("#btn-repeat").classList.toggle("on", state.repeat !== "off");
  $("#btn-repeat").innerHTML = icon(state.repeat === "one" ? "repeatOne" : "repeat");
  $("#btn-radio").classList.toggle("on", state.radio);
}

// ---------- Reproducción ----------
// ---------- Diagnóstico: tiempos desde que pulsas hasta que suena (página /debug) ----------
let diag = null;
function diagStart(t) {
  diag = { cancion: t.title.slice(0, 40), t0: performance.now(), ms: {} };
}
function diagMark(ev) {
  if (!diag || diag.ms[ev] != null) return;
  diag.ms[ev] = Math.round(performance.now() - diag.t0);
  if (ev === "playing" || ev === "error") {
    const body = JSON.stringify({ cancion: diag.cancion, ...diag.ms });
    diag = null;
    fetch(withToken("/api/debug/client"), { method: "POST", headers: { "Content-Type": "application/json" }, body }).catch(() => {});
  }
}
for (const ev of ["loadstart", "progress", "loadedmetadata", "loadeddata", "canplay", "canplaythrough", "playing", "waiting", "error"]) {
  audio.addEventListener(ev, () => diagMark(ev));
}

// Safari (y cualquier navegador del iPhone/iPad) recorre todo el audio de YouTube antes de
// reproducirlo. Con HLS, su formato nativo, empieza en cuanto tiene el primer fragmento.
const IS_APPLE_WEBKIT = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.vendor === "Apple Computer, Inc." && !/Chrome|CriOS|FxiOS|Edg/.test(navigator.userAgent));
const USE_HLS = IS_APPLE_WEBKIT && audio.canPlayType("application/vnd.apple.mpegurl") !== "";
const hlsFailed = new Set(); // canciones sin índice: se reproducen de la forma normal
function audioUrl(id) {
  return withToken(USE_HLS && !hlsFailed.has(id) ? `/api/hls/${id}.m3u8` : `/api/stream/${id}`);
}

function playIndex(i, autoplay = true) {
  if (i < 0 || i >= state.queue.length) return;
  state.index = i;
  const t = current();
  if (autoplay) diagStart(t);
  // Al restaurar la última canción no se descarga nada hasta pulsar play
  audio.preload = autoplay ? "auto" : "none";
  audio.src = audioUrl(t.id);
  if (autoplay) { setLoading(true); audio.play().catch(() => {}); }
  updateMediaSession(t);
  persist(); renderAll();
}
function playNow(track) {
  // Si ya está en la cola, salta a ella; si no, la inserta después de la actual.
  const existing = state.queue.findIndex((t) => t.id === track.id);
  if (existing >= 0) return playIndex(existing);
  state.queue.splice(state.index + 1, 0, track);
  playIndex(state.index + 1);
}
function next(auto = false) {
  if (!state.queue.length) return;
  if (auto && state.repeat === "one") { audio.currentTime = 0; audio.play(); return; }
  let i;
  if (state.shuffle && state.queue.length > 1) {
    do { i = Math.floor(Math.random() * state.queue.length); } while (i === state.index);
  } else {
    i = state.index + 1;
    if (i >= state.queue.length) {
      if (state.radio && current()) {
        extendRadio(true).then((added) => { if (added) playIndex(state.index + 1); });
        return;
      }
      if (state.repeat === "all") i = 0;
      else { if (auto) { audio.pause(); } return; }
    }
  }
  playIndex(i);
}
function prev() {
  if (audio.currentTime > 3 || state.index <= 0) { audio.currentTime = 0; return; }
  playIndex(state.index - 1);
}
function togglePlay() {
  if (!audio.src && state.queue.length) return playIndex(Math.max(0, state.index));
  // Si la carga anterior falló, se vuelve a intentar desde cero
  if (audio.error && state.queue.length) return playIndex(Math.max(0, state.index));
  if (audio.paused) {
    if (audio.readyState < 3) setLoading(true); // aún no hay audio cargado: mostrar "cargando"
    audio.play().catch(() => {});
  } else audio.pause();
}

// ---------- Media Session (pantalla de bloqueo, auriculares, teclas multimedia) ----------
function updateMediaSession(t) {
  if (!("mediaSession" in navigator) || !t) return;
  setupMediaButtons();
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title, artist: t.channel,
    artwork: [
      { src: t.thumb, sizes: "320x180", type: "image/jpeg" },
      { src: `https://i.ytimg.com/vi/${t.id}/hqdefault.jpg`, sizes: "480x360", type: "image/jpeg" },
    ],
  });
}
// Botones de la pantalla de bloqueo / CarPlay. Safari en iOS los olvida a veces al cambiar de
// canción y vuelve a poner «−10 s / +10 s», así que se registran de nuevo con cada canción.
function setupMediaButtons() {
  if (!("mediaSession" in navigator)) return;
  const ms = navigator.mediaSession;
  const set = (action, fn) => { try { ms.setActionHandler(action, fn); } catch {} };
  set("play", () => audio.play());
  set("pause", () => audio.pause());
  set("previoustrack", () => prev());
  set("nexttrack", () => next());
  set("seekto", (d) => { audio.currentTime = d.seekTime; });
  // En móvil (iPhone, CarPlay, Android) los botones de ±10 s sustituyen a «anterior / siguiente»:
  // solo se dejan en escritorio, donde no molestan.
  const mobile = IS_APPLE_WEBKIT || matchMedia("(hover: none) and (pointer: coarse)").matches;
  set("seekbackward", mobile ? null : (d) => { audio.currentTime -= d.seekOffset || 10; });
  set("seekforward", mobile ? null : (d) => { audio.currentTime += d.seekOffset || 10; });
}
setupMediaButtons();


// ---------- Eventos del audio ----------
let seeking = false;
let loading = false;
function setLoading(on) {
  loading = on;
  $("#btn-play").innerHTML = on ? '<span class="spinner"></span>' : icon(audio.paused ? "play" : "pause");
  $("#btn-play").classList.toggle("loading", on);
  const t = current();
  if (on && t) setStatus(`Cargando «${t.title}»… (la primera vez puede tardar unos segundos)`);
}
audio.addEventListener("play", () => { if (!loading) $("#btn-play").innerHTML = icon("pause"); });
audio.addEventListener("pause", () => { if (!loading) $("#btn-play").innerHTML = icon("play"); });
audio.addEventListener("loadstart", () => { if (audio.getAttribute("src")) setLoading(!audio.paused || audio.autoplay); });
audio.addEventListener("waiting", () => setLoading(true));
audio.addEventListener("playing", () => {
  setLoading(false);
  setupMediaButtons(); // iOS: asegura ⏮ ⏭ en la pantalla de bloqueo una vez que suena
  const t = current();
  if (t && state.played[state.played.length - 1] !== t.id) { state.played.push(t.id); persist(); }
  if (state.radio) extendRadio();
  prefetchNext();
});
audio.addEventListener("ended", () => next(true));
audio.addEventListener("loadedmetadata", () => {
  $("#seek").max = Math.floor(audio.duration || 0);
  $("#t-dur").textContent = fmt(audio.duration);
});
audio.addEventListener("timeupdate", () => {
  if (!seeking) $("#seek").value = Math.floor(audio.currentTime);
  $("#t-cur").textContent = fmt(audio.currentTime);
  if ("mediaSession" in navigator && audio.duration && navigator.mediaSession.setPositionState) {
    try { navigator.mediaSession.setPositionState({ duration: audio.duration, position: audio.currentTime, playbackRate: audio.playbackRate }); } catch {}
  }
});
let errorStreak = 0;
audio.addEventListener("playing", () => { errorStreak = 0; setStatus(""); });
audio.addEventListener("error", async () => {
  setLoading(false);
  const t = current();
  if (!t) return;
  // Si falló con HLS, se reintenta al momento de la forma normal
  if (USE_HLS && !hlsFailed.has(t.id)) { hlsFailed.add(t.id); playIndex(state.index); return; }
  // Pregunta al servidor el motivo exacto del fallo
  let why = "";
  try {
    const r = await fetch(withToken(`/api/stream/${t.id}`), { headers: { Range: "bytes=0-1" } });
    if (r.status === 401) why = "contraseña incorrecta";
    else if (!r.ok) why = (await r.json().catch(() => ({}))).detail || `error ${r.status}`;
    else why = "el navegador no pudo leer el audio";
  } catch (e) { why = "sin conexión con el servidor"; }
  setStatus(`No se pudo reproducir «${t.title}»: ${why}`);
  if (/not a bot|Sign in/i.test(why)) {
    $("#status").innerHTML += ' — <a href="/cookies" style="color:var(--accent)">Actualizar cookies</a>';
  }
  if (++errorStreak < 3 && state.index < state.queue.length - 1) setTimeout(() => next(true), 2500);
});
// ---------- Modo radio ----------
let radioBusy = false;
// Si quedan pocas canciones en la cola, añade canciones parecidas a la que suena
async function extendRadio(force = false) {
  const seed = current();
  const remaining = state.queue.length - state.index - 1;
  if (!seed || radioBusy || (!force && remaining >= 3)) return 0;
  radioBusy = true;
  try {
    const r = await fetch(withToken(`/api/radio/${seed.id}?n=25`));
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.status);
    const inQueue = new Set(state.queue.map((t) => t.id));
    const recent = new Set(state.played.slice(-40));
    const similar = (await r.json()).filter((t) => !inQueue.has(t.id));
    // Prioriza lo no escuchado últimamente; si no hay nada nuevo, acepta repetir
    let fresh = similar.filter((t) => !recent.has(t.id));
    if (!fresh.length) fresh = similar;
    fresh = fresh.slice(0, 10);
    fresh.forEach((t) => { t.fromRadio = true; });
    state.queue.push(...fresh);
    persist(); renderAll();
    return fresh.length;
  } catch (e) {
    setStatus("Radio: no se pudieron cargar canciones parecidas (" + e.message + ")");
    return 0;
  } finally { radioBusy = false; }
}
function startRadio(track) {
  state.radio = true;
  state.queue = [track];
  playIndex(0);
  setStatus(`Radio de «${track.title}»`);
  extendRadio(true);
}
$("#btn-radio").onclick = () => {
  state.radio = !state.radio; persist(); renderAll();
  setStatus(state.radio ? "Modo radio activado: al acabar la cola sonarán canciones parecidas" : "Modo radio desactivado");
  if (state.radio && !audio.paused) extendRadio();
};

// Prepara la siguiente canción en el servidor mientras suena la actual
function prefetchNext() {
  // Las dos siguientes de la cola
  // Las dos siguientes: el servidor guarda sus primeros segundos de audio
  prefetchMany(state.queue.slice(state.index + 1, state.index + 3).map((t) => t.id));
}
const prefetched = new Set();
// Pide al servidor que prepare varias canciones (en ese orden; lo último pedido va primero)
let lastMany = "";
function prefetchMany(ids) {
  const list = ids.filter(Boolean).slice(0, 40).join(",");
  if (!list || list === lastMany) return;
  lastMany = list;
  fetch(withToken(`/api/prefetch_many?ids=${list}`)).catch(() => {});
}

function prefetch(id, audio = false) {
  const key = id + (audio ? ":a" : "");
  if (prefetched.has(key)) return;
  prefetched.add(key);
  setTimeout(() => prefetched.delete(key), 3 * 3600 * 1000); // las URLs caducan a las ~4 h en el servidor
  fetch(withToken(`/api/prefetch/${id}${audio ? "?audio=1" : ""}`)).catch(() => {});
}
$("#seek").addEventListener("input", () => { seeking = true; $("#t-cur").textContent = fmt(+$("#seek").value); });
$("#seek").addEventListener("change", () => { audio.currentTime = +$("#seek").value; seeking = false; });

// ---------- Controles ----------
$("#btn-play").onclick = togglePlay;
$("#btn-next").onclick = () => next();
$("#btn-prev").onclick = prev;
$("#btn-shuffle").onclick = () => { state.shuffle = !state.shuffle; persist(); renderAll(); };
$("#btn-repeat").onclick = () => {
  state.repeat = { off: "all", all: "one", one: "off" }[state.repeat]; persist(); renderAll();
};
$("#btn-fav").onclick = () => { const t = current(); if (t) toggleFav(t); };

function toggleFav(t) {
  state.favs = isFav(t.id) ? state.favs.filter((f) => f.id !== t.id) : [t, ...state.favs];
  persist(); renderAll();
}

// Clicks en listas (delegación)
const listFor = (mode) => mode === "results" ? state.results : mode === "queue" ? state.queue
  : mode === "favs" ? state.favs : (openPlaylist()?.tracks || []);
for (const [id, mode] of [["#results", "results"], ["#queue", "queue"], ["#favs", "favs"], ["#pl-tracks", "pl"]]) {
  $(id).addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]"); const li = e.target.closest(".item");
    if (!btn || !li) return;
    const i = +li.dataset.i;
    const list = listFor(mode);
    const t = list[i];
    if (mode === "pl" && btn.dataset.act !== "play" && btn.dataset.act !== "more") {
      const pl = openPlaylist();
      if (btn.dataset.act === "remove") pl.tracks.splice(i, 1);
      if (btn.dataset.act === "up" && i > 0) [pl.tracks[i - 1], pl.tracks[i]] = [pl.tracks[i], pl.tracks[i - 1]];
      persist(); renderAll(); return;
    }
    switch (btn.dataset.act) {
      case "more": openTrackMenu(btn, t, mode); return;
      case "play":
        if (mode === "queue") playIndex(i);
        else if (mode === "favs") { state.queue = [...state.favs]; playIndex(i); } // reproduce la lista de favoritos
        else if (mode === "pl") { playPlaylist(openPlaylist(), i); return; }
        else playNow(t);
        break;
      case "radio": startRadio(t); return;
      case "add": state.queue.push(t); break;
      case "next": state.queue.splice(state.index + 1, 0, t); break;
      case "fav": toggleFav(t); return;
      case "remove":
        state.queue.splice(i, 1);
        if (i < state.index) state.index--;
        else if (i === state.index) { audio.pause(); audio.removeAttribute("src"); state.index = Math.min(i, state.queue.length) - 1; }
        break;
      case "up":
        if (i > 0) {
          [state.queue[i - 1], state.queue[i]] = [state.queue[i], state.queue[i - 1]];
          if (state.index === i) state.index--; else if (state.index === i - 1) state.index++;
        }
        break;
    }
    persist(); renderAll();
  });
}

// Barra "Vaciar cola" (solo en la pestaña Cola y si hay canciones)
var currentTab = "results"; // var: se usa desde renderAll antes de esta línea
function updateQueueBar() {
  $("#queue-bar").classList.toggle("hidden", currentTab !== "queue" || !state.queue.length);
}
function clearQueue() {
  if (!state.queue.length) return;
  if (!confirm(`¿Eliminar las ${state.queue.length} canciones de la cola?`)) return;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  state.queue = [];
  state.index = -1;
  $("#seek").value = 0; $("#seek").max = 0;
  $("#t-cur").textContent = "0:00"; $("#t-dur").textContent = "0:00";
  setLoading(false);
  persist(); renderAll();
  setStatus("Cola vacía");
}
$("#btn-clear-queue").onclick = clearQueue;

// Al tocar una canción se empieza a preparar ya (antes de levantar el dedo)
for (const [id, mode] of [["#results", "results"], ["#queue", "queue"], ["#favs", "favs"], ["#pl-tracks", "pl"]]) {
  $(id).addEventListener("pointerdown", (e) => {
    if (e.target.closest(".actions")) return;
    const li = e.target.closest(".item");
    if (!li) return;
    const list = listFor(mode);
    const t = list[+li.dataset.i];
    if (t) prefetch(t.id, true);
  }, { passive: true });
}

// Pestañas
document.querySelectorAll(".tabs button").forEach((b) => b.onclick = () => {
  document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
  for (const id of ["results", "queue", "favs", "lists"]) $("#" + id).classList.toggle("hidden", id !== b.dataset.tab);
  currentTab = b.dataset.tab; updateQueueBar();
  // Al mirar la cola o los favoritos, se preparan sus canciones
  if (b.dataset.tab === "queue") prefetchMany(state.queue.slice(Math.max(0, state.index), state.index + 6).map((t) => t.id));
  if (b.dataset.tab === "favs") prefetchMany(state.favs.slice(0, 6).map((t) => t.id));
  if (b.dataset.tab === "lists") { const pl = openPlaylist(); if (pl) prefetchMany(pl.tracks.slice(0, 6).map((t) => t.id)); }
  setStatus(b.dataset.tab === "favs" && !state.favs.length ? "Aún no tienes favoritos." : "");
});

// Búsqueda
// ---------- Canciones / Vídeos ----------
function renderModes() {
  document.querySelectorAll(".modes .chip").forEach((c) => {
    const on = c.dataset.mode === state.mode;
    c.classList.toggle("on", on);
    c.setAttribute("aria-checked", on);
  });
}
document.querySelectorAll(".modes .chip").forEach((c) => c.onclick = () => {
  if (state.mode === c.dataset.mode) return;
  state.mode = c.dataset.mode; persist(); renderModes();
  if ($("#q").value.trim()) runSearch($("#q").value);
});
renderModes();

// ---------- Compartir ----------
function youtubeId(text) {
  const m = text.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
async function shareTrack(t) {
  if (!t) return;
  const url = `${location.origin}/?v=${t.id}`;
  const text = `${t.title}${t.channel ? " – " + t.channel : ""}`;
  return shareLink({ title: t.title, text, url, label: "Compartir canción" });
}

// En móvil se usa el menú de compartir del sistema (WhatsApp, Mensajes…).
// En escritorio (Windows, Mac, Linux) ese menú falla o no sirve de mucho: se copia el enlace
// y se muestra en una ventana con botón «Copiar» por si el navegador no deja copiar solo.
async function shareLink({ title, text, url, label }) {
  if (IS_TOUCH && navigator.share) {
    try { await navigator.share({ title, text, url }); return; }
    catch (e) { if (e.name === "AbortError") return; } // cancelado por el usuario
  }
  let copied = false;
  try { await navigator.clipboard.writeText(url); copied = true; } catch {}
  openSheet(`
    <h2>${esc(label)}</h2>
    <div class="sheet-sub">${esc(text)}</div>
    <input id="share-url" class="share-url" type="text" readonly value="${esc(url)}">
    <div class="sheet-actions">
      <button class="text-btn" data-close>Cerrar</button>
      <button id="share-copy" class="text-btn accent">${copied ? "¡Copiado!" : "Copiar enlace"}</button>
    </div>`);
  const input = $("#share-url");
  input.onclick = () => input.select();
  setTimeout(() => input.select(), 30);
  $("#share-copy").onclick = async () => {
    input.select();
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch { ok = document.execCommand && document.execCommand("copy"); }
    $("#share-copy").textContent = ok ? "¡Copiado!" : "Pulsa Ctrl+C";
  };
  if (copied) toast("Enlace copiado");
}
$("#btn-share").onclick = () => shareTrack(current());
$("#btn-addlist").onclick = () => { const t = current(); if (t) openAddToList(t); };

// Abre una canción compartida (enlace de Musicola con ?v=, o enlace de YouTube pegado)
async function openShared(id, autoplay) {
  setStatus("Cargando canción…");
  try {
    const r = await fetch(withToken(`/api/track/${id}`));
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.status);
    const t = await r.json();
    let idx = state.queue.findIndex((x) => x.id === t.id);
    if (idx < 0) { idx = Math.max(0, state.index + 1); state.queue.splice(idx, 0, t); }
    if (autoplay) { playIndex(idx); setStatus(""); }
    else {
      // Sin un toque previo el navegador no deja reproducir: se deja preparada
      playIndex(idx, false); prefetch(t.id, true); renderAll();
      setStatus(`Pulsa ▶ para escuchar «${t.title}»`);
    }
  } catch (e) { setStatus("No se pudo abrir la canción: " + e.message); }
}

// Búsqueda: al pulsar Enter y también mientras escribes (como Spotify)
let searchSeq = 0;
async function runSearch(q, { typing = false } = {}) {
  q = q.trim(); if (!q) return;
  // ¿Han pegado un enlace de YouTube? Se abre esa canción directamente
  // ¿Un enlace de lista de Musicola? Se abre la lista
  if (/#list=[zj][\w-]+/.test(q)) { if (!typing) { $("#q").value = ""; $("#q").blur(); openSharedPlaylistCode(q); } return; }
  const linkId = youtubeId(q);
  if (linkId) { if (!typing) { $("#q").value = ""; openShared(linkId, true); } return; }
  const seq = ++searchSeq; // si llega una búsqueda más nueva, esta se descarta
  if (!typing) { $("#q").blur(); state.results = []; renderAll(); }
  if (currentTab !== "results") document.querySelector('.tabs button[data-tab="results"]').click();
  if (!state.results.length) setStatus("Buscando…");
  try {
    const r = await fetch(withToken(`/api/search?q=${encodeURIComponent(q)}&mode=${state.mode}`));
    if (seq !== searchSeq) return;
    if (r.status === 401) {
      // Servidor protegido: pide la contraseña una vez y la recuerda en este navegador
      const t = prompt("Contraseña de Musicola:");
      if (t) { localStorage.setItem("token", t.trim()); location.reload(); }
      setStatus("Hace falta la contraseña."); return;
    }
    if (!r.ok) throw new Error((await r.json()).detail || r.status);
    const results = await r.json();
    if (seq !== searchSeq) return;
    state.results = results;
    // Como Spotify: el servidor prepara los primeros segundos de TODOS los resultados, de arriba abajo
    // Los 6 primeros (con más, YouTube nos toma por bot). Si se está escribiendo, solo cuando
    // los resultados llevan 1,5 s sin cambiar, para no precargar cada letra.
    const ids = state.results.slice(0, 6).map((t) => t.id);
    if (typing) setTimeout(() => { if (seq === searchSeq) prefetchMany(ids); }, 1500);
    else prefetchMany(ids);
    setStatus(state.results.length ? "" : "Sin resultados.");
  } catch (err) { if (seq === searchSeq) setStatus("Error: " + err.message); }
  renderAll();
}
$("#search-form").addEventListener("submit", (e) => { e.preventDefault(); clearTimeout(typingTimer); runSearch($("#q").value); });
let typingTimer = null;
$("#q").addEventListener("input", () => {
  clearTimeout(typingTimer);
  const q = $("#q").value.trim();
  if (q.length < 3) return;
  typingTimer = setTimeout(() => runSearch(q, { typing: true }), 450);
});

// ---------- Volumen ----------
const volume = { level: load("volume", 1), muted: load("muted", false) };
// En móvil (pantalla táctil) no hay barra de volumen: manda el volumen del teléfono
const IS_TOUCH = matchMedia("(hover: none) and (pointer: coarse)").matches;
function applyVolume() {
  if (IS_TOUCH) { audio.volume = 1; audio.muted = false; return; }
  audio.volume = volume.level;
  audio.muted = volume.muted || volume.level === 0;
  const shown = audio.muted ? 0 : volume.level;
  const slider = $("#volume");
  slider.value = Math.round(shown * 100);
  slider.style.setProperty("--fill", `${shown * 100}%`);
  $("#btn-mute").innerHTML = icon(audio.muted ? "volOff" : volume.level < 0.5 ? "volDown" : "volUp");
  $("#btn-mute").title = audio.muted ? "Activar sonido (M)" : "Silenciar (M)";
  save("volume", volume.level); save("muted", volume.muted);
}
function setVolume(v) {
  volume.level = Math.min(1, Math.max(0, v));
  volume.muted = false;
  applyVolume();
}
$("#volume").addEventListener("input", (e) => setVolume(e.target.value / 100));
$("#volume").addEventListener("wheel", (e) => { e.preventDefault(); setVolume(volume.level + (e.deltaY < 0 ? 0.05 : -0.05)); }, { passive: false });
$("#btn-mute").onclick = () => {
  if (volume.level === 0) { volume.level = 0.5; volume.muted = false; }
  else volume.muted = !volume.muted;
  applyVolume();
};
applyVolume();

// Atajos de teclado
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if (e.code === "Space") { e.preventDefault(); togglePlay(); }
  else if (e.key === "ArrowRight") audio.currentTime += 10;
  else if (e.key === "ArrowLeft") audio.currentTime -= 10;
  else if (e.key === "ArrowUp") { e.preventDefault(); setVolume(volume.level + 0.05); }
  else if (e.key === "ArrowDown") { e.preventDefault(); setVolume(volume.level - 0.05); }
  else if (e.key === "m" || e.key === "M") $("#btn-mute").click();
  else if (e.key === "n") next();
  else if (e.key === "p") prev();
  else if (e.key === "/") { e.preventDefault(); $("#q").focus(); }
});

// Prepara en el servidor la canción actual y las siguientes (al abrir la web y al volver a
// ella: iOS pausa las páginas en segundo plano). Así, al pulsar ▶ empieza al instante.
function warmCurrent() {
  const t = current();
  if (t) prefetch(t.id, true);
  prefetchNext();
  if (state.results.length) setTimeout(() => prefetchMany(state.results.slice(0, 6).map((r) => r.id)), 1500);
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && audio.paused) warmCurrent();
});

// Arranque: restaura la última canción (sin reproducir automáticamente)
if (current()) { playIndex(state.index, false); warmCurrent(); }
{
  const sharedId = SHARED_ID;
  if (sharedId && /^[\w-]{11}$/.test(sharedId)) {
    history.replaceState(null, "", "/");
    openShared(sharedId, false);
  }
}
renderAll();
setStatus(state.queue.length ? "" : "Busca algo para empezar");
// Lista compartida (#list=…): se abre al cargar (se define al final del archivo)
setTimeout(() => openSharedPlaylistFromHash(), 0);

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

// ---------- Listas de reproducción ----------
// Se guardan en este navegador (localStorage), como los favoritos.
var openListId = null; // lista abierta en la pestaña «Listas» (null = índice)
function openPlaylist() { return state.playlists.find((p) => p.id === openListId) || null; }
function plById(id) { return state.playlists.find((p) => p.id === id); }
function nCanciones(n) { return `${n} ${n === 1 ? "canción" : "canciones"}`; }

function toast(text) {
  const el = $("#toast");
  el.textContent = text; el.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 2200);
}

function createPlaylist(name, first) {
  const pl = { id: "p" + Date.now().toString(36), name: name.trim(), tracks: first ? [first] : [] };
  state.playlists.unshift(pl);
  persist(); renderAll();
  toast(first ? `Añadida a «${pl.name}»` : `Lista «${pl.name}» creada`);
  return pl;
}
function addToPlaylist(id, t) {
  const pl = plById(id); if (!pl) return;
  if (pl.tracks.some((x) => x.id === t.id)) return toast(`Ya está en «${pl.name}»`);
  const { fromRadio, ...clean } = t;
  pl.tracks.push(clean);
  persist(); renderAll(); toast(`Añadida a «${pl.name}»`);
}
function playPlaylist(pl, start = 0, shuffled = false) {
  if (!pl || !pl.tracks.length) return;
  let list = [...pl.tracks];
  if (shuffled) { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } start = 0; }
  state.queue = list; playIndex(start);
}

function renderPlaylists() {
  const pl = openPlaylist();
  $("#pl-index").classList.toggle("hidden", !!pl);
  $("#pl-detail").classList.toggle("hidden", !pl);
  if (pl) {
    $("#pl-name").textContent = pl.name;
    $("#pl-count").textContent = nCanciones(pl.tracks.length);
    renderList($("#pl-tracks"), pl.tracks, "pl");
    $("#pl-empty").classList.toggle("hidden", pl.tracks.length > 0);
    return;
  }
  $("#pl-list").innerHTML = state.playlists.map((p) => `
    <li class="item pl-item" data-id="${esc(p.id)}">
      <div class="pl-cover" data-act="open">${p.tracks[0] ? `<img src="${esc(p.tracks[0].thumb)}" alt="" loading="lazy">` : icon("list")}</div>
      <div class="meta" data-act="open"><div class="title">${esc(p.name)}</div><div class="sub">${nCanciones(p.tracks.length)}</div></div>
      <div class="actions"><button data-act="playlist" title="Reproducir">${icon("play")}</button></div>
    </li>`).join("");
  $("#pl-none").classList.toggle("hidden", state.playlists.length > 0);
}

$("#pl-list").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-act]"); const li = e.target.closest(".pl-item");
  if (!btn || !li) return;
  const pl = plById(li.dataset.id);
  if (btn.dataset.act === "playlist") return playPlaylist(pl);
  openListId = pl.id; renderAll();
  prefetchMany(pl.tracks.slice(0, 6).map((t) => t.id));
  $("main").scrollTop = 0;
});
$("#pl-back").onclick = () => { openListId = null; renderAll(); };
$("#pl-play").onclick = () => playPlaylist(openPlaylist());
$("#pl-shuffle").onclick = () => playPlaylist(openPlaylist(), 0, true);
$("#pl-new").onclick = () => askName("Nueva lista", "", "Crear", (name) => { openListId = createPlaylist(name).id; renderAll(); });
$("#pl-rename").onclick = () => {
  const pl = openPlaylist();
  askName("Renombrar lista", pl.name, "Guardar", (name) => { pl.name = name.trim(); persist(); renderAll(); });
};
$("#pl-share").onclick = () => sharePlaylist(openPlaylist());
$("#pl-delete").onclick = () => {
  const pl = openPlaylist();
  if (!confirm(`¿Eliminar la lista «${pl.name}»?`)) return;
  state.playlists = state.playlists.filter((p) => p.id !== pl.id);
  openListId = null; persist(); renderAll(); toast("Lista eliminada");
};

// ---------- Menú ⋮ de cada canción ----------
function closeMenu() { $("#menu").classList.add("hidden"); }
function openTrackMenu(anchor, t, mode) {
  const m = $("#menu");
  const items = [["radio", "Iniciar radio", "radio"]];
  if (mode !== "queue") items.push(["next", "Reproducir después", "playNext"], ["add", "Añadir a la cola", "add"]);
  if (mode === "queue" || mode === "pl") items.push(["fav", isFav(t.id) ? "Quitar de favoritos" : "Añadir a favoritos", isFav(t.id) ? "fav" : "favOff"]);
  items.push(["list", "Añadir a una lista…", "listAdd"], ["share", "Compartir", "share"]);
  m.innerHTML = items.map(([a, label, ic]) => `<button data-m="${a}">${icon(ic)}<span>${label}</span></button>`).join("");
  m.onclick = (e) => {
    const b = e.target.closest("[data-m]"); if (!b) return;
    closeMenu();
    switch (b.dataset.m) {
      case "radio": return startRadio(t);
      case "next": state.queue.splice(state.index + 1, 0, t); toast("Sonará después"); break;
      case "add": state.queue.push(t); toast("Añadida a la cola"); break;
      case "fav": return toggleFav(t);
      case "list": return openAddToList(t);
      case "share": return shareTrack(t);
    }
    persist(); renderAll();
  };
  m.classList.remove("hidden");
  const r = anchor.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + "px";
  m.style.top = (r.bottom + h + 8 < innerHeight ? r.bottom + 4 : Math.max(8, r.top - h - 4)) + "px";
}
document.addEventListener("pointerdown", (e) => {
  if (!$("#menu").classList.contains("hidden") && !e.target.closest("#menu") && !e.target.closest('[data-act="more"]')) closeMenu();
});
$("main").addEventListener("scroll", closeMenu, { passive: true });
addEventListener("resize", closeMenu);

// ---------- Ventanas: elegir lista / escribir nombre ----------
function openSheet(html) {
  $("#sheet-body").innerHTML = html;
  $("#sheet").classList.remove("hidden");
}
function closeSheet() { $("#sheet").classList.add("hidden"); $("#sheet-body").innerHTML = ""; }
$("#sheet").addEventListener("click", (e) => { if (e.target.id === "sheet" || e.target.closest("[data-close]")) closeSheet(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeSheet(); closeMenu(); } });

function askName(title, initial, confirmLabel, onOk) {
  openSheet(`
    <h2>${esc(title)}</h2>
    <form id="name-form" autocomplete="off">
      <input id="name-input" type="text" maxlength="80" placeholder="Nombre de la lista" value="${esc(initial)}" enterkeyhint="done">
      <div class="sheet-actions">
        <button type="button" class="text-btn" data-close>Cancelar</button>
        <button type="submit" class="text-btn accent">${esc(confirmLabel)}</button>
      </div>
    </form>`);
  const input = $("#name-input");
  setTimeout(() => { input.focus(); input.select(); }, 30);
  $("#name-form").onsubmit = (e) => {
    e.preventDefault();
    const v = input.value.trim(); if (!v) return input.focus();
    closeSheet(); onOk(v);
  };
}

function openAddToList(t) {
  if (!state.playlists.length) return askName("Nueva lista", "", "Crear y añadir", (name) => createPlaylist(name, t));
  openSheet(`
    <h2>Añadir a una lista</h2>
    <div class="sheet-sub">${esc(t.title)}</div>
    <ul class="sheet-list">
      <li><button data-new>${icon("add")}<span class="accent">Nueva lista…</span></button></li>
      ${state.playlists.map((p) => `
        <li><button data-pl="${esc(p.id)}">${icon("list")}
          <span class="grow"><span class="title">${esc(p.name)}</span><span class="sub">${nCanciones(p.tracks.length)}</span></span>
          ${p.tracks.some((x) => x.id === t.id) ? `<span class="accent" title="Ya está">${icon("check")}</span>` : ""}
        </button></li>`).join("")}
    </ul>
    <div class="sheet-actions"><button class="text-btn" data-close>Cerrar</button></div>`);
  $("#sheet-body").onclick = (e) => {
    if (e.target.closest("[data-new]")) return askName("Nueva lista", "", "Crear y añadir", (name) => createPlaylist(name, t));
    const b = e.target.closest("[data-pl]");
    if (b) { closeSheet(); addToPlaylist(b.dataset.pl, t); }
  };
}
renderAll();

// ---------- Compartir listas ----------
// La lista viaja dentro del propio enlace (#list=…), comprimida: no se guarda nada en el servidor
// y el enlace funciona aunque el servidor se reinicie.
const b64url = (bytes) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64url = (str) => Uint8Array.from(atob(str.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
async function pipeBytes(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}
async function encodePlaylist(pl) {
  const data = JSON.stringify({ n: pl.name, t: pl.tracks.map((t) => [t.id, t.title, t.channel || "", Math.round(t.duration || 0)]) });
  const bytes = new TextEncoder().encode(data);
  if (typeof CompressionStream === "function") {
    try { return "z" + b64url(await pipeBytes(bytes, new CompressionStream("deflate-raw"))); } catch {}
  }
  return "j" + b64url(bytes);
}
async function decodePlaylist(code) {
  let bytes = unb64url(code.slice(1));
  if (code[0] === "z") bytes = await pipeBytes(bytes, new DecompressionStream("deflate-raw"));
  const d = JSON.parse(new TextDecoder().decode(bytes));
  const tracks = (d.t || []).filter((x) => Array.isArray(x) && /^[\w-]{11}$/.test(x[0])).map(([id, title, channel, duration]) =>
    ({ id, title: String(title || ""), channel: String(channel || ""), duration: +duration || 0, thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` }));
  return { name: String(d.n || "Lista compartida").slice(0, 80), tracks };
}

async function sharePlaylist(pl) {
  if (!pl) return;
  if (!pl.tracks.length) return toast("La lista está vacía");
  const url = `${location.origin}/#list=${await encodePlaylist(pl)}`;
  const text = `Lista «${pl.name}» · ${nCanciones(pl.tracks.length)}`;
  return shareLink({ title: pl.name, text, url, label: "Compartir lista" });
}

// iPhone/iPad: Safari y la app de la pantalla de inicio guardan los datos por separado,
// y iOS siempre abre los enlaces en Safari. Ahí se ofrece copiar el enlace para pegarlo en la app.
const IS_STANDALONE = navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
const IOS_BROWSER = /iPhone|iPad|iPod/.test(navigator.userAgent) && !IS_STANDALONE;

async function openSharedPlaylistFromHash() {
  const m = location.hash.match(/^#list=([zj][\w-]+)$/);
  if (!m) return;
  history.replaceState(null, "", location.pathname + location.search);
  return openSharedPlaylistCode(m[0]);
}

async function openSharedPlaylistCode(text) {
  const m = String(text).match(/#list=([zj][\w-]+)/);
  if (!m) return toast("Ese enlace no es de una lista de Musicola");
  let shared;
  try { shared = await decodePlaylist(m[1]); } catch { return toast("El enlace de la lista no es válido"); }
  if (!shared.tracks.length) return toast("La lista compartida está vacía");
  const preview = shared.tracks.slice(0, 5).map((t) => `<li><span class="title">${esc(t.title)}</span><span class="sub">${esc(t.channel)}</span></li>`).join("");
  openSheet(`
    <h2>Lista compartida</h2>
    <div class="sheet-sub">«${esc(shared.name)}» · ${nCanciones(shared.tracks.length)}</div>
    <ul class="shared-preview">${preview}${shared.tracks.length > 5 ? `<li class="sub">y ${shared.tracks.length - 5} más…</li>` : ""}</ul>
    ${IOS_BROWSER ? `<div class="ios-hint">
      <b>¿Usas Musicola desde la pantalla de inicio?</b> El iPhone abre los enlaces en Safari, que no comparte las listas con la app.
      Copia el enlace, abre Musicola y en <b>Listas</b> pulsa <b>Pegar lista</b>.
      <button class="text-btn accent" data-copylink>Copiar enlace para la app</button>
    </div>` : ""}
    <div class="sheet-actions">
      <button class="text-btn" data-close>Cerrar</button>
      <button class="text-btn" data-sh="play">Reproducir</button>
      <button class="text-btn accent" data-sh="save">Guardar lista</button>
    </div>`);
  prefetchMany(shared.tracks.slice(0, 3).map((t) => t.id));
  const link = `${location.origin}/#list=${m[1]}`;
  $("#sheet-body").onclick = async (e) => {
    const c = e.target.closest("[data-copylink]");
    if (c) {
      try { await navigator.clipboard.writeText(link); c.textContent = "¡Copiado! Ahora abre Musicola"; }
      catch { prompt("Copia este enlace:", link); }
      return;
    }
    const b = e.target.closest("[data-sh]"); if (!b) return;
    closeSheet();
    if (b.dataset.sh === "play") return playPlaylist(shared);
    const exists = state.playlists.some((p) => p.name === shared.name);
    const pl = { id: "p" + Date.now().toString(36), name: exists ? `${shared.name} (compartida)` : shared.name, tracks: shared.tracks };
    state.playlists.unshift(pl);
    openListId = pl.id; persist(); renderAll();
    document.querySelector('.tabs button[data-tab="lists"]').click();
    toast(`Lista «${pl.name}» guardada`);
  };
}
addEventListener("hashchange", openSharedPlaylistFromHash);

// «Pegar lista»: lee el enlace del portapapeles (iOS muestra el botón «Pegar» para permitirlo)
async function pastePlaylist() {
  let text = "";
  try { text = await navigator.clipboard.readText(); } catch {}
  if (/#list=[zj][\w-]+/.test(text)) return openSharedPlaylistCode(text);
  askName("Pegar lista", "", "Abrir", (v) => openSharedPlaylistCode(v));
  const input = $("#name-input");
  if (input) { input.removeAttribute("maxlength"); input.placeholder = "Pega aquí el enlace de la lista"; input.value = ""; }
}
$("#pl-paste").onclick = pastePlaylist;
