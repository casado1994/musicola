package com.musicola.app.data

import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import org.schabi.newpipe.extractor.downloader.Downloader
import org.schabi.newpipe.extractor.downloader.Request
import org.schabi.newpipe.extractor.downloader.Response
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException
import java.util.concurrent.TimeUnit

/** Cliente HTTP que usa el extractor de NewPipe para hablar con YouTube. */
class DownloaderImpl private constructor(private val client: OkHttpClient) : Downloader() {

    companion object {
        // Mismo user agent que usa NewPipe (navegador de escritorio)
        const val USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:153.0) Gecko/20100101 Firefox/153.0"

        val instance: DownloaderImpl by lazy {
            DownloaderImpl(
                OkHttpClient.Builder()
                    .connectTimeout(15, TimeUnit.SECONDS)
                    .readTimeout(30, TimeUnit.SECONDS)
                    .build()
            )
        }
    }

    override fun execute(request: Request): Response {
        val method = request.httpMethod()
        var body = request.dataToSend()?.toRequestBody()
        if (body == null && (method == "POST" || method == "PUT")) body = ByteArray(0).toRequestBody()

        val builder = okhttp3.Request.Builder()
            .method(method, body)
            .url(request.url())
            .header("User-Agent", USER_AGENT)

        request.headers().forEach { (name, values) ->
            builder.removeHeader(name)
            values.forEach { builder.addHeader(name, it) }
        }

        client.newCall(builder.build()).execute().use { r ->
            if (r.code == 429) throw ReCaptchaException("reCaptcha Challenge requested", request.url())
            return Response(
                r.code,
                r.message,
                r.headers.toMultimap(),
                r.body?.string(),
                r.request.url.toString()
            )
        }
    }
}
