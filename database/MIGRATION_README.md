# 🔐 MIGRACIÓN - LOGIN Y REGISTRO EN BD

## 📋 Descripción

Este conjunto de scripts actualiza tu base de datos existente para que funcione completamente el sistema de **Login y Registro** amarrado a PostgreSQL.

**Archivos en esta carpeta:**
- `migration-login-setup.sql` - Script SQL con todos los cambios
- `setup-login.sh` - Script bash automático
- `migrate.py` - Script Python interactivo (recomendado)
- `rollback-login-setup.sql` - Script para revertir cambios si es necesario
- `MIGRATION_README.md` - Este archivo

---

## ⚡ Ejecución Rápida

### Opción 1: Python (Recomendado - Más seguro)
```bash
cd database
python3 migrate.py
```

### Opción 2: Bash
```bash
cd database
bash setup-login.sh
```

### Opción 3: SQL directo
```bash
psql -U postgres -d zentra -f database/migration-login-setup.sql
```

---

## 📝 Qué hace la migración

### 1. Actualiza tabla `users`
Agrega columnas para seguridad:
- `verificado` - ¿Email verificado?
- `ultimo_login_fallido` - Timestamp del último login fallido
- `intentos_login_fallidos` - Contador de intentos fallidos
- `bloqueado_hasta` - Fecha de desbloqueo (si está bloqueado)
- `email_verificado_en` - Cuándo se verificó el email

### 2. Crea tabla `login_attempts`
Registra todos los intentos de login:
```sql
CREATE TABLE login_attempts (
    id SERIAL PRIMARY KEY,
    email VARCHAR(100),
    ip_address VARCHAR(50),
    user_agent TEXT,
    exitoso BOOLEAN,
    razon_fallo VARCHAR(255),
    timestamp TIMESTAMP
);
```

### 3. Crea tabla `password_reset_tokens`
Para recuperación de contraseña:
```sql
CREATE TABLE password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    token VARCHAR(255) UNIQUE,
    email VARCHAR(100),
    usado BOOLEAN,
    expira_en TIMESTAMP
);
```

### 4. Crea tabla `user_sessions`
Maneja sesiones activas:
```sql
CREATE TABLE user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    token VARCHAR(500) UNIQUE,
    ip_address VARCHAR(50),
    activa BOOLEAN,
    expira_en TIMESTAMP
);
```

### 5. Crea índices de optimización
Mejora performance de queries:
```sql
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_login_attempts_email ON login_attempts(email);
-- ... más índices
```

### 6. Crea roles iniciales
```
- admin: Acceso total
- doctor: Acceso médico
- enfermera: Acceso limitado
- recepcionista: Gestión de citas
- gerente_compras: Inventario
- contador: Finanzas
- paciente: Solo su información
```

### 7. Crea permisos
Define permisos por módulo y acción

### 8. Crea usuario admin
```
Email:      admin@zentra.com
Contraseña: admin123
Rol:        admin (acceso total)
```

---

## ✅ Pre-requisitos

1. **PostgreSQL corriendo**
   ```bash
   brew services start postgresql@15
   ```

2. **Base de datos `zentra` creada**
   ```bash
   createdb zentra
   ```

3. **Schema original cargado**
   ```bash
   psql -U postgres -d zentra -f database/schema.sql
   ```

4. **Archivo `backend/.env` configurado**
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=tu_password
   DB_NAME=zentra
   ```

---

## 🔍 Verificación

Después de ejecutar la migración, verifica que todo funcionó:

```bash
# Verificar tablas nuevas
psql -U postgres -d zentra -c "\dt login_attempts password_reset_tokens user_sessions"

# Verificar usuario admin
psql -U postgres -d zentra -c "SELECT email, nombre, activo FROM users WHERE email = 'admin@zentra.com';"

