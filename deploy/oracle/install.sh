#!/usr/bin/env bash
# Instala Musicola en un servidor Ubuntu (Oracle Cloud u otro) con HTTPS automático.
# Uso: bash install.sh
set -euo pipefail

echo "== Instalación de Musicola =="
read -rp "Elige la contraseña de la web (letras y números, mínimo 8): " PASS
[[ "$PASS" =~ ^[A-Za-z0-9._-]{8,}$ ]] || { echo "Usa al menos 8 letras o números (sin espacios ni símbolos raros)"; exit 1; }

# Dirección pública gratuita con HTTPS: 1.2.3.4 -> 1-2-3-4.sslip.io
IP=$(curl -fsS https://api.ipify.org || curl -fsS https://ifconfig.me)
DOMAIN="$(echo "$IP" | tr . -).sslip.io"
echo "IP pública: $IP  ->  https://$DOMAIN"

# Docker
if ! command -v docker >/dev/null; then
  echo "== Instalando Docker =="
  curl -fsSL https://get.docker.com | sudo sh
fi

# Cortafuegos interno de las imágenes de Oracle: abrir 80 y 443
echo "== Abriendo puertos 80 y 443 =="
for p in 80 443; do
  if ! sudo iptables -C INPUT -p tcp --dport "$p" -j ACCEPT 2>/dev/null; then
    n=$(sudo iptables -L INPUT --line-numbers | awk '/REJECT/ {print $1; exit}')
    if [ -n "$n" ]; then sudo iptables -I INPUT "$n" -p tcp --dport "$p" -j ACCEPT
    else sudo iptables -A INPUT -p tcp --dport "$p" -j ACCEPT; fi
  fi
done
sudo apt-get install -y -qq iptables-persistent >/dev/null 2>&1 || true
sudo netfilter-persistent save >/dev/null 2>&1 || true

# Archivos de Musicola
sudo mkdir -p /opt/musicola
sudo touch /opt/musicola/cookies.txt
sudo tee /opt/musicola/compose.yml >/dev/null <<EOF
services:
  musicola:
    image: ghcr.io/casado1994/musicola-web:latest
    restart: unless-stopped
    environment:
      - MUSICOLA_TOKEN=${PASS}
      - PORT=8000
    volumes:
      - ./cookies.txt:/etc/secrets/cookies.txt:ro
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    command: caddy reverse-proxy --from ${DOMAIN} --to musicola:8000
    volumes: ["caddy_data:/data"]
volumes:
  caddy_data:
EOF

echo "== Arrancando =="
cd /opt/musicola
sudo docker compose pull
sudo docker compose up -d

echo
echo "Listo. En 1-2 minutos estará en:  https://$DOMAIN"
echo "Cookies de YouTube (si hacen falta): sudo nano /opt/musicola/cookies.txt  y luego"
echo "    cd /opt/musicola && sudo docker compose restart musicola"
echo "Actualizar a la última versión:  cd /opt/musicola && sudo docker compose pull && sudo docker compose up -d"
