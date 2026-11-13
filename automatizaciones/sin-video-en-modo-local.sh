#!/bin/sh
# En modo ligero (-Dbotengine.selenium.modo=local) no hay grabador de video: Chrome corre dentro
# del contenedor, sin Selenium Grid. Aun así, AutomatizacionBotEngine espera 45 s por cada
# ejecución a un .mp4 que nunca llega y deja la advertencia «Selenium no genero el video esperado».
# Antes de compilar, esto hace que SeleniumVideoService.asociar() no busque video en modo local.
# Si el repositorio ya lo resuelve o cambia esa clase, solo avisa y la construcción sigue.
#
# Uso: sin-video-en-modo-local.sh <raíz-del-código-java>
set -eu

ARCHIVO="$1/src/main/java/com/botengine/automatizacion/service/SeleniumVideoService.java"

if [ ! -f "$ARCHIVO" ]; then
    echo "AVISO: no existe $ARCHIVO; no se ajustó la búsqueda de video."
    exit 0
fi

if grep -q 'botengine.selenium.modo' "$ARCHIVO"; then
    echo "SeleniumVideoService ya distingue el modo local; no se cambia."
    exit 0
fi

if [ "$(grep -c 'ResultadoEjecucion resultado) {' "$ARCHIVO")" != "1" ]; then
    echo "AVISO: SeleniumVideoService cambió; no se ajustó la búsqueda de video (seguirá esperándolo)."
    exit 0
fi

# Primera línea del método asociar(ResultadoEjecucion resultado).
sed -i '/ResultadoEjecucion resultado) {/a\
        // Modo local (servidor de 1 GB): sin grabador de video; solo capturas, Word y PDF.\
        if ("local".equalsIgnoreCase(System.getProperty("botengine.selenium.modo", "remote"))) {\
            return;\
        }' "$ARCHIVO"

grep -q 'botengine.selenium.modo' "$ARCHIVO"
echo "SeleniumVideoService: sin búsqueda de video en modo local."
