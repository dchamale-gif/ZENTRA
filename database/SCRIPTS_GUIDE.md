# 📁 SCRIPTS DE MIGRACIÓN - GUÍA RÁPIDA

Aquí encontrarás todos los scripts para actualizar tu base de datos y habilitar Login/Registro.

---

## 🚀 INICIO RÁPIDO (3 pasos)

### Paso 1: Verificar configuración
```bash
cd database
python3 verify-pre-migration.py
```

Este script verifica que todo esté bien antes de hacer cambios:
- ✅ PostgreSQL está instalado y corriendo
- ✅ Variables de ambiente configuradas
- ✅ Base de datos existe
- ✅ Tablas principales existen

### Paso 2: Ejecutar migración
```bash
python3 migrate.py
```

O si prefieres bash:
```bash
bash setup-login.sh
```

O SQL directo:
```bash
psql -U postgres -d zentra -f migration-login-setup.sql
```

### Paso 3: Iniciar sistema
```bash
# Terminal 1: Backend
cd backend && npm start

# Terminal 2: Frontend
# En VS Code: click derecho en index.html > Open with Live Server
# O: python3 -m http.server 5500
```

---

## 📋 DESCRIPCIÓN DE ARCHIVOS

### 1. `verify-pre-migration.py` 🔍
**Verificador de pre-migración (EJECUTAR PRIMERO)**

```bash
python3 database/verify-pre-migration.py
```

Verifica:
- PostgreSQL instalado y corriendo
- Archivo .env configurado
- Variables de ambiente
- Base de datos existe
- Tablas principales existen
- Scripts de migración disponibles

**Estado:** ✅ Seguro, no hace cambios

---

### 2. `migration-login-setup.sql` 📊
**Script SQL con todos los cambios**

```bash
psql -U postgres -d zentra -f database/migration-login-setup.sql
```

Hace:
- ✅ Agrega columnas a tabla `users`
- ✅ Crea tabla `login_attempts`
- ✅ Crea tabla `password_reset_tokens`
- ✅ Crea tabla `user_sessions`
- ✅ Crea índices
- ✅ Inserta roles iniciales
- ✅ Inserta permisos
- ✅ Crea usuario admin

**Uso:** Directo si prefieres SQL puro

---

### 3. `migrate.py` 🐍
**Script Python interactivo (RECOMENDADO)**

```bash
python3 database/migrate.py
```

Características:
- Interfaz amigable con colores
- Pide confirmación antes de hacer cambios
- Verifica éxito de migración
- Muestra estadísticas
- Mejor para Windows y macOS

**Estado:** ✅ Seguro y fácil

---

### 4. `setup-login.sh` 🔧
**Script Bash automático**

```bash
bash database/setup-login.sh
```

Características:
- Verifica PostgreSQL
- Carga variables de .env
- Ejecuta migración
- Muestra resumen

**Estado:** ✅ Para Linux/macOS

---

### 5. `rollback-login-setup.sql` ↩️
**Revertir cambios de migración**

```bash
psql -U postgres -d zentra -f database/rollback-login-setup.sql
```

Elimina:
- Tabla `login_attempts`
- Tabla `password_reset_tokens`
- Tabla `user_sessions`
- Índices nuevos

⚠️ **No elimina datos de tablas existentes**

---

### 6. `MIGRATION_README.md` 📖
**Documentación completa de migración**

Contiene:
- Descripción detallada de cambios
- Pre-requisitos
- Verificación paso a paso
- Troubleshooting
- Rollback si es necesario

---

## 🎯 FLUJO RECOMENDADO

```
1. verify-pre-migration.py
   ↓ (Si todo OK)
2. migrate.py  (o setup-login.sh)
   ↓ (Si éxito)
3. Iniciar backend: npm start
   ↓
4. Abrir login: http://localhost:5500/login.html
   ↓
5. Login: admin@zentra.com / admin123
```

---

## 🛠️ OPCIONES DE MIGRACIÓN

| Opción | Comando | Ventajas | Desventajas |
|--------|---------|----------|-------------|
| **Python** | `python3 migrate.py` | Interactivo, verificación, colores | Requiere Python 3 |
| **Bash** | `bash setup-login.sh` | Simple, automático | Solo para Linux/macOS |
| **SQL directo** | `psql -f migration...sql` | Rápido, directo | Menos feedback |
| **Python verificador** | `python3 verify...py` | Valida antes | Informativo solo |

**Recomendación:** Python (más seguro y amigable)

---

## ⚡ COMANDOS RÁPIDOS

### Ver estadísticas después de migración
```bash
psql -U postgres -d zentra -c "
SELECT 
    'Usuarios: ' || count(*) FROM users
UNION ALL
SELECT 'Roles: ' || count(*) FROM roles
UNION ALL
SELECT 'Permisos: ' || count(*) FROM permissions;
"
```

