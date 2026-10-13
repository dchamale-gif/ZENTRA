# 📋 ESTADO DE CUENTA - GUÍA DE INSTALACIÓN

## 🎯 Objetivo
Implementar un módulo completo de "Estado de Cuenta" que permite ver e imprimir estados de cuenta detallados por categoría de servicios (internamiento, medicamentos, insumos, equipo médico, exámenes, honorarios, extras).

---

## 📊 ARCHIVOS QUE CAMBIARON

### Frontend
- ✅ `facturacion-mejorada.html` - Sección de botones agregada
- ✅ `js/facturacion-mejorada.js` - Métodos para generar PDF
- ✅ `index.html` - Se agregó script `saldo-paciente.js`

### Backend
- ✅ `backend/src/controllers/billingMejoradoController.js` - Método `getEstadoCuentaDetallado()`
- ✅ `backend/src/routes/billing-mejorada.js` - Ruta `/api/billing/estado-cuenta-detallado/:paciente_id`

### Base de Datos
- ✅ `database/estado-de-cuenta-migration.sql` - **NUEVO: Script de migración**

---

## 🚀 PASOS DE INSTALACIÓN

### Paso 1: Ejecutar Migraciones de Base de Datos

**IMPORTANTE:** Ejecuta estos scripts EN ORDEN:

#### 1.1 Verificar configuración (opcional pero recomendado)
```bash
cd database
python3 verify-pre-migration.py
```

#### 1.2 Ejecutar migración de estado de cuenta
```bash
# Opción 1: Con psql directo
psql -U postgres -d zentra -f database/estado-de-cuenta-migration.sql

# Opción 2: Con Python (si tienes migrate.py configurado)
python3 database/migrate.py
```

#### 1.3 Cargar datos de ejemplo (opcional)
```bash
psql -U postgres -d zentra -f database/facturacion-datos-ejemplo.sql
```

### Paso 2: Reiniciar el Backend
```bash
cd backend
npm start
# O si usas PM2
pm2 restart "Zentra Backend"
```

### Paso 3: Recargar el Frontend
```
1. Recarga el navegador (Cmd+R o Ctrl+F5)
2. Limpia caché: Cmd+Shift+Delete (Chrome)
```

---

## ✅ VERIFICACIÓN DE INSTALACIÓN

### ✓ Verificar que todo funciona

1. **Login en la aplicación**
   - Usuario: admin@gmail.com
   - Contraseña: admin

2. **Navega a Facturación Mejorada**
   - Menú izquierdo → Módulo Contable → (necesitas encontrar el link)

3. **Selecciona un paciente**
   - Deberás ver una nueva sección: "Estado de Cuenta del Paciente"

4. **Haz clic en "Imprimir Estado de Cuenta"**
   - Se abrirá una ventana nueva con el estado de cuenta en PDF
   - Deberás ver un documento profesional con:
     - Información del paciente (nombre, edad, DPI, teléfono)
     - Secciones por categoría (Internamiento, Medicamentos, etc.)
     - Tabla con: Producto, Presentación, Cantidad, Precio, Descuento, Total
     - Resumen financiero (Subtotal, IVA, Total)
     - Saldo pendiente

---

## 🗂️ ESTRUCTURA DE DATOS

### Tabla: `pacientes_saldo`
```sql
- id (PK)
- paciente_id (FK a pacientes)
- saldo_pendiente (Dinero que debe el paciente)
- total_deuda (Total acumulado)
- ultima_transaccion (Timestamp)
- usuario_actualizo
- created_at, updated_at
```

### Tabla: `venta_items` (modificada)
```sql
-- Campos nuevos agregados:
- tipo_item VARCHAR(50) -- Categoría: internamiento, medicamentos, insumos, equipo_medico, examenes, honorarios, extras, general
```

### Tabla: `ventas` (modificada)
```sql
-- Campos nuevos agregados:
- total_descuentos
- base_impuesto
- total_impuestos
- tipo_factura
```

---

