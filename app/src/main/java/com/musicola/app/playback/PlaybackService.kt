package com.musicola.app.playback

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Bundle
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaLibraryService.LibraryParams
import androidx.media3.session.MediaLibraryService.MediaLibrarySession
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSession.MediaItemsWithStartPosition
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.musicola.app.MainActivity
import com.musicola.app.data.Track
import com.musicola.app.data.YouTube
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.guava.future
import kotlinx.coroutines.launch
import java.util.concurrent.ConcurrentHashMap

/**
 * Servicio de reproducción:
 *  - mantiene la música sonando con la app cerrada (notificación, pantalla de bloqueo, auriculares)
 *  - expone un catálogo navegable para Android Auto: Favoritos, Recientes y búsqueda (también por voz)
 */
@OptIn(UnstableApi::class)
class PlaybackService : MediaLibraryService() {

    private companion object {
        const val ROOT = "root"
        const val FAVS = "favs"
        const val RECENT = "recent"
        const val SEARCH_PREFIX = "search:"
        const val MAX_RECENT = 50
    }

    private var session: MediaLibrarySession? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val prefs by lazy { getSharedPreferences("musicola", Context.MODE_PRIVATE) }
    private val searchResults = ConcurrentHashMap<String, List<Track>>()
    private var radioBusy = false

