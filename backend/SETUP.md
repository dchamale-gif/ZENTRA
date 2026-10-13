# 🚀 SETUP RÁPIDO - BACKEND NODE.JS

## PASO 1: Instalar Node.js

### macOS (recomendado: Homebrew)

```bash
# Instalar Homebrew si no lo tienes
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Instalar Node.js (incluye npm)
brew install node

# Verificar instalación
node --version
npm --version
```

### O descarga desde: https://nodejs.org/ (versión LTS recomendada)

---

## PASO 2: Instalar dependencias Node.js

```bash
cd /Users/diego/SistemaContable/backend
npm install
```

---

## PASO 3: Crear base de datos PostgreSQL

### Instalar PostgreSQL (si no lo tienes)

```bash
# macOS con Homebrew
brew install postgresql@15

# Iniciar PostgreSQL
brew services start postgresql@15

# Verificar conexión
psql --version
```

### Crear base de datos

```bash
# Conectarse a PostgreSQL
psql -U postgres

# En la consola psql, ejecutar:
CREATE DATABASE zentra;
\c zentra
\i /Users/diego/SistemaContable/database/schema.sql
```

---

## PASO 4: Configurar variables de entorno

```bash
cd /Users/diego/SistemaContable/backend

# Crear archivo .env desde el ejemplo
cp .env.example .env

# Editar .env con tus valores
nano .env
```

**Importante:** 
- Cambiar `DB_PASSWORD` con tu contraseña de PostgreSQL
- Generar un JWT_SECRET fuerte (mínimo 32 caracteres)
- Cambiar `JWT_SECRET` a algo seguro

Ejemplo de JWT_SECRET seguro:
```
JWT_SECRET=mi_secreto_super_seguro_12345678901234567890abcdefgh
```

---

## PASO 5: Verificar conexión a BD

```bash
cd backend
node -e "
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});
pool.query('SELECT NOW()', (err, res) => {
  if (err) console.error('❌ Error:', err.message);
  else console.log('✅ Conexión OK:', res.rows[0]);
  process.exit();
});
"
```

---

## PASO 6: Iniciar el servidor

### Desarrollo (con auto-reload)

```bash
cd /Users/diego/SistemaContable/backend
npm run dev
```

Deberías ver:
```
╔════════════════════════════════════════╗
║     🏥 ZENTRA API BACKEND 🏥      ║
╚════════════════════════════════════════╝

✅ Servidor ejecutándose en puerto 3000
```

### Prueba rápida

```bash
curl http://localhost:3000/health
```

Respuesta esperada:
```json
{
  "status": "OK",
  "timestamp": "2026-05-27T20:35:00.000Z",
  "environment": "development"
}
```

---

## PRIMER USUARIO DE PRUEBA

### 1. Registrar usuario

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "doctor@zentra.com",
    "password": "password123",
    "nombre": "Juan",
    "apellido": "Pérez",
    "telefono": "3001234567"
  }'
```

### 2. Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "doctor@zentra.com",
    "password": "password123"
  }'
```

Copiar el `token` de la respuesta.

### 3. Usar token para protegidas

```bash
curl http://localhost:3000/api/auth/profile \
  -H "Authorization: Bearer <TU_TOKEN_AQUI>"
```

---

## ESTRUCTURA DE CARPETAS CREADAS

```
backend/
├── src/
│   ├── controllers/
│   │   ├── authController.js       # Registro, login, perfil
│   │   └── pacientesController.js  # CRUD pacientes
│   ├── routes/
│   │   ├── auth.js                 # Rutas /api/auth
│   │   └── pacientes.js            # Rutas /api/pacientes
│   ├── middleware/
│   │   ├── auth.js                 # JWT + Permisos
│   │   └── audit.js                # Auditoría automática
│   └── db/
│       └── connection.js           # Pool PostgreSQL
├── server.js                        # Entrada principal
├── package.json
├── .env.example
└── .gitignore
```

---

## PRÓXIMOS PASOS

1. ✅ Backend básico listo
2. ⏭️ Crear más endpoints (compras, ventas, caja, reportes)
3. ⏭️ Conectar frontend con API
4. ⏭️ UI de login en el frontend
5. ⏭️ Módulo de hospitalización

---

## TROUBLESHOOTING

### "npm: command not found"
→ Instalar Node.js desde nodejs.org

### "Error: connect ECONNREFUSED 127.0.0.1:5432"
→ PostgreSQL no está corriendo. Ejecutar: `brew services start postgresql@15`

### "FATAL: password authentication failed"
→ Verificar DB_PASSWORD en .env

### "EADDRINUSE: address already in use :::3000"
→ Puerto 3000 en uso. Cambiar PORT en .env o matar proceso: `lsof -i :3000`

---

## RECURSOS

- Node.js: https://nodejs.org/
- Express: https://expressjs.com/
- PostgreSQL: https://www.postgresql.org/
- JWT: https://jwt.io/
- Documentación completa en: `README.md`
