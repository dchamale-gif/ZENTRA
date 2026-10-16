#!/usr/bin/env bash
# Configura Zentra para un dominio y deja todo listo para `docker compose up`.
#
# Uso:
#   ./configurar-dominio.sh zentra.midominio.com [soporte@midominio.com]
#   ./configurar-dominio.sh --nginx erp.midominio.com [soporte@midominio.com]
#
# Con --nginx el ERP queda detrás del nginx que ya existe en el servidor
# (cuando otra web ocupa los puertos 80/443): Caddy escucha solo en
# 127.0.0.1:${ERP_LOCAL_PORT:-8088} y se genera el sitio de nginx a instalar.
#
# Qué hace:
#   1. Crea .env a partir de .env.docker.example si aún no existe.
#   2. Escribe DOMAIN, CORS_ORIGIN y (opcional) PLATFORM_ADMIN_EMAIL.
#   3. Genera los secretos que falten en ./secrets (no toca los existentes).
#   4. Comprueba que el DNS del dominio apunte a este servidor.
set -euo pipefail

cd "$(dirname "$0")"

BEHIND_NGINX=false
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --nginx) BEHIND_NGINX=true ;;
    *) ARGS+=("$arg") ;;
  esac
done

DOMAIN_INPUT="${ARGS[0]:-}"
ADMIN_EMAIL="${ARGS[1]:-}"
ERP_LOCAL_PORT="${ERP_LOCAL_PORT:-8088}"

if [ -z "$DOMAIN_INPUT" ]; then
  echo "Uso: $0 [--nginx] <dominio> [correo-soporte]" >&2
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

# Quita KEY de .env si existe.
unset_env() {
  local key="$1" tmp
  tmp="$(mktemp)"
  awk -v k="$key" '$0 !~ "^" k "=" { print }' .env > "$tmp"
  cat "$tmp" > .env
  rm -f "$tmp"
}

NGINX_CONF=""
if [ "$BEHIND_NGINX" = true ]; then
  set_env COMPOSE_FILE "compose.yaml:compose.proxy.yaml"
  set_env ERP_LOCAL_PORT "$ERP_LOCAL_PORT"
  echo "✓ Modo detrás de nginx: el ERP escuchará en 127.0.0.1:$ERP_LOCAL_PORT"

  if command -v ss >/dev/null 2>&1 && ss -ltn "sport = :$ERP_LOCAL_PORT" | grep -q LISTEN \
     && ! docker compose ps --status running web 2>/dev/null | grep -q web; then
    echo "⚠ El puerto $ERP_LOCAL_PORT ya está en uso por otra aplicación. Repite con otro, por ejemplo:"
    echo "  ERP_LOCAL_PORT=8099 $0 --nginx $DOMAIN"
  fi

  NGINX_CONF="deploy/nginx-erp.$DOMAIN.conf"
  sed -e "s/__DOMAIN__/$DOMAIN/g" -e "s/__PORT__/$ERP_LOCAL_PORT/g" deploy/nginx-erp.conf > "$NGINX_CONF"
  echo "✓ Sitio de nginx generado en $NGINX_CONF"
else
  unset_env COMPOSE_FILE
fi

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
  echo "  El certificado HTTPS no se podrá emitir hasta que el DNS propague."
elif [ -n "$PUBLIC_IP" ] && [ "$DNS_IP" != "$PUBLIC_IP" ]; then
  echo "⚠ $DOMAIN apunta a $DNS_IP, pero la IP pública de este servidor es $PUBLIC_IP."
  echo "  Si usas un proxy como Cloudflare, ignora este aviso; si no, corrige el registro A."
else
  echo "✓ DNS correcto: $DOMAIN → $DNS_IP"
fi

if [ "$BEHIND_NGINX" = true ]; then
cat <<EOF

Siguientes pasos (en el servidor):
  docker compose up -d --build
  docker compose --profile setup run --rm bootstrap-admin
  curl -I http://127.0.0.1:$ERP_LOCAL_PORT/login.html     # debe responder 200

  sudo cp $NGINX_CONF /etc/nginx/sites-available/$DOMAIN
  sudo ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN
  sudo nginx -t && sudo systemctl reload nginx
  sudo certbot --nginx -d $DOMAIN

Luego abre https://$DOMAIN
EOF
else
cat <<EOF

Siguientes pasos (en el servidor, con los puertos 80 y 443 abiertos):
  docker compose up -d --build
  docker compose --profile setup run --rm bootstrap-admin
  docker compose ps

Luego abre https://$DOMAIN
EOF
fi
