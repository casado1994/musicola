package com.musicola.app.playback

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import org.schabi.newpipe.extractor.services.youtube.YoutubeParsingHelper
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Vía rápida (la misma que la extensión de Chrome): UNA sola petición al reproductor de YouTube
 * con un cliente que no necesita ejecutar el JavaScript de YouTube. Mucho más rápida que el
 * extractor completo de NewPipe, que queda como reserva en [StreamResolver].
 *
 * Datos de los clientes tomados de NewPipeExtractor / yt-dlp. Si YouTube cambia algo, normalmente
 * basta con actualizar estos valores.
 */
object FastResolver {
    private data class Client(
        val key: String,
        val name: String,
        val id: Int,
        val version: String,
        val userAgent: String,
        val extra: Map<String, Any>,
    )

    const val ANDROID_VR_UA =
        "com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip"

    private val clients = mutableListOf(
        Client(
            "visionos", "VISIONOS", 101, "1.04",
            YoutubeParsingHelper.getVisionOsUserAgent(null),
            mapOf("deviceMake" to "Apple", "deviceModel" to "RealityDevice17,1",
                "osName" to "visionOS", "osVersion" to "26.6.0.23O770"),
        ),
        Client(
            "android_vr", "ANDROID_VR", 28, "1.65.10", ANDROID_VR_UA,
            mapOf("deviceMake" to "Oculus", "deviceModel" to "Quest 3", "androidSdkVersion" to 32,
                "osName" to "Android", "osVersion" to "12L"),
        ),
    )

    private val http = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    /** Devuelve la URL directa del mejor audio, probando primero el cliente que funcionó la última vez. */
    @Throws(IOException::class)
    fun resolve(videoId: String): String {
        var last: Exception? = null
        for (c in synchronized(clients) { clients.toList() }) {
            try {
                val url = request(videoId, c)
                synchronized(clients) { clients.remove(c); clients.add(0, c) }
                return url
            } catch (e: Exception) {
                last = e
            }
        }
        throw IOException("Vía rápida: ${last?.message}", last)
    }

    private fun request(videoId: String, c: Client): String {
        val clientCtx = JSONObject()
            .put("clientName", c.name)
            .put("clientVersion", c.version)
            .put("hl", "es")
            .put("gl", "ES")
        c.extra.forEach { (k, v) -> clientCtx.put(k, v) }
        val body = JSONObject()
            .put("context", JSONObject().put("client", clientCtx))
            .put("videoId", videoId)
            .put("contentCheckOk", true)
            .put("racyCheckOk", true)
            .put("playbackContext", JSONObject().put("contentPlaybackContext",
                JSONObject().put("html5Preference", "HTML5_PREF_WANTS")))

        val req = Request.Builder()
            .url("https://www.youtube.com/youtubei/v1/player?prettyPrint=false")
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .header("User-Agent", c.userAgent)
            .header("X-YouTube-Client-Name", c.id.toString())
            .header("X-YouTube-Client-Version", c.version)
            .header("Origin", "https://www.youtube.com")
            .build()

        val json = http.newCall(req).execute().use { r ->
            if (!r.isSuccessful) throw IOException("YouTube respondió ${r.code}")
            JSONObject(r.body?.string() ?: throw IOException("Respuesta vacía"))
        }

        val status = json.optJSONObject("playabilityStatus")
        if (status?.optString("status") != "OK") {
            throw IOException(status?.optString("reason")?.takeIf { it.isNotBlank() }
                ?: status?.optString("status") ?: "vídeo no reproducible")
        }

        val formats = json.optJSONObject("streamingData")?.optJSONArray("adaptiveFormats")
            ?: throw IOException("Sin formatos")
        data class F(val url: String, val mime: String, val bitrate: Int, val isDefault: Boolean)
        val audio = (0 until formats.length()).mapNotNull { i ->
            val f = formats.getJSONObject(i)
            val mime = f.optString("mimeType")
            val url = f.optString("url")
            if (!mime.startsWith("audio/") || url.isBlank()) return@mapNotNull null
            val track = f.optJSONObject("audioTrack")
            F(url, mime, f.optInt("bitrate"), track == null || track.optBoolean("audioIsDefault"))
        }
        if (audio.isEmpty()) throw IOException("Sin audio disponible")
        val pool = audio.filter { it.isDefault }.ifEmpty { audio } // evita doblajes automáticos
        val best = pool.filter { it.mime.startsWith("audio/mp4") }.maxByOrNull { it.bitrate }
            ?: pool.maxByOrNull { it.bitrate }!!
        return best.url
    }
}
