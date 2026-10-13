# Módulo de Facturación Mejorada - Integración

## Descripción General

Se ha creado un nuevo módulo de facturación robusto integrado con el saldo de paciente que incluye:

- ✅ **Descuentos avanzados** (porcentaje o cantidad fija)
- ✅ **Integración automática con saldo de paciente**
- ✅ **Impresión de recibos profesionales**
- ✅ **Estados de cuenta detallados**
- ✅ **Registro de movimientos y pagos**
- ✅ **Historial completo de transacciones**

---

## Archivos Creados

### Frontend (JavaScript)

1. **`js/facturacion-mejorada.js`**
   - Módulo principal `FacturacionMejorada`
   - Gestión de facturas, items y descuentos
   - Cálculos automáticos
   - Impresión de recibos

2. **`js/saldo-paciente-integrado.js`**
   - Módulo `SaldoPacienteIntegrado`
   - Visualización de saldos
   - Registro de pagos
   - Generación de estados de cuenta

### Frontend (HTML)

3. **`facturacion-mejorada.html`**
   - Interfaz completa de facturación
   - Modal de descuentos
   - Tabla responsive de items
   - Resumen de totales

### Backend (Node.js)

4. **`backend/src/controllers/billingMejoradoController.js`**
   - `createFacturaMejorada()` - Crear factura con integración
   - `getEstadoCuenta()` - Estado de cuenta detallado
   - `getSaldoPaciente()` - Obtener saldo actual
   - `registrarPago()` - Registrar pago/abono
   - `listFacturas()` - Listar facturas

5. **`backend/src/routes/billing-mejorada.js`**
   - POST `/api/billing/facturas-mejorada` - Crear factura
   - GET `/api/billing/facturas` - Listar facturas
   - GET `/api/billing/estado-cuenta/:paciente_id` - Estado de cuenta
   - GET `/api/saldo-paciente/:paciente_id` - Obtener saldo
   - POST `/api/billing/pagos` - Registrar pago

### Base de Datos

6. **`database/facturacion-mejorada-migration.sql`**
   - Tablas: `pacientes_saldo`, `ventas_mejorada`, `venta_items_mejorada`
   - Tablas: `venta_descuentos_mejorada`, `movimientos_paciente`, `pagos_paciente`
   - Vistas y índices para rendimiento

---

## Pasos de Integración Local

### 1. **Copiar archivos frontend**
```bash
# Los archivos JS ya están en lugar:
# - js/facturacion-mejorada.js
# - js/saldo-paciente-integrado.js

# El HTML está en:
# - facturacion-mejorada.html
```

### 2. **Actualizar el server.js del backend**
Agregar en `backend/server.js`:

```javascript
// Importar rutas de facturación mejorada
const billingMejoradaRoutes = require('./src/routes/billing-mejorada');

// Registrar rutas
app.use('/api/billing', billingMejoradaRoutes);
app.use('/api/saldo-paciente', billingMejoradaRoutes);
```

### 3. **Ejecutar migración SQL en base de datos local**
```bash
# Si usas MySQL/MariaDB:
mysql -u usuario -p nombre_base_datos < database/facturacion-mejorada-migration.sql

# Si usas PostgreSQL:
psql -U usuario -d nombre_base_datos -f database/facturacion-mejorada-migration.sql
```

### 4. **Verificar las rutas en backend**
Las rutas están en `backend/src/routes/billing-mejorada.js`:
- POST `/api/billing/facturas-mejorada`
- GET `/api/billing/facturas`
- GET `/api/billing/estado-cuenta/:paciente_id`
- GET `/api/saldo-paciente/:paciente_id`
- POST `/api/billing/pagos`

### 5. **Probar localmente**
- Acceder a: `file:///Users/diego/SistemaContable/facturacion-mejorada.html`
- O si tienes servidor web: `http://localhost:puerto/facturacion-mejorada.html`

---

## Flujo de Funcionamiento

### Crear Factura:
1. Usuario busca y selecciona paciente
2. Agrega items (descripción, cantidad, precio)
3. Puede agregar descuentos (porcentaje o cantidad fija)
4. Sistema calcula totales automáticamente:
   - Subtotal
   - Total descuentos
   - Base imponible
   - IVA 12%
   - Total neto
