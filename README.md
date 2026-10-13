# 🏥 Zentra

**Zentra** es un sistema integral de gestión médica diseñado para clínicas, consultorios y centros de salud, con módulos completos para pacientes, historias clínicas y transacciones médicas. Construido con tecnologías web modernas, ofrece una interfaz intuitiva y funcionalidades completas para controlar tu negocio.

## ✨ Características

### Multiempresa y prueba gratuita
- Registro autoservicio de empresa y usuario administrador.
- Aislamiento de datos por organización mediante PostgreSQL Row Level Security.
- Prueba completa de 30 días con bloqueo automático al vencer.
- Estado y días restantes visibles dentro de la aplicación.

### 1. **Dashboard Inteligente**
- 📊 KPIs principales en tiempo real (Ingresos, Gastos, Inventario, Márgenes)
- 📈 Gráficos interactivos con Chart.js
- 📋 Transacciones recientes
- 🎯 Resumen visual de métricas clave

### 2. **Gestión de Inventario**
- 📦 Catálogo completo de productos
- 🔍 Búsqueda y filtrado por categoría
- ⚠️ Alertas de stock bajo
- 💰 Cálculo automático de valor total por producto
- ✏️ Edición y actualización de productos

### 3. **Sistema de Transacciones**
- 💳 Registro de ventas y compras individual
- 📝 **Carga masiva de transacciones** (Nuevo v1.1)
  - Interfaz tipo Excel para múltiples registros
  - Validación en tiempo real por fila
  - Cálculos automáticos (Qty × Price)
  - Procesamiento por lotes with detailed reporting
  - Actualización automática de stock
- 📄 Devoluciones y ajustes
- 📅 Filtrado por fecha y tipo
- 📊 Seguimiento completo de transacciones
- 🏷️ Estados de transacciones (Completada, Pendiente, etc.)

### 4. **Reportes Profesionales**
- 📊 Reporte de ventas
- 📦 Reporte de inventario
- 💰 Balance general
- 📈 Análisis de márgenes
- 📥 Exportación (preparado para futura integración)

### 5. **Configuración del Sistema**
- 🏢 Información de empresa
- 👤 Gestión de usuario
- ⚙️ Preferencias del sistema
- 🔐 Cambio de contraseña

## 🎨 Diseño Profesional

