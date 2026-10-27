#!/usr/bin/env bash
set -euo pipefail

SECRETS_DIR="${1:-./secrets}"
mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"

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