# Contar roles y permisos
psql -U postgres -d zentra -c "SELECT COUNT(*) FROM roles;"
psql -U postgres -d zentra -c "SELECT COUNT(*) FROM permissions;"
```

---

## 🔄 Si algo salió mal - ROLLBACK

Si necesitas revertir los cambios:

```bash
# SQL directo
psql -U postgres -d zentra -f database/rollback-login-setup.sql
```

**Nota:** El rollback elimina las tablas nuevas pero NO afecta datos existentes.

---

## 🔑 Credenciales después de migración

```
Email:      admin@zentra.com
Contraseña: admin123
Rol:        admin
```

**⚠️ IMPORTANTE:** Cambia la contraseña en el primer login.

---

## 📊 Estadísticas de BD después de migración

```
Usuarios:   >= 1 (admin)
Roles:      7 (admin, doctor, enfermera, recepcionista, gerente_compras, contador, paciente)
Permisos:   40+ (todos los módulos del sistema)
```

---

## 🛡️ Seguridad

### Implementado:
- ✅ Contraseñas hasheadas con bcrypt
- ✅ Registro de intentos de login
- ✅ Bloqueo temporal de cuenta (si muchos intentos fallidos)
- ✅ Tokens de recuperación de contraseña
- ✅ Sesiones con expiración
- ✅ Auditoría de logins

### En producción DEBES:
- 🔴 Cambiar JWT_SECRET en `backend/.env`
- 🔴 Usar HTTPS
- 🔴 Cambiar contraseña de admin
- 🔴 Configurar DB_PASSWORD segura

---

## 🧪 Test después de migración

### 1. Verificar login del admin
```bash
# En otra terminal, iniciar backend
cd backend
npm start

# Ir a http://localhost:5500/login.html
# Usar: admin@zentra.com / admin123
```

### 2. Verificar tabla de login_attempts
```bash
psql -U postgres -d zentra -c "SELECT * FROM login_attempts ORDER BY timestamp DESC LIMIT 5;"
```

### 3. Verificar sesiones
```bash
psql -U postgres -d zentra -c "SELECT * FROM user_sessions WHERE activa = true;"
```

---

## 📋 Contenido de los scripts

### `migration-login-setup.sql`
Script principal con todos los cambios SQL. Usa `BEGIN;` y `COMMIT;` para transacción atómica.

### `setup-login.sh`
Script bash que:
1. Verifica PostgreSQL
2. Carga variables de .env
3. Solicita contraseña si es necesario
4. Ejecuta la migración
5. Muestra resumen

### `migrate.py`
Script Python que:
1. Carga variables de .env
2. Conecta a BD de forma segura
3. Pide confirmación
4. Ejecuta migración
5. Verifica cambios
6. Muestra estadísticas

### `rollback-login-setup.sql`
Script para revertir la migración:
- Elimina tablas nuevas
- Elimina índices
- Opcionalmente elimina usuario admin (comentado)

---

## 🐛 Troubleshooting

### Error: "role postgres does not exist"
```bash
# Crear usuario postgres
createuser -s postgres
```

### Error: "database zentra does not exist"
```bash
# Crear base de datos
createdb zentra

# Cargar schema original
psql -U postgres -d zentra -f database/schema.sql
```

### Error: "CORS policy"
Edita `backend/.env`:
```env
CORS_ORIGIN=http://localhost:5500,http://localhost:3000,file://
```

### Error: "Token inválido"
Limpia localStorage:
- Abre DevTools (F12)
- Application → Local Storage → Clear All
- Recarga la página

---

## 📞 Soporte

Si tienes problemas:

1. Revisa la consola del navegador (F12)
2. Revisa los logs del backend (`npm start`)
3. Verifica la conexión a BD:
   ```bash
   psql -U postgres -d zentra -c "SELECT NOW();"
   ```
4. Ejecuta el rollback si es necesario

---

## ✨ Después de la migración

1. ✅ Iniciar backend: `cd backend && npm start`
2. ✅ Abrir frontend: `http://localhost:5500/login.html`
3. ✅ Hacer login con admin@zentra.com / admin123
4. ✅ Cambiar contraseña de admin
5. ✅ Crear más usuarios según necesites
6. ✅ Asignar roles a usuarios

---

**¡Listo! Tu sistema de Login está completamente funcional.** 🚀

Para más detalles, ver:
- `LOGIN_SETUP.md` - Guía completa
- `QUICK_LOGIN.md` - Inicio rápido
- `ARCHITECTURE.md` - Arquitectura del sistema
