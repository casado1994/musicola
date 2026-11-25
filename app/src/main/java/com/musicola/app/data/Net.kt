package com.musicola.app.data

import okhttp3.ConnectionPool
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/**
 * Cliente HTTP compartido para hablar con YouTube (audio, búsqueda y radio).
 * Al compartirlo, una conexión ya abierta (con su cifrado TLS negociado) se reutiliza
 * en las siguientes peticiones en lugar de crear otra desde cero.
 */
object Net {
    val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        // Mantiene las conexiones abiertas 10 min sin uso (por defecto, 5)
        .connectionPool(ConnectionPool(5, 10, TimeUnit.MINUTES))
        .build()

    private const val WARM_INTERVAL_MS = 4 * 60 * 1000L
    @Volatile private var lastWarm = 0L

    /**
     * Conecta por adelantado con los servidores de YouTube que usa la app, para que la
     * primera canción o búsqueda se ahorre el establecimiento de la conexión.
     * Es barato (respuesta vacía) y no hace nada si se calentó hace poco.
     */
    fun warmUp() {
        val now = System.currentTimeMillis()
        if (now - lastWarm < WARM_INTERVAL_MS) return
        lastWarm = now
        thread(name = "musicola-warmup", isDaemon = true) {
            for (host in listOf("www.youtube.com", "music.youtube.com")) {
                runCatching {
                    http.newCall(Request.Builder().url("https://$host/generate_204").head().build())
                        .execute().close()
                }
            }
        }
    }
}
