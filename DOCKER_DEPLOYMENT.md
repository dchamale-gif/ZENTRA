# Guía de Despliegue Multiempresa con Docker en Zentra

Esta guía describe la arquitectura de seguridad, aislamiento de datos con PostgreSQL Row Level Security (RLS) y los pasos para desplegar Zentra en producción usando Docker y Docker Compose.

---

## 1. Arquitectura de Seguridad y Aislamiento

### 1.1 Row Level Security (RLS) Estricto
- Cada tabla de datos de negocio (`pacientes`, `ventas`, `compras`, `historia_clinica`, `pacientes_saldo`, `movimientos_paciente`, etc.) cuenta con la columna `organization_id NOT NULL`.
- Las tablas tienen habilitado y forzado RLS:
  ```sql
  ALTER TABLE <tabla> ENABLE ROW LEVEL SECURITY;
  ALTER TABLE <tabla> FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON <tabla> FOR ALL
    USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::INTEGER)
    WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::INTEGER);
  ```
- **Principio de Mínimo Privilegio**: La aplicación web se conecta a través de un pool con el rol `zentra_tenant`, el cual **no es superusuario** y **no tiene privilegios BYPASSRLS**. No puede saltarse las políticas de RLS bajo ninguna circunstancia.

### 1.2 Separación de Roles en Base de Datos
| Rol | Conexión | Propósito y Privilegios |
|---|---|---|
| `zentra_owner` | Migraciones / Inicialización | Propietario del esquema, ejecuta migraciones y verificaciones RLS. |
| `zentra_tenant` | Backend general (`connection.js`) | Acceso a tablas de negocio limitado por RLS de la empresa activa. `INSERT/UPDATE/DELETE` revocado en tablas de autenticación y plataforma. |
| `zentra_auth` | Autenticación (`authConnection.js`) | Solo lectura en usuarios, roles y organizaciones para login; inserción para registro de nuevas empresas. |
| `zentra_platform` | Soporte (`platformConnection.js`) | Acceso administrativo a organizaciones, generación de licencias y administradores de plataforma. |

### 1.3 Bloqueo de Despliegue si falta RLS
El script `database/verify-tenant-isolation.sql` verifica dinámicamente que **toda tabla empresarial** en el esquema `public` posea `organization_id NOT NULL`, RLS activo, RLS forzado y la política `tenant_isolation`. Si alguna tabla carece de aislamiento, la migración falla con error fatal y el contenedor backend no inicia.

---

## 2. Flujo de Negocio y Licencias

1. **Auto-registro de Cliente**:
   - Desde `login.html`, el nuevo cliente selecciona "Registrar Empresa".
   - Proporciona: Nombre de la Empresa, Sector Comercial, Correo corporativo, NIT, Teléfono, Dirección, y credenciales del usuario administrador.
   - El sistema genera automáticamente una licencia de prueba (Trial) válida por **30 días**.

2. **Atención por WhatsApp**:
   - En el formulario de registro y en la pantalla de período expirado, existe el botón **"Hablar con un ingeniero de soporte"**.
   - Abre un chat directo de WhatsApp con el número **39959782** (+502 39959782) prellenando el mensaje con los datos comerciales de la empresa.

3. **Bloqueo tras 30 Días**:
   - Tras expirar el período demo de 30 días, el middleware `auth.js` bloquea las solicitudes de la empresa con código `TRIAL_EXPIRED`.
   - Se muestra en pantalla el aviso de expiración y el enlace directo a WhatsApp para renovación.

4. **Panel de Soporte / Administración**:
   - Accesible directamente desde `login.html` usando las credenciales del Administrador de Soporte.
   - Redirige automáticamente a `support.html`.
   - Permite:
     - Ver listado de todas las empresas y filtrar por próximas a vencer (30, 60, 90, 365 días).
     - Ver el formato de licencia de cada empresa: `XXXX-XXXX-XXXX`.
     - **Habilitar / Activar** licencias definiendo el plan y los días de vigencia.
     - **Generar clave**: emite una nueva clave criptográfica `XXXX-XXXX-XXXX` bajo demanda.
     - **Suspender**: bloquea el acceso de la empresa en caso de falta de pago.
     - **Agregar empresa**: alta manual de clientes directamente desde el panel.

---

## 3. Despliegue Paso a Paso con Docker

> **Atajo:** `./configurar-dominio.sh zentra.tu-dominio.com soporte@tu-dominio.com` realiza los pasos 1 y 2 y verifica el DNS.

### Paso 1: Configurar Variables de Entorno
Copie el archivo de ejemplo:
```bash
cp .env.docker.example .env
```
Edite `.env` con su dominio y correo de soporte:
```ini
DOMAIN=zentra.tu-dominio.com
POSTGRES_DB=zentra
POSTGRES_USER=zentra_owner
NODE_ENV=production
CORS_ORIGIN=https://zentra.tu-dominio.com
JWT_EXPIRATION=8h
PLATFORM_ADMIN_EMAIL=soporte@tu-dominio.com
PLATFORM_ADMIN_NAME="Soporte Zentra"
```

### Paso 2: Generar Secretos Criptográficos
Ejecute el script de generación de secretos:
```bash
./generate-docker-secrets.sh
```
Esto creará el directorio `./secrets/` con permisos `0700` y archivos con permisos `0600`:
- `postgres_password.txt`
- `tenant_db_password.txt`
- `auth_db_password.txt`
- `platform_db_password.txt`
- `jwt_secret.txt`
- `platform_admin_password.txt`

> **Nota:** La contraseña inicial generada para el usuario de soporte estará en `./secrets/platform_admin_password.txt`.

### Paso 3: Inicializar la Base de Datos y Migraciones
Inicie PostgreSQL y el servicio de migración con verificación de RLS:
```bash
docker compose up -d db
docker compose up migrate
```
El servicio `migrate` ejecutará la migración multiempresa, agregará todas las tablas tardías y ejecutará la verificación de aislamiento RLS.

### Paso 4: Crear el Primer Usuario Administrador de Soporte
Ejecute el contenedor de bootstrap:
```bash
docker compose --profile setup run --rm bootstrap-admin
```
Esto creará el usuario `PLATFORM_ADMIN_EMAIL` con la contraseña de `./secrets/platform_admin_password.txt`.

### Paso 5: Levantar Toda la Plataforma
Inicie los servicios restantes (backend y proxy web Caddy):
```bash
docker compose up -d
```

### Paso 6: Verificación de Funcionamiento
1. Verifique el estado de los contenedores:
   ```bash
   docker compose ps
   ```
2. Verifique los logs del backend para confirmar que pasó las validaciones de seguridad:
   ```bash
   docker compose logs backend
   ```
   Debe mostrar:
   ```
   ✓ Roles de base de datos verificados: least-privilege activo y sin BYPASSRLS.
   ```
3. Abra su navegador en `https://zentra.tu-dominio.com` (o `https://localhost` en local).
4. Inicie sesión con el correo y contraseña del administrador de soporte. El sistema lo redirigirá inmediatamente a `support.html`.

---

## 4. Mantenimiento y Comandos Útiles

- **Verificar aislamiento RLS manualmente en cualquier momento:**
  ```bash
  docker compose exec db psql -U zentra_owner -d zentra -f /docker-entrypoint-initdb.d/04-verify.sql
  ```

- **Reiniciar servicios tras actualización de código:**
  ```bash
  docker compose build
  docker compose up -d
  ```

- **Hacer backup de la base de datos:**
  ```bash
  docker compose exec db pg_dump -U zentra_owner zentra > backup_$(date +%Y%m%d_%H%M%S).sql
  ```
