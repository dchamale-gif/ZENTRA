# 🏗️ ARQUITECTURA DEL SISTEMA DE LOGIN

## Diagrama General

```
┌─────────────────────────────────────────────────────────────────────┐
│                         APLICACIÓN ZENTRA                        │
├──────────────────┬──────────────────────────────┬──────────────────┤
│   FRONTEND       │       BACKEND API            │    BASE DE DATOS │
│  (JavaScript)    │    (Node.js + Express)       │   (PostgreSQL)   │
├──────────────────┼──────────────────────────────┼──────────────────┤
│                  │                              │                  │
│  login.html      │  POST /auth/login            │  users           │
│  ├─ form        │  ├─ Validar email            │  ├─ id           │
│  ├─ validación  │  ├─ Hash password + bcrypt   │  ├─ email        │
│  └─ submit      │  ├─ Verificar contraseña     │  ├─ password_hash│
│                  │  ├─ Obtener roles           │  ├─ nombre       │
│  auth-utils.js   │  ├─ Generar JWT token       │  ├─ activo       │
│  ├─ AuthManager │  └─ Retornar token + user   │  └─ created_at   │
│  ├─ login()     │                              │                  │
│  ├─ logout()    │  POST /auth/logout           │  roles           │
│  ├─ getToken()  │  ├─ Validar JWT             │  ├─ id           │
│  └─ fetchAuth() │  └─ Limpiar sesión          │  ├─ nombre       │
│                  │                              │  └─ descripción  │
│  login.js        │  GET /auth/profile           │                  │
│  ├─ handleLogin │  ├─ Verificar JWT           │  user_roles      │
│  └─ formSubmit  │  └─ Retornar datos usuario  │  ├─ user_id      │
│                  │                              │  └─ role_id      │
│  app.js          │  POST /pacientes (protegido)│                  │
│  ├─ protección  │  GET /medicinas (protegido) │  permissions     │
│  ├─ perfil      │  etc...                      │                  │
│  └─ logout      │                              │                  │
│                  │  Middleware:                 │                  │
│  index.html      │  ├─ authMiddleware          │                  │
│  ├─ header      │  ├─ rolePermissionMiddleware│                  │
│  ├─ sidebar     │  ├─ auditMiddleware         │                  │
│  └─ dashboard   │  └─ errorHandler            │                  │
│                  │                              │                  │
│  Almacenamiento: │  Seguridad:                 │  Conexión:       │
│  ├─ localStorage │  ├─ Helmet.js              │  ├─ Pool pg      │
│  │   (token)    │  ├─ CORS                    │  ├─ Host: local  │
│  └─ sessionStor │  ├─ Rate limiting           │  └─ Port: 5432   │
│                  │  └─ JWT secrets             │                  │
│                  │                              │                  │
└──────────────────┴──────────────────────────────┴──────────────────┘
```

---

## Flujo de Autenticación Detallado

