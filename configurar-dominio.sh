#!/usr/bin/env bash
# Configura Zentra para un dominio y deja todo listo para `docker compose up`.
#
# Uso:
#   ./configurar-dominio.sh zentra.midominio.com [soporte@midominio.com]
#
# Qué hace:
#   1. Crea .env a partir de .env.docker.example si aún no existe.
#   2. Escribe DOMAIN, CORS_ORIGIN y (opcional) PLATFORM_ADMIN_EMAIL.
#   3. Genera los secretos que falten en ./secrets (no toca los existentes).
#   4. Comprueba que el DNS del dominio apunte a este servidor.
set -euo pipefail

cd "$(dirname "$0")"

DOMAIN_INPUT="${1:-}"
ADMIN_EMAIL="${2:-}"

if [ -z "$DOMAIN_INPUT" ]; then
  echo "Uso: $0 <dominio> [correo-soporte]" >&2
  echo "Ejemplo: $0 zentra.midominio.com soporte@midominio.com" >&2
  exit 1
fi

# Aceptar también "https://dominio/" y normalizarlo a "dominio".
DOMAIN="$(printf '%s' "$DOMAIN_INPUT" | sed -E 's#^[a-zA-Z]+://##; s#/.*$##' | tr '[:upper:]' '[:lower:]')"

if ! printf '%s' "$DOMAIN" | grep -Eq '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$'; then
  echo "✗ '$DOMAIN_INPUT' no parece un dominio válido (ej. zentra.midominio.com)." >&2
  exit 1
fi

if [ -n "$ADMIN_EMAIL" ] && ! printf '%s' "$ADMIN_EMAIL" | grep -Eq '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'; then
  echo "✗ '$ADMIN_EMAIL' no parece un correo válido." >&2
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.docker.example .env
  chmod 600 .env
  echo "✓ Creado .env a partir de .env.docker.example"
fi

# Reemplaza o agrega KEY=VALUE en .env (compatible con macOS y Linux).
set_env() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  awk -v k="$key" -v v="$value" '
    BEGIN { done = 0 }
    $0 ~ "^" k "=" { print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }
  ' .env > "$tmp"
  cat "$tmp" > .env
  rm -f "$tmp"
}

set_env DOMAIN "$DOMAIN"
set_env CORS_ORIGIN "https://$DOMAIN"
[ -n "$ADMIN_EMAIL" ] && set_env PLATFORM_ADMIN_EMAIL "$ADMIN_EMAIL"
echo "✓ .env actualizado: DOMAIN=$DOMAIN, CORS_ORIGIN=https://$DOMAIN"

if grep -q '^PLATFORM_ADMIN_EMAIL=.*example\.com' .env; then
  echo "⚠ PLATFORM_ADMIN_EMAIL sigue siendo el de ejemplo. Pásalo como segundo argumento o edita .env."
fi

./generate-docker-secrets.sh >/dev/null
echo "✓ Secretos listos en ./secrets"

# Comprobación de DNS (solo avisa; no detiene el script).
resolve_ip() {
  if command -v dig >/dev/null 2>&1; then
    dig +short A "$1" | grep -E '^[0-9.]+$' | head -n1
  elif command -v getent >/dev/null 2>&1; then
    getent ahostsv4 "$1" | awk 'NR==1 { print $1 }'
  else
    host "$1" 2>/dev/null | awk '/has address/ { print $4; exit }'
  fi
}

DNS_IP="$(resolve_ip "$DOMAIN" || true)"
PUBLIC_IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"

echo ""
if [ -z "$DNS_IP" ]; then
  echo "⚠ $DOMAIN todavía no resuelve a ninguna IP."
  echo "  Crea un registro DNS tipo A: $DOMAIN → ${PUBLIC_IP:-<IP pública de este servidor>}"
  echo "  Caddy no podrá emitir el certificado HTTPS hasta que el DNS propague."
elif [ -n "$PUBLIC_IP" ] && [ "$DNS_IP" != "$PUBLIC_IP" ]; then
  echo "⚠ $DOMAIN apunta a $DNS_IP, pero la IP pública de este servidor es $PUBLIC_IP."
  echo "  Si usas un proxy como Cloudflare, ignora este aviso; si no, corrige el registro A."
else
  echo "✓ DNS correcto: $DOMAIN → $DNS_IP"
fi

cat <<EOF

Siguientes pasos (en el servidor, con los puertos 80 y 443 abiertos):
  docker compose up -d --build
  docker compose --profile setup run --rm bootstrap-admin
  docker compose ps

Luego abre https://$DOMAIN
EOF