### Paleta de Colores
- **Primario**: Azul Profundo (#1e3a8a) - Confianza y profesionalismo
- **Secundario**: Cyan/Teal (#0891b2) - Energía moderna
- **Acento**: Naranja (#f97316) - Llamativo y dinámico
- **Fondos**: Grises claros para confort visual
- **Estados**: Verde (éxito), Rojo (error), Amarillo (alerta)

### Elementos de Diseño
- ✅ Interfaz responsive (mobile, tablet, desktop)
- ✅ Gradientes modernos y sutiles
- ✅ Sombras y efectos hover profesionales
- ✅ Iconos Font Awesome integrados
- ✅ Animaciones suaves y transiciones
- ✅ Typography clara y legible

## 📂 Estructura del Proyecto

```
Zentra/
├── index.html              # Página principal (estructura HTML)
├── css/
│   └── style.css          # Estilos principales con variables CSS
├── js/
│   └── app.js             # Lógica de la aplicación
└── data/
    └── demo-data.js       # Datos de demostración
```

## 🚀 Inicio Rápido

### Requisitos
- Navegador web moderno (Chrome, Firefox, Safari, Edge)
- Conexión a Internet (para CDN de Chart.js y Font Awesome)

### Instalación

1. **Clonar o descargar el proyecto**
   ```bash
   git clone <url-del-repositorio>
   cd Zentra
   ```

2. **Abrir en navegador**
   - Opción 1: Abrir directamente `index.html`
   - Opción 2: Usar Live Server en VS Code
   - Opción 3: Servir con HTTP local:
   ```bash
   python -m http.server 8000
   # o con Node.js: npx http-server
   ```

3. **Acceder a la aplicación**
   ```
   http://localhost:8000
   ```

## 📊 Datos de Demostración

El sistema incluye datos ficticios completos:

### 🛍️ Inventario (10 productos)
- **Electrónica**: Laptops, Monitores, Periféricos
- **Ropa**: Camisetas, Pantalones
- **Alimentos**: Café, Aceite
- **Herramientas**: Taladros, Sets de herramientas

### 💳 Transacciones (10 transacciones)
- Ventas completadas
- Compras a proveedores
- Devoluciones
- Diferentes estados (Completada, Pendiente)

### 📈 Métricas
- Ingresos totales: $48,500
- Gastos totales: $22,300
- Valor de inventario: $125,000
- Margen neto: 45.9%

## ⌨️ Navegación

### Atajos
- **Dashboard**: Vista principal con KPIs y gráficos
- **Inventario**: Gestión completa de productos
- **Transacciones**: Sistema de compras y ventas
- **Reportes**: Generación de reportes
- **Configuración**: Ajustes del sistema

## 🏥 Módulos Médicos (Versión 1.2+)

Sistema integrado para clínicas y consultorios médicos:

### 💊 Prescripciones Médicas
- Crear prescripciones de medicinas
- Seleccionar doctor y diagnóstico
- Múltiples medicinas por prescripción
- Cargo automático a cuenta del paciente
- [Ver documentación completa →](./PRESCRIPCIONES_QUICK_REFERENCE.md)

### 👤 Gestión de Pacientes
- Base de datos de pacientes
- Historial médico completo
- Seguimiento de diagnósticos
- Integración con prescripciones

### 📋 Historia Clínica
- Notas médicas por paciente
- Diagnósticos activos
- Seguimiento de tratamientos
- Vinculación automática con prescripciones

### 💰 Saldo del Paciente
- Control de deudas por servicios médicos
- Registros de cargos por medicinas
- Seguimiento de pagos y abonos
- Reporte de deuda pendiente

### 📊 Cuentas por Cobrar
- Rastreo de deudas por servicios
- Vinculación con prescripciones
- Estado de pagos
- Reportes de cobranza

### 📚 Documentación de Prescripciones
- [Guía Rápida de Usuario](./PRESCRIPCIONES_QUICK_REFERENCE.md)
- [Documentación Técnica Completa](./INTEGRACION_PRESCRIPCIONES.md)
- [Diagramas de Integración](./DIAGRAMA_INTEGRACION.md)
- [Resumen Ejecutivo](./RESUMEN_PRESCRIPCIONES.md)
- [Índice de Documentación](./INDICE_DOCUMENTACION.md)

## 🔧 Funcionalidades Disponibles en Demo

### ✅ Implementadas
- Navegación entre secciones
- Búsqueda y filtrado de productos
- Filtrado de transacciones por tipo y fecha
- Gráficos interactivos
- Agregar nuevos productos
- Interfaz completamente responsiva
- Notificaciones del sistema
- Cálculos automáticos de moneda
- 💊 **Sistema integrado de prescripciones médicas** (v1.2)
  - Prescripción de medicinas
  - Cargo automático a cuenta del paciente
  - Sincronización con Historia Clínica
  - Integración con Cuentas por Cobrar

### 🔜 Próximas (Base de Datos)
- Persistencia de datos en base de datos
- Autenticación y roles de usuario
- Generación automática de reportes PDF
- Exportación a Excel
- Histórico completo de cambios
- Respaldo automático de datos
- API REST para integración

## 🛠️ Tecnologías Utilizadas

- **HTML5**: Estructura semántica
- **CSS3**: Diseño moderno con variables, gradientes, flexbox
- **JavaScript (Vanilla)**: Lógica de aplicación sin dependencias
- **Chart.js**: Gráficos interactivos
- **Font Awesome 6**: Iconografía profesional

## 📱 Responsive Design

- **Desktop** (1200px+): Sidebar completo + contenido
- **Tablet** (768px - 1199px): Ajustes de layout
- **Mobile** (<768px): Sidebar colapsable, menú hamburguesa

## 🔐 Preparación para Base de Datos

El código está diseñado para facilitar futura integración:

```javascript
// Estructura lista para API REST
const apiEndpoints = {
  products: '/api/products',
  transactions: '/api/transactions',
  reports: '/api/reports',
  users: '/api/users'
};
```

### Pasos para integrar BD:
1. Crear backend con Node.js (Express) o Python (Flask/Django)
2. Configurar API REST endpoints
3. Reemplazar llamadas a `demoData` con peticiones fetch()
4. Agregar autenticación JWT
5. Implementar validaciones en servidor

## 📝 Guía de Uso

### Agregar Producto
1. Ir a "Inventario"
2. Hacer clic en "+ Agregar Producto"
3. Completar formulario (nombre, categoría, precio, stock)
4. Guardar

### Buscar Productos
1. Ir a "Inventario"
2. Usar campo de búsqueda por nombre o código
3. Filtrar por categoría (opcional)

### Filtrar Transacciones
1. Ir a "Transacciones"
2. Seleccionar tipo (Venta, Compra, Devolución)
3. Establecer rango de fechas
4. Ver resultados filtrados

### Ver Reportes
1. Ir a "Reportes"
2. Seleccionar tipo de reporte
3. (En versión futura) Descargar como PDF

## 🎯 Objetivos Futuros

- [ ] Base de datos relacional (PostgreSQL/MySQL)
- [ ] API REST completa
- [ ] Autenticación de usuarios
- [ ] Sistema de roles y permisos
- [ ] Generación de PDF
- [ ] Exportación a Excel
- [ ] Notificaciones por email
- [ ] Integración con pasarelas de pago
- [ ] Aplicación móvil nativa
- [ ] Sincronización en tiempo real

## 💡 Tips de Personalización

### Cambiar colores
Editar en `css/style.css`:
```css
:root {
    --primary-color: #tu-color-primario;
    --secondary-color: #tu-color-secundario;
    --accent-color: #tu-color-acento;
}
```

### Agregar nuevas categorías
Editar en `data/demo-data.js` o `html/index.html` en los select:
```html
<option value="Nueva Categoría">Nueva Categoría</option>
```

### Cambiar moneda
Buscar `formatCurrency()` en `data/demo-data.js` y ajustar locale.

## 🐛 Troubleshooting

### Los gráficos no aparecen
- Verificar conexión a CDN de Chart.js
- Limpiar caché del navegador (Ctrl+Shift+R)

### Estilos no se aplican correctamente
- Verificar que css/style.css está en la ruta correcta
- Limpiar caché: Ctrl+Shift+Delete

### Funcionalidad no responde
- Abrir Developer Tools (F12)
- Revisar consola para mensajes de error
- Verificar que todos los archivos JS están cargados

## 📞 Soporte

Para preguntas o reportar bugs:
1. Revisar la documentación
2. Consultar archivo de cambios
3. Reportar en issues del proyecto

## 📄 Licencia

Este proyecto es de uso educativo y comercial.

## 👨‍💻 Desarrollado para

**Stock Flow** - Sistema de Gestión Contable Moderno
Versión 1.0 - Marzo 2026

---

**¡Gracias por usar Stock Flow!** 🎉

Para más información, actualizar el código o agregar funcionalidades, no dudes en contactar.
