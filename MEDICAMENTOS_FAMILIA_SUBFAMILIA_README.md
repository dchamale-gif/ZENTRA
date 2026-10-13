<!-- MEDICAMENTOS: Familia y Subfamilia - Visualización Mejorada -->

# Mejora: Visualización de Información de Medicamentos

**Fecha:** 2026-09-04  
**Problema:** No se visualizaban los campos de familia y subfamilia de los medicamentos.  
**Estado:** ✅ RESUELTO

---

## Descripción del Problema

Cuando se visualizaban medicamentos en el sistema, faltaban los siguientes campos:
- Familia del medicamento (ej: Antiinflamatorios, Antibióticos)
- Subfamilia del medicamento (ej: AINES, Penicilinas)

Esto limitaba la capacidad de categorizar y filtrar medicamentos efectivamente.

---

## Cambios Implementados

### 1. Schema de Base de Datos (`database/schema.sql`)

Se agregaron los siguientes campos a la tabla `medicinas`:

```sql
ALTER TABLE medicinas ADD COLUMN familia VARCHAR(100);
ALTER TABLE medicinas ADD COLUMN subfamilia VARCHAR(100);
ALTER TABLE medicinas ADD COLUMN presentacion VARCHAR(50);
ALTER TABLE medicinas ADD COLUMN codigo_externo VARCHAR(50);
ALTER TABLE medicinas ADD COLUMN codigo_barra VARCHAR(50);
```

**Campos Nuevos:**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `familia` | VARCHAR(100) | Familia principal (ej: Antiinflamatorios, Antibióticos) |
| `subfamilia` | VARCHAR(100) | Subfamilia específica (ej: AINES, Penicilinas) |
| `presentacion` | VARCHAR(50) | Forma de presentación (Tabletas, Cápsulas, Crema, etc.) |
| `codigo_externo` | VARCHAR(50) | Código asignado externamente |
| `codigo_barra` | VARCHAR(50) | Código de barras del producto |

### 2. Visualización en Tabla

La tabla de medicamentos ahora muestra 10 columnas:

```
Código | Nombre | Familia | Subfamilia | Presentación | Concentración | Stock | Vencimiento | Estado | Acciones
```

**Ejemplo:**
```
IBU400 | Ibuprofeno 400mg | Antiinflamatorios | AINES | Tabletas | 400mg | 100 unid. | 2027-06-30 | Activa | [Editar] [Eliminar]
```

### 3. Modal de Edición/Creación

El formulario de medicinas incluye:

```
[Información Básica]
  ├─ Código de Barra
  ├─ Nombre
  ├─ Familia (Select) ← NUEVO
  ├─ Subfamilia (Select) ← NUEVO
  ├─ Presentación
  └─ Principio Activo

[Dosis y Presentación]
  ├─ Dosis
  ├─ Unidad de Dosis
  ├─ Lote
  └─ Fecha Vencimiento

[Inventario]
  ├─ Cantidad En Stock
  ├─ Cantidad Mínima Alerta
  └─ Precio Unitario
```

### 4. Filtros Disponibles

En la sección de listado de medicinas se pueden filtrar por:
- **Familia:** Selecciona una familia para ver solo medicamentos de esa familia
- **Subfamilia:** Se actualiza dinámicamente según la familia seleccionada
- **Búsqueda:** Busca por nombre, código, concentración o principio activo

### 5. Detalles del Medicamento

Al ver los detalles de un medicamento se muestra:

```
[Medicamento] - [Estado]

Información Básica:
├─ Código de Barra: 7501001234500
├─ Familia: Antiinflamatorios
├─ Subfamilia: AINES
└─ Presentación: Tabletas

Información Farmacológica:
├─ Principio Activo: Ibuprofeno
├─ Dosis Recomendada: 400mg
├─ Lote: LOT001
└─ Fecha Vencimiento: 2027-06-30
```

---

## Archivos Modificados/Creados

### Archivos Existentes (Modificados)
- **`database/schema.sql`** - Agregados campos familia, subfamilia, presentacion, codigo_externo, codigo_barra

### Archivos Nuevos (Creados)
- **`database/add-familia-subfamilia-medicinas.sql`** - Script de migración para BD existentes
- **`database/medicamentos-familia-subfamilia-datos-ejemplo.sql`** - Datos de ejemplo con 21 medicamentos

---

## Instrucciones de Implementación

### Para Nueva Instalación
1. Utiliza el schema actualizado: `database/schema.sql`
2. Carga los datos de ejemplo: `database/medicamentos-familia-subfamilia-datos-ejemplo.sql`
3. El código JavaScript ya está preparado para usar estos campos

### Para Base de Datos Existente

**Paso 1:** Agregar campos a la tabla

