package com.musicola.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.schabi.newpipe.extractor.Image
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.search.SearchInfo
import org.schabi.newpipe.extractor.services.youtube.linkHandler.YoutubeSearchQueryHandlerFactory
import org.schabi.newpipe.extractor.stream.StreamInfo
import org.schabi.newpipe.extractor.stream.StreamInfoItem

/** Búsqueda y metadatos de YouTube usando el extractor de NewPipe (sin API key). */
object YouTube {
    private val service get() = ServiceList.YouTube

    suspend fun search(query: String, onlySongs: Boolean): List<Track> = withContext(Dispatchers.IO) {
        val filter = listOf(
            if (onlySongs) YoutubeSearchQueryHandlerFactory.MUSIC_SONGS
            else YoutubeSearchQueryHandlerFactory.VIDEOS
        )
        val info = SearchInfo.getInfo(service, service.searchQHFactory.fromQuery(query, filter, ""))
        info.relatedItems.filterIsInstance<StreamInfoItem>().mapNotNull { item ->
            val id = idFromUrl(item.url) ?: return@mapNotNull null
            Track(
                id = id,
                title = item.name ?: "",
                artist = item.uploaderName ?: "",
                thumb = bestThumb(item.thumbnails, id),
                duration = item.duration.coerceAtLeast(0),
            )
        }
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
