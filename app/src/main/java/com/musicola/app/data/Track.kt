package com.musicola.app.data

import android.net.Uri
import android.os.Bundle
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import org.json.JSONArray
import org.json.JSONObject

data class Track(
    val id: String,
    val title: String,
    val artist: String,
    val thumb: String,
    val duration: Long, // segundos
) {
    fun toMediaItem(): MediaItem = MediaItem.Builder()
        .setMediaId(id)
        .setUri("yt:$id") // se resuelve a la URL real del audio justo antes de reproducir
        .setMediaMetadata(
            MediaMetadata.Builder()
                .setTitle(title)
                .setArtist(artist)
                .setArtworkUri(Uri.parse(thumb))
                .setExtras(Bundle().apply { putLong("duration", duration) })
                .build()
        )
        .build()

    fun toJson(): JSONObject = JSONObject()
        .put("id", id).put("title", title).put("artist", artist)
        .put("thumb", thumb).put("duration", duration)

    companion object {
        fun fromMediaItem(item: MediaItem): Track {
            val m = item.mediaMetadata
            return Track(
                id = item.mediaId,
                title = m.title?.toString() ?: "",
                artist = m.artist?.toString() ?: "",
                thumb = m.artworkUri?.toString() ?: "https://i.ytimg.com/vi/${item.mediaId}/hqdefault.jpg",
                duration = m.extras?.getLong("duration") ?: 0L,
            )
        }

        fun fromJson(o: JSONObject) = Track(
            o.getString("id"), o.optString("title"), o.optString("artist"),
            o.optString("thumb"), o.optLong("duration"),
        )

        fun listToJson(list: List<Track>): String =
            JSONArray().apply { list.forEach { put(it.toJson()) } }.toString()

        fun listFromJson(s: String?): List<Track> {
            if (s.isNullOrBlank()) return emptyList()
            return runCatching {
                val arr = JSONArray(s)
                (0 until arr.length()).map { fromJson(arr.getJSONObject(it)) }
            }.getOrDefault(emptyList())
        }
    }
}