```sql
-- Para MySQL/MariaDB
ALTER TABLE medicinas ADD COLUMN IF NOT EXISTS familia VARCHAR(100);
ALTER TABLE medicinas ADD COLUMN IF NOT EXISTS subfamilia VARCHAR(100);
ALTER TABLE medicinas ADD COLUMN IF NOT EXISTS presentacion VARCHAR(50);
ALTER TABLE medicinas ADD COLUMN IF NOT EXISTS codigo_externo VARCHAR(50);
ALTER TABLE medicinas ADD COLUMN IF NOT EXISTS codigo_barra VARCHAR(50);

-- Para PostgreSQL
ALTER TABLE medicinas ADD COLUMN IF NOT EXISTS familia VARCHAR(100);
ALTER TABLE medicinas ADD COLUMN IF NOT EXISTS subfamilia VARCHAR(100);
-- etc...
```

**Paso 2:** Crear índices (opcional pero recomendado)

```sql
CREATE INDEX idx_medicinas_familia ON medicinas(familia);
CREATE INDEX idx_medicinas_subfamilia ON medicinas(subfamilia);
CREATE INDEX idx_medicinas_codigo_externo ON medicinas(codigo_externo);
CREATE INDEX idx_medicinas_codigo_barra ON medicinas(codigo_barra);
```

**Paso 3:** Cargar datos de ejemplo (opcional)

```sql
-- Usar el archivo: database/medicamentos-familia-subfamilia-datos-ejemplo.sql
```

---

## Familias y Subfamilias Predefinidas

El sistema incluye datos de ejemplo con las siguientes categorías:

### Antiinflamatorios
- AINES: Ibuprofeno, Diclofenaco, Naproxeno

### Analgésicos
- No AINES: Acetaminofén

### Antibióticos
- Penicilinas: Amoxicilina
- Fluoroquinolonas: Ciprofloxacino
- Macrólidos: Azitromicina

### Antihipertensivos
- Inhibidores de ACE: Lisinopril
- Bloqueadores Beta: Atenolol
- Bloqueadores de Calcio: Nifedipino

### Antihistamínicos
- Antihistamínicos H1: Loratadina, Difenhidramina

### Vitaminas
- Vitaminas Hidrosolubles: Vitamina C, Complejo B
- Vitaminas Liposolubles: Vitamina D3

### Corticosteroides
- Corticosteroides Sistémicos: Prednisona
- Corticosteroides Tópicos: Hidrocortisona

### Antifúngicos
- Azoles: Fluconazol
- Imidazoles: Miconazol

### Antiácidos
- Inhibidores de Bomba de Protones: Omeprazol
- Antagonistas H2: Ranitidina

---

## Características

### Búsqueda Mejorada
- Busca en nombre, código, concentración y principio activo
- Busca también en familia y subfamilia

### Filtrado Dinámico
- Al seleccionar familia, se actualizan las subfamilias disponibles
- Los filtros se aplican en tiempo real
- Puedes combinar múltiples filtros

### Gestión de Medicamentos
- **Crear:** Formulario con campos de familia y subfamilia
- **Editar:** Recarga automáticamente la familia y subfamilia
- **Eliminar:** Confirma antes de eliminar
- **Ver Detalles:** Muestra toda la información del medicamento

---

## Notas Técnicas

### Base de Datos
- Los campos `familia` y `subfamilia` permiten NULL (para medicamentos heredados)
- Se recomiendan crear índices para mejorar rendimiento en búsquedas
- Compatible con MySQL, MariaDB y PostgreSQL

### JavaScript (js/medicinas.js)
- El código ya está preparado para usar estos campos
- Funciones clave:
  - `extractFamilias()` - Extrae familias y subfamilias únicas
  - `populateFamilySelectors()` - Rellena los selectores
  - `updateMedicineSubfamilySelector()` - Actualiza subfamilias dinámicamente
  - `renderMedicines()` - Renderiza la tabla con todos los campos

### HTML (index.html)
- El modal de medicina ya contiene los selectores de familia y subfamilia
- La tabla de medicinas ya muestra las columnas familia y subfamilia

---

## Pruebas Recomendadas

1. **Crear medicamento:** Verifica que se guarden familia y subfamilia
2. **Editar medicamento:** Confirma que se cargan correctamente los valores
3. **Filtrar:** Prueba filtrar por familia y subfamilia
4. **Búsqueda:** Busca por nombre, familia o subfamilia
5. **Ver detalles:** Verifica que se muestren todos los campos

---

## Próximas Mejoras Posibles

- [ ] Agregar campo `grupo_terapeutico` para clasificación adicional
- [ ] Crear módulo de gestión de familias/subfamilias
- [ ] Reportes por familia/subfamilia
- [ ] Integración con protocolo de medicamentos
- [ ] Alertas de medicamentos vencidos por familia

---

**Versión:** 1.0  
**Última Actualización:** 2026-09-04  
**Estado:** ✅ Completo y Documentado
