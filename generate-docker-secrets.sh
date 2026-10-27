#!/usr/bin/env bash
set -euo pipefail

SECRETS_DIR="${1:-./secrets}"
mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"

# Si los secretos existentes tienen una ACL para que el contenedor (usuario node) los lea,
# el secreto nuevo recibe la misma; si no, el backend no arranca por «Permission denied».
copy_acl() {
  local target="$1"
  command -v getfacl >/dev/null 2>&1 && command -v setfacl >/dev/null 2>&1 || return 0
  local reference
  for reference in "$SECRETS_DIR"/*.txt; do
    [ "$reference" = "$target" ] && continue
    if [ "$(getfacl --omit-header --skip-base "$reference" 2>/dev/null)" != "" ]; then
      getfacl "$reference" | setfacl --set-file=- "$target"
      echo "  (permisos ACL copiados de $(basename "$reference"))"
      return 0
    fi
  done
}

generate_secret() {
  local file="$1"
  local bytes="${2:-32}"
  local full_path="$SECRETS_DIR/$file"
  if [ -s "$full_path" ]; then
    echo "• Ya existe: $full_path (conservado)"
  else
    if command -v openssl >/dev/null 2>&1; then
      openssl rand -hex "$bytes" | tr -d '\n' > "$full_path"
    else
      head -c "$bytes" /dev/urandom | od -An -tx1 | tr -d ' \n' > "$full_path"
    fi
    chmod 600 "$full_path"
    copy_acl "$full_path"
    echo "✓ Generado: $full_path"
  fi
}

echo "Generando secretos seguros en $SECRETS_DIR..."
generate_secret "postgres_password.txt" 32
generate_secret "tenant_db_password.txt" 32
generate_secret "auth_db_password.txt" 32
generate_secret "platform_db_password.txt" 32
generate_secret "jwt_secret.txt" 48
generate_secret "platform_admin_password.txt" 24
generate_secret "integrations_key.txt" 32

echo ""
echo "Secretos generados con permisos 0600 en $SECRETS_DIR."
echo "La contraseña inicial del administrador de plataforma está en: $SECRETS_DIR/platform_admin_password.txt"
