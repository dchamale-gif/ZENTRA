# Módulo de Facturación Robusta

## Descripción

Módulo completo de facturación con soporte para descuentos por porcentaje y cantidad fija. Incluye:

- ✅ Creación de facturas
- ✅ Descuentos a nivel de item
- ✅ Descuentos a nivel de factura
- ✅ Descuentos predefinidos y personalizados
- ✅ Cálculo automático de impuestos (IVA 12%)
- ✅ Gestión de clientes
- ✅ Historial de cambios
- ✅ Códigos promocionales

## Estructura

### Base de Datos

Se han añadido las siguientes tablas:

#### `tipos_descuentos`
Tipos de descuentos disponibles en el sistema.

#### `descuentos`
Configuración predefinida de descuentos:
- **id**: Identificador único
- **nombre**: Nombre del descuento
- **descripcion**: Descripción
- **tipo_descuento**: 'porcentaje' o 'fijo'
- **valor**: Valor del descuento
- **minimo_aplicable**: Monto mínimo para aplicar
- **maximo_uso**: Número máximo de usos
- **codigo_promocion**: Código para aplicar automáticamente
- **activo**: Estado del descuento
- **fecha_inicio/fecha_fin**: Validez temporal

#### `venta_item_descuentos`
Descuentos aplicados a items individuales:
- Vinculado a `venta_items`
- Tipo: porcentaje o fijo
- Monto del descuento calculado

#### `venta_descuentos`
Descuentos a nivel de factura:
- Vinculado a `ventas`
- Puede referenciar un `descuento` predefinido
- Tipo: porcentaje o fijo

#### `configuracion_impuestos`
Configuración de impuestos:
- Nombre del impuesto
- Porcentaje
- Predeterminado

### Backend

#### Controlador: `billingController.js`

**Métodos de Facturas:**
- `createFactura(req, res)` - Crear nueva factura
- `getFactura(req, res)` - Obtener detalles de factura
- `listFacturas(req, res)` - Listar facturas con filtros
- `updateFactura(req, res)` - Actualizar factura
- `deleteFactura(req, res)` - Eliminar factura

**Métodos de Descuentos:**
- `createDescuento(req, res)` - Crear descuento predefinido
- `listDescuentos(req, res)` - Listar descuentos disponibles
- `validarCodigoPromocional(req, res)` - Validar código promocional

**Métodos Auxiliares:**
- `calcularDescuento(monto, tipo, valor)` - Cálculo de descuento
- `calcularTotalesFactura(items, descuentos)` - Cálculo de totales

#### Rutas: `/api/billing`

```
POST   /api/billing/facturas              - Crear factura
GET    /api/billing/facturas              - Listar facturas
GET    /api/billing/facturas/:id          - Obtener factura
PUT    /api/billing/facturas/:id          - Actualizar factura
DELETE /api/billing/facturas/:id          - Eliminar factura

POST   /api/billing/descuentos            - Crear descuento
GET    /api/billing/descuentos            - Listar descuentos
POST   /api/billing/validar-codigo        - Validar código promocional
```

### Frontend

#### Módulo: `facturacion.js`

**Interfaz de Usuario:**
- Modal de nueva factura
- Agregar/eliminar items
- Aplicar descuentos por item
- Aplicar descuentos a factura
- Uso de códigos promocionales
- Vista de totales en tiempo real

## Ejemplos de Uso

### 1. Crear Descuento Predefinido

**Descuento por Porcentaje (10%):**
```bash
curl -X POST http://localhost:3011/api/billing/descuentos \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "nombre": "Descuento por Volumen 10%",
    "descripcion": "Aplicable a compras mayores a Q500",
    "tipo_descuento": "porcentaje",
    "valor": 10,
    "minimo_aplicable": 500,
    "codigo_promocion": "VOLUMEN10"
  }'
```

**Descuento Fijo (Q50):**
```bash
curl -X POST http://localhost:3011/api/billing/descuentos \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "nombre": "Descuento Especial",
    "descripcion": "Descuento fijo de Q50",
    "tipo_descuento": "fijo",
    "valor": 50,
    "minimo_aplicable": 200,
    "fecha_inicio": "2026-06-25",
    "fecha_fin": "2026-12-31"
  }'
```

