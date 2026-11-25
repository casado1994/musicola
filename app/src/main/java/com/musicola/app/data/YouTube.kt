package com.musicola.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.schabi.newpipe.extractor.Image
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.playlist.PlaylistInfo
import org.schabi.newpipe.extractor.search.SearchInfo
import org.schabi.newpipe.extractor.services.youtube.linkHandler.YoutubeSearchQueryHandlerFactory
import org.schabi.newpipe.extractor.stream.StreamInfo
import org.schabi.newpipe.extractor.stream.StreamInfoItem

/** Búsqueda, radio y metadatos de YouTube: vía directa (como la extensión) con NewPipe de reserva. */
object YouTube {
    private val service get() = ServiceList.YouTube

    suspend fun search(query: String, onlySongs: Boolean): List<Track> = withContext(Dispatchers.IO) {
        // Vía rápida, como la extensión: una petición directa a YouTube Music / YouTube
        val direct = runCatching {
            if (onlySongs) DirectYouTube.searchSongs(query).ifEmpty { DirectYouTube.searchVideos(query) }
            else DirectYouTube.searchVideos(query)
        }.onFailure { android.util.Log.w("Musicola", "Búsqueda directa falló: ${it.message}") }.getOrNull()
        if (!direct.isNullOrEmpty()) return@withContext direct

        // Reserva: extractor de NewPipe
        val filter = listOf(
            if (onlySongs) YoutubeSearchQueryHandlerFactory.MUSIC_SONGS
            else YoutubeSearchQueryHandlerFactory.VIDEOS
        )
        val info = SearchInfo.getInfo(service, service.searchQHFactory.fromQuery(query, filter, ""))
        info.relatedItems.filterIsInstance<StreamInfoItem>().mapNotNull { toTrack(it) }
    }

    /**
     * Modo radio: canciones parecidas a [id]. Usa el "Mix" de YouTube Music de ese tema,
     * con el Mix normal y los vídeos relacionados como reserva.
     */
    suspend fun radio(id: String, max: Int = 25): List<Track> = withContext(Dispatchers.IO) {
        // Vía rápida, como la extensión
        val direct = runCatching { DirectYouTube.radio(id) }
            .onFailure { android.util.Log.w("Musicola", "Radio directa falló: ${it.message}") }.getOrNull()
        if (!direct.isNullOrEmpty()) return@withContext direct.take(max)

        // Reserva: extractor de NewPipe
        for (listId in listOf("RDAMVM$id", "RD$id")) {
            val items = runCatching {
                PlaylistInfo.getInfo(service, "https://www.youtube.com/watch?v=$id&list=$listId").relatedItems
            }.getOrNull() ?: continue
            val tracks = items.filterIsInstance<StreamInfoItem>().mapNotNull { toTrack(it) }.filter { it.id != id }
            if (tracks.isNotEmpty()) return@withContext tracks.take(max)
        }
        runCatching {
            StreamInfo.getInfo(service, "https://www.youtube.com/watch?v=$id").relatedItems
                .filterIsInstance<StreamInfoItem>().mapNotNull { toTrack(it) }.filter { it.id != id }
        }.getOrDefault(emptyList()).take(max)
    }

    private fun toTrack(item: StreamInfoItem): Track? {
        val id = idFromUrl(item.url) ?: return null
        return Track(
            id = id,
            title = item.name ?: "",
            artist = item.uploaderName ?: "",
            thumb = bestThumb(item.thumbnails, id),
            duration = item.duration.coerceAtLeast(0),
        )
    }

    /** Para "Compartir" desde la app de YouTube: convierte una URL en una pista. */
    suspend fun trackFromUrl(url: String): Track? = withContext(Dispatchers.IO) {
        val id = idFromUrl(url) ?: return@withContext null
        val info = StreamInfo.getInfo(service, "https://www.youtube.com/watch?v=$id")
        Track(id, info.name ?: "", info.uploaderName ?: "", bestThumb(info.thumbnails, id), info.duration)
    }

    fun idFromUrl(url: String): String? =
        runCatching { service.streamLHFactory.fromUrl(url).id }.getOrNull()

    private fun bestThumb(images: List<Image>?, id: String): String =
        images?.maxByOrNull { it.width }?.url ?: "https://i.ytimg.com/vi/$id/hqdefault.jpg"
}
