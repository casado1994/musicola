package com.musicola.app.ui

import android.app.Application
import android.content.Context
import android.net.ConnectivityManager
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import com.musicola.app.data.Playlist
import com.musicola.app.data.PlaylistLink
import com.musicola.app.data.Track
import com.musicola.app.data.YouTube
import com.musicola.app.playback.AudioCache
import com.musicola.app.playback.StreamResolver
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class PlayerViewModel(app: Application) : AndroidViewModel(app) {

    private val prefs = app.getSharedPreferences("musicola", Context.MODE_PRIVATE)
    private var controller: MediaController? = null
    private var searchJob: Job? = null
    private var pendingShare: String? = null

    // ---- Estado observable por la UI ----
    var query by mutableStateOf("")
    var onlySongs by mutableStateOf(prefs.getBoolean("onlySongs", true))
        private set
    var results by mutableStateOf<List<Track>>(emptyList())
        private set
    var loading by mutableStateOf(false)
        private set
    var message by mutableStateOf<String?>(null)
        private set

    var queue by mutableStateOf<List<Track>>(emptyList())
        private set
    var currentIndex by mutableStateOf(-1)
        private set
    var isPlaying by mutableStateOf(false)
        private set
    var isBuffering by mutableStateOf(false)
        private set
    var shuffle by mutableStateOf(false)
        private set
    var repeatMode by mutableStateOf(Player.REPEAT_MODE_OFF)
        private set
    var position by mutableLongStateOf(0L)
        private set
    var duration by mutableLongStateOf(0L)
        private set

    var radio by mutableStateOf(prefs.getBoolean("radio", false))
        private set

    var favs by mutableStateOf(Track.listFromJson(prefs.getString("favs", null)))
        private set

    val current: Track? get() = queue.getOrNull(currentIndex)

    private val listener = object : Player.Listener {
        override fun onEvents(player: Player, events: Player.Events) = sync()
    }

    // ---- Conexión con el servicio ----
    fun attach(c: MediaController) {
        controller = c
        c.addListener(listener)
        if (c.mediaItemCount == 0) {
            // Restaura la última cola (sin reproducir automáticamente)
            val saved = Track.listFromJson(prefs.getString("queue", null))
            if (saved.isNotEmpty()) {
                val idx = prefs.getInt("index", 0).coerceIn(0, saved.lastIndex)
                c.setMediaItems(saved.map { it.toMediaItem() }, idx, prefs.getLong("pos", 0L))
                c.shuffleModeEnabled = prefs.getBoolean("shuffle", false)
                c.repeatMode = prefs.getInt("repeat", Player.REPEAT_MODE_OFF)
            }
        }
        sync()
        pendingShare?.let { pendingShare = null; openShared(it) }
    }

    fun detach() {
        controller?.let { savePosition(it); it.removeListener(listener) }
        controller = null
    }

    private fun sync() {
        val c = controller ?: return
        queue = (0 until c.mediaItemCount).map { Track.fromMediaItem(c.getMediaItemAt(it)) }
        currentIndex = if (c.mediaItemCount == 0) -1 else c.currentMediaItemIndex
        isPlaying = c.isPlaying
        isBuffering = c.playbackState == Player.STATE_BUFFERING
        shuffle = c.shuffleModeEnabled
        repeatMode = c.repeatMode
        tick()
        prefs.edit()
            .putString("queue", Track.listToJson(queue))
            .putInt("index", currentIndex.coerceAtLeast(0))
            .putBoolean("shuffle", shuffle)
            .putInt("repeat", repeatMode)
            .apply()
    }

    /** Lo llama la UI periódicamente para mover la barra de progreso. */
    fun tick() {
        val c = controller ?: return
        position = c.currentPosition.coerceAtLeast(0)
        duration = c.duration.takeIf { it > 0 } ?: ((current?.duration ?: 0L) * 1000L)
    }

    private fun savePosition(c: MediaController) {
        prefs.edit().putLong("pos", c.currentPosition.coerceAtLeast(0)).apply()
    }

    // ---- Búsqueda ----
    private var typingJob: Job? = null

    /** Búsqueda mientras escribes (como Spotify): se lanza al dejar de escribir 0,45 s. */
    fun onQueryChange(value: String) {
        query = value
        typingJob?.cancel()
        if (value.trim().length < 3) return
        typingJob = viewModelScope.launch {
            delay(450)
            search(typing = true)
        }
    }

    fun search(typing: Boolean = false) {
        val q = query.trim()
        if (q.isEmpty()) return
        if (q.contains("#list=")) { // enlace de lista pegado en el buscador
            if (!typing) { query = ""; openShared(q) }
            return
        }
        if (!typing) typingJob?.cancel()
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            message = null
            if (!typing) results = emptyList() // al escribir, se mantienen los resultados hasta que llegan los nuevos
            loading = results.isEmpty()
            try {
                results = YouTube.search(q, onlySongs)
                if (results.isEmpty()) message = "Sin resultados."
                prefetchResults(results)
            } catch (e: Exception) {
                message = "Error al buscar: ${e.message ?: e.javaClass.simpleName}"
            } finally {
                loading = false
            }
        }
    }

    private var prefetchJob: Job? = null

    /** ¿Conexión sin límite de datos (Wi-Fi)? Con datos móviles se precarga menos audio. */
    private fun unmetered(): Boolean = runCatching {
        !getApplication<Application>().getSystemService(ConnectivityManager::class.java).isActiveNetworkMetered
    }.getOrDefault(false)

    /**
     * Precarga, como Spotify:
     *  - primeros segundos de AUDIO en el móvil: de todos los resultados con Wi-Fi,
     *    de los 5 primeros con datos móviles (al pulsarlos suenan casi al instante);
     *  - del resto, solo la dirección del audio (apenas gasta datos).
     */
    private fun prefetchResults(list: List<Track>) {
        prefetchJob?.cancel() // una búsqueda nueva sustituye a la anterior
        prefetchJob = prefetchList(list)
    }

    private fun prefetchList(list: List<Track>): Job = viewModelScope.launch(AudioCache.dispatcher) {
        val withAudio = if (unmetered()) list.size else 5
        for (pair in list.take(withAudio).chunked(2)) {
            if (!isActive) break
            pair.map { t -> async { AudioCache.prefetchStart(t.id) } }.awaitAll()
        }
        for (pair in list.drop(withAudio).chunked(2)) {
            if (!isActive) break
            pair.map { t ->
                async { if (!StreamResolver.isCached(t.id)) runCatching { StreamResolver.resolve(t.id) } }
            }.awaitAll()
        }
    }

    private var tabJob: Job? = null

    /** Al abrir Cola (1) o Favoritos (2), se preparan sus primeras canciones. */
    fun prefetchTab(tab: Int) {
        val list = when (tab) {
            1 -> queue.drop(currentIndex.coerceAtLeast(0)).take(15)
            2 -> favs.take(15)
            else -> return
        }
        tabJob?.cancel()
        tabJob = prefetchList(list)
    }

    /** Al tocar una canción (antes de levantar el dedo) se empieza a preparar. */
    fun prefetchOne(t: Track) {
        if (AudioCache.hasStart(t.id)) return
        viewModelScope.launch(AudioCache.dispatcher) { AudioCache.prefetchStart(t.id) }
    }

    fun chooseOnlySongs(value: Boolean) {
        onlySongs = value
        prefs.edit().putBoolean("onlySongs", value).apply()
        if (query.isNotBlank()) search()
    }

    // ---- Cola y reproducción ----
    private fun ensurePrepared(c: MediaController) {
        if (c.playbackState == Player.STATE_IDLE) c.prepare()
    }

    fun playNow(track: Track) {
        val c = controller ?: return
        val existing = queue.indexOfFirst { it.id == track.id }
        val target = if (existing >= 0) existing else {
            val at = if (c.mediaItemCount == 0) 0 else c.currentMediaItemIndex + 1
            c.addMediaItem(at, track.toMediaItem())
            at
        }
        c.seekTo(target, 0)
        ensurePrepared(c)
        c.play()
    }

    fun playList(tracks: List<Track>, start: Int) {
        val c = controller ?: return
        c.setMediaItems(tracks.map { it.toMediaItem() }, start, 0)
        c.prepare()
        c.play()
    }

    fun addToQueue(track: Track) {
        controller?.addMediaItem(track.toMediaItem())
        message = "Añadida a la cola"
    }

    fun playNext(track: Track) {
        val c = controller ?: return
        val at = if (c.mediaItemCount == 0) 0 else c.currentMediaItemIndex + 1
        c.addMediaItem(at, track.toMediaItem())
        message = "Sonará a continuación"
    }

    fun removeAt(i: Int) { controller?.removeMediaItem(i) }
    fun moveUp(i: Int) { if (i > 0) controller?.moveMediaItem(i, i - 1) }
    fun playAt(i: Int) {
        val c = controller ?: return
        c.seekTo(i, 0); ensurePrepared(c); c.play()
    }
    fun clearQueue() { controller?.clearMediaItems() }

    fun togglePlay() {
        val c = controller ?: return
        if (c.isPlaying) c.pause() else {
            if (c.playbackState == Player.STATE_ENDED) c.seekTo(0)
            ensurePrepared(c); c.play()
        }
    }
    fun next() { controller?.let { it.seekToNext(); ensurePrepared(it) } }
    fun previous() { controller?.let { it.seekToPrevious(); ensurePrepared(it) } }
    fun seekTo(ms: Long) { controller?.seekTo(ms); position = ms }
    fun toggleShuffle() { controller?.let { it.shuffleModeEnabled = !it.shuffleModeEnabled } }
    fun cycleRepeat() {
        controller?.let {
            it.repeatMode = when (it.repeatMode) {
                Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ALL
                Player.REPEAT_MODE_ALL -> Player.REPEAT_MODE_ONE
                else -> Player.REPEAT_MODE_OFF
            }
        }
    }

    // ---- Modo radio ----
    fun toggleRadio() {
        radio = !radio
        prefs.edit().putBoolean("radio", radio).apply() // el servicio escucha este cambio
        message = if (radio) "📻 Radio activada: al acabar la cola sonarán canciones parecidas" else "Radio desactivada"
    }

    fun startRadio(track: Track) {
        radio = true
        prefs.edit().putBoolean("radio", true).apply()
        playList(listOf(track), 0) // el servicio rellena la cola con canciones parecidas
        message = "📻 Radio de «${track.title}»"
    }

    // ---- Listas de reproducción ----
    var playlists by mutableStateOf(Playlist.listFromJson(prefs.getString("playlists", null)))
        private set

    private fun savePlaylists(list: List<Playlist>) {
        playlists = list
        // El servicio (Android Auto) lee estas listas de aquí
        prefs.edit().putString("playlists", Playlist.listToJson(list)).apply()
    }

    private fun updatePlaylist(id: String, change: (Playlist) -> Playlist) {
        savePlaylists(playlists.map { if (it.id == id) change(it) else it })
    }

    fun createPlaylist(name: String, first: Track? = null): Playlist {
        val pl = Playlist(Playlist.newId(), name.trim().ifBlank { "Mi lista" }, listOfNotNull(first))
        savePlaylists(playlists + pl)
        message = if (first != null) "Añadida a «${pl.name}»" else "Lista «${pl.name}» creada"
        return pl
    }

    fun addToPlaylist(id: String, t: Track) {
        val pl = playlists.find { it.id == id } ?: return
        if (pl.tracks.any { it.id == t.id }) { message = "Ya está en «${pl.name}»"; return }
        updatePlaylist(id) { it.copy(tracks = it.tracks + t) }
        message = "Añadida a «${pl.name}»"
    }

    fun removeFromPlaylist(id: String, index: Int) =
        updatePlaylist(id) { pl -> pl.copy(tracks = pl.tracks.filterIndexed { i, _ -> i != index }) }

    fun movePlaylistTrackUp(id: String, index: Int) {
        if (index <= 0) return
        updatePlaylist(id) { pl ->
            val l = pl.tracks.toMutableList()
            l.add(index - 1, l.removeAt(index))
            pl.copy(tracks = l)
        }
    }

    fun renamePlaylist(id: String, name: String) {
        if (name.isNotBlank()) updatePlaylist(id) { it.copy(name = name.trim()) }
    }

    fun deletePlaylist(id: String) {
        val pl = playlists.find { it.id == id } ?: return
        savePlaylists(playlists.filterNot { it.id == id })
        message = "Lista «${pl.name}» eliminada"
    }

    fun playPlaylist(pl: Playlist, start: Int = 0, shuffled: Boolean = false) {
        if (pl.tracks.isEmpty()) { message = "La lista está vacía"; return }
        if (shuffled) playList(pl.tracks.shuffled(), 0) else playList(pl.tracks, start)
    }

    // ---- Favoritos ----
    fun isFav(id: String) = favs.any { it.id == id }
    fun toggleFav(track: Track) {
        favs = if (isFav(track.id)) favs.filterNot { it.id == track.id } else listOf(track) + favs
        prefs.edit().putString("favs", Track.listToJson(favs)).apply()
    }

    // ---- Compartir desde YouTube ----
    // ---- Listas compartidas (enlaces #list=…, compatibles con la web) ----
    var sharedPlaylist by mutableStateOf<Playlist?>(null)
        private set

    fun sharePlaylistLink(pl: Playlist): String = PlaylistLink.encode(pl)

    fun dismissSharedPlaylist() { sharedPlaylist = null }

    fun saveSharedPlaylist(): Playlist? {
        val shared = sharedPlaylist ?: return null
        sharedPlaylist = null
        val name = if (playlists.any { it.name == shared.name }) "${shared.name} (compartida)" else shared.name
        val pl = shared.copy(id = Playlist.newId(), name = name)
        savePlaylists(playlists + pl)
        message = "Lista «$name» guardada"
        return pl
    }

    fun playSharedPlaylist() {
        val shared = sharedPlaylist ?: return
        sharedPlaylist = null
        playPlaylist(shared)
    }

    fun openShared(text: String) {
        if (text.contains("#list=")) {
            val pl = PlaylistLink.decode(text)
            when {
                pl == null -> message = "El enlace de la lista no es válido"
                pl.tracks.isEmpty() -> message = "La lista compartida está vacía"
                else -> { sharedPlaylist = pl; pl.tracks.take(3).forEach { prefetchOne(it) } }
            }
            return
        }
        if (controller == null) { pendingShare = text; return }
        val url = Regex("https?://\\S+").find(text)?.value ?: return
        viewModelScope.launch {
            message = "Cargando enlace…"
            try {
                val t = YouTube.trackFromUrl(url)
                if (t != null) { playNow(t); message = null } else message = "Enlace no reconocido"
            } catch (e: Exception) {
                message = "No se pudo abrir el enlace: ${e.message}"
            }
        }
    }

    fun consumeMessage() { message = null }
}
