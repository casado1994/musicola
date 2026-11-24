FROM python:3.12-slim

# Deno: el runtime de JavaScript que yt-dlp necesita para YouTube
COPY --from=denoland/deno:bin /deno /usr/local/bin/deno

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

# Menos memoria: limita el montón de JavaScript de Deno y la fragmentación de Python
ENV DENO_V8_FLAGS=--max-old-space-size=192 \
    MALLOC_ARENA_MAX=2 \
    PYTHONUNBUFFERED=1

# Render (y otros) indican el puerto en la variable PORT
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*' --workers 1"]
