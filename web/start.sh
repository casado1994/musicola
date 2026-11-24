#!/bin/sh
# Arranca el generador de PO Tokens en segundo plano (solo accesible desde dentro) y luego la web.
if [ "${POT:-1}" != "0" ] && [ -x /usr/local/bin/bgutil-pot ]; then
  /usr/local/bin/bgutil-pot server --host 127.0.0.1 --port 4416 &
fi
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips='*' --workers 1
