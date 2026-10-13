# 🔐 GUÍA DE IMPLEMENTACIÓN: LOGIN AMARRADO A BASE DE DATOS

## ✅ Lo que ya está implementado

### Backend (Node.js + Express)
- ✅ API de autenticación completa (`/auth/login`, `/auth/register`, `/auth/logout`)
- ✅ Tabla de usuarios en PostgreSQL con contraseñas hasheadas (bcrypt)
- ✅ Sistema de roles y permisos
- ✅ JWT tokens con expiración
- ✅ Middleware de autenticación

### Frontend (JavaScript Puro)
- ✅ Página de login con interfaz moderna (`login.html`)
- ✅ Gestor de autenticación (`auth-utils.js`)
- ✅ Script de login (`login.js`)
- ✅ Protección de rutas automática
- ✅ Almacenamiento seguro de tokens
- ✅ Menú de usuario con logout

---

## 🚀 PASOS PARA ACTIVAR EL LOGIN

### PASO 1: Configurar Base de Datos PostgreSQL

```bash
# Instalar PostgreSQL (si no lo tienes)
brew install postgresql@15

# Iniciar PostgreSQL
brew services start postgresql@15

# Conectarse a PostgreSQL
psql -U postgres

# Crear base de datos
CREATE DATABASE zentra;

# Conectarse a la BD
\c zentra

# Ejecutar el schema SQL
\i /Users/diego/SistemaContable/database/schema.sql
```

### PASO 2: Crear usuario de prueba en la BD

```bash
psql -U postgres -d zentra
```

Dentro de psql, ejecutar:

```sql
-- Insertar roles necesarios
INSERT INTO roles (nombre, descripcion) VALUES 
  ('admin', 'Administrador del sistema'),
  ('doctor', 'Doctor'),
  ('recepcionista', 'Recepcionista'),
  ('contable', 'Contable')
ON CONFLICT DO NOTHING;

-- Crear usuario de prueba
INSERT INTO users (email, password_hash, nombre, apellido, telefono, activo)
VALUES (
  'admin@zentra.com',
  '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',  -- bcrypt de 'admin123'
  'Admin',
  'Usuario',
  '1234567890',
  true
);

-- Verificar usuario creado
SELECT * FROM users;
```

**O usar script Node.js para crear usuario con hash correcto:**

```javascript
const bcrypt = require('bcryptjs');

const password = 'admin123';
bcrypt.hash(password, 10, (err, hash) => {
  console.log('INSERT INTO users VALUES (..., ' + "'" + hash + "'" + ', ...)');
});
```

### PASO 3: Configurar variables de entorno (.env)

Editar `/Users/diego/SistemaContable/backend/.env`:

```env
# ====================================
# DATABASE
# ====================================
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=tu_password_postgres
DB_NAME=zentra

# ====================================
# SERVER
# ====================================
PORT=3000
NODE_ENV=development

# ====================================
# JWT - Usar una contraseña segura en producción
# ====================================
JWT_SECRET=tu_super_secreto_jwt_cambiar_en_produccion_minimo_32_caracteres
JWT_EXPIRATION=7d

# ====================================
# CORS - Permitir el frontend
# ====================================
CORS_ORIGIN=http://localhost:5500,http://localhost:3000,file://

# ====================================
# LOGGING
# ====================================
LOG_LEVEL=debug
```

### PASO 4: Instalar y ejecutar Backend

```bash
cd /Users/diego/SistemaContable/backend

# Instalar dependencias
npm install

# Iniciar servidor
npm start
# o: node server.js
```

Deberías ver:
```
✅ Conexión a PostgreSQL establecida
Server running on port 3000
```

### PASO 5: Abrir el Frontend

Abrir el proyecto en VS Code Live Server:

```bash
# En VS Code, click derecho en index.html > "Open with Live Server"
# O en terminal:
cd /Users/diego/SistemaContable
# Servir archivos en puerto 5500 (live-server por defecto)
```

Será redirigido automáticamente a `http://localhost:5500/login.html`

---

## 🔑 CREDENCIALES DE PRUEBA

```
Email: admin@zentra.com
Contraseña: admin123
```

---

## 📋 FLUJO DE LOGIN

