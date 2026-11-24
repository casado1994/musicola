# Musicola para Chrome

Extensión que reproduce música de YouTube **sin anuncios, sin servidor y sin cookies**:
pide el audio a YouTube directamente desde tu navegador, con tu conexión.

## Instalar
1. Descarga `musicola-chrome.zip` y descomprímelo en una carpeta que no vayas a borrar.
2. En Chrome abre `chrome://extensions`.
3. Activa **Modo de desarrollador** (arriba a la derecha).
4. Pulsa **Cargar descomprimida** y elige la carpeta descomprimida (la que contiene `manifest.json`).
5. Fija el icono: pieza de puzle (barra de Chrome) → chincheta junto a *Musicola*.
6. Pulsa el icono: se abre el reproductor.

Chrome puede avisar al arrancar de que hay extensiones en modo desarrollador: es normal.

## Actualizar
Sustituye los archivos de la carpeta por los nuevos y pulsa ↻ en la tarjeta de Musicola en `chrome://extensions`.
Los favoritos y la cola se conservan.

## Si algo falla
Abre el reproductor, pulsa F12 → pestaña *Console* y busca las líneas `[musicola]`: dicen qué cliente de
YouTube funcionó o por qué falló.