```
INICIO
  ↓
┌─────────────────────────────────────────┐
│  Usuario abre http://localhost:5500     │
└─────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────┐
│  index.html carga                       │
│  ├─ auth-utils.js se ejecuta            │
│  └─ DOMContentLoaded dispara requireAuth│
└─────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────┐
│  ¿authManager.isAuthenticated()?        │
│  (Verificar si hay token en localStorage)
└─────────────────────────────────────────┘
  ↓
  ├─ NO → REDIRECT a /login.html
  │
  └─ SÍ → ¿Token expirado?
       ├─ SÍ → REDIRECT a /login.html
       └─ NO → Cargar dashboard
           ↓
        ┌──────────────────────────────┐
        │  initializeUserProfile()     │
        │  ├─ Obtener usuario de storage
        │  ├─ Mostrar nombre en header │
        │  └─ Mostrar rol              │
        └──────────────────────────────┘
           ↓
        ┌──────────────────────────────┐
        │  setupLogout()               │
        │  └─ Listeners para logout btn│
        └──────────────────────────────┘
           ↓
        ┌──────────────────────────────┐
        │  Dashboard funcionando ✅    │
        │  - Todas las rutas protegidas│
        │  - Token en headers automático
        │  - Usuario identificado      │
        └──────────────────────────────┘

───────────────────────────────────────────

EN LOGIN.HTML (cuando No hay autenticación):

1. Usuario ingresa credenciales
   ├─ Email: admin@zentra.com
   └─ Password: ••••••••

2. Submit formulario
   └─ handleLogin() dispara

3. Validaciones cliente
   ├─ ¿Email vacío? → Error
   ├─ ¿Email válido? → Error
   └─ ¿Password < 6 chars? → Error

4. authManager.login(email, password)
   └─ FETCH POST /auth/login
       ├─ Headers: { Content-Type: application/json }
       └─ Body: { email, password }

5. Backend recibe request
   ├─ Buscar usuario por email
   │   ├─ ¿Usuario existe?
   │   │   └─ NO → Return 401
   │   └─ SÍ → Continuar
   ├─ Comparar password con hash
   │   ├─ ¿Match?
   │   │   └─ NO → Return 401
   │   └─ SÍ → Continuar
   ├─ Obtener roles de usuario
   ├─ Obtener permisos de usuario
   ├─ Generar JWT token
   │   └─ Payload: { userId, email, roles, permissions }
   │   └─ Expiración: 7 días
   ├─ Actualizar último_login
   └─ Return 200 + { token, user }

6. Frontend recibe respuesta
   ├─ ¿success === true?
   │   ├─ SÍ → 
   │   │   ├─ localStorage.setItem('zentra_token', token)
   │   │   ├─ localStorage.setItem('zentra_user', JSON.stringify(user))
   │   │   ├─ Mostrar: "Bienvenido Admin"
   │   │   └─ setTimeout(2s) → REDIRECT index.html
   │   └─ NO → 
   │       ├─ Mostrar error
   │       └─ Limpiar password

7. En index.html
   ├─ requireAuth() verifica token ✅
   └─ Dashboard carga normalmente

───────────────────────────────────────────

LOGOUT:

User click → Menu usuario → Cerrar Sesión
  ↓
performLogout()
  ├─ confirm("¿Estás seguro?")
  ├─ authManager.logout()
  │   ├─ FETCH POST /auth/logout
  │   │   └─ Header: Authorization: Bearer {token}
  │   ├─ localStorage.removeItem('zentra_token')
  │   └─ localStorage.removeItem('zentra_user')
  └─ setTimeout → REDIRECT /login.html

───────────────────────────────────────────
```

---

## Estructura de Archivos

```
/Users/diego/SistemaContable/
├── login.html                    ← 🔐 Página de login
├── index.html                    ← Dashboard (requiere autenticación)
│
├── js/
│   ├── auth-utils.js             ← 🛡️ Gestor de autenticación (clase AuthManager)
│   ├── login.js                  ← 🔑 Lógica del formulario de login
│   ├── app.js                    ← Protección de rutas + perfil usuario
│   ├── config.js
│   ├── pacientes.js
│   ├── ... otros módulos
│   └── gastos-servicios.js
│
├── css/
│   └── style.css
│
├── data/
│   └── demo-data.js
│
├── backend/
│   ├── .env                      ← Variables de ambiente (NO en git)
│   ├── .env.example              ← Template de .env
│   ├── server.js                 ← Express app principal
│   ├── package.json
│   ├── create-test-user.js       ← 👤 Script para crear usuario de prueba
│   │
│   └── src/
│       ├── controllers/
│       │   ├── authController.js    ← 🔐 Lógica de autenticación
│       │   └── pacientesController.js
│       │
│       ├── routes/
│       │   ├── auth.js              ← Rutas de autenticación
│       │   └── pacientes.js
│       │
│       ├── middleware/
│       │   ├── auth.js              ← 🛡️ Middleware de JWT
│       │   └── audit.js
│       │
│       └── db/
│           └── connection.js         ← Conexión a PostgreSQL
│
├── database/
│   └── schema.sql                ← 📊 Estructura de BD
│
├── LOGIN_SETUP.md                ← 📖 Guía completa
├── QUICK_LOGIN.md                ← ⚡ Guía rápida
├── quick-login-setup.sh          ← 🚀 Script automático
└── README.md
```

---

## Componentes Clave

### 1. AuthManager (auth-utils.js)

```javascript
class AuthManager {
  - login(email, password)        // Autenticar
  - logout()                       // Cerrar sesión
  - register(userData)             // Registrar usuario
  - getProfile()                   // Obtener datos del usuario
  - isAuthenticated()              // ¿Tiene token?
  - isTokenExpired()               // ¿Token expiró?
  - hasRole(role)                  // ¿Tiene rol?
  - hasPermission(permission)      // ¿Tiene permiso?
  - fetchWithAuth(url, options)    // Request autenticado
  - saveToken(token)               // Guardar token
  - getToken()                     // Obtener token
  - clearToken()                   // Limpiar token
}
```

