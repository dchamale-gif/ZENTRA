# 🏥 ZENTRA - Backend API

Backend profesional para el Sistema Médico Zentra, construido con Node.js, Express y PostgreSQL.

## 📋 Tabla de Contenidos

- [Instalación](#instalación)
- [Configuración](#configuración)
- [Estructura](#estructura)
- [Endpoints](#endpoints)
- [Autenticación](#autenticación)
- [Ejecución](#ejecución)

## 🚀 Instalación

### Requisitos previos

- Node.js 16.x o superior
- PostgreSQL 12.x o superior
- npm o yarn

### Pasos

1. **Instalar dependencias**

```bash
cd backend
npm install
```

2. **Crear archivo .env**

```bash
cp .env.example .env
```

3. **Configurar variables de entorno** (editar `.env`)

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=tu_password
DB_NAME=zentra
JWT_SECRET=tu_secreto_jwt_muy_largo_minimo_32_caracteres
```

4. **Crear base de datos PostgreSQL**

```bash
# Conectarse a PostgreSQL
psql -U postgres

# Crear base de datos
CREATE DATABASE zentra;
\c zentra

# Ejecutar schema
\i ../database/schema.sql
\i ../database/multitenancy-trial-migration.sql
```

### Panel de soporte y licencias

Después de ejecutar la migración multiempresa, crea la cuenta privada que podrá
administrar empresas y licencias:

```bash
export PLATFORM_ADMIN_EMAIL=soporte@zentra.com
export PLATFORM_ADMIN_PASSWORD='CAMBIAR_POR_UNA_PASSWORD_SEGURA'
export PLATFORM_ADMIN_NAME='Soporte Zentra'
npm run create:platform-admin
```

Esa cuenta se autentica desde `login.html` y se redirige automáticamente a
`support.html`. No es el mismo rol `admin` de una empresa.

## ⚙️ Configuración

### Variables de Entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `DB_HOST` | localhost | Host de PostgreSQL |
| `DB_PORT` | 5432 | Puerto de PostgreSQL |
| `DB_USER` | postgres | Usuario de BD |
| `DB_PASSWORD` | - | Contraseña de BD |
| `DB_NAME` | zentra | Nombre de BD |
| `PORT` | 3000 | Puerto del servidor |
| `NODE_ENV` | development | Ambiente |
| `JWT_SECRET` | - | Secreto para JWT (mínimo 32 chars) |
| `JWT_EXPIRATION` | 7d | Expiración de token |
| `CORS_ORIGIN` | localhost:5500 | Origins permitidos |

## 📁 Estructura

```
backend/
├── src/
│   ├── controllers/          # Lógica de negocio
│   │   ├── authController.js
│   │   └── pacientesController.js
│   ├── routes/               # Definición de rutas
│   │   ├── auth.js
│   │   └── pacientes.js
│   ├── middleware/           # Middlewares
│   │   ├── auth.js          # JWT + Permisos
│   │   └── audit.js         # Auditoría
│   ├── db/
│   │   └── connection.js    # Pool de PostgreSQL
│   └── utils/               # Utilidades
├── server.js                 # Entrada principal
├── package.json
└── .env.example
```

## 🔌 Endpoints

### Autenticación

#### POST `/api/auth/register`

Registrar nuevo usuario

```json
{
  "email": "doctor@zentra.com",
  "password": "password123",
  "nombre": "Juan",
  "apellido": "Pérez",
  "telefono": "3001234567"
}
```

**Response 201:**
```json
{
  "message": "Usuario registrado exitosamente",
  "user": {
    "id": 1,
    "email": "doctor@zentra.com",
    "nombre": "Juan",
    "apellido": "Pérez"
  }
}
```

#### POST `/api/auth/login`

Autenticarse

```json
{
  "email": "doctor@zentra.com",
  "password": "password123"
}
```

**Response 200:**
```json
{
  "message": "Login exitoso",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "doctor@zentra.com",
    "nombre": "Juan",
    "apellido": "Pérez",
    "roles": ["doctor"],
    "permissions": ["pacientes_view", "pacientes_create", "historia_view", ...]
  }
}
```

#### GET `/api/auth/profile`

Obtener perfil del usuario actual

**Headers:**
```
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "user": {
    "id": 1,
    "email": "doctor@zentra.com",
    "nombre": "Juan",
    "apellido": "Pérez",
    "telefono": "3001234567",
    "activo": true,
    "ultimo_login": "2026-05-27T20:35:00Z"
  }
}
```

### Pacientes

#### GET `/api/pacientes`

Listar todos los pacientes

**Headers:**
```
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "total": 45,
  "pacientes": [
    {
      "id": 1,
      "cedula": "1234567890",
      "nombre": "Carlos",
      "apellido": "García",
      "edad": 35,
      "genero": "M",
      "tipo_sangre": "O+",
      "telefono": "3009876543",
      "email": "carlos@mail.com",
      "activo": true
    }
  ]
}
```

#### GET `/api/pacientes/:id`

Obtener datos específicos de un paciente

#### POST `/api/pacientes`

Crear nuevo paciente

```json
{
  "cedula": "1234567890",
  "nombre": "Carlos",
  "apellido": "García",
  "edad": 35,
  "genero": "M",
  "tipo_sangre": "O+",
  "telefono": "3009876543",
  "email": "carlos@mail.com",
  "direccion": "Calle 5 #123",
  "ciudad": "Medellín",
  "alergias": "Penicilina",
  "enfermedades_cronicas": "Hipertensión",
  "contacto_emergencia": "3001111111"
}
```

#### PUT `/api/pacientes/:id`

Actualizar paciente (campos parciales)

```json
{
  "telefono": "3009876543",
  "email": "nuevo@mail.com"
}
```

#### DELETE `/api/pacientes/:id`

Eliminar paciente (soft delete - marca como inactivo)

## 🔐 Autenticación

### JWT Token

Los tokens JWT se envían en el header `Authorization`:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Roles y Permisos

**Roles disponibles:**
- `admin` - Acceso total
- `doctor` - Gestión de pacientes y clínica
- `enfermera` - Monitoreo de pacientes
- `recepcionista` - Entrada de datos básica
- `gerente_compras` - Gestión de inventario
- `contador` - Reportes financieros

**Permisos:**
- `pacientes_view`, `pacientes_create`, `pacientes_edit`, `pacientes_delete`
- `historia_view`, `historia_create`, `historia_edit`
- `medicinas_view`, `medicinas_edit`, `medicinas_delete`
- `compras_view`, `compras_create`, `compras_edit`
- `ventas_view`, `ventas_create`
- `caja_view`, `caja_edit`
- `reportes_view`, `reportes_export`
- `admin_users`, `admin_config`, `audit_view`

## ▶️ Ejecución

### Desarrollo

```bash
npm run dev
```

Requiere `nodemon` instalado globalmente o localmente.

### Producción

```bash
npm start
```

### Health Check

```bash
curl http://localhost:3000/health
```

## 📊 Base de Datos

### Crear tablas

```bash
psql -U postgres -d zentra -f ../database/schema.sql
```

### Roles iniciales

La BD se crea con 6 roles predefinidos y 21 permisos granulares.

## 🔍 Logging y Auditoría

Todas las operaciones CREATE, UPDATE, DELETE se registran automáticamente en la tabla `audit_log` con:
- Usuario responsable
- Tabla afectada
- Datos antes/después
- IP y User-Agent
- Timestamp

## 🐛 Troubleshooting

### Error: "Error conectando a la DB"

Verificar:
1. PostgreSQL está corriendo
2. Credenciales en `.env` son correctas
3. Base de datos `zentra` existe

### Error: "Token inválido"

- Verificar que el JWT_SECRET en `.env` sea el mismo usado al generar el token
- Revisar que el token no haya expirado

### Error: "Permiso denegado"

- Verificar que el usuario tiene el rol y permiso requerido
- Usar endpoint `/api/auth/profile` para ver permisos actuales

## 📝 Notas

- Todas las contraseñas se hashean con bcrypt (10 rounds)
- Los tokens JWT expiran en 7 días (configurable)
- Los usuarios inactivos no pueden acceder
- El último login se registra automáticamente
- Se usa soft-delete (activo=false) para pacientes

## 📦 Dependencias

- **express** - Framework web
- **pg** - Cliente PostgreSQL
- **bcryptjs** - Hashing de contraseñas
- **jsonwebtoken** - JWT tokens
- **cors** - Manejo CORS
- **helmet** - Seguridad HTTP
- **morgan** - Logging HTTP
- **dotenv** - Variables de entorno

## 📄 Licencia

ISC