    // Al activar la radio desde la app, se rellena la cola al momento si hace falta
    private val prefsListener = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
        if (key == "radio") session?.player?.let { maybeExtendRadio(it) }
    }

    override fun onCreate() {
        super.onCreate()

        // Peticiones al estilo de NewPipe (POST + parámetro rn) para que YouTube no corte la descarga
        val youtubeHttp = YoutubeHttpDataSource.Factory()
            .setRangeParameterEnabled(false)
            .setRnParameterEnabled(true)

        // "yt:VIDEO_ID" -> URL real del audio, resuelta en el hilo de carga
        val resolving = ResolvingDataSource.Factory(youtubeHttp) { spec ->
            if (spec.uri.scheme == "yt") {
                spec.withUri(Uri.parse(StreamResolver.resolve(spec.uri.schemeSpecificPart)))
            } else spec
        }

        val player = ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(resolving))
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                /* handleAudioFocus = */ true
            )
            .setHandleAudioBecomingNoisy(true) // pausa al desconectar los auriculares
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()

        player.addListener(object : Player.Listener {
            private var retriedId: String? = null

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (isPlaying) retriedId = null
            }

            override fun onPlayerError(error: PlaybackException) {
                val id = player.currentMediaItem?.mediaId ?: return
                if (retriedId != id) {
                    // Probablemente la URL ha caducado: se vuelve a pedir una vez
                    retriedId = id
                    StreamResolver.invalidate(id)
                    player.prepare()
                    player.play()
                } else if (player.hasNextMediaItem()) {
                    player.seekToNextMediaItem()
                    player.prepare()
                    player.play()
                }
            }

            override fun onEvents(p: Player, events: Player.Events) {
                if (events.contains(Player.EVENT_MEDIA_ITEM_TRANSITION)) {
                    p.currentMediaItem?.let { addRecent(Track.fromMediaItem(it)) }
                }
                if (events.containsAny(Player.EVENT_TIMELINE_CHANGED, Player.EVENT_MEDIA_ITEM_TRANSITION)) {
                    saveQueue(p)
                }
                if (events.contains(Player.EVENT_MEDIA_ITEM_TRANSITION)) maybeExtendRadio(p)
                if (events.contains(Player.EVENT_PLAYBACK_STATE_CHANGED) && p.playbackState == Player.STATE_ENDED) {
                    maybeExtendRadio(p, force = true)
                }
            }
        })

        val openApp = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        session = MediaLibrarySession.Builder(this, player, LibraryCallback())
            .setSessionActivity(openApp)
            .build()

        prefs.registerOnSharedPreferenceChangeListener(prefsListener)
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? = session

    override fun onTaskRemoved(rootIntent: Intent?) {
        val player = session?.player
        // Si no está sonando nada al cerrar la app desde recientes, se para el servicio
        if (player == null || !player.playWhenReady || player.mediaItemCount == 0 ||
            player.playbackState == Player.STATE_ENDED
        ) {
            stopSelf()
        }
    }

    override fun onDestroy() {
        prefs.unregisterOnSharedPreferenceChangeListener(prefsListener)
        scope.cancel()
        session?.run {
            player.release()
            release()
        }
        session = null
        super.onDestroy()
    }

    // ---------------------------------------------------------------- modo radio

    /** Si la radio está activada y quedan pocas canciones, añade canciones parecidas a la actual. */
    private fun maybeExtendRadio(p: Player, force: Boolean = false) {
        if (!prefs.getBoolean("radio", false) || radioBusy) return
        val seed = p.currentMediaItem ?: return
        val remaining = p.mediaItemCount - p.currentMediaItemIndex - 1
        if (!force && remaining >= 3) return
        radioBusy = true
        scope.launch {
            try {
                val inQueue = (0 until p.mediaItemCount).map { p.getMediaItemAt(it).mediaId }.toSet()
                val recent = recents().take(30).map { it.id }.toSet()
                val similar = YouTube.radio(seed.mediaId).filter { it.id !in inQueue }
                // Prioriza lo no escuchado últimamente; si no hay nada nuevo, acepta repetir
                val fresh = similar.filter { it.id !in recent }.ifEmpty { similar }.take(10)
                if (fresh.isNotEmpty()) {
                    val wasEnded = p.playbackState == Player.STATE_ENDED
                    p.addMediaItems(fresh.map { it.toMediaItem() })
                    if (wasEnded) {
                        p.seekToNextMediaItem()
                        p.prepare()
                        p.play()
                    }
                }
            } catch (_: Exception) {
                // sin conexión o YouTube no devolvió nada: se reintentará en la siguiente canción
            } finally {
                radioBusy = false
            }
        }
    }

    // ---------------------------------------------------------------- datos

    private fun favs() = Track.listFromJson(prefs.getString("favs", null))
    private fun recents() = Track.listFromJson(prefs.getString("recents", null))

    private fun addRecent(t: Track) {
        val list = listOf(t) + recents().filterNot { it.id == t.id }
        prefs.edit().putString("recents", Track.listToJson(list.take(MAX_RECENT))).apply()
    }

    private fun saveQueue(p: Player) {
        val queue = (0 until p.mediaItemCount).map { Track.fromMediaItem(p.getMediaItemAt(it)) }
        prefs.edit()
            .putString("queue", Track.listToJson(queue))
            .putInt("index", p.currentMediaItemIndex.coerceAtLeast(0))
            .apply()
    }

    /** Lista de pistas de una carpeta del catálogo ("favs", "recent" o "search:consulta"). */
    private fun listFor(parent: String): List<Track> = when {
        parent == FAVS -> favs()
        parent == RECENT -> recents()
        parent.startsWith(SEARCH_PREFIX) -> searchResults[parent.removePrefix(SEARCH_PREFIX)].orEmpty()
        else -> emptyList()
    }

    // Los elementos del catálogo usan IDs "carpeta|videoId" para saber de qué lista vienen
    private fun splitId(mediaId: String): Pair<String, String>? {
        val sep = mediaId.lastIndexOf('|')
        return if (sep < 0) null else mediaId.substring(0, sep) to mediaId.substring(sep + 1)
    }

    private fun folder(id: String, title: String) = MediaItem.Builder()
        .setMediaId(id)
        .setMediaMetadata(
            MediaMetadata.Builder()
                .setTitle(title)
                .setIsBrowsable(true)
                .setIsPlayable(false)
                .setMediaType(MediaMetadata.MEDIA_TYPE_FOLDER_MIXED)
                .build()
        )
        .build()

    private fun browseItem(parent: String, t: Track): MediaItem {
        val base = t.toMediaItem()
        return base.buildUpon()
            .setMediaId("$parent|${t.id}")
            .setMediaMetadata(
                base.mediaMetadata.buildUpon()
                    .setIsBrowsable(false)
                    .setIsPlayable(true)
                    .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
                    .build()
            )
            .build()
    }

    /** Convierte cualquier MediaItem recibido (de la app o de Android Auto) en uno reproducible. */
    private fun toPlayable(item: MediaItem): MediaItem {
        val split = splitId(item.mediaId)
        if (split != null) {
            val (parent, id) = split
            listFor(parent).firstOrNull { it.id == id }?.let { return it.toMediaItem() }
            return item.buildUpon().setMediaId(id).setUri("yt:$id").build()
        }
        return if (item.mediaMetadata.title != null) Track.fromMediaItem(item).toMediaItem()
        else item.buildUpon().setUri("yt:${item.mediaId}").build()
    }

    private fun <T> paginate(items: List<T>, page: Int, pageSize: Int): List<T> {
        if (pageSize <= 0 || pageSize == Int.MAX_VALUE) return if (page == 0) items else emptyList()
        val from = page.toLong() * pageSize
        if (from >= items.size) return emptyList()
        return items.subList(from.toInt(), minOf(items.size.toLong(), from + pageSize).toInt())
    }

    // ---------------------------------------------------------------- Android Auto / sesión

    private inner class LibraryCallback : MediaLibrarySession.Callback {

        override fun onGetLibraryRoot(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            params: LibraryParams?
        ): ListenableFuture<LibraryResult<MediaItem>> {
            val extras = Bundle().apply {
                putBoolean("android.media.browse.SEARCH_SUPPORTED", true) // botón de búsqueda en Auto
                putInt("android.media.browse.CONTENT_STYLE_BROWSABLE_HINT", 1) // carpetas como lista
                putInt("android.media.browse.CONTENT_STYLE_PLAYABLE_HINT", 1)  // canciones como lista
            }
            return Futures.immediateFuture(
                LibraryResult.ofItem(folder(ROOT, "Musicola"), LibraryParams.Builder().setExtras(extras).build())
            )
        }

        override fun onGetChildren(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            parentId: String,
            page: Int,
            pageSize: Int,
            params: LibraryParams?
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
            val items = when (parentId) {
                ROOT -> listOf(folder(FAVS, "Favoritos"), folder(RECENT, "Recientes"))
                else -> listFor(parentId).map { browseItem(parentId, it) }
            }
            return Futures.immediateFuture(LibraryResult.ofItemList(paginate(items, page, pageSize), params))
        }

        override fun onGetItem(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            mediaId: String
        ): ListenableFuture<LibraryResult<MediaItem>> {
            val item = when (mediaId) {
                ROOT -> folder(ROOT, "Musicola")
                FAVS -> folder(FAVS, "Favoritos")
                RECENT -> folder(RECENT, "Recientes")
                else -> splitId(mediaId)?.let { (parent, id) ->
                    listFor(parent).firstOrNull { it.id == id }?.let { browseItem(parent, it) }
                }
            }
            return Futures.immediateFuture(
                if (item != null) LibraryResult.ofItem(item, null)
                else LibraryResult.ofError(LibraryResult.RESULT_ERROR_BAD_VALUE)
            )
        }

        override fun onSearch(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            query: String,
            params: LibraryParams?
        ): ListenableFuture<LibraryResult<Void>> {
            scope.launch {
                val results = runCatching { YouTube.search(query, onlySongs = true) }.getOrDefault(emptyList())
                searchResults[query] = results
                session.notifySearchResultChanged(browser, query, results.size, params)
            }
            return Futures.immediateFuture(LibraryResult.ofVoid())
        }

        override fun onGetSearchResult(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            query: String,
            page: Int,
            pageSize: Int,
            params: LibraryParams?
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
            val parent = SEARCH_PREFIX + query
            val items = listFor(parent).map { browseItem(parent, it) }
            return Futures.immediateFuture(LibraryResult.ofItemList(paginate(items, page, pageSize), params))
        }

        override fun onAddMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>
        ): ListenableFuture<MutableList<MediaItem>> {
            val query = mediaItems.singleOrNull()?.requestMetadata?.searchQuery
            if (query != null) {
                return scope.future {
                    YouTube.search(query, onlySongs = true).map { it.toMediaItem() }.toMutableList()
                }
            }
            return Futures.immediateFuture(mediaItems.map { toPlayable(it) }.toMutableList())
        }

        override fun onSetMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>,
            startIndex: Int,
            startPositionMs: Long
        ): ListenableFuture<MediaItemsWithStartPosition> {
            val single = mediaItems.singleOrNull()

            // "Ok Google, pon X en Musicola": busca y reproduce los resultados
            val query = single?.requestMetadata?.searchQuery
            if (query != null) {
                return scope.future {
                    val list = runCatching { YouTube.search(query, onlySongs = true) }
                        .getOrDefault(emptyList()).map { it.toMediaItem() }
                    MediaItemsWithStartPosition(list, if (list.isEmpty()) C.INDEX_UNSET else 0, C.TIME_UNSET)
                }
            }

            // Al tocar una canción de una lista en Auto, se carga la lista entera desde esa canción
            single?.let { splitId(it.mediaId) }?.let { (parent, id) ->
                val list = listFor(parent)
                val idx = list.indexOfFirst { it.id == id }
                if (idx >= 0) {
                    return Futures.immediateFuture(
                        MediaItemsWithStartPosition(list.map { it.toMediaItem() }, idx, C.TIME_UNSET)
                    )
                }
            }

            return Futures.immediateFuture(
                MediaItemsWithStartPosition(mediaItems.map { toPlayable(it) }, startIndex, startPositionMs)
            )
        }

        // Al pulsar "play" en Auto sin nada cargado, se recupera la última cola
        override fun onPlaybackResumption(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo
        ): ListenableFuture<MediaItemsWithStartPosition> {
            val queue = Track.listFromJson(prefs.getString("queue", null))
            if (queue.isEmpty()) {
                return Futures.immediateFailedFuture(UnsupportedOperationException("Cola vacía"))
            }
            val idx = prefs.getInt("index", 0).coerceIn(0, queue.lastIndex)
            return Futures.immediateFuture(
                MediaItemsWithStartPosition(queue.map { it.toMediaItem() }, idx, prefs.getLong("pos", 0L))
            )
        }
    }
}
