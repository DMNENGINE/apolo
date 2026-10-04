#!/usr/bin/env bash
# Publica la web de APOLO (repo privado bezonka1/apolo-web) en la Raspberry Pi → https://apolocompanion.com
# Uso (Git Bash, desde cualquier sitio):  bash tools/subir-web.sh
# En la Pi: nginx sirve /var/www/apolo en 127.0.0.1:8093 y el túnel de Cloudflare "apolo" lo publica.
set -euo pipefail
PI="${PI:-dmn@192.168.1.124}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "→ bajando bezonka1/apolo-web…"
gh repo clone bezonka1/apolo-web "$TMP/web" -- -q --depth 1
echo "   commit: $(git -C "$TMP/web" log --oneline -1)"

echo "→ subiendo a la Pi ($PI)…"
tar --exclude=.git -czf - -C "$TMP/web" . | ssh "$PI" '
  set -e
  sudo -n mkdir -p /var/www/apolo.nuevo
  sudo -n tar -xzf - -C /var/www/apolo.nuevo
  sudo -n chown -R www-data:www-data /var/www/apolo.nuevo
  sudo -n find /var/www/apolo.nuevo -type d -exec chmod 755 {} +
  sudo -n find /var/www/apolo.nuevo -type f -exec chmod 644 {} +
  # cambio atómico: la web nunca queda a medias
  sudo -n rm -rf /var/www/apolo.anterior
  sudo -n mv /var/www/apolo /var/www/apolo.anterior
  sudo -n mv /var/www/apolo.nuevo /var/www/apolo
'
echo "→ comprobando https://apolocompanion.com …"
curl -s -o /dev/null -w "   %{http_code} %{content_type}\n" --max-time 20 "https://apolocompanion.com/?v=$(date +%s)"
echo "Listo. Si algo sale mal, la versión anterior está en la Pi en /var/www/apolo.anterior"
