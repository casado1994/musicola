plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.musicola.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.musicola.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 8
        versionName = "1.7"
    }

    // Clave fija incluida en el repo: así cada APK nuevo se instala encima del anterior
    // sin tener que desinstalar (y sin perder favoritos ni la cola).
    signingConfigs {
        getByName("debug") {
            storeFile = file("musicola.keystore")
            storePassword = "musicola"
            keyAlias = "musicola"
            keyPassword = "musicola"
        }
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true }
    packaging {
        resources.excludes += setOf("META-INF/*.md", "META-INF/CHANGES", "META-INF/COPYRIGHT", "META-INF/DEPENDENCIES")
    }
}

dependencies {
    // Extractor de NewPipe: búsqueda y obtención del audio directamente desde YouTube
    implementation("com.github.TeamNewPipe:NewPipeExtractor:v0.27.1")
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs_nio:2.1.5")

    // Reproducción en segundo plano + notificación + pantalla de bloqueo
    val media3 = "1.5.1"
    implementation("androidx.media3:media3-exoplayer:$media3")
    implementation("androidx.media3:media3-session:$media3")
    implementation("androidx.media3:media3-datasource:$media3")
    implementation("androidx.media3:media3-database:$media3") // almacén de audio en el móvil

    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-guava:1.9.0")

    // UI
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("io.coil-kt:coil-compose:2.7.0")
}