### 2. Crear Factura con Descuentos

```bash
curl -X POST http://localhost:3011/api/billing/facturas \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "numero_factura": "FAC-2026062501",
    "cliente_id": "PAC-001",
    "items": [
      {
        "descripcion": "Medicamento X",
        "cantidad": 5,
        "precio_unitario": 100,
        "medicina_id": "MED-001",
        "descuentos": [
          {
            "tipo": "porcentaje",
            "valor": 5,
            "motivo": "Descuento por cantidad"
          }
        ]
      },
      {
        "descripcion": "Medicamento Y",
        "cantidad": 2,
        "precio_unitario": 150,
        "articulo_id": "ART-001"
      }
    ],
    "descuentos": [
      {
        "tipo": "fijo",
        "valor": 50,
        "motivo": "Promoción especial"
      }
    ],
    "metodo_pago": "efectivo",
    "observaciones": "Cliente VIP"
  }'
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Factura creada exitosamente",
  "data": {
    "id": "FAC-1234567890",
    "numero_factura": "FAC-2026062501",
    "subtotal": 700,
    "total_descuentos": 85,
    "total_impuestos": 73.8,
    "total": 688.8
  }
}
```

### 3. Validar Código Promocional

```bash
curl -X POST http://localhost:3011/api/billing/validar-codigo \
  -H "Content-Type: application/json" \
  -d '{
    "codigo": "VOLUMEN10",
    "monto_base": 600
  }'
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "descuento_id": "DESC-001",
    "tipo_descuento": "porcentaje",
    "valor": 10,
    "monto_descuento": 60,
    "descripcion": "Descuento por Volumen 10%"
  }
}
```

### 4. Obtener Facturas Filtradas

```bash
curl -X GET "http://localhost:3011/api/billing/facturas?fecha_inicio=2026-06-01&fecha_fin=2026-06-30&limit=20" \
  -H "Authorization: Bearer TOKEN"
```

## Cálculos

### Descuento por Porcentaje
```
Monto Descuento = (Base × Porcentaje) / 100
```

### Descuento Fijo
```
Monto Descuento = Valor Fijo (máximo = Base)
```

### Total de Factura
```
Subtotal = Suma de (Cantidad × Precio) de todos los items
Descuentos Items = Suma de descuentos aplicados a items
Descuentos Factura = Suma de descuentos a nivel de factura
Total Descuentos = Descuentos Items + Descuentos Factura
Subtotal con Descuentos = Subtotal - Total Descuentos
Total Impuestos = Subtotal con Descuentos × 12%
TOTAL = Subtotal con Descuentos + Total Impuestos
```

## Instalación

### 1. Aplicar cambios en Base de Datos

```bash
psql -U usuario -d sistema_contable < database/billing-schema-extension.sql
```

### 2. Incluir módulo en Frontend

En `index.html`:
```html
<script src="js/facturacion.js"></script>
```

### 3. El backend ya está configurado

Las rutas se cargan automáticamente desde `server.js`.

## Funcionalidades Avanzadas

### Notas de Crédito/Débito
Las facturas pueden ser de tipo:
- `normal` - Factura regular
- `nota_credito` - Devolución/ajuste negativo
- `nota_debito` - Ajuste positivo

### Códigos Promocionales
- Validación de fechas de vigencia
- Límite de usos
- Monto mínimo requerido
- Descuentos por código automático

### Historial de Cambios
Cada cambio en una factura se registra en `venta_historial_cambios` con:
- Campo modificado
- Valor anterior y nuevo
- Motivo del cambio
- Usuario que realizó el cambio

## Seguridad

- ✅ Autenticación requerida para todas las operaciones
- ✅ Validación de datos en backend
- ✅ Transacciones de base de datos para integridad
- ✅ Auditoría de cambios
- ✅ Límite de descuentos validado

## Mejoras Futuras

- [ ] Reportes de descuentos aplicados
- [ ] Análisis de rentabilidad
- [ ] Descuentos por categoría de cliente
- [ ] Integración con sistemas de pago
- [ ] Generar PDF de facturas
- [ ] Envío por correo electrónico
- [ ] Descuentos progresivos según volumen histórico
