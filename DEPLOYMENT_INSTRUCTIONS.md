# Despliegue seguro de Zentra con Docker

Zentra se despliega con tres servicios:

- `web`: Caddy sirve el frontend y termina HTTPS.
- `backend`: API Node.js, accesible únicamente desde la red interna.
- `db`: PostgreSQL, sin puertos publicados al host.

El backend usa tres roles PostgreSQL diferentes:

- `zentra_tenant`: datos operativos sujetos a RLS.
- `zentra_auth`: registro y autenticación.
- `zentra_platform`: empresas, soporte y licencias.

## Requisitos

- Docker Engine.
- Docker Compose v2.
- Un dominio cuyo DNS apunte al servidor.
- Puertos 80 y 443 disponibles.

## Configuración rápida (recomendada)

1. En tu proveedor de dominio crea un registro DNS tipo **A** que apunte el
   dominio (o subdominio) a la IP pública del servidor.
2. En el servidor, desde la carpeta del proyecto:

```bash
./configurar-dominio.sh zentra.midominio.com soporte@midominio.com
docker compose up -d --build
docker compose --profile setup run --rm bootstrap-admin
```

El script crea `.env`, escribe `DOMAIN` y `CORS_ORIGIN`, genera los secretos
que falten y comprueba que el DNS apunte al servidor. Caddy emite el
certificado HTTPS en el primer arranque; si el DNS aún no propagó, lo
reintenta solo.

Para probar en local sin dominio, deje `DOMAIN` vacío y use
`CORS_ORIGIN=https://localhost`: Caddy servirá
`https://localhost` con un certificado local.

## Configuración manual

```bash
cp .env.docker.example .env
mkdir -p secrets

openssl rand -base64 48 > secrets/postgres_password.txt
openssl rand -base64 48 > secrets/tenant_db_password.txt
openssl rand -base64 48 > secrets/auth_db_password.txt
openssl rand -base64 48 > secrets/platform_db_password.txt
openssl rand -base64 64 > secrets/jwt_secret.txt
openssl rand -base64 32 > secrets/platform_admin_password.txt

chmod 600 secrets/*.txt
```

Edite `.env` y configure al menos:

```env
DOMAIN=zentra.example.com
CORS_ORIGIN=https://zentra.example.com
PLATFORM_ADMIN_EMAIL=soporte@zentra.example.com
PLATFORM_ADMIN_NAME=Soporte Zentra
JWT_EXPIRATION=8h
```

No incluya `http://` o `https://` en `DOMAIN`.

## Inicio

```bash
docker compose config
docker compose up -d --build
docker compose ps
```

Caddy obtiene y renueva automáticamente el certificado TLS para el dominio.
El puerto 3011 del backend y el 5432 de PostgreSQL no se publican.

## Crear administrador de soporte

```bash
docker compose --profile setup run --rm bootstrap-admin
```

La contraseña es el contenido de `secrets/platform_admin_password.txt`. Después
puede iniciar sesión desde `https://DOMINIO/login.html`.

## Actualizaciones

```bash
docker compose pull
docker compose up -d --build
docker compose ps
```

El servicio `migrate` aplica la migración multiempresa antes de iniciar la API.

## Copias de seguridad

```bash
docker compose exec -T db pg_dump \
  -U zentra_owner -d zentra -Fc > "zentra-$(date +%F).dump"
```

Guarde los respaldos cifrados fuera del servidor y pruebe periódicamente su
restauración.

## Verificación

```bash
curl -I "https://${DOMAIN}/"
curl "https://${DOMAIN}/health"
docker compose logs --tail=100 backend
```

El backend rechaza el arranque si:

- algún rol de aplicación tiene `SUPERUSER` o `BYPASSRLS`;
- los tres subsistemas comparten el mismo rol PostgreSQL;
- falta `CORS_ORIGIN`;
- falta una CA válida cuando se solicita TLS hacia una base remota.

## Consideraciones operativas

- No publique los puertos 3011 ni 5432.
- No ejecute el backend como `postgres`.
- No copie secretos dentro de las imágenes.
- Rote contraseñas y `JWT_SECRET` ante cualquier exposición.
- Mantenga Docker, PostgreSQL, Caddy y las dependencias actualizados.
