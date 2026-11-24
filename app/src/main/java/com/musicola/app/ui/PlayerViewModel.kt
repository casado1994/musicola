package com.musicola.app.ui

import android.app.Application
import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import com.musicola.app.data.Track
import com.musicola.app.data.YouTube
import kotlinx.coroutines.Job
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
    fun search() {
        val q = query.trim()
        if (q.isEmpty()) return
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            loading = true; message = null; results = emptyList()
            try {
                results = YouTube.search(q, onlySongs)
                if (results.isEmpty()) message = "Sin resultados."
            } catch (e: Exception) {
                message = "Error al buscar: ${e.message ?: e.javaClass.simpleName}"
            } finally {
                loading = false
            }
        }
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

    // ---- Favoritos ----
    fun isFav(id: String) = favs.any { it.id == id }
    fun toggleFav(track: Track) {
        favs = if (isFav(track.id)) favs.filterNot { it.id == track.id } else listOf(track) + favs
        prefs.edit().putString("favs", Track.listToJson(favs)).apply()
    }

    // ---- Compartir desde YouTube ----
    fun openShared(text: String) {
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
