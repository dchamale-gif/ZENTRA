#!/bin/sh
# Arranca el portal de automatizaciones. Corre como root solo para leer los secretos de
# Docker y dejar listas las carpetas; Java corre después como el usuario "app".
set -eu

leer_secreto() {
    archivo="/run/secrets/$1"
    if [ ! -s "$archivo" ]; then
        echo "Falta el secreto $archivo. Ejecuta ./generate-docker-secrets.sh en el servidor." >&2
        exit 1
    fi
    tr -d '\r\n' < "$archivo"
}

SPRING_DATASOURCE_PASSWORD="$(leer_secreto automatizaciones_db_password)"
BOTENGINE_ADMIN_PASSWORD="$(leer_secreto automatizaciones_admin_password)"
BOTENGINE_CREDENTIAL_KEY="$(leer_secreto automatizaciones_credential_key)"
export SPRING_DATASOURCE_PASSWORD BOTENGINE_ADMIN_PASSWORD BOTENGINE_CREDENTIAL_KEY

# La prueba de ejemplo (LOGIN_TEST) entra al propio portal con el usuario administrador.
export TEST_USERNAME="${TEST_USERNAME:-${BOTENGINE_ADMIN_USERNAME:-admin}}"
export TEST_PASSWORD="${TEST_PASSWORD:-$BOTENGINE_ADMIN_PASSWORD}"

chown app:app /app/storage /app/reportes 2>/dev/null || true

# setpriv no cambia HOME: WebDriverManager guarda ahí el ChromeDriver que descarga.
export HOME=/app

# shellcheck disable=SC2086
exec setpriv --reuid=app --regid=app --init-groups java ${JAVA_OPTS:-} -jar /app/app.jar
