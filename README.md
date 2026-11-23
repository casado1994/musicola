# Musicola para Android 🎵

App de Android para escuchar música de YouTube **sin anuncios y sin servidor**: busca y saca el audio directamente desde el móvil, con el mismo extractor que usa [NewPipe](https://newpipe.net).

- Búsqueda de **canciones** (catálogo de YouTube Music) o de **vídeos**
- Solo audio, que sigue sonando **con la pantalla apagada o con la app cerrada**
- Controles en la notificación, en la pantalla de bloqueo y en los auriculares Bluetooth
- Cola de reproducción, aleatorio, repetir (todo/una) y favoritos
- La cola y la posición se recuperan al volver a abrir la app
- **Compartir → Musicola** desde la app de YouTube para reproducir ese vídeo

## Conseguir el APK con GitHub (sin instalar nada)

1. Crea una cuenta en GitHub, si no la tienes, y un repositorio nuevo **privado** (por ejemplo, `musicola`).
2. Sube el contenido de esta carpeta al repositorio. Puedes hacerlo de dos maneras:
   - **Desde la web:** "Add file" → "Upload files" y arrastra todos los archivos y carpetas. Incluye la carpeta `.github`: en Windows y Mac está oculta, así que actívalo para verla.
   - **Con git:**
     ```bash
     git init && git add . && git commit -m "Musicola"
     git branch -M main
     git remote add origin https://github.com/TU_USUARIO/musicola.git
     git push -u origin main
     ```
3. Ve a la pestaña **Actions** del repositorio. Verás "Compilar APK" en marcha; tarda unos 5–8 minutos.
4. Cuando termine con ✅, entra en la ejecución y descarga **musicola-apk** en el apartado *Artifacts*. Es un zip con `app-debug.apk` dentro.
5. Pasa el APK al móvil, ábrelo y permite "instalar apps de origen desconocido" cuando te lo pida.

Cada vez que subas cambios se genera un APK nuevo. Se instala **encima** del anterior y conservas los favoritos, porque el proyecto incluye una clave de firma fija (`app/musicola.keystore`).

## Compilar en tu PC (alternativa)

Abre la carpeta con Android Studio y usa *Build → Build APK(s)*. También puedes ejecutar `./gradlew assembleDebug`.

## Cuando deje de funcionar

YouTube cambia cosas cada pocas semanas y NewPipe lo arregla con nuevas versiones del extractor. Si las canciones dejan de sonar o falla la búsqueda:

1. Mira la última versión en https://github.com/TeamNewPipe/NewPipeExtractor/releases
2. Cambia el número en `app/build.gradle.kts`:
   ```kotlin
   implementation("com.github.TeamNewPipe:NewPipeExtractor:v0.27.1")
   ```
3. Sube el cambio. GitHub compila un APK nuevo.

## Cómo está hecho

| Archivo | Qué hace |
|---|---|
| `data/YouTube.kt` | Búsqueda y metadatos (NewPipeExtractor) |
| `playback/StreamResolver.kt` | ID de vídeo → URL del mejor audio (m4a), con caché de 4 h |
| `playback/YoutubeHttpDataSource.java` | Peticiones de audio al estilo NewPipe, para que YouTube no las corte |
| `playback/PlaybackService.kt` | ExoPlayer (Media3) y la sesión multimedia: segundo plano y notificación |
| `ui/` | Interfaz en Jetpack Compose |

## Licencia y aviso

Usa código de NewPipe y de NewPipeExtractor, ambos con licencia **GPL-3.0**, así que este proyecto también lo es. Es para uso personal: saltarse los anuncios va contra los Términos de Servicio de YouTube.
