# Automatizaciones en el panel de soporte

La pestaña **Automatizaciones** de `support.html` muestra el portal
[AutomatizacionBotEngine](https://github.com/eaguerral/AutomatizacionBotEngine) (Java/Spring Boot +
Selenium + TestNG) dentro del panel. Desde ahí se usan todas sus funciones: catálogo de
automatizaciones, asignaciones, usuarios y roles, empresas, credenciales de sitios (cifradas),
insumos, ejecución en Chrome con video y capturas, reportes Word/PDF, historial y reportes.

## Cómo está armado

| Servicio (compose.yaml)   | Qué hace |
|---------------------------|----------|
| `automatizaciones`        | El portal Java. Se construye desde GitHub (rama `prod`, o la de `AUTOMATIZACIONES_REF`). |
| `automatizaciones-chrome` | Chrome de Selenium. El portal comparte su red (busca Selenium en `localhost:4444`). |
| `automatizaciones-video`  | Graba en video las ejecuciones. |
| `automatizaciones-db`     | PostgreSQL propio del portal (separado de la base del ERP). |

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

Necesita unos 2-3 GB de RAM libres (Chrome, Java y PostgreSQL). En `/opt/zentra`:

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
`docker compose --profile automatizaciones stop automatizaciones automatizaciones-video automatizaciones-chrome automatizaciones-db`.
Los datos quedan en los volúmenes `automatizaciones_*`.
