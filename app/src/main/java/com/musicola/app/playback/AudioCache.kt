package com.musicola.app.playback

import android.content.Context
import android.net.Uri
import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.CacheWriter
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import kotlinx.coroutines.Dispatchers
import java.io.File

/**
 * Almacén de audio en el móvil (como Spotify):
 *  - Todo lo que suena se guarda (hasta 300 MB; al llenarse se borra lo escuchado hace más tiempo).
 *    Repetir una canción, favoritos o volver atrás suena al instante y sin gastar datos.
 *  - [prefetchStart] descarga por adelantado los primeros segundos de una canción. Al pulsarla,
 *    empieza a sonar desde el móvil mientras el resto se descarga detrás.
 *
 * La clave de cada canción es "yt:VIDEO_ID", así que no depende de la URL temporal de YouTube.
 */
@OptIn(UnstableApi::class)
object AudioCache {
    private const val MAX_BYTES = 300L * 1024 * 1024
    /** ~10-15 s de audio a 128-160 kbps */
    const val PREFETCH_BYTES = 256L * 1024

    /** Las precargas van de 2 en 2 para no competir con lo que está sonando. */
    val dispatcher = Dispatchers.IO.limitedParallelism(2)

    private var cache: SimpleCache? = null
    lateinit var factory: CacheDataSource.Factory
        private set

    @Synchronized
    fun init(context: Context) {
        if (cache != null) return
        val c = SimpleCache(
            File(context.cacheDir, "audio"),
            LeastRecentlyUsedCacheEvictor(MAX_BYTES),
            StandaloneDatabaseProvider(context.applicationContext),
        )
        cache = c

        // Peticiones al estilo de NewPipe (POST + parámetro rn) para que YouTube no corte la descarga
        val youtubeHttp = YoutubeHttpDataSource.Factory()
            .setRangeParameterEnabled(false)
            .setRnParameterEnabled(true)

        // "yt:VIDEO_ID" -> URL real del audio (solo cuando hay que ir a la red)
        val resolving = ResolvingDataSource.Factory(youtubeHttp) { spec ->
            if (spec.uri.scheme == "yt") {
                spec.withUri(Uri.parse(StreamResolver.resolve(spec.uri.schemeSpecificPart)))
            } else spec
        }

        factory = CacheDataSource.Factory()
            .setCache(c)
            .setUpstreamDataSourceFactory(resolving)
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
    }

    private fun key(id: String) = "yt:$id"

    /** Borra lo guardado de una canción (si falló al reproducirse, por si estaba dañado). */
    fun remove(id: String) {
        runCatching { cache?.removeResource(key(id)) }
    }

    /** ¿Ya están en el móvil los primeros segundos? */
    fun hasStart(id: String): Boolean =
        cache?.isCached(key(id), 0, PREFETCH_BYTES) == true

    /** Descarga los primeros segundos de audio de [id]. Bloqueante: llamar desde un hilo de fondo. */
    fun prefetchStart(id: String) {
        if (cache == null || hasStart(id)) return
        val spec = DataSpec.Builder()
            .setUri(key(id))
            .setPosition(0)
            .setLength(PREFETCH_BYTES)
            .build()
        try {
            CacheWriter(factory.createDataSource(), spec, null, null).cache()
        } catch (e: Exception) {
            Log.w("Musicola", "Precarga de audio de $id falló: ${e.message}")
        }
    }
}
