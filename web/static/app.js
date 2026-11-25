// Musicola - frontend
const $ = (s) => document.querySelector(s);
const audio = $("#audio");

// Token opcional: abre la app una vez como /?t=TU_TOKEN y se recuerda.
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
  shuffle: load("shuffle", false),
  repeat: load("repeat", "off"), // off | all | one
  radio: load("radio", false),
  played: load("played", []), // ids escuchados recientemente (para que la radio no repita)
  results: [],
};
const persist = () => {
  save("queue", state.queue); save("index", state.index); save("favs", state.favs);
  save("shuffle", state.shuffle); save("repeat", state.repeat);
  save("radio", state.radio); save("played", state.played.slice(-300));
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
        ${mode === "queue"
          ? `<button data-act="up" title="Subir">${icon("up")}</button><button data-act="remove" title="Quitar">${icon("close")}</button>`
          : `<button data-act="radio" title="Iniciar radio con esta canción">${icon("radio")}</button><button data-act="next" title="Reproducir después">${icon("playNext")}</button><button data-act="add" title="Añadir a la cola">${icon("add")}</button>`}
        <button data-act="fav" class="${isFav(t.id) ? "on" : ""}" title="Favorito">${icon(isFav(t.id) ? "fav" : "favOff")}</button>
      </div>
    </li>`).join("");
}
function renderAll() {
  renderList($("#results"), state.results, "results");
  renderList($("#queue"), state.queue, "queue");
  renderList($("#favs"), state.favs, "favs");
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
function playIndex(i, autoplay = true) {
  if (i < 0 || i >= state.queue.length) return;
  state.index = i;
  const t = current();
  // Al restaurar la última canción no se descarga nada hasta pulsar play
  audio.preload = autoplay ? "auto" : "none";
  audio.src = withToken(`/api/stream/${t.id}`);
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
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title, artist: t.channel,
    artwork: [
      { src: t.thumb, sizes: "320x180", type: "image/jpeg" },
      { src: `https://i.ytimg.com/vi/${t.id}/hqdefault.jpg`, sizes: "480x360", type: "image/jpeg" },
    ],
  });
}
if ("mediaSession" in navigator) {
  const ms = navigator.mediaSession;
  ms.setActionHandler("play", () => audio.play());
  ms.setActionHandler("pause", () => audio.pause());
  ms.setActionHandler("previoustrack", prev);
  ms.setActionHandler("nexttrack", () => next());
  try { ms.setActionHandler("seekto", (d) => { audio.currentTime = d.seekTime; }); } catch {}
  try { ms.setActionHandler("seekbackward", (d) => { audio.currentTime -= d.seekOffset || 10; }); } catch {}
  try { ms.setActionHandler("seekforward", (d) => { audio.currentTime += d.seekOffset || 10; }); } catch {}
}

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
  for (const n of state.queue.slice(state.index + 1, state.index + 3)) prefetch(n.id, true);
}
const prefetched = new Set();
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
for (const [id, mode] of [["#results", "results"], ["#queue", "queue"], ["#favs", "favs"]]) {
  $(id).addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]"); const li = e.target.closest(".item");
    if (!btn || !li) return;
    const i = +li.dataset.i;
    const list = mode === "results" ? state.results : mode === "queue" ? state.queue : state.favs;
    const t = list[i];
    switch (btn.dataset.act) {
      case "play":
        if (mode === "queue") playIndex(i);
        else if (mode === "favs") { state.queue = [...state.favs]; playIndex(i); } // reproduce la lista de favoritos
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

// Pestañas
document.querySelectorAll(".tabs button").forEach((b) => b.onclick = () => {
  document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
  for (const id of ["results", "queue", "favs"]) $("#" + id).classList.toggle("hidden", id !== b.dataset.tab);
  currentTab = b.dataset.tab; updateQueueBar();
  setStatus(b.dataset.tab === "favs" && !state.favs.length ? "Aún no tienes favoritos." : "");
});

// Búsqueda
$("#search-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("#q").value.trim(); if (!q) return;
  $("#q").blur();
  document.querySelector('.tabs button[data-tab="results"]').click();
  state.results = []; renderAll(); setStatus("Buscando…");
  try {
    const r = await fetch(withToken(`/api/search?q=${encodeURIComponent(q)}`));
    if (r.status === 401) {
      // Servidor protegido: pide la contraseña una vez y la recuerda en este navegador
      const t = prompt("Contraseña de Musicola:");
      if (t) { localStorage.setItem("token", t.trim()); location.reload(); }
      setStatus("Hace falta la contraseña."); return;
    }
    if (!r.ok) throw new Error((await r.json()).detail || r.status);
    state.results = await r.json();
    // Como Spotify: el servidor guarda los primeros segundos de audio de los 5 primeros resultados
    state.results.slice(0, 5).forEach((t, i) => setTimeout(() => prefetch(t.id, true), i * 400));
    setStatus(state.results.length ? "" : "Sin resultados.");
  } catch (err) { setStatus("Error: " + err.message); }
  renderAll();
});

// ---------- Volumen ----------
const volume = { level: load("volume", 1), muted: load("muted", false) };
function applyVolume() {
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
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && audio.paused) warmCurrent();
});

// Arranque: restaura la última canción (sin reproducir automáticamente)
if (current()) { playIndex(state.index, false); warmCurrent(); }
renderAll();
setStatus(state.queue.length ? "" : "Busca algo para empezar");

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
