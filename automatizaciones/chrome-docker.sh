#!/bin/sh
# Chromium para las pruebas del portal, con las opciones que necesita dentro de Docker y las que
# reducen memoria. Se instala como /usr/bin/google-chrome (ver Dockerfile).
exec /usr/bin/chromium \
    --no-sandbox \
    --disable-dev-shm-usage \
    --disable-gpu \
    --disable-extensions \
    --disable-background-networking \
    --disable-component-update \
    --mute-audio \
    --renderer-process-limit=2 \
    "$@"
