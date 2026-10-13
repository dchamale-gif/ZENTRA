# PLAN DE ACCIÓN - Tareas Implementadas

Documento generado: 2026-08-07
Última actualización: 2026-10-01

## Resumen Ejecutivo

Las seis tareas de este plan ya cuentan con implementación funcional:
- ✅ Filtros avanzados de pacientes y saldos.
- ✅ Caja Integrada con persistencia mediante API y fallback local.
- ✅ Agenda conectada a API, con validación de conflictos en servidor.
- ✅ Órdenes médicas con CRUD y generación de PDF.
- ✅ Personal médico con CRUD, especialidades y horarios.
- ✅ Hospitalización con ingresos, traslados, altas y control transaccional de camas.

La ejecución de las migraciones y las pruebas integrales contra PostgreSQL de producción forman parte del despliegue, no del desarrollo pendiente.

---

## TAREAS COMPLETADAS

### TAREA 1: Agregar Filtros Avanzados (Nivel: FÁCIL)
**Estado**: ✅ COMPLETADA
**Archivos**: `index.html`, `js/pacientes.js`, `js/saldo-paciente.js`

**Paso 1**: Actualizar HTML (index.html línea 294-298)
```html
<select id="filterPacient" class="form-input">
    <option value="todos">Todos los Pacientes</option>
    <option value="cliente">Solo Clientes</option>
    <option value="no-cliente">No Clientes</option>
    <option value="alfabetico-asc">Alfabético (A-Z)</option>
    <option value="alfabetico-desc">Alfabético (Z-A)</option>
    <option value="deudor">Con Saldo Pendiente</option>
    <option value="pagado">Pagados</option>
</select>
```

**Paso 2**: Actualizar `pacientes.js` renderPacientes()
- Agregar lógica de ordenamiento basada en filtro
- Integrar con módulo de saldos para "deudor/pagado"

**Estimado**: 1-2 horas

---

### TAREA 2: Arreglar Módulo de Cobros/Caja (Nivel: MEDIO)
**Estado**: ✅ COMPLETADA
**Archivos**: `js/caja.js`, `js/cuentas-por-cobrar.js`

**Problema**: Los datos son hardcodeados, no hay búsqueda ni filtros

**Pasos**:
1. Revisar si existe endpoint de movimientos en API
2. Si no existe, crear endpoint en backend: `POST /api/caja/movimientos`
3. Actualizar `caja.js` para:
   - Cargar movimientos desde API o localStorage
   - Agregar búsqueda por cliente/referencia
   - Agregar filtros por tipo (ingreso/egreso)
   - Agregar filtros por fecha

**Implementación final**:
- API autenticada en `/api/caja` y resumen en `/api/caja/summary`.
- Cálculo transaccional de saldo anterior/posterior.
- Búsqueda y filtros en frontend; persistencia local como respaldo.
- Migración idempotente sobre la tabla `caja` existente.

**Estimado**: 3-4 horas

---

### TAREA 3: Arreglar Módulo de Agenda (Nivel: MEDIO)
**Estado**: ✅ COMPLETADA
**Archivos**: `js/agenda-avanzada.js`

**Problema**: Usa localStorage, no integrado con API de citas

**Pasos**:
1. Crear endpoint en backend si no existe:
   - `GET /api/citas` - Listar citas
   - `POST /api/citas` - Crear cita
   - `PUT /api/citas/:id` - Actualizar cita
   - `DELETE /api/citas/:id` - Eliminar cita

2. Actualizar `agenda-avanzada.js`:
   - Cargar datos desde API en `loadData()`
   - Guardar cambios a API en métodos de edición
   - Validar conflictos de horarios
   - Validar disponibilidad de doctor

**Implementación final**:
- API autenticada en `/api/appointments` con GET, POST, PUT y DELETE lógico.
- Carga, creación, edición y cancelación conectadas desde el calendario.
- Conflictos de doctor/fecha/hora validados también en servidor.
- Fallback local cuando la API no está disponible.

**Estimado**: 4-5 horas

---

### TAREA 4: Crear Módulo de Órdenes Médicas (Nivel: ALTO)
**Estado**: ✅ COMPLETADA
**Archivos**: Nuevos - crear `js/ordenes-medicas.js`

**Requerimientos**:
- Listar órdenes médicas por paciente
- Crear/Editar/Eliminar órdenes
- Vincular con historia clínica
- Vincular con servicios/procedimientos
- Generar PDF de orden

