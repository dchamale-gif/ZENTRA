# Dashboards y Reportes con Datos Reales

## 📊 Cambios Implementados

Los dashboards y reportes ahora obtienen **datos reales directamente de la base de datos** en lugar de usar datos hardcodeados de demostración.

### ✅ Componentes Actualizados

#### 1. **Dashboard Financiero** (`/js/dashboard-financiero.js`)
- **Antes**: Mostraba datos ficticios
- **Ahora**: Obtiene datos reales de:
  - Resumen financiero (ingresos, egresos, ganancia, margen)
  - Datos históricos mensuales (últimos 12 meses)
  - Categorización de gastos
  - Categorización de ingresos

#### 2. **Módulo de Reportes** (`/js/reports.js`)
- **Antes**: Consolidaba datos de diferentes módulos locales
- **Ahora**: Obtiene datos reales filtrados por período de la API

## 📡 API Endpoints Disponibles

### Resumen Financiero
```bash
GET /api/reports/financial-summary?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
```
Retorna: ingresos, egresos, ganancia, margen, transacciones, etc.

### Datos Históricos Mensuales
```bash
GET /api/reports/monthly-data?months=12
```
Retorna: datos mes a mes de los últimos N meses

### Datos Diarios
```bash
GET /api/reports/daily-data
```
Retorna: datos de los últimos 30 días

### Gastos por Categoría
```bash
GET /api/reports/expenses-by-category?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
```
Retorna: gastos agrupados por proveedor/categoría

### Ingresos por Categoría
```bash
GET /api/reports/income-by-category?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
```
Retorna: ingresos agrupados por tipo (medicinas, artículos, etc)

### Flujo de Caja
```bash
GET /api/reports/cash-flow?months=12
```
Retorna: flujo acumulado de efectivo

### Productos Más Vendidos
```bash
GET /api/reports/top-selling-products?limit=10&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
```
Retorna: ranking de productos más vendidos

## 🚀 Cómo Usar

### 1. Asegúrate de que el Backend está Ejecutándose

```bash
cd backend
npm install
npm start
```

El servidor debe estar disponible en: `http://localhost:3011` o `http://178.128.72.110:3011`

### 2. Accede al Dashboard Financiero

- La página se cargará automáticamente con datos reales de la base de datos
- Los gráficos se actualizarán automáticamente
- El botón "Refrescar" recargará los datos desde la BD

### 3. Genera Reportes

- Selecciona el período (día, semana, mes, año o personalizado)
- El reporte se generará con datos reales filtrados por esas fechas
- Puedes exportar a Excel o PDF

## 📊 Datos Consultados

| Componente | Tabla(s) de BD | Información |
|-----------|---|---|
| **Ingresos** | `ventas` | Total de ventas, número de facturas |
| **Egresos** | `compras` | Total de compras, número de compras |
| **Categorías de Gastos** | `compras`, `compra_items`, `proveedores` | Gastos por proveedor |
| **Categorías de Ingresos** | `venta_items`, `medicinas`, `codigos_articulos` | Ingresos por tipo de producto |
| **Histórico** | `ventas`, `compras` | Datos agrupados por mes |
| **Diarios** | `ventas`, `compras` | Datos últimos 30 días |

## ⚙️ Configuración

### URL de la API
La aplicación busca la API en rutas relativas (`/api/reports/...`).

Si necesitas cambiar la URL, edita el archivo de configuración:
```javascript
// En config.js
API: {
    baseURL: 'http://tu-servidor:3011/api'
}
```

### Token de Autenticación
Los endpoints requieren autenticación. El token se envía automáticamente desde:
```javascript
localStorage.getItem('auth_token')
```

## 🔍 Depuración

Si los dashboards no muestran datos:

1. **Verifica la consola del navegador** (F12 → Consola)
   - Busca mensajes de error en las solicitudes de API

2. **Verifica la conexión al backend**
   ```bash
   curl http://localhost:3011/health
   ```

3. **Verifica que tienes datos en la BD**
   ```sql
   SELECT COUNT(*) FROM ventas;
   SELECT COUNT(*) FROM compras;
   ```

4. **Verifica el token de autenticación**
   ```javascript
   // En la consola
   localStorage.getItem('auth_token')
   ```

## 📝 Próximas Mejoras (Opcionales)

- [ ] Agregar gráficos adicionales
- [ ] Implementar filtros más avanzados
- [ ] Agregar predicciones/proyecciones
- [ ] Exportación a múltiples formatos
- [ ] Caché de datos para mejor rendimiento
- [ ] Webhooks para actualización en tiempo real
