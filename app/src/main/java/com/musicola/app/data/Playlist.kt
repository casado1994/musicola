package com.musicola.app.data

import org.json.JSONArray
import org.json.JSONObject

/** Lista de reproducción creada por el usuario. */
data class Playlist(
    val id: String,
    val name: String,
    val tracks: List<Track>,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("name", name)
        .put("tracks", JSONArray().apply { tracks.forEach { put(it.toJson()) } })

    companion object {
        fun newId(): String = "p" + System.currentTimeMillis().toString(36)

        fun listToJson(list: List<Playlist>): String =
            JSONArray().apply { list.forEach { put(it.toJson()) } }.toString()

        fun listFromJson(s: String?): List<Playlist> {
            if (s.isNullOrBlank()) return emptyList()
            return runCatching {
                val arr = JSONArray(s)
                (0 until arr.length()).map { i ->
                    val o = arr.getJSONObject(i)
                    val t = o.optJSONArray("tracks") ?: JSONArray()
                    Playlist(
                        o.getString("id"),
                        o.optString("name", "Lista"),
                        (0 until t.length()).map { Track.fromJson(t.getJSONObject(it)) },
                    )
                }
            }.getOrDefault(emptyList())
        }
    }
}
