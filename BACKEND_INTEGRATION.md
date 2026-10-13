# 📋 INTEGRACIÓN BACKEND-FRONTEND

## RESUMEN RÁPIDO

El backend Node.js está listo. Aquí está lo que se creó y cómo conectarlo con el frontend.

## ✅ QUÉ SE CREÓ

### Backend Node.js + Express

```
backend/
├── 📄 server.js                    # Servidor principal
├── 📄 package.json                 # Dependencias Node.js
├── 📄 .env.example                 # Variables de entorno
├── 📄 README.md                    # Documentación completa
├── 📄 SETUP.md                     # Guía de instalación
├── 📄 API_CLIENT_EJEMPLO.js        # Cliente JS para consumir API
│
└── src/
    ├── controllers/
    │   ├── 📄 authController.js    # Login, registro, perfil
    │   └── 📄 pacientesController.js # CRUD pacientes
    ├── routes/
    │   ├── 📄 auth.js              # Rutas /api/auth/*
    │   └── 📄 pacientes.js         # Rutas /api/pacientes/*
    ├── middleware/
    │   ├── 📄 auth.js              # JWT + Permisos
    │   └── 📄 audit.js             # Auditoría automática
    └── db/
        └── 📄 connection.js         # Pool de PostgreSQL
```

## 🔌 ENDPOINTS DISPONIBLES

### Autenticación (Público)

```
POST   /api/auth/register          → Registrar usuario
POST   /api/auth/login             → Autenticarse (obtiene JWT)
POST   /api/auth/logout            → Logout (requiere JWT)
GET    /api/auth/profile           → Perfil usuario actual (requiere JWT)
```

### Pacientes (Requiere JWT + Permisos)

```
GET    /api/pacientes              → Listar todos
GET    /api/pacientes/:id          → Obtener uno
POST   /api/pacientes              → Crear
PUT    /api/pacientes/:id          → Actualizar
DELETE /api/pacientes/:id          → Eliminar (soft)
```

## 🛠️ CÓMO INSTALAR Y EJECUTAR

### 1. Instalar Node.js

**macOS:**
```bash
brew install node
```

**O descargar:** https://nodejs.org/ (versión LTS)

### 2. Instalar dependencias

```bash
cd /Users/diego/SistemaContable/backend
npm install
```

### 3. Configurar base de datos

- Instalar PostgreSQL: `brew install postgresql@15`
- Crear BD: `psql -U postgres`
  ```sql
  CREATE DATABASE zentra;
  \c zentra
  \i /Users/diego/SistemaContable/database/schema.sql
  ```

### 4. Crear archivo .env

```bash
cp .env.example .env
```

Editar `.env`:
```
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=tu_contraseña_aqui
DB_NAME=zentra
JWT_SECRET=tu_secreto_jwt_super_seguro_minimo_32_caracteres
PORT=3000
```

### 5. Iniciar servidor

```bash
npm run dev
```

Deberías ver:
```
╔════════════════════════════════════════╗
║     🏥 ZENTRA API BACKEND 🏥      ║
╚════════════════════════════════════════╝

✅ Servidor ejecutándose en puerto 3000
```

## 🔗 CONECTAR FRONTEND CON BACKEND

### Opción 1: Usar el cliente API proporcionado

El archivo `API_CLIENT_EJEMPLO.js` en `backend/` tiene clase `ZentraAPI` lista para usar.

**Copiar a tu proyecto:**
```bash
cp backend/API_CLIENT_EJEMPLO.js js/api-client.js
```

**En tu HTML, cargar antes que otros scripts:**
```html
<script src="js/api-client.js"></script>
```

**Usar en tu código JavaScript:**
```javascript
// Crear instancia
const api = new ZentraAPI('http://localhost:3000/api');

// Login
await api.login('doctor@zentra.com', 'password123');

// Obtener pacientes
const data = await api.getPacientes();
console.log(data.pacientes);

// Crear paciente
await api.createPaciente({
  cedula: '123456',
  nombre: 'Juan',
  apellido: 'Pérez'
});
```

### Opción 2: Fetch directo