## 📱 CÓMO USAR EL ESTADO DE CUENTA

### Vista Rápida
1. Ve a Facturación Mejorada
2. Selecciona un paciente
3. Haz clic en "📄 Ver Estado de Cuenta"
4. Se mostrará un resumen con saldos

### Impresión
1. Ve a Facturación Mejorada
2. Selecciona un paciente
3. Haz clic en "🖨️ Imprimir Estado de Cuenta"
4. Se abrirá una ventana nueva con formato de PDF profesional
5. Usa Cmd+P (Mac) o Ctrl+P (Windows) para imprimir a PDF
6. Guarda el archivo o imprime directamente

---

## 🔧 TROUBLESHOOTING

### Problema: "SaldoPacienteModule is not defined"
**Solución:** Ya está arreglado. Se agregó `saldo-paciente.js` a index.html

### Problema: Error 500 en API de pacientes
**Solución:** Ejecuta las migraciones en el siguiente orden:
1. `migration-login-setup.sql`
2. `estado-de-cuenta-migration.sql`
3. `facturacion-datos-ejemplo.sql`

### Problema: No veo el estado de cuenta
**Causa 1:** No seleccionaste un paciente
- Solución: Usa la búsqueda en Facturación Mejorada para seleccionar un paciente

**Causa 2:** Las tablas no tienen datos
- Solución: Ejecuta `facturacion-datos-ejemplo.sql` para cargar datos de prueba

### Problema: El PDF no se abre o está vacío
**Solución:**
1. Verifica que el paciente tenga facturas en la BD
2. Abre la consola del navegador (F12) y busca errores
3. Revisa que el token JWT sea válido
4. Limpia caché del navegador

---

## 📝 SCRIPTS DE BD EN ORDEN

```bash
# 1. Setup inicial (si es la primera vez)
psql -U postgres -d zentra -f database/schema.sql

# 2. Migración de Login/Registro
psql -U postgres -d zentra -f database/migration-login-setup.sql

# 3. Migración de Estado de Cuenta ⭐ NUEVO
psql -U postgres -d zentra -f database/estado-de-cuenta-migration.sql

# 4. Datos de ejemplo (opcional pero recomendado para pruebas)
psql -U postgres -d zentra -f database/facturacion-datos-ejemplo.sql

# 5. [OPCIONAL] Si usas la extensión de facturación mejorada
psql -U postgres -d zentra -f database/facturacion-mejorada-migration.sql
```

---

## 🎨 FORMATO DEL ESTADO DE CUENTA

El estado de cuenta incluye:

### Encabezado
- Logo de la clínica
- "ESTADO DE CUENTA"
- Información de la clínica

### Información del Paciente (2 columnas)
- Paciente: [Nombre Completo]
- Edad: [Edad calculada]
- DPI: [DPI]
- Teléfono: [Teléfono]
- Fecha de Emisión: [Hoy]

### Secciones por Categoría
Para cada categoría con items:
- **Encabezado de categoría** (Ej: INTERNAMIENTO)
- **Tabla** con columnas:
  - Producto
  - Presentación
  - Cantidad
  - Precio Unitario
  - Descuento
  - Precio c/Desc
  - Total
- **Subtotal de categoría**

### Resumen Financiero
- Subtotal General
- (-) Descuentos
- Base Imponible
- (+) IVA (12%)
- **TOTAL FACTURADO**

### Saldo del Paciente
- Saldo a Favor: [Monto] (si aplica)
- Saldo Pendiente: [Monto]

### Pie de Página
- Clínica: Psiquiatría Santa Clara
- PBX: (502) 2334-4545
- Web: www.psiquiatriasantaclara.com

---

## 📞 SOPORTE

Si algo no funciona:
1. Verifica que ejecutaste todas las migraciones
2. Recarga la página (Cmd+Shift+R)
3. Abre la consola (F12) y busca errores rojos
4. Revisa los logs del servidor: `pm2 logs`

---

**Última actualización:** 2026-07-01
**Estado:** ✅ Listo para usar
