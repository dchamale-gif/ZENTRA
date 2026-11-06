#!/bin/sh
# Las plantillas de AutomatizacionBotEngine tienen enlaces absolutos ("/css/...", "/usuarios").
# Dentro del ERP el portal vive en una ruta propia (por ejemplo /pruebas), así que antes de
# compilar se les antepone esa ruta. Los enlaces th:href="@{...}" ya la respetan solos.
#
# Uso: ajustar-ruta-base.sh <carpeta-de-plantillas> <ruta-base>
set -eu

DIR="$1"
BASE="$2"

for archivo in "$DIR"/*.html; do
    # 1) atributos: href="/x", src="/x", action="/x" (no toca "//cdn...")
    # 2) onclick="window.location.href='/x'"
    # 3) JavaScript con la ruta al inicio de la línea: "/automatizaciones/" + id + "/ejecutar"
    #    (lo que va después de un + es un sufijo y se deja igual)
    sed -E -i \
        -e "s#(href|src|action)=\"/([^/])#\1=\"$BASE/\2#g" \
        -e "s#location\.href *= *'/#location.href='$BASE/#g" \
        -e "s#^([[:space:]]*)\"/([a-z])#\1\"$BASE/\2#" \
        "$archivo"
done

# Aviso (sin detener la construcción) si el repositorio agregó rutas absolutas de otro estilo.
restantes="$(grep -nE "(=|\(|^)[[:space:]]*[\"']/[a-z]" "$DIR"/*.html | grep -v "$BASE/" || true)"
if [ -n "$restantes" ]; then
    echo "AVISO: rutas absolutas sin ajustar a $BASE:"
    echo "$restantes"
fi
