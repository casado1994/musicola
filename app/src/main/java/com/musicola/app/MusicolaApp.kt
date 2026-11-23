package com.musicola.app

import android.app.Application
import com.musicola.app.data.DownloaderImpl
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.localization.ContentCountry
import org.schabi.newpipe.extractor.localization.Localization

class MusicolaApp : Application() {
    override fun onCreate() {
        super.onCreate()
        NewPipe.init(DownloaderImpl.instance, Localization("es", "ES"), ContentCountry("ES"))
    }
}