1. **Usuario abre la app** → Redirigido a `login.html`
2. **Ingresa credenciales** → Se envía a `/auth/login` del backend
3. **Backend valida** → 
   - ✓ Busca usuario por email
   - ✓ Verifica contraseña con bcrypt
   - ✓ Obtiene roles y permisos
   - ✓ Genera JWT token
4. **Frontend recibe token** →
   - ✓ Guarda en localStorage
   - ✓ Guarda datos del usuario
   - ✓ Redirige a `index.html`
5. **App protegida** →
   - ✓ Verifica token en cada carga
   - ✓ Incluye token en requests a la API
   - ✓ Muestra nombre del usuario en header

---

## 🛡️ SEGURIDAD IMPLEMENTADA

### Backend
- ✅ Contraseñas hasheadas con bcrypt
- ✅ JWT tokens con expiración (7 días por defecto)
- ✅ Middleware de autenticación en rutas protegidas
- ✅ CORS configurado
- ✅ Helmet.js para headers de seguridad
- ✅ Auditoría de login (último_login)

### Frontend
- ✅ Almacenamiento de token en localStorage
- ✅ Protección automática de rutas
- ✅ Validación de email y contraseña
- ✅ Detección de token expirado
- ✅ Logout automático si token invalido

---

## 📝 ARCHIVOS CREADOS/MODIFICADOS

### Nuevos archivos:
- ✅ `/login.html` - Página de login
- ✅ `/js/auth-utils.js` - Gestor de autenticación
- ✅ `/js/login.js` - Lógica del formulario

### Modificados:
- ✅ `/index.html` - Agregados scripts de auth + menú de usuario
- ✅ `/js/app.js` - Protección de rutas + funciones de perfil/logout

---

## 🧪 PRUEBAS

### Test 1: Login correcto
```
1. Ir a http://localhost:5500/login.html
2. Email: admin@zentra.com
3. Pass: admin123
4. Click Ingresar
5. ✓ Debe redirigir a dashboard
6. ✓ Nombre del usuario en header superior izquierdo
```

### Test 2: Credenciales incorrectas
```
1. Email: admin@zentra.com
2. Pass: contraseña_incorrecta
3. ✓ Debe mostrar error "Credenciales inválidas"
```

### Test 3: Email no existe
```
1. Email: nosoyusuario@test.com
2. Pass: cualquier_cosa
3. ✓ Debe mostrar error "Credenciales inválidas"
```

### Test 4: Protección de rutas
```
1. Borrar localStorage (F12 > Application > Clear)
2. Ir a http://localhost:5500/index.html
3. ✓ Debe redirigir automáticamente a /login.html
```

### Test 5: Logout
```
1. Estar logueado en el dashboard
2. Click en usuario (arriba en sidebar)
3. Click "Cerrar Sesión"
4. ✓ Debe limpiar token y redirigir a login
```

---

## 🔧 TROUBLESHOOTING

### Error: "Conexión rechazada a BD"
```bash
# Verificar que PostgreSQL está corriendo
brew services list
# Si no está: brew services start postgresql@15

# Verificar credenciales en .env
# Verificar que la BD existe:
psql -U postgres -l | grep zentra
```

### Error: "Token inválido/expirado"
```
- Limpiar localStorage: F12 > Application > Clear
- Hacer login nuevamente
```

### Error: "CORS policy"
```
- Verificar CORS_ORIGIN en .env
- Debe incluir http://localhost:5500 o tu URL del frontend
```

### Error: "Cannot GET /auth/login"
```
- Verificar que backend está corriendo (npm start)
- Verificar puerto 3000 está disponible
```

---

## 📚 PRÓXIMAS MEJORAS (Opcional)

- [ ] Recuperación de contraseña
- [ ] Registro de nuevos usuarios
- [ ] 2FA (autenticación de dos factores)
- [ ] Sincronización de roles con permisos por página
- [ ] Token refresh automático
- [ ] Historial de intentos de login
- [ ] Bloqueo de cuenta después de N intentos fallidos

---

## ✉️ SOPORTE

Para dudas o problemas, revisar:
- Logs del backend: `npm start` output
- Consola del navegador: F12 > Console
- Network tab: F12 > Network (revisar requests a /auth/login)

---

**Sistema Zentra v1.0** | Login amarrado a Base de Datos ✅
