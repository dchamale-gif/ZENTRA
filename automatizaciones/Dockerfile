# syntax=docker/dockerfile:1
# Portal de automatizaciones (AutomatizacionBotEngine, Java/Spring + Selenium) para la pestaña
# "Automatizaciones" del panel de soporte. El código se baja del repositorio de GitHub al
# construir la imagen; para traer cambios nuevos: docker compose build automatizaciones.
ARG BOTENGINE_REPO=https://github.com/eaguerral/AutomatizacionBotEngine.git
ARG BOTENGINE_REF=prod
# Debe coincidir con SERVER_SERVLET_CONTEXT_PATH en compose.yaml y con el Caddyfile.
ARG RUTA_BASE=/pruebas

FROM eclipse-temurin:17-jdk AS build
ARG BOTENGINE_REPO
ARG BOTENGINE_REF
ARG RUTA_BASE
ADD ${BOTENGINE_REPO}#${BOTENGINE_REF} /src
WORKDIR /src
COPY ajustar-ruta-base.sh /tmp/ajustar-ruta-base.sh
RUN sh /tmp/ajustar-ruta-base.sh src/main/resources/templates "$RUTA_BASE"
RUN --mount=type=cache,target=/root/.m2 \
    sh ./mvnw -B -q -DskipTests package \
    && cp target/automatizacion-botengine-*.jar /app.jar

FROM eclipse-temurin:17-jre
RUN useradd --system --uid 10001 --home-dir /app --shell /usr/sbin/nologin app \
    && mkdir -p /app/storage/evidencias /app/storage/plantillas-evidencia \
                /app/reportes/testng /app/reportes/evidencias /app/reportes/logs /app/reportes/ejecuciones \
    && chown -R app:app /app
WORKDIR /app
COPY --from=build /app.jar /app/app.jar
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 755 /usr/local/bin/entrypoint.sh
EXPOSE 8081
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