**Backend Requerido**:
```sql
CREATE TABLE ordenes_medicas (
    id UUID PRIMARY KEY,
    paciente_id VARCHAR NOT NULL,
    doctor_id VARCHAR NOT NULL,
    fecha_orden DATE NOT NULL,
    descripcion TEXT,
    servicios_solicitados TEXT,
    notas TEXT,
    estado VARCHAR (pendiente, completada, cancelada),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

**Endpoints**:
- `GET /api/ordenes-medicas` - Listar
- `POST /api/ordenes-medicas` - Crear
- `PUT /api/ordenes-medicas/:id` - Actualizar
- `DELETE /api/ordenes-medicas/:id` - Eliminar

**Estimado**: 6-8 horas

---

### TAREA 5: Crear Módulo de Gestión de Personal (Nivel: ALTO)
**Estado**: ✅ COMPLETADA
**Archivos**: Nuevos - crear `js/personal.js`

**Requerimientos**:
- Listar especialistas/personal
- Registrar especialidades
- Configurar horarios disponibles
- Gestionar permisos/vacaciones
- Vincular con agenda de citas

**Backend Requerido**:
```sql
CREATE TABLE personal_medico (
    id UUID PRIMARY KEY,
    nombre VARCHAR NOT NULL,
    apellido_paterno VARCHAR,
    apellido_materno VARCHAR,
    especialidad VARCHAR NOT NULL,
    licencia_profesional VARCHAR UNIQUE,
    telefono VARCHAR,
    email VARCHAR,
    horario_inicio TIME,
    horario_fin TIME,
    dias_disponibles VARCHAR[],
    estado VARCHAR (activo, inactivo, licencia),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE disponibilidad_personal (
    id UUID PRIMARY KEY,
    personal_id UUID NOT NULL,
    fecha DATE,
    hora_inicio TIME,
    hora_fin TIME,
    estado VARCHAR (disponible, ocupado, bloqueado),
    FOREIGN KEY (personal_id) REFERENCES personal_medico(id)
);
```

**Endpoints**:
- `GET /api/personal` - Listar personal
- `POST /api/personal` - Crear personal
- `PUT /api/personal/:id` - Actualizar
- `DELETE /api/personal/:id` - Eliminar
- `GET /api/personal/:id/disponibilidad` - Ver disponibilidad

**Estimado**: 6-8 horas

---

### TAREA 6: Arreglar Hospitalización - Ingresos a Cama (Nivel: MEDIO)
**Estado**: ✅ COMPLETADA
**Archivos**: `js/hospitalizaciones.js`

**Problema**: No valida disponibilidad de camas, no guarda datos

**Pasos**:
1. Revisar estructura de datos de hospitalizaciones
2. Crear/Verificar tabla de camas en BD:
   ```sql
   CREATE TABLE camas (
       id UUID PRIMARY KEY,
       numero VARCHAR UNIQUE NOT NULL,
       piso INTEGER,
       estado VARCHAR (disponible, ocupada, mantenimiento),
       tipo_cama VARCHAR (individual, compartida)
   );
   
   CREATE TABLE ingresos_hospitalizacion (
       id UUID PRIMARY KEY,
       paciente_id VARCHAR NOT NULL,
       cama_id UUID NOT NULL,
       fecha_ingreso DATE NOT NULL,
       fecha_egreso DATE,
       doctor_responsable VARCHAR,
       diagnostico TEXT,
       estado VARCHAR (ingresado, egresado, transferido),
       FOREIGN KEY (cama_id) REFERENCES camas(id)
   );
   ```

3. Crear endpoints:
   - `GET /api/camas/disponibles` - Camas libres
   - `POST /api/hospitalizaciones/ingresos` - Ingresar paciente
   - `PUT /api/hospitalizaciones/ingresos/:id` - Egresar paciente

4. Actualizar `hospitalizaciones.js`:
   - Cargar camas disponibles
   - Validar antes de ingresar
   - Guardar ingreso a BD

**Implementación final**:
- Maestros persistentes de habitaciones y camas con datos iniciales.
- API autenticada para listar ingresos, ingresar, trasladar y dar de alta.
- Bloqueos de fila y transacciones para impedir ocupación doble.
- Historial persistente de traslados y fallback local en frontend.

**Estimado**: 3-4 horas

---

## ORDEN DE IMPLEMENTACIÓN EJECUTADO

1. ✅ Filtros avanzados.
2. ✅ Órdenes médicas.
3. ✅ Personal médico.
4. ✅ Agenda API.
5. ✅ Caja API.
6. ✅ Hospitalización API.

---

## CHECKLIST DE VALIDACIÓN

Para cada tarea completada, verificar:

- [x] Código implementado y validado estáticamente
- [x] Validación de datos en formularios
- [x] Mensajes de error claros para usuarios
- [x] Persistencia mediante API implementada
- [x] Búsqueda/filtros implementados
- [x] Integración con módulos relacionados
- [x] Rutas y controladores cargan correctamente
- [x] Documentación actualizada
- [ ] Ejecutar migraciones en el servidor de producción
- [ ] Ejecutar pruebas integrales con la base PostgreSQL de producción

---

## RECURSOS ÚTILES

### Patrones Establecidos:
- Ver `js/data-normalizer.js` para normalización de datos
- Ver `js/pacientes.js` para estructura de módulo actualizado
- Ver `js/compras.js` para integración con localStorage

### Endpoints Disponibles (Verificados):
- API Base: `http://178.128.72.110:3011/api`
- Autenticación: Bearer token en header Authorization
- Formato: JSON

### Datos Demo:
- Ubicación: `data/demo-data.js`
- Usar como fallback cuando API no disponible

---

## NOTAS IMPORTANTES

1. **Siempre normalizar datos**: Usar `DataNormalizer` para backend
2. **Guardar en localStorage**: Como fallback para persistencia
3. **Validar en cliente**: Mejorar experiencia del usuario
4. **Manejo de errores**: Mostrar mensajes claros
5. **Logs en consola**: Facilita debugging

---

## CONTACTO / PREGUNTAS

Para preguntas sobre implementación, revisar:
- Código existente en módulos similares
- Comentarios en `CORRECCIONES_2026_08_07.md`
- Estructura de backend en `backend/src/`

---

Documento finalizado: 2026-10-01
Versión: 2.0.0