```javascript
// Login
const response = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'doctor@zentra.com',
    password: 'password123'
  })
});

const data = await response.json();
const token = data.token;

// Guardar token
localStorage.setItem('zentra_token', token);

// Usar en siguiente petición
const pResponse = await fetch('http://localhost:3000/api/pacientes', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

## 📱 ESTRUCTURA DE RESPUESTAS

### Respuesta exitosa

```json
{
  "message": "Éxito",
  "data": { ... },
  "user": { ... },
  "pacientes": [ ... ]
}
```

### Respuesta con error

```json
{
  "error": "Descripción del error",
  "required": ["permiso_necesario"]
}
```

## 🔐 SISTEMA DE AUTENTICACIÓN

### Flujo completo

1. **Usuario se registra o login**
   ```javascript
   const result = await api.login(email, password);
   // result.token → guardar en localStorage
   ```

2. **Token se guarda automáticamente**
   ```javascript
   // ZentraAPI lo guarda automáticamente en localStorage
   // Clave: 'zentra_token'
   ```

3. **Peticiones futuras llevan token**
   ```javascript
   // Automático en API_CLIENT_EJEMPLO.js
   // Header: Authorization: Bearer <token>
   ```

4. **Si token expira, se limpia automáticamente**
   ```javascript
   // Error 401 → auto logout → redirigir a login
   ```

## 👥 ROLES Y PERMISOS

### Roles predefinidos

| Rol | Descripción | Uso |
|-----|------------|-----|
| `admin` | Acceso total | IT/Administrador |
| `doctor` | Pacientes + Clínica | Médicos |
| `enfermera` | Monitoreo de pacientes | Personal de enfermería |
| `recepcionista` | Entrada de datos básica | Recepción |
| `gerente_compras` | Inventario de medicinas | Compras |
| `contador` | Reportes financieros | Contabilidad |

### Permisos granulares

```javascript
// Ejemplo: Usuario necesita permiso específico
// El middleware lo verifica automáticamente

// Si usuario NO tiene permiso:
// Response 403: "Permiso denegado"
```

## 📊 AUDITORÍA AUTOMÁTICA

Todas las operaciones CREATE, UPDATE, DELETE se registran en `audit_log` con:
- ✅ Usuario responsable
- ✅ Tabla afectada
- ✅ Datos antes/después (JSONB)
- ✅ IP y User-Agent
- ✅ Timestamp exacto

```sql
SELECT * FROM audit_log WHERE user_id = 1 ORDER BY timestamp DESC;
```

## 🚀 PRÓXIMOS PASOS

### Fase 1: ✅ COMPLETADA
- Backend Node.js
- Autenticación JWT
- CRUD Pacientes
- Auditoría

### Fase 2: Por hacer
- [ ] Instalar Node.js en tu máquina
- [ ] Configurar PostgreSQL
- [ ] Ejecutar `npm install` en backend/
- [ ] Probar endpoints con Postman o curl
- [ ] Conectar frontend con API_CLIENT

### Fase 3: Expansión
- [ ] Más endpoints (compras, ventas, caja, reportes)
- [ ] UI de login en frontend
- [ ] Reemplazar localStorage del frontend con llamadas API
- [ ] Módulo de hospitalización

## 🧪 PRUEBAS RÁPIDAS

### Con curl

```bash
# Health check
curl http://localhost:3000/health

# Registrar usuario
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@zentra.com","password":"pass123","nombre":"Test","apellido":"User"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@zentra.com","password":"pass123"}'

# Obtener pacientes (reemplaza TOKEN)
curl http://localhost:3000/api/pacientes \
  -H "Authorization: Bearer TOKEN"
```

### Con Postman

Importar esta colección (próximamente disponible en `backend/postman-collection.json`)

## 📧 VARIABLES DE ENTORNO

```env
# .env (no compartir con git)
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=tu_password_seguro
DB_NAME=zentra

PORT=3000
NODE_ENV=development

JWT_SECRET=tu_jwt_secreto_muy_largo_minimo_32_caracteres
JWT_EXPIRATION=7d

CORS_ORIGIN=http://localhost:5500,http://localhost:3000,file://
```

## ⚠️ SEGURIDAD

- ✅ Contraseñas hasheadas con bcrypt
- ✅ JWT tokens con expiración
- ✅ CORS configurado
- ✅ Helmet para headers HTTP seguros
- ✅ Auditoría de todas las operaciones
- ⚠️ JWT_SECRET debe ser FUERTE y SECRETO
- ⚠️ NO compartir .env por git
- ⚠️ En producción, usar HTTPS

## 📞 SOPORTE

Ver documentos:
- `backend/README.md` - Documentación completa
- `backend/SETUP.md` - Guía de instalación paso a paso
- `backend/API_CLIENT_EJEMPLO.js` - Ejemplos de código