5. Al guardar:
   - Se crea la factura
   - Se actualizan los items y descuentos
   - **Se actualiza automáticamente el saldo del paciente**
   - Se registra movimiento en historial
   - Se genera recibo imprimible

### Realizar Pago:
1. Usuario accede a "Saldo de Paciente"
2. Busca el paciente deudor
3. Hace clic en "Pago"
4. Ingresa monto, método de pago y referencia
5. Sistema:
   - Descuenta del saldo pendiente
   - Registra el movimiento
   - Actualiza historial

### Generar Estado de Cuenta:
1. Usuario selecciona paciente
2. Sistema extrae:
   - Datos del paciente
   - Todas las facturas
   - Todos los pagos/movimientos
   - Saldo acumulado
3. Genera PDF profesional para imprimir

---

## Estructura de Datos

### Factura
```javascript
{
  numero_factura: "FAC-2026-000001",
  paciente_id: "PAC-001",
  items: [
    {
      descripcion: "Consulta General",
      cantidad: 1,
      precio_unitario: 150.00,
      subtotal: 150.00,
      descuentos: [],
      descuento_total: 0,
      total_item: 150.00
    }
  ],
  descuentos: [
    {
      tipo: "porcentaje",
      valor: 10,
      motivo: "Promoción"
    }
  ],
  totales: {
    subtotal: 150.00,
    total_descuentos: 15.00,
    base_impuesto: 135.00,
    total_impuestos: 16.20,
    total_neto: 151.20
  }
}
```

### Saldo de Paciente
```javascript
{
  paciente_id: "PAC-001",
  saldo_pendiente: 151.20,
  total_deuda: 151.20,
  ultima_transaccion: "2026-06-26"
}
```

---

## Descuentos Soportados

### 1. Porcentaje (%)
- Ejemplo: 10% de descuento
- Cálculo: `subtotal * (10/100)`
- Validación: 0-100%

### 2. Cantidad Fija (Q)
- Ejemplo: Q50.00 de descuento
- No puede superar el subtotal
- Se limita automáticamente

### Niveles de Descuento:
- **A nivel de item**: Descuentos individuales por línea
- **A nivel de factura**: Descuentos generales que aplican a toda la factura

---

## Reportes Disponibles

### 1. Recibo (al guardar factura)
- Datos del paciente
- Detalle de items con precios
- Desglose de descuentos
- Cálculo de IVA
- Total a pagar

### 2. Estado de Cuenta
- Información completa del paciente
- Historial de movimientos (cargos y abonos)
- Saldo acumulado por fecha
- Total de cargos/abonos
- Saldo actual

---

## Validaciones Implementadas

✅ Paciente seleccionado antes de crear factura
✅ Al menos un item en la factura
✅ Cantidades y precios positivos
✅ Descuentos válidos (porcentaje 0-100, cantidad no negativa)
✅ Descuentos no pueden exceder subtotal
✅ Monto de pago no puede superar saldo pendiente
✅ Todas las operaciones en transacciones (rollback si falla)

---

## Errores Comunes y Soluciones

### Error: "Paciente no encontrado"
- Asegurar que existe el paciente en tabla `pacientes`
- Verificar que el `paciente_id` es correcto

### Error: "No hay saldo registrado para este paciente"
- La tabla `pacientes_saldo` debe tener un registro para cada paciente
- Ejecutar: `INSERT INTO pacientes_saldo (id, paciente_id, saldo_pendiente, total_deuda) VALUES (...)`

### Error: "CORS - Request blocked"
- Las peticiones vienen de archivo local (file://)
- Usar servidor web local o servir desde el backend

### Error: "Bearer token"
- Asegurar que está presente en localStorage: `localStorage.getItem('token')`
- Verificar que el token es válido

---

## Próximas Mejoras (Opcional)

- [ ] Impuestos variables por región
- [ ] Descuentos por código promocional
- [ ] Automatización de cobros
- [ ] Notificaciones de pago
- [ ] Reportes comparativos
- [ ] Auditoría de cambios
- [ ] Firma digital
- [ ] Envío por email

---

## Contacto para Errores

Los cambios son **100% locales**. Si encuentras errores en el servidor remoto:
1. Revisar logs del servidor
2. Verificar base de datos remota
3. Compartir screenshot del error
4. Enviar logs exactos para diagnóstico

---

**Última actualización:** 26 de Junio, 2026
