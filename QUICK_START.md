# 🚀 Guía Rápida - Stock Flow

## ⚡ Inicio en 30 segundos

### Opción 1: Abrir directamente
1. Localiza el archivo `index.html`
2. Haz doble clic para abrirlo en tu navegador
3. ¡Listo! El sistema está funcionando

### Opción 2: VS Code + Live Server
1. Abre la carpeta en VS Code
2. Instala extensión "Live Server" (si no la tienes)
3. Clic derecho en `index.html` → "Open with Live Server"
4. Se abrirá en `http://localhost:5500`

### Opción 3: Terminal
```bash
# Windows
cd Zentra
python -m http.server 8000
# Accede a http://localhost:8000

# Mac/Linux
cd Zentra
python3 -m http.server 8000
```

---

## 🎯 Primeros Pasos

### 1️⃣ Explorar el Dashboard
- Visualiza los KPIs principales
- Observa gráficos de ventas e inventario
- Revisa transacciones recientes

### 2️⃣ Gestionar Inventario
- Ve a "Inventario" en el menú lateral
- Busca productos por nombre o código
- Filtra por categoría
- Agrega un nuevo producto con "+ Agregar Producto"

### 3️⃣ Ver Transacciones
- Abre "Transacciones"
- Filtra por tipo (Venta, Compra, Devolución)
- Establece rango de fechas
- Haz clic en "Ver" para detalles

### 4️⃣ Consultar Reportes
- Accede a "Reportes"
- Visualiza diferentes tipos (Ventas, Balance, etc.)
- Revisa el resumen mensual

### 5️⃣ Configurar Sistema
- Ve a "Configuración"
- Actualiza información de la empresa
- Modifica datos de usuario
- Ajusta preferencias

---

## 📊 Datos de Demo Que Encontrarás

### Inventario
- 10 productos de diferentes categorías
- Stock variado desde 8 hasta 500 unidades
- Precios desde $8.50 hasta $1,200

### Transacciones
- 10 transacciones ficticias
- Mix de ventas, compras y devoluciones
- Estados completados y pendientes
- Últimos 5 días

### Métricas
- **Ingresos**: $48,500 (mes actual)
- **Gastos**: $22,300
- **Inventario**: $125,000
- **Margen Neto**: 45.9%

---

## 🎨 Personalización Rápida

### Cambiar Nombre de la Empresa
1. Ve a "Configuración"
2. En "Información de la Empresa"
3. Modifica "Nombre de la Empresa"

### Cambiar Colores
1. Abre `css/style.css`
2. Busca `:root {`
3. Modifica los colores:
   ```css
   --primary-color: #tu-color;
   --accent-color: #nuevo-color;
   ```

### Agregar Categorías
1. Abre `js/config.js`
2. Busca `PRODUCTS: { categories: [`
3. Agrega nuevas categorías:
   ```javascript
   categories: ['Electrónica', 'Ropa', 'Tu Categoría', ...]
   ```

---

## 🔍 Características Demo

### ✅ Ya Funcionan
- Navegación completa entre secciones
- Búsqueda en tiempo real
- Gráficos interactivos
- Filtros dinámicos
- Agregar productos
- Notificaciones

### 🔜 Próximas Funciones (con BD)
- Guardar datos permanentemente
- Usuarios con login
- Exportar a PDF/Excel
- Reportes automáticos
- Sincronización en tiempo real

---

## 💡 Tips Útiles

### Dashboard
- Los gráficos son interactivos
- Pasa el ratón sobre los datos
- Las tarjetas KPI se animan al pasar

### Búsqueda
- Busca por nombre completo o parcial
- Funciona en tiempo real sin esperar
- Combina con filtros para resultados precisos

### Responsive
- Funciona perfecto en desktop
- Se adapta a tablets
- Sidebar se colapsa en móvil (botón ≡)
- Prueba reduciendo el tamaño de tu ventana

### Dark Mode
- Modo oscuro en desarrollo
- Pronto disponible en configuración

---

## 🐛 Solucionar Problemas

### No carga la página
- ✅ Revisa que estés en navegador moderno
- ✅ Limpia caché (Ctrl+Shift+Del)
- ✅ Intenta con otro navegador

### Gráficos no se ven
- ✅ Necesita Internet (CDN de Chart.js)
- ✅ Verifica conexión de red
- ✅ Abre consola (F12) para ver errores

### Estilos extraños
- ✅ Recarga la página (Ctrl+R o Cmd+R)
- ✅ Limpia caché navegador (Ctrl+Shift+Delete)
- ✅ Verifica que css/style.css existe

### Tabla vacía
- ✅ Los datos están en memoria durante la sesión
- ✅ Recarga la página si notificaste cambios
- ✅ Esto cambiará cuando integres BD

---

## 📁 Estructura de Archivos

```
Zentra/
├── index.html           ← Abre esto en navegador
├── README.md           ← Documentación completa
├── QUICK_START.md      ← Este archivo
├── css/
│   └── style.css       ← Todos los estilos
├── js/
│   ├── config.js       ← Configuración del sistema
│   └── app.js          ← Lógica principal
└── data/
    └── demo-data.js    ← Datos ficticios
```

---

## 🎓 Próximos Pasos

### Para Aprender
1. Revisa el código en `js/app.js`
2. Estudia las funciones en `data/demo-data.js`
3. Experimenta con los estilos en `css/style.css`

### Para Personalizar
1. Modifica datos en `demo-data.js`
2. Ajusta colores en `css/style.css`
3. Agrega elementos en `index.html`

### Para Integrar BD
1. Crea un backend (Node.js, Python, PHP)
2. Configura API REST endpoints
3. Reemplaza llamadas a `demoData` con fetch()
4. Agrega autenticación

---

## 📞 Necesitas Ayuda?

1. Consulta el `README.md` para documentación completa
2. Verifica `index.html` para estructura HTML
3. Revisa `css/style.css` para información de estilos
4. Abre Developer Tools (F12) para debugging
5. Consulta comentarios en el código

---

## 🎉 ¡Disfruta Stock Flow!

El sistema está 100% funcional y listo para usar.
Próxima fase: Integración con base de datos.

**Stock Flow v1.0** - Marzo 2026
