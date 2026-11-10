# Automatizaciones en el panel de soporte

La pestaña **Automatizaciones** de `support.html` muestra el portal
[AutomatizacionBotEngine](https://github.com/eaguerral/AutomatizacionBotEngine) (Java/Spring Boot +
Selenium + TestNG) dentro del panel. Desde ahí se usan todas sus funciones: catálogo de
automatizaciones, asignaciones, usuarios y roles, empresas, credenciales de sitios (cifradas),
insumos, ejecución en Chrome con capturas, reportes Word/PDF, historial y reportes.

## Cómo está armado

| Servicio (compose.yaml)   | Qué hace |
|---------------------------|----------|
| `automatizaciones`        | El portal Java con Chromium adentro. Se construye desde GitHub (rama `prod`, o la de `AUTOMATIZACIONES_REF`). |
| `automatizaciones-db`     | PostgreSQL propio del portal (separado de la base del ERP). |

**Modo ligero** (para que quepa en el droplet de 1 GB junto al ERP y la web del bot):
- El portal corre en modo `local` (`-Dbotengine.selenium.modo=local`): abre Chromium sin ventana
  dentro de su propio contenedor solo mientras dura cada prueba. No hay Selenium Grid ni grabador.
- Por eso **las ejecuciones nuevas no tienen video** (sí capturas, Word y PDF). El portal espera
  45 s al video antes de seguir, así que cada ejecución tarda eso de más; para quitarlo hay que
  hacer el video opcional en el código de AutomatizacionBotEngine.
- `automatizaciones/chrome-docker.sh` se instala como `google-chrome` y le agrega a Chromium las
  opciones que necesita en Docker (`--no-sandbox`, `--disable-dev-shm-usage`) y las que ahorran
  memoria. WebDriverManager descarga el ChromeDriver de esa versión la primera vez (necesita
  salida a internet).
- Topes: 700 MB el portal (Java + Chromium) y 128 MB su base. Si al servidor le falta memoria, el
  sistema mata primero estos contenedores (`oom_score_adj`), nunca al ERP. Con un droplet de 2 GB
  las pruebas corren con holgura.

- Caddy publica el portal en **`/pruebas`** y, antes de cada petición, pregunta al backend
  (`GET /api/platform/sesion`) si hay sesión de soporte. Sin ella responde 401.
- El portal tiene **su propio login**: usuario `admin`, contraseña en
  `secrets/automatizaciones_admin_password.txt`. Desde ahí se crean los demás usuarios (técnicos,
  responsables).
- Las plantillas del repositorio usan enlaces absolutos (`/css/...`); al construir la imagen,
  `automatizaciones/ajustar-ruta-base.sh` les antepone `/pruebas`. Si en el log de la construcción
  aparece `AVISO: rutas absolutas sin ajustar`, hay un enlace nuevo que revisar.
- Todos los servicios van en el perfil `automatizaciones`: si no se enciende, el ERP queda igual y
  la pestaña avisa que el portal no responde.

## Encenderlo en el servidor

En reposo usa unos 250-300 MB; durante una prueba, 300-400 MB más. En `/opt/zentra`:

```bash
cd /opt/zentra && git pull && ./generate-docker-secrets.sh && (grep -q '^COMPOSE_PROFILES=' .env || printf '\nCOMPOSE_PROFILES=automatizaciones\n' >> .env) && docker compose up -d --build
```

La primera construcción tarda varios minutos (baja Maven y las dependencias). La contraseña del
usuario `admin` del portal:

```bash
cat /opt/zentra/secrets/automatizaciones_admin_password.txt
```

Con nginx delante (modo `--nginx`), copia otra vez `deploy/nginx-erp.conf` al sitio de nginx para
que las ejecuciones largas no se corten a los 2 minutos (el bloque `location /pruebas/`); si no, una
ejecución de más de 2 minutos sigue corriendo pero el navegador muestra un error y el resultado
aparece después en el historial.

## Actualizar el portal

Los cambios que se suban al repositorio AutomatizacionBotEngine llegan al reconstruir:

```bash
cd /opt/zentra && docker compose build automatizaciones && docker compose up -d automatizaciones
```

## Apagarlo

Quitar `COMPOSE_PROFILES=automatizaciones` de `.env` y ejecutar
`docker compose --profile automatizaciones stop automatizaciones automatizaciones-db`.
Los datos quedan en los volúmenes `automatizaciones_*`.
