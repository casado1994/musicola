package com.musicola.app

import android.app.Application
import com.musicola.app.data.DownloaderImpl
import com.musicola.app.data.Net
import com.musicola.app.playback.AudioCache
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.localization.ContentCountry
import org.schabi.newpipe.extractor.localization.Localization

class MusicolaApp : Application() {
    override fun onCreate() {
        super.onCreate()
        NewPipe.init(DownloaderImpl.instance, Localization("es", "ES"), ContentCountry("ES"))
        AudioCache.init(this) // almacén de audio en el móvil (300 MB)
        Net.warmUp() // también al arrancar el proceso (p. ej. desde Android Auto)
    }
}
