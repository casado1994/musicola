package com.musicola.app.data

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException

/**
 * Búsqueda y radio con UNA petición directa a YouTube / YouTube Music, igual que la extensión
 * de Chrome (extension/yt.js). Más rápido que el extractor completo de NewPipe, que queda
 * como reserva en [YouTube].
 */
object DirectYouTube {
    private data class Client(val name: String, val id: Int, val version: String)

    private val WEB = Client("WEB", 1, "2.20260708.00.00")
    private val MUSIC = Client("WEB_REMIX", 67, "1.20260707.12.00")
    private const val DESKTOP_UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"

    private val http get() = com.musicola.app.data.Net.http // conexiones compartidas y precalentadas

    private val ID_RE = Regex("^[A-Za-z0-9_-]{11}$")
    private val DUR_RE = Regex("^\\d+(:\\d{2}){1,2}$")

    @Throws(IOException::class)
    private fun innertube(host: String, endpoint: String, c: Client, body: JSONObject): JSONObject {
        body.put("context", JSONObject().put("client", JSONObject()
            .put("clientName", c.name).put("clientVersion", c.version).put("hl", "es").put("gl", "ES")))
        val origin = "https://$host"
        val req = Request.Builder()
            .url("$origin/youtubei/v1/$endpoint?prettyPrint=false")
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .header("User-Agent", DESKTOP_UA)
            .header("X-YouTube-Client-Name", c.id.toString())
            .header("X-YouTube-Client-Version", c.version)
            .header("Origin", origin)
            .header("Referer", "$origin/")
            .build()
        http.newCall(req).execute().use { r ->
            if (!r.isSuccessful) throw IOException("YouTube respondió ${r.code}")
            return JSONObject(r.body?.string() ?: throw IOException("Respuesta vacía"))
        }
    }

    // ---------- Utilidades para recorrer las respuestas ----------
    private fun walk(o: Any?, fn: (JSONObject) -> Unit) {
        when (o) {
            is JSONObject -> { fn(o); o.keys().forEach { walk(o.opt(it), fn) } }
            is JSONArray -> for (i in 0 until o.length()) walk(o.opt(i), fn)
        }
    }

    private fun text(x: Any?): String = when (x) {
        is String -> x
        is JSONObject -> x.optString("simpleText").ifBlank { x.optString("content") }.ifBlank {
            val runs = x.optJSONArray("runs") ?: return@ifBlank ""
            (0 until runs.length()).joinToString("") { runs.getJSONObject(it).optString("text") }
        }
        else -> ""
    }

    private fun seconds(s: String?): Long {
        if (s == null || !DUR_RE.matches(s)) return 0
        return s.split(":").fold(0L) { acc, p -> acc * 60 + p.toLong() }
    }

    private fun track(id: String, title: String, artist: String, dur: Long) =
        Track(id, title.ifBlank { "Sin título" }, artist, "https://i.ytimg.com/vi/$id/hqdefault.jpg", dur)

    private fun dedupe(list: List<Track>): List<Track> =
        list.filter { ID_RE.matches(it.id) }.distinctBy { it.id }

    // ---------- Búsqueda ----------
    @Throws(IOException::class)
    fun searchSongs(q: String): List<Track> {
        // Filtro "Canciones" de YouTube Music
        val j = innertube("music.youtube.com", "search", MUSIC,
            JSONObject().put("query", q).put("params", "EgWKAQIIAWoMEA4QChADEAQQCRAF"))
        val out = mutableListOf<Track>()
        walk(j) { o ->
            val r = o.optJSONObject("musicResponsiveListItemRenderer") ?: return@walk
            var id = r.optJSONObject("playlistItemData")?.optString("videoId").orEmpty()
            if (id.isBlank()) walk(r) { x ->
                if (id.isBlank()) x.optJSONObject("watchEndpoint")?.optString("videoId")?.let { if (it.isNotBlank()) id = it }
            }
            if (id.isBlank()) return@walk
            val cols = r.optJSONArray("flexColumns") ?: JSONArray()
            fun col(i: Int): List<String> {
                val runs = cols.optJSONObject(i)?.optJSONObject("musicResponsiveListItemFlexColumnRenderer")
                    ?.optJSONObject("text")?.optJSONArray("runs") ?: return emptyList()
                return (0 until runs.length()).map { runs.getJSONObject(it).optString("text") }
            }
            val title = col(0).joinToString("")
            val sub = col(1).filter { it.isNotBlank() && it.trim() != "•" }
            val dur = sub.lastOrNull { DUR_RE.matches(it) }
            val artist = if (sub.firstOrNull() in setOf("Canción", "Song", "Vídeo", "Video")) sub.getOrNull(1) else sub.firstOrNull()
            out += track(id, title, artist.orEmpty(), seconds(dur))
        }
        return dedupe(out)
    }

    @Throws(IOException::class)
    fun searchVideos(q: String): List<Track> {
        val j = innertube("www.youtube.com", "search", WEB, JSONObject().put("query", q).put("params", "EgIQAQ=="))
        val out = mutableListOf<Track>()
        walk(j) { o ->
            val v = o.optJSONObject("videoRenderer") ?: return@walk
            val id = v.optString("videoId")
            if (id.isNotBlank()) {
                out += track(id, text(v.opt("title")), text(v.opt("ownerText") ?: v.opt("longBylineText")),
                    seconds(text(v.opt("lengthText"))))
            }
        }
        return dedupe(out)
    }

    // ---------- Radio ----------
    private fun panel(j: JSONObject, seed: String): List<Track> {
        val out = mutableListOf<Track>()
        walk(j) { o ->
            val v = o.optJSONObject("playlistPanelVideoRenderer") ?: return@walk
            val id = v.optString("videoId")
            if (id.isBlank() || id == seed) return@walk
            val by = (v.optJSONObject("shortBylineText") ?: v.optJSONObject("longBylineText"))
                ?.optJSONArray("runs")?.optJSONObject(0)?.optString("text").orEmpty()
            out += track(id, text(v.opt("title")), by, seconds(text(v.opt("lengthText"))))
        }
        return dedupe(out)
    }

    @Throws(IOException::class)
    fun radio(id: String): List<Track> {
        try {
            val res = panel(innertube("music.youtube.com", "next", MUSIC,
                JSONObject().put("videoId", id).put("playlistId", "RDAMVM$id").put("isAudioOnly", true)), id)
            if (res.isNotEmpty()) return res
        } catch (_: IOException) { /* se prueba con YouTube normal */ }
        return panel(innertube("www.youtube.com", "next", WEB,
            JSONObject().put("videoId", id).put("playlistId", "RD$id")), id)
    }
}
