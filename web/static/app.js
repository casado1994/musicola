// Musicola - frontend
const $ = (s) => document.querySelector(s);
const audio = $("#audio");

// Token opcional: abre la app una vez como /?t=TU_TOKEN y se recuerda.
const urlToken = new URLSearchParams(location.search).get("t");
if (urlToken) { localStorage.setItem("token", urlToken); history.replaceState(null, "", "/"); }
const TOKEN = localStorage.getItem("token") || "";
const withToken = (u) => TOKEN ? u + (u.includes("?") ? "&" : "?") + "t=" + encodeURIComponent(TOKEN) : u;

// ---------- Estado persistente ----------
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const state = {
  queue: load("queue", []),
  index: load("index", -1),
  favs: load("favs", []),
  shuffle: load("shuffle", false),
  repeat: load("repeat", "off"), // off | all | one
  results: [],
};
const persist = () => {
  save("queue", state.queue); save("index", state.index); save("favs", state.favs);
  save("shuffle", state.shuffle); save("repeat", state.repeat);
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
        <div class="sub">${esc(t.channel)}${t.duration ? " · " + fmt(t.duration) : ""}</div>
      </div>
      <div class="actions">
        ${mode === "queue"
          ? `<button data-act="up" title="Subir">↑</button><button data-act="remove" title="Quitar">✕</button>`
          : `<button data-act="next" title="Reproducir después">⇥</button><button data-act="add" title="Añadir a la cola">＋</button>`}
        <button data-act="fav" title="Favorito">${isFav(t.id) ? "♥" : "♡"}</button>
      </div>
    </li>`).join("");
}
function renderAll() {
  renderList($("#results"), state.results, "results");
  renderList($("#queue"), state.queue, "queue");
  renderList($("#favs"), state.favs, "favs");
  $("#queue-count").textContent = state.queue.length ? `(${state.queue.length})` : "";
  const t = current();
  $("#np-title").textContent = t ? t.title : "Nada sonando";
  $("#np-channel").textContent = t ? t.channel : "";
  if (t) $("#np-thumb").src = t.thumb; else $("#np-thumb").removeAttribute("src");
  $("#btn-fav").textContent = t && isFav(t.id) ? "♥" : "♡";
  $("#btn-fav").classList.toggle("on", !!(t && isFav(t.id)));
  $("#btn-shuffle").classList.toggle("on", state.shuffle);
  $("#btn-repeat").classList.toggle("on", state.repeat !== "off");
  $("#btn-repeat").textContent = state.repeat === "one" ? "↻¹" : "↻";
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
  $("#btn-play").textContent = on ? "…" : (audio.paused ? "▶" : "⏸");
  $("#btn-play").classList.toggle("loading", on);
  const t = current();
  if (on && t) setStatus(`Cargando «${t.title}»… (la primera vez puede tardar unos segundos)`);
}
audio.addEventListener("play", () => { if (!loading) $("#btn-play").textContent = "⏸"; });
audio.addEventListener("pause", () => { if (!loading) $("#btn-play").textContent = "▶"; });
audio.addEventListener("loadstart", () => { if (audio.getAttribute("src")) setLoading(!audio.paused || audio.autoplay); });
audio.addEventListener("waiting", () => setLoading(true));
audio.addEventListener("playing", () => { setLoading(false); prefetchNext(); });
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
  if (++errorStreak < 3 && state.index < state.queue.length - 1) setTimeout(() => next(true), 2500);
});
// Prepara la siguiente canción en el servidor mientras suena la actual
function prefetchNext() {
  const n = state.queue[state.index + 1];
  if (n) fetch(withToken(`/api/prefetch/${n.id}`)).catch(() => {});
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

// Pestañas
document.querySelectorAll(".tabs button").forEach((b) => b.onclick = () => {
  document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
  for (const id of ["results", "queue", "favs"]) $("#" + id).classList.toggle("hidden", id !== b.dataset.tab);
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
    setStatus(state.results.length ? "" : "Sin resultados.");
  } catch (err) { setStatus("Error: " + err.message); }
  renderAll();
});

// Atajos de teclado
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if (e.code === "Space") { e.preventDefault(); togglePlay(); }
  else if (e.key === "ArrowRight") audio.currentTime += 10;
  else if (e.key === "ArrowLeft") audio.currentTime -= 10;
  else if (e.key === "n") next();
  else if (e.key === "p") prev();
  else if (e.key === "/") { e.preventDefault(); $("#q").focus(); }
});

// Arranque: restaura la última canción (sin reproducir automáticamente)
if (current()) playIndex(state.index, false);
renderAll();
setStatus(state.queue.length ? "" : "Busca algo para empezar 🎵");

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