### 2. JWT Token Structure

```javascript
Header:
{
  "alg": "HS256",
  "typ": "JWT"
}

Payload:
{
  "userId": 1,
  "email": "admin@zentra.com",
  "roles": ["admin"],
  "permissions": ["read:pacientes", "write:pacientes"],
  "iat": 1717689600,
  "exp": 1718294400
}

Signature:
HMACSHA256(
  base64UrlEncode(header) + "." +
  base64UrlEncode(payload),
  JWT_SECRET
)
```

### 3. Request Autenticado

```javascript
// Frontend
const response = await authManager.fetchWithAuth('/pacientes', {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Lo que se envía al backend:
GET /pacientes HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

// Backend valida el middleware:
const token = req.headers.authorization?.split(' ')[1];
jwt.verify(token, JWT_SECRET);
```

---

## Seguridad

```
┌─────────────────────────────────────────────┐
│          CAPAS DE SEGURIDAD                  │
├─────────────────────────────────────────────┤
│                                              │
│  CAPA 1: HTTPS/TLS (Producción)             │
│  └─ Encriptación en tránsito                │
│                                              │
│  CAPA 2: CORS                                │
│  └─ Solo orígenes permitidos pueden acceder │
│                                              │
│  CAPA 3: Helmet.js                          │
│  └─ Headers de seguridad HTTP               │
│                                              │
│  CAPA 4: JWT Tokens                         │
│  └─ Firmados con SECRET (no reversible)     │
│  └─ Expiración: 7 días                      │
│  └─ Almacenados en localStorage (HTTPS only)
│                                              │
│  CAPA 5: Bcrypt Password Hashing            │
│  └─ Algoritmo: bcrypt                       │
│  └─ Rounds: 10                              │
│  └─ Salt: automático                        │
│  └─ Imposible revertir el hash              │
│                                              │
│  CAPA 6: Validación Cliente                 │
│  └─ Email válido                            │
│  └─ Contraseña > 6 caracteres               │
│  └─ Validación en tiempo real                │
│                                              │
│  CAPA 7: Validación Servidor                │
│  └─ Validar entrada                         │
│  └─ Rate limiting (TODO)                    │
│  └─ Intentos máximos (TODO)                 │
│                                              │
│  CAPA 8: Auditoría                          │
│  └─ Log de logins                           │
│  └─ Timestamp: último_login                 │
│                                              │
└─────────────────────────────────────────────┘
```

---

## Variables de Ambiente

```env
# .env

# DATABASE
DB_HOST=localhost              # Host de PostgreSQL
DB_PORT=5432                   # Puerto PostgreSQL
DB_USER=postgres               # Usuario de BD
DB_PASSWORD=xxxxx              # Contraseña BD
DB_NAME=zentra             # Nombre de BD

# SERVER
PORT=3000                       # Puerto Express
NODE_ENV=development            # Entorno

# JWT - Cambiar en PRODUCCIÓN
JWT_SECRET=tu_super_secreto_minimo_32_caracteres
JWT_EXPIRATION=7d              # Token válido por 7 días

# CORS - Frontend urls permitidas
CORS_ORIGIN=http://localhost:5500,http://localhost:3000,file://

# LOGGING
LOG_LEVEL=debug                # debug, info, warning, error
```

---

## Dependencias Node.js

```json
{
  "dependencies": {
    "express": "4.18.2",          // Framework web
    "pg": "8.11.3",               // Driver PostgreSQL
    "bcryptjs": "2.4.3",          // Hash de contraseñas
    "jsonwebtoken": "9.1.2",      // Generación JWT
    "cors": "2.8.5",              // CORS middleware
    "helmet": "7.1.0",            // Headers de seguridad
    "morgan": "1.10.0",           // Logger HTTP
    "dotenv": "16.3.1"            // Variables de ambiente
  }
}
```

---

## Checklist de Seguridad

- ✅ Contraseñas hasheadas con bcrypt (rounds: 10)
- ✅ JWT tokens firmados (HS256)
- ✅ Tokens con expiración (7 días)
- ✅ CORS configurado
- ✅ Helmet.js headers
- ✅ HTTPS ready (en producción)
- ✅ SQL Injection protection (prepared statements)
- ⚠️ Rate limiting (TODO)
- ⚠️ Bloqueo de cuenta (TODO)
- ⚠️ 2FA (TODO)

---

**Arquitectura completa del sistema de Login - Zentra v1.0**
