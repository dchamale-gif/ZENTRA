# CONTRIBUIR A STOCK FLOW

¡Gracias por tu interés en contribuir a Stock Flow! Las contribuciones son bienvenidas y apreciadas.

---

## 📋 Tabla de Contenidos

1. [Código de Conducta](#código-de-conducta)
2. [Cómo Reportar Bugs](#cómo-reportar-bugs)
3. [Cómo Sugerir Mejoras](#cómo-sugerir-mejoras)
4. [Enviar Pull Requests](#enviar-pull-requests)
5. [Guía de Estilo](#guía-de-estilo)
6. [Configuración de Desarrollo](#configuración-de-desarrollo)

---

## 🤝 Código de Conducta

### Nuestra Promesa

En el interés de fomentar un ambiente abierto y acogedor, nosotros como contribuyentes y mantenedores nos comprometemos a hacer participar en nuestro proyecto y nuestra comunidad una experiencia libre de acoso para todos.

### Nuestros Estándares

Ejemplos de comportamiento que contribuye a crear un ambiente positivo incluyen:

- Usar lenguaje acogedor e inclusivo
- Ser respetuoso de los puntos de vista y experiencias diferentes
- Aceptar críticas constructivas
- Enfocarse en lo que es mejor para la comunidad

### Aplicación

Instancias de comportamiento abusivo, de acoso o inaceptable pueden ser reportadas contactando con los mantenedores del proyecto. Todos los reportes serán revisados e investigados.

---

## 🐛 Cómo Reportar Bugs

### Antes de Reportar un Bug

- Verifica si el bug ya ha sido reportado
- Prueba con la última versión
- Verifica tu configuración

### Cómo Reportar un Bug

Usa el siguiente formato:

```markdown
**Descripción**
Descripción clara del problema

**Pasos para Reproducir**
1. Abre...
2. Haz clic en...
3. Observa...

**Comportamiento Esperado**
Qué debería suceder

**Comportamiento Actual**
Qué sucede realmente

**Screenshots**
Si es aplicable

**Entorno**
- OS: [ej. Windows 10]
- Navegador: [ej. Chrome 90]
- Versión Stock Flow: [ej. 1.0.0]

**Logs Adicional**
Consola del navegador (F12)
```

---

## 💡 Cómo Sugerir Mejoras

### Antes de Sugerir

- Verifica si la mejora ya fue sugerida
- Considera si es aplicable al proyecto

### Formato para Sugerir

```markdown
**Descripción de la Mejora**
Descripción clara

**Motivación**
Por qué sería útil

**Ejemplo de Implementación**
Cómo podría funcionar

**Alternativas**
Otras soluciones consideradas
```

---

## 🔧 Enviar Pull Requests

### Pasos

1. **Fork el repositorio**
   ```bash
   git clone https://github.com/tu-usuario/Zentra.git
   cd Zentra
   ```

2. **Crear rama de feature**
   ```bash
   git checkout -b feature/AmazingFeature
   ```

3. **Realiza tus cambios**
   - Actualiza el código
   - Agrega tests si es necesario
   - Actualiza documentación

4. **Commit tus cambios**
   ```bash
   git add .
   git commit -m "Add some AmazingFeature"
   ```

5. **Push a la rama**
   ```bash
   git push origin feature/AmazingFeature
   ```

6. **Abre un Pull Request**
   - Describe los cambios claramente
   - Referencia issues relacionados
   - Incluye screenshots si es aplicable

### Convenciones de Commits

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: Nueva funcionalidad
- `fix`: Corrección de bug
- `docs`: Cambios en documentación
- `style`: Cambios de formato (no afectan código)
- `refactor`: Refactorización de código
- `test`: Agregar o actualizar tests
- `chore`: Cambios de build, dependencias

**Ejemplos:**
```
feat(inventory): add product search functionality
fix(dashboard): correct KPI calculation
docs(readme): update installation instructions
style(css): format code with prettier
```

---

## 📝 Guía de Estilo

### HTML

```html
<!-- Usar atributos data- para JavaScript -->
<button class="btn" data-page="dashboard">Dashboard</button>

<!-- Identar con 4 espacios -->
<div class="container">
    <div class="content">
        <p>Contenido</p>
    </div>
</div>
```

### CSS

```css
/* Usar variables CSS personalizadas */
.element {
    color: var(--primary-color);
    transition: var(--transition);
}

/* Ordenar propiedades: posición, tamaño, apariencia, otros */
.card {
    /* Position & Layout */
    position: relative;
    display: flex;
    
    /* Sizing */
    width: 100%;
    padding: 20px;
    
    /* Appearance */
    background-color: var(--bg-white);
    border-radius: 8px;
    
    /* Effects */
    box-shadow: var(--shadow);
}
```

### JavaScript

```javascript
// Usar nombres descriptivos
function performProductSearch(searchTerm) {
    // ...
}

// Usar const por defecto, let si es necesario
const tableElement = document.getElementById('table');
let currentPage = 1;

// Comentar código complejo
// Calcular el margen de ganancia basado en precio y costo
const margin = ((salePrice - costPrice) / salePrice) * 100;

// Usar arrow functions cuando sea apropiado
const products = data.map(item => ({
    name: item.name,
    price: item.price
}));
```

### Estructura de Carpetas

```
proyecto/
├── index.html              # Estructura principal
├── css/
│   └── style.css          # Todos los estilos
├── js/
│   ├── config.js          # Configuración
│   └── app.js             # Lógica principal
├── data/
│   └── demo-data.js       # Datos ficticios
│
├── README.md              # Documentación
├── QUICK_START.md         # Guía rápida
├── CONTRIBUTING.md        # Este archivo
└── .gitignore             # Git ignore
```

---

## 🛠️ Configuración de Desarrollo

### Requisitos
- Node.js v14+
- Git
- Editor de código (VS Code recomendado)

### Setup

```bash
# Clonar repositorio
git clone https://github.com/tu-usuario/Zentra.git
cd Zentra

# Instalar Live Server (VS Code)
# Extension: Live Server (Five Server)

# O usar Python
python -m http.server 8000
# Acceder a http://localhost:8000
```

### Testing en Navegador

1. Abrir DevTools (F12)
2. Verificar consola sin errores
3. Probar en múltiples navegadores
4. Validar responsive (F12 → Toggle Device Toolbar)

### Verificar Antes de Enviar PR

- [ ] Código sigue la guía de estilo
- [ ] No hay errores en consola
- [ ] Funciona en desktop, tablet, móvil
- [ ] Documentación actualizada
- [ ] Commits con mensajes claros
- [ ] README actualizado si es necesario

---

## 🎯 Áreas Donde Podemos Necesitar Ayuda

### Documentación
- Mejorar README
- Crear tutoriales
- Ejemplos de uso

### Funcionalidades
- Integración con base de datos
- Sistema de autenticación
- Exportación a PDF/Excel
- API REST

### Testing
- Tests unitarios
- Tests de integración
- Tests de UI

### Diseño
- Mejorar UI/UX
- Agregar temas
- Optimizar responsive

### Traducciones
- Inglés
- Otros idiomas

---

## 💬 Si Tienes Preguntas?

- Revisa la [documentación](README.md)
- Consulta la [guía rápida](QUICK_START.md)
- Abre una Issue con la etiqueta `question`

---

## 🙏 Gracias!

Tu contribución es valiosa y ayuda a hacer Stock Flow mejor para todos.

**Stock Flow Contributing Guide v1.0**
