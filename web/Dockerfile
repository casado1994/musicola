FROM python:3.12-slim

# Deno: el runtime de JavaScript que yt-dlp necesita para YouTube
COPY --from=denoland/deno:bin /deno /usr/local/bin/deno

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Generador de PO Tokens (bgutil-pot, en Rust: <50 MB de RAM) + su plugin para yt-dlp.
# Ayuda a saltarse "Sign in to confirm you're not a bot" sin cookies.
ARG TARGETARCH
ARG POT_VERSION=v0.8.1
RUN set -e; \
    case "${TARGETARCH:-amd64}" in arm64) a=aarch64 ;; *) a=x86_64 ;; esac; \
    base="https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs/releases/download/${POT_VERSION}"; \
    python -c "import sys, urllib.request as u; u.urlretrieve(sys.argv[1], '/usr/local/bin/bgutil-pot'); u.urlretrieve(sys.argv[2], '/tmp/pot.zip')" \
        "$base/bgutil-pot-linux-$a" "$base/bgutil-ytdlp-pot-provider-rs.zip"; \
    chmod +x /usr/local/bin/bgutil-pot; \
    python -m zipfile -e /tmp/pot.zip "$(python -c 'import site; print(site.getsitepackages()[0])')"; \
    rm /tmp/pot.zip; \
    python -c "import yt_dlp_plugins.extractor.getpot_bgutil_http"

COPY . .
RUN chmod +x start.sh

# Menos memoria: limita el montón de JavaScript de Deno y la fragmentación de Python
ENV DENO_V8_FLAGS=--max-old-space-size=192 \
    MALLOC_ARENA_MAX=2 \
    PYTHONUNBUFFERED=1

# Render (y otros) indican el puerto en la variable PORT
ENV PORT=8000
EXPOSE 8000
CMD ["./start.sh"]
