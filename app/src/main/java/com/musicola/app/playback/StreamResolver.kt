package com.musicola.app.playback

import org.schabi.newpipe.extractor.MediaFormat
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.stream.AudioTrackType
import org.schabi.newpipe.extractor.stream.DeliveryMethod
import org.schabi.newpipe.extractor.stream.StreamInfo
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap

/**
 * Convierte un ID de vídeo en la URL directa del mejor audio disponible.
 * Se llama desde el hilo de carga de ExoPlayer (nunca desde el hilo principal).
 */
object StreamResolver {
    private data class Entry(val url: String, val expiresAt: Long)

    private val cache = ConcurrentHashMap<String, Entry>()
    private const val TTL_MS = 4 * 60 * 60 * 1000L // las URLs de YouTube caducan a las ~6 h

    fun invalidate(id: String) {
        cache.remove(id)
    }

    private val locks = ConcurrentHashMap<String, Any>()

    /** Ya resuelto y vigente (para no repetir trabajo en la precarga). */
    fun isCached(id: String): Boolean = (cache[id]?.expiresAt ?: 0L) > System.currentTimeMillis()

    @Throws(IOException::class)
    fun resolve(id: String): String {
        cache[id]?.takeIf { it.expiresAt > System.currentTimeMillis() }?.let { return it.url }
        // Si la precarga ya está resolviendo esta canción, se espera a ella en vez de repetirla
        synchronized(locks.getOrPut(id) { Any() }) {
            cache[id]?.takeIf { it.expiresAt > System.currentTimeMillis() }?.let { return it.url }
            val url = try {
                FastResolver.resolve(id) // 1 petición, sin JavaScript (como la extensión)
            } catch (e: IOException) {
                android.util.Log.w("Musicola", "Vía rápida falló para $id, uso NewPipe: ${e.message}")
                resolveWithNewPipe(id) // reserva: extractor completo, más lento
            }
            cache[id] = Entry(url, System.currentTimeMillis() + TTL_MS)
            return url
        }
    }

    @Throws(IOException::class)
    private fun resolveWithNewPipe(id: String): String {
        val info = try {
            StreamInfo.getInfo(ServiceList.YouTube, "https://www.youtube.com/watch?v=$id")
        } catch (e: IOException) {
            throw e
        } catch (e: Exception) {
            throw IOException("No se pudo obtener la información del vídeo $id", e)
        }

        val streams = info.audioStreams.filter {
            it.isUrl && it.deliveryMethod == DeliveryMethod.PROGRESSIVE_HTTP
        }
        // Evita pistas dobladas automáticamente: preferimos el audio original
        val original = streams.filter {
            it.audioTrackType == null || it.audioTrackType == AudioTrackType.ORIGINAL
        }.ifEmpty { streams }

        val best = original.filter { it.format == MediaFormat.M4A }.maxByOrNull { it.averageBitrate }
            ?: original.maxByOrNull { it.averageBitrate }
            ?: throw IOException("Este vídeo no tiene audio disponible")

        return best.content
    }
}
