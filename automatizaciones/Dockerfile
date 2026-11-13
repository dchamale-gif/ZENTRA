# syntax=docker/dockerfile:1
# Portal de automatizaciones (AutomatizacionBotEngine, Java/Spring + Selenium) para la pestaña
# "Automatizaciones" del panel de soporte. El código se baja del repositorio de GitHub al
# construir la imagen; para traer cambios nuevos: docker compose build automatizaciones.
#
# Modo ligero: Chrome (Chromium) sin ventana va dentro de esta misma imagen y solo corre mientras
# dura cada prueba; no hay Selenium Grid ni grabador de video aparte. Así cabe en un servidor de
# 1 GB junto al ERP. Se mantienen capturas, Word y PDF; no se graba video.
ARG BOTENGINE_REPO=https://github.com/eaguerral/AutomatizacionBotEngine.git
ARG BOTENGINE_REF=prod
# Debe coincidir con SERVER_SERVLET_CONTEXT_PATH en compose.yaml y con el Caddyfile.
ARG RUTA_BASE=/pruebas

# Java 21: es lo que pide el pom.xml (java.version), aunque el README del repositorio diga 17.
FROM eclipse-temurin:21-jdk AS build
ARG BOTENGINE_REPO
ARG BOTENGINE_REF
ARG RUTA_BASE
ADD ${BOTENGINE_REPO}#${BOTENGINE_REF} /src
WORKDIR /src
COPY ajustar-ruta-base.sh /tmp/ajustar-ruta-base.sh
RUN sh /tmp/ajustar-ruta-base.sh src/main/resources/templates "$RUTA_BASE"
# Sin video en modo ligero: que no espere 45 s ni avise por un .mp4 que no se graba.
COPY sin-video-en-modo-local.sh /tmp/sin-video-en-modo-local.sh
RUN sh /tmp/sin-video-en-modo-local.sh /src
RUN --mount=type=cache,target=/root/.m2 \
    sh ./mvnw -B -q -DskipTests package \
    && cp target/automatizacion-botengine-*.jar /app.jar

FROM eclipse-temurin:21-jre AS jre

# Debian y no Ubuntu: en Ubuntu Chromium solo existe como snap, que no funciona en Docker.
FROM debian:trixie-slim
ENV JAVA_HOME=/opt/java/openjdk \
    PATH=/opt/java/openjdk/bin:$PATH \
    LANG=C.UTF-8
COPY --from=jre /opt/java/openjdk /opt/java/openjdk
RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# El portal abre Chrome sin poder pasarle opciones; estas son las que necesita dentro de Docker
# (sin sandbox de usuario, /dev/shm pequeño) y las que ahorran memoria. WebDriverManager reconoce
# la versión con «google-chrome --version» y ChromeDriver abre este mismo envoltorio.
COPY chrome-docker.sh /usr/bin/google-chrome
RUN chmod 755 /usr/bin/google-chrome \
    && mkdir -p /opt/google/chrome /etc/chromium.d \
    && ln -s /usr/bin/google-chrome /opt/google/chrome/chrome \
    && printf 'export CHROMIUM_FLAGS="$CHROMIUM_FLAGS --no-sandbox --disable-dev-shm-usage --disable-gpu"\n' > /etc/chromium.d/zz-docker

RUN useradd --system --uid 10001 --home-dir /app --shell /usr/sbin/nologin app \
    && mkdir -p /app/storage/evidencias /app/storage/plantillas-evidencia /app/storage/selenium-videos \
                /app/reportes/testng /app/reportes/evidencias /app/reportes/logs /app/reportes/ejecuciones \
    && chown -R app:app /app
WORKDIR /app
COPY --from=build /app.jar /app/app.jar
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 755 /usr/local/bin/entrypoint.sh
EXPOSE 8081
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