### Verificar usuario admin
```bash
psql -U postgres -d zentra -c "
SELECT email, nombre, activo FROM users WHERE email = 'admin@zentra.com';
"
```

### Ver intentos de login
```bash
psql -U postgres -d zentra -c "
SELECT * FROM login_attempts ORDER BY timestamp DESC LIMIT 10;
"
```

### Revertir cambios (si algo salió mal)
```bash
psql -U postgres -d zentra -f database/rollback-login-setup.sql
```

---

## 🔐 CREDENCIALES POR DEFECTO

```
Email:      admin@zentra.com
Contraseña: admin123
Rol:        admin (acceso total)
```

⚠️ **CAMBIA la contraseña después del primer login**

---

## 📋 CHECKLIST

- [ ] PostgreSQL instalado y corriendo
- [ ] Base de datos `zentra` existe
- [ ] Schema original cargado (schema.sql)
- [ ] Archivo `backend/.env` configurado
- [ ] Ejecuté `verify-pre-migration.py` (OK)
- [ ] Ejecuté `migrate.py` (OK)
- [ ] Inicié backend: `npm start`
- [ ] Probé login: admin@zentra.com / admin123
- [ ] Cambié contraseña de admin

---

## ⭐ NUEVO: Estado de Cuenta - Facturación Mejorada

### 7. `estado-de-cuenta-migration.sql` 📈
**Script para agregar Estado de Cuenta (NUEVO - 2026-07-01)**

```bash
psql -U postgres -d zentra -f database/estado-de-cuenta-migration.sql
```

Hace:
- ✅ Agrega campo `tipo_item` a tabla `venta_items`
- ✅ Agrega campos a tabla `ventas` para facturación mejorada
- ✅ Crea tabla `pacientes_saldo` para gestionar saldos
- ✅ Crea tabla `movimientos_paciente` para historial
- ✅ Crea índices para performance
- ✅ Inicializa datos de saldo para pacientes existentes

**¿Para qué sirve?**
- Ver e imprimir "Estados de Cuenta" detallados por categoría
- Mostrar saldos pendientes del paciente
- Agrupar servicios por tipo: Internamiento, Medicamentos, Insumos, Equipo Médico, Exámenes, Honorarios, Extras

**Interfaz:**
- Facturación Mejorada → Seleccionar paciente → "Estado de Cuenta del Paciente"
- Botones: "📄 Ver Estado de Cuenta" y "🖨️ Imprimir Estado de Cuenta"

**Estado:** ✅ Nuevo, incluido en esta versión

---

## 📊 ORDEN DE EJECUCIÓN RECOMENDADO

Para una instalación **limpia** (primera vez):

```bash
# 1. Schema base (si es primera vez)
psql -U postgres -d zentra -f database/schema.sql

# 2. Login y autenticación
psql -U postgres -d zentra -f database/migration-login-setup.sql

# 3. ⭐ NUEVO: Estado de Cuenta (si quieres usar el módulo de facturación)
psql -U postgres -d zentra -f database/estado-de-cuenta-migration.sql

# 4. Datos de ejemplo para pruebas (opcional)
psql -U postgres -d zentra -f database/facturacion-datos-ejemplo.sql
```

Para una actualización en un sistema **existente**:

```bash
# Solo ejecuta esto (agrega nuevas campos sin borrar datos)
psql -U postgres -d zentra -f database/estado-de-cuenta-migration.sql
```

---

## 🐛 TROUBLESHOOTING

### "No such file or directory: migration-login-setup.sql"
```bash
# Asegúrate de estar en la carpeta correcta
cd /Users/diego/SistemaContable/database
python3 migrate.py
```

### "permission denied"
```bash
# Hacer script ejecutable
chmod +x setup-login.sh
bash setup-login.sh
```

### "Database does not exist"
```bash
# Crear BD y cargar schema
createdb zentra
psql -U postgres -d zentra -f schema.sql
```

### Error: "No module named 'psycopg2'"
```bash
# Instalar dependencia Python
pip3 install psycopg2-binary python-dotenv
```

---

## 📞 SOPORTE

Si algo no funciona:

1. Ejecuta `verify-pre-migration.py` - te dirá qué falta
2. Lee `MIGRATION_README.md` - tiene más detalles
3. Revisa los logs del script
4. Si necesitas rollback: `rollback-login-setup.sql`

---

## ✨ Después de la migración

✅ Sistema de Login funcional
✅ Registro de usuarios en BD
✅ Roles y permisos configurados
✅ Auditoría de logins activa
✅ Recuperación de contraseña lista

---

**¡Todo listo para usar!** 🚀

Próximo paso: `python3 database/migrate.py`
