package com.musicola.app.data

import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.zip.Deflater
import java.util.zip.Inflater

/**
 * Enlaces de listas compartidas, compatibles con la versión web:
 *   https://<web>/#list=z<base64url(deflate-raw(JSON))>
 * JSON: {"n": nombre, "t": [[videoId, título, artista, duración], …]}
 * La lista viaja dentro del enlace: no se guarda nada en ningún servidor.
 */
object PlaylistLink {
    const val WEB = "https://p01--musicola--bxwqmgr26l5m.code.run"
    private const val B64 = Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP
    private val ID = Regex("^[\\w-]{11}$")

    fun encode(pl: Playlist): String {
        val json = JSONObject().put("n", pl.name).put("t", JSONArray().apply {
            pl.tracks.forEach { put(JSONArray().put(it.id).put(it.title).put(it.artist).put(it.duration)) }
        }).toString().toByteArray()
        val d = Deflater(Deflater.BEST_COMPRESSION, true).apply { setInput(json); finish() }
        val out = ByteArrayOutputStream(); val buf = ByteArray(4096)
        while (!d.finished()) out.write(buf, 0, d.deflate(buf))
        d.end()
        return "$WEB/#list=z" + Base64.encodeToString(out.toByteArray(), B64)
    }

    /** Busca un enlace de lista en un texto y lo decodifica (null si no hay o no es válido). */
    fun decode(text: String): Playlist? = runCatching {
        val code = Regex("#list=([zj][\\w-]+)").find(text)?.groupValues?.get(1) ?: return null
        var bytes = Base64.decode(code.substring(1), B64)
        if (code[0] == 'z') {
            val inf = Inflater(true).apply { setInput(bytes + 0.toByte()) } // byte extra: requisito de zlib con nowrap
            val out = ByteArrayOutputStream(); val buf = ByteArray(8192)
            while (!inf.finished()) {
                val n = inf.inflate(buf)
                if (n == 0 && (inf.needsInput() || inf.needsDictionary())) break
                out.write(buf, 0, n)
            }
            inf.end(); bytes = out.toByteArray()
        }
        val o = JSONObject(String(bytes))
        val arr = o.optJSONArray("t") ?: JSONArray()
        val tracks = (0 until arr.length()).mapNotNull { i ->
            val a = arr.optJSONArray(i) ?: return@mapNotNull null
            val id = a.optString(0)
            if (!ID.matches(id)) null
            else Track(id, a.optString(1), a.optString(2), "https://i.ytimg.com/vi/$id/mqdefault.jpg", a.optLong(3))
        }
        Playlist(Playlist.newId(), o.optString("n").ifBlank { "Lista compartida" }.take(80), tracks)
    }.getOrNull()
}
