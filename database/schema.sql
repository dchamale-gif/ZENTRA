-- ============================================
-- ZENTRA - SCHEMA DE BASE DE DATOS
-- PostgreSQL / MySQL
-- ============================================

-- ============================================
-- 1. USUARIOS Y AUTENTICACIÓN
-- ============================================

-- Tabla de Roles
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) UNIQUE NOT NULL,
    descripcion VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Usuarios
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100),
    telefono VARCHAR(20),
    activo BOOLEAN DEFAULT true,
    verificado BOOLEAN DEFAULT false,
    ultimo_login TIMESTAMP,
    ultimo_login_fallido TIMESTAMP,
    intentos_login_fallidos INTEGER DEFAULT 0,
    bloqueado_hasta TIMESTAMP,
    email_verificado_en TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de asignación de roles (Usuario - Rol)
CREATE TABLE user_roles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, role_id)
);

-- Tabla de Permisos
CREATE TABLE permissions (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE NOT NULL,
    descripcion VARCHAR(255),
    modulo VARCHAR(50),
    accion VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de asignación de permisos a roles
CREATE TABLE role_permissions (
    id SERIAL PRIMARY KEY,
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(role_id, permission_id)
);

-- ============================================
-- SEGURIDAD - AUTENTICACIÓN
-- ============================================

-- Tabla de Intentos de Login
CREATE TABLE login_attempts (
    id SERIAL PRIMARY KEY,
    email VARCHAR(100) NOT NULL,
    ip_address VARCHAR(50),
    user_agent TEXT,
    exitoso BOOLEAN DEFAULT false,
    razon_fallo VARCHAR(255),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (email) REFERENCES users(email) ON DELETE CASCADE
);

-- Tabla de Tokens de Recuperación de Contraseña
CREATE TABLE password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(100) NOT NULL,
    usado BOOLEAN DEFAULT false,
    usado_en TIMESTAMP,
    expira_en TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Sesiones Activas
CREATE TABLE user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) UNIQUE NOT NULL,
    ip_address VARCHAR(50),
    user_agent TEXT,
    activa BOOLEAN DEFAULT true,
    login_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    logout_en TIMESTAMP,
    ultima_actividad TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expira_en TIMESTAMP NOT NULL
);

-- ============================================
-- 2. PACIENTES Y DATOS PERSONALES
-- ============================================

-- Tabla de Pacientes (Datos principales)
CREATE TABLE pacientes (
    id VARCHAR(50) PRIMARY KEY,
    -- Datos de consulta
    fecha_primer_consulta DATE,
    motivo_consulta TEXT,
    referencia VARCHAR(255),
    
    -- Identificación personal
    nombre VARCHAR(100) NOT NULL,
    apellido_paterno VARCHAR(100) NOT NULL,
    apellido_materno VARCHAR(100),
    edad INTEGER,
    fecha_nacimiento DATE,
    nacionalidad VARCHAR(50),
    genero VARCHAR(20),
    dpi VARCHAR(20) UNIQUE,
    pasaporte VARCHAR(50),
    
    -- Ubicación
    direccion VARCHAR(255),
    colonia VARCHAR(100),
    zona VARCHAR(50),
    municipio VARCHAR(100),
    departamento VARCHAR(100),
    originario_de VARCHAR(100),
    
    -- Contacto
    telefono VARCHAR(20),
    email VARCHAR(100),
    vive_con VARCHAR(100),
    tiene_hijos BOOLEAN,
    
    -- Información laboral/educativa
    estado_civil VARCHAR(50),
    profesion VARCHAR(100),
    grado_academico VARCHAR(100),
    ocupacion VARCHAR(100),
    
    -- Tipo de servicio
    tipo_servicio VARCHAR(50), -- agudo, cronico, coex
    clasificacion VARCHAR(100),
    segmento_coex VARCHAR(100),
    
    -- Información adicional
    foto TEXT, -- Base64 encoded image
    is_cliente BOOLEAN DEFAULT false,
    cliente_id VARCHAR(50),
    fecha_registro DATE NOT NULL DEFAULT CURRENT_DATE,
    notas TEXT,
    
    estado VARCHAR(20) DEFAULT 'activo',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Empresa (Lugar de trabajo)
CREATE TABLE empresas (
    id SERIAL PRIMARY KEY,
    paciente_id VARCHAR(50) NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    nombre VARCHAR(150),
    telefono VARCHAR(20),
    direccion VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Contacto de Emergencia
CREATE TABLE contactos_emergencia (
    id SERIAL PRIMARY KEY,
    paciente_id VARCHAR(50) NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    nombre VARCHAR(150),
    telefono VARCHAR(20),
    parentesco VARCHAR(50),
    direccion VARCHAR(255),
    tipo VARCHAR(20) DEFAULT 'principal', -- 'principal' o 'secundario'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Historial Médico
CREATE TABLE historial_medico (
    id SERIAL PRIMARY KEY,
    paciente_id VARCHAR(50) NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    padece_cronica BOOLEAN,
    especificacion_cronica TEXT,
    toma_medicamento BOOLEAN,
    especificacion_medicamento TEXT,
    padece_alergia BOOLEAN,
    especificacion_alergia TEXT,
    utiliza_protesis BOOLEAN,
    especificacion_protesis TEXT,
    ha_convulsionado BOOLEAN,
    ultimo_procedimiento VARCHAR(255),
    fecha_procedimiento DATE,
    examenes_lab VARCHAR(255),
    fecha_examenes DATE,
    ultimo_periodo DATE,
    edad_primera_menstruacion INTEGER,
    cantidad_gestas INTEGER,
    cantidad_partos INTEGER,
    tuvo_embarazos BOOLEAN,
    cantidad_embarazos_hist INTEGER,
    dias_periodo_hist INTEGER,
    tratamiento_psiquiatrico BOOLEAN,
    tipo_sustancia VARCHAR(255),
    tiempo_consumo VARCHAR(100),
    frecuencia_consumo VARCHAR(50),
    via_administracion VARCHAR(100),
    intentos_rehabilitacion INTEGER,
    ultimo_tratamiento DATE,
    motivacion_tratamiento TEXT,
    comorbilidad BOOLEAN,
    especificacion_comorbilidad TEXT,
    antecedentes_legales BOOLEAN,
    especificacion_legales TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Laboratorios
CREATE TABLE laboratorios (
    id SERIAL PRIMARY KEY,
    paciente_id VARCHAR(50) NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    tipo VARCHAR(150) NOT NULL,
    fecha DATE NOT NULL,
    resultado TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Órdenes
CREATE TABLE ordenes (
    id SERIAL PRIMARY KEY,
    paciente_id VARCHAR(50) NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    tipo VARCHAR(50) NOT NULL, -- 'ejercicio', 'alimentacion', 'medicamento', 'descanso', 'higiene', 'otro'
    descripcion TEXT NOT NULL,
    estado VARCHAR(50) DEFAULT 'pendiente', -- 'pendiente', 'en_progreso', 'completada'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Alertas
CREATE TABLE alertas (
    id SERIAL PRIMARY KEY,
    paciente_id VARCHAR(50) NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    tipo VARCHAR(50) NOT NULL, -- 'alergia', 'medicamento', 'riesgo', 'otro'
    descripcion TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para laboratorios
CREATE INDEX idx_laboratorios_paciente ON laboratorios(paciente_id);

-- Índices para órdenes
CREATE INDEX idx_ordenes_paciente ON ordenes(paciente_id);

-- Índices para alertas
CREATE INDEX idx_alertas_paciente ON alertas(paciente_id);

-- Tabla de Datos Familiares
CREATE TABLE datos_familia (
    id SERIAL PRIMARY KEY,
    paciente_id VARCHAR(50) NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    
    -- Padre
    padre_nombre VARCHAR(150),
    padre_vivo BOOLEAN,
    padre_ocupacion VARCHAR(100),
    padre_telefono VARCHAR(20),
    
    -- Madre
    madre_nombre VARCHAR(150),
    madre_vivo BOOLEAN,
    madre_ocupacion VARCHAR(100),
    madre_telefono VARCHAR(20),
    
    -- Pareja
    pareja_nombre VARCHAR(150),
    pareja_vivo BOOLEAN,
    pareja_ocupacion VARCHAR(100),
    pareja_telefono VARCHAR(20),
    
    -- Hermanos
    hermanos_numero INTEGER,
    hermanos_observaciones TEXT,
    
    -- Hijos
    hijos_numero INTEGER,
    hijos_observaciones TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Responsable del Paciente
CREATE TABLE responsables_paciente (
    id SERIAL PRIMARY KEY,
    paciente_id VARCHAR(50) NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    nombre VARCHAR(150) NOT NULL,
    relacion VARCHAR(100),
    telefono VARCHAR(20),
    email VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Documentos y Fotografías
CREATE TABLE documentos_paciente (
    id VARCHAR(50) PRIMARY KEY,
    paciente_id VARCHAR(50) NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    categoria VARCHAR(100), -- DPI_Paciente, Pasaporte_Paciente, DPI_Responsable, Pasaporte_Responsable, Foto_Perfil_Responsable, Documentos_Medicos, Otros
    nombre_archivo VARCHAR(255),
    contenido TEXT, -- Base64 encoded image
    timestamp_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 3. CLIENTES Y RELACIONES
-- ============================================

-- Tabla de Clientes
CREATE TABLE clientes (
    id VARCHAR(50) PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    email VARCHAR(100) UNIQUE,
    telefono VARCHAR(20),
    razon_social VARCHAR(150),
    nit VARCHAR(20),
    contacto_principal VARCHAR(150),
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla relacional: Paciente - Cliente
CREATE TABLE paciente_cliente (
    id VARCHAR(50) PRIMARY KEY,
    paciente_id VARCHAR(50) NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    cliente_id VARCHAR(50) NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    fecha_asignacion DATE DEFAULT CURRENT_DATE,
    UNIQUE(paciente_id, cliente_id)
);

-- ============================================
-- 4. CLÍNICA - HISTORIA MÉDICA
-- ============================================

-- ============================================
-- 4. CLÍNICA - HISTORIA MÉDICA
-- ============================================

-- Tabla de Historia Clínica
CREATE TABLE historia_clinica (
    id VARCHAR(50) PRIMARY KEY,
    paciente_id VARCHAR(50) NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    doctor_id INTEGER REFERENCES users(id),
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    hora TIME,
    diagnostico TEXT,
    sintomas TEXT,
    antecedentes TEXT,
    tratamiento TEXT,
    medicinas_recetadas TEXT,
    observaciones TEXT,
    estado VARCHAR(20) DEFAULT 'activo',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Diagnósticos Activos
CREATE TABLE diagnosticos_paciente (
    id VARCHAR(50) PRIMARY KEY,
    paciente_id VARCHAR(50) NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    codigo_cie10 VARCHAR(50),
    descripcion VARCHAR(255) NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE,
    estado VARCHAR(20) DEFAULT 'activo',
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Habitaciones y camas
CREATE TABLE habitaciones (
    id VARCHAR(50) PRIMARY KEY,
    numero INTEGER NOT NULL,
    piso VARCHAR(20) DEFAULT 'Plano',
    tipo VARCHAR(50),
    orden INTEGER DEFAULT 0,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE camas (
    id VARCHAR(50) PRIMARY KEY,
    habitacion_id VARCHAR(50) NOT NULL REFERENCES habitaciones(id),
    numero_cama INTEGER NOT NULL,
    estado VARCHAR(20) DEFAULT 'libre',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(habitacion_id, numero_cama)
);

-- Tabla de Hospitalizaciones
CREATE TABLE hospitalizaciones (
    id VARCHAR(50) PRIMARY KEY,
    paciente_id VARCHAR(50) NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    doctor_id INTEGER REFERENCES users(id),
    cama_id VARCHAR(50) REFERENCES camas(id),
    fecha_entrada DATE NOT NULL DEFAULT CURRENT_DATE,
    hora_entrada TIME,
    fecha_salida DATE,
    hora_salida TIME,
    motivo TEXT NOT NULL,
    diagnostico TEXT,
    tratamiento TEXT,
    estado VARCHAR(20) DEFAULT 'activa',
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE traslados_camas (
    id VARCHAR(50) PRIMARY KEY,
    hospitalizacion_id VARCHAR(50) NOT NULL REFERENCES hospitalizaciones(id) ON DELETE CASCADE,
    cama_origen_id VARCHAR(50) NOT NULL REFERENCES camas(id),
    cama_destino_id VARCHAR(50) NOT NULL REFERENCES camas(id),
    fecha_traslado DATE NOT NULL DEFAULT CURRENT_DATE,
    hora_traslado TIME NOT NULL DEFAULT CURRENT_TIME,
    razon TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 5. INVENTARIO Y MEDICINAS
-- ============================================

-- Tabla de Medicinas
CREATE TABLE medicinas (
    id VARCHAR(50) PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    seccion VARCHAR(100) DEFAULT 'SEC-001',
    familia VARCHAR(100),
    subfamilia VARCHAR(100),
    principio_activo VARCHAR(150),
    concentracion VARCHAR(50),
    forma_farmaceutica VARCHAR(50),
    presentacion VARCHAR(50),
    cantidad INTEGER NOT NULL DEFAULT 0,
    cantidad_minima INTEGER DEFAULT 10,
    precio_costo DECIMAL(10, 2) NOT NULL,
    precio_venta DECIMAL(10, 2) NOT NULL,
    lote VARCHAR(50),
    fecha_vencimiento DATE,
    proveedor_id VARCHAR(50),
    codigo_externo VARCHAR(50),
    codigo_barra VARCHAR(50),
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Medicamentos Asignados a Paciente
CREATE TABLE medicamentos_paciente (
    id VARCHAR(50) PRIMARY KEY,
    paciente_id VARCHAR(50) NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    medicina_id VARCHAR(50) NOT NULL REFERENCES medicinas(id),
    dosis VARCHAR(100),
    frecuencia VARCHAR(100),
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE,
    indicaciones TEXT,
    estado VARCHAR(20) DEFAULT 'activo',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Proveedores
CREATE TABLE proveedores (
    id VARCHAR(50) PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    email VARCHAR(100),
    telefono VARCHAR(20),
    direccion VARCHAR(255),
    ciudad VARCHAR(100),
    razon_social VARCHAR(150),
    nit VARCHAR(20),
    contacto VARCHAR(100),
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Códigos de Artículos
CREATE TABLE codigos_articulos (
    id VARCHAR(50) PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    nombre_articulo VARCHAR(150) NOT NULL,
    descripcion TEXT,
    categoria VARCHAR(100),
    familia VARCHAR(100),
    precio_unitario DECIMAL(10, 2),
    cantidad_disponible INTEGER DEFAULT 0,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 6. COMPRAS
-- ============================================

-- Tabla de Compras
CREATE TABLE compras (
    id VARCHAR(50) PRIMARY KEY,
    numero_compra VARCHAR(50) UNIQUE NOT NULL,
    proveedor_id VARCHAR(50) NOT NULL REFERENCES proveedores(id),
    user_id INTEGER REFERENCES users(id),
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_entrega DATE,
    total DECIMAL(12, 2) NOT NULL,
    estado VARCHAR(20) DEFAULT 'pendiente',
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Items de Compra
CREATE TABLE compra_items (
    id VARCHAR(50) PRIMARY KEY,
    compra_id VARCHAR(50) NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
    medicina_id VARCHAR(50) REFERENCES medicinas(id),
    articulo_id VARCHAR(50) REFERENCES codigos_articulos(id),
    cantidad INTEGER NOT NULL,
    precio_unitario DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(12, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 7. VENTAS Y SERVICIOS
-- ============================================

-- Tabla de Ventas
CREATE TABLE ventas (
    id VARCHAR(50) PRIMARY KEY,
    numero_venta VARCHAR(50) UNIQUE NOT NULL,
    paciente_id VARCHAR(50) REFERENCES pacientes(id),
    cliente_id VARCHAR(50) REFERENCES clientes(id),
    user_id INTEGER REFERENCES users(id),
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    hora TIME,
    subtotal DECIMAL(12, 2) NOT NULL,
    descuento DECIMAL(12, 2) DEFAULT 0,
    impuesto DECIMAL(12, 2) DEFAULT 0,
    total DECIMAL(12, 2) NOT NULL,
    metodo_pago VARCHAR(50),
    estado VARCHAR(20) DEFAULT 'completada',
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Items de Venta
CREATE TABLE venta_items (
    id VARCHAR(50) PRIMARY KEY,
    venta_id VARCHAR(50) NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    medicina_id VARCHAR(50) REFERENCES medicinas(id),
    articulo_id VARCHAR(50) REFERENCES codigos_articulos(id),
    cantidad INTEGER NOT NULL,
    precio_unitario DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(12, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Servicios
CREATE TABLE servicios (
    id VARCHAR(50) PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    precio DECIMAL(10, 2) NOT NULL,
    duracion_minutos INTEGER,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Servicios facturados
CREATE TABLE servicios_facturados (
    id VARCHAR(50) PRIMARY KEY,
    paciente_id VARCHAR(50) NOT NULL REFERENCES pacientes(id),
    servicio_id VARCHAR(50) NOT NULL REFERENCES servicios(id),
    doctor_id INTEGER REFERENCES users(id),
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    hora TIME,
    cantidad INTEGER DEFAULT 1,
    precio_unitario DECIMAL(10, 2) NOT NULL,
    total DECIMAL(12, 2) NOT NULL,
    estado VARCHAR(20) DEFAULT 'completado',
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 8. FINANZAS - CAJA
-- ============================================

-- Tabla de Caja (Entrada/Salida)
CREATE TABLE caja (
    id VARCHAR(50) PRIMARY KEY,
    tipo VARCHAR(20) NOT NULL, -- entrada, salida
    tipo_movimiento VARCHAR(50),
    concepto VARCHAR(150) NOT NULL,
    categoria VARCHAR(100),
    monto DECIMAL(12, 2) NOT NULL,
    descripcion TEXT,
    paciente_id VARCHAR(50) REFERENCES pacientes(id),
    referencia VARCHAR(100),
    referencia_venta_id VARCHAR(50) REFERENCES ventas(id),
    referencia_compra_id VARCHAR(50) REFERENCES compras(id),
    user_id INTEGER REFERENCES users(id),
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    hora TIME,
    saldo_anterior DECIMAL(12, 2),
    saldo_posterior DECIMAL(12, 2),
    estado VARCHAR(20) DEFAULT 'activo',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Estados de Cuenta
CREATE TABLE estados_cuenta (
    id VARCHAR(50) PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    tipo_cuenta VARCHAR(50),
    saldo_inicial DECIMAL(12, 2) DEFAULT 0,
    saldo_actual DECIMAL(12, 2) DEFAULT 0,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Cuentas por Cobrar
CREATE TABLE cuentas_por_cobrar (
    id VARCHAR(50) PRIMARY KEY,
    paciente_id VARCHAR(50) REFERENCES pacientes(id),
    cliente_id VARCHAR(50) REFERENCES clientes(id),
    monto_total DECIMAL(12, 2) NOT NULL,
    monto_pagado DECIMAL(12, 2) DEFAULT 0,
    monto_pendiente DECIMAL(12, 2) NOT NULL,
    referencia_venta_id VARCHAR(50) REFERENCES ventas(id),
    fecha_vencimiento DATE,
    estado VARCHAR(20) DEFAULT 'pendiente',
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Pagos (Cuentas por Cobrar)
CREATE TABLE pagos_cuentas (
    id VARCHAR(50) PRIMARY KEY,
    cuenta_id VARCHAR(50) NOT NULL REFERENCES cuentas_por_cobrar(id),
    monto DECIMAL(12, 2) NOT NULL,
    metodo_pago VARCHAR(50),
    referencia VARCHAR(100),
    fecha_pago DATE NOT NULL DEFAULT CURRENT_DATE,
    user_id INTEGER REFERENCES users(id),
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 9. AUDITORÍA - LOG DE OPERACIONES
-- ============================================

-- Tabla de Audit Log
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    accion VARCHAR(50) NOT NULL,
    tabla_afectada VARCHAR(100) NOT NULL,
    registro_id VARCHAR(50),
    ip_address VARCHAR(50),
    user_agent TEXT,
    datos_antes TEXT,
    datos_despues TEXT,
    cambios TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 10. RESERVAS Y AGENDA
-- ============================================

-- Tabla de Reservas Web
CREATE TABLE reservas (
    id VARCHAR(50) PRIMARY KEY,
    nombre_paciente VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    telefono VARCHAR(20),
    fecha_reserva DATE NOT NULL,
    hora_reserva TIME NOT NULL,
    doctor_id INTEGER REFERENCES users(id),
    servicio_id VARCHAR(50) REFERENCES servicios(id),
    estado VARCHAR(20) DEFAULT 'pendiente',
    notas TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Agenda (eventos del doctor)
CREATE TABLE agenda (
    id VARCHAR(50) PRIMARY KEY,
    doctor_id INTEGER NOT NULL REFERENCES users(id),
    titulo VARCHAR(150) NOT NULL,
    descripcion TEXT,
    fecha DATE NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    tipo VARCHAR(50), -- cita, disponibilidad, bloqueo
    reserva_id VARCHAR(50) REFERENCES reservas(id),
    paciente_id VARCHAR(50) REFERENCES pacientes(id),
    ubicacion VARCHAR(100),
    recordatorio_minutos INTEGER DEFAULT 15,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 11. CONFIGURACIÓN
-- ============================================

-- Tabla de Configuración Global
CREATE TABLE configuracion (
    id SERIAL PRIMARY KEY,
    clave VARCHAR(100) UNIQUE NOT NULL,
    valor VARCHAR(500),
    tipo VARCHAR(20),
    descripcion TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- ÍNDICES PARA OPTIMIZACIÓN
-- ============================================

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_activo ON users(activo);
CREATE INDEX idx_pacientes_dpi ON pacientes(dpi);
CREATE INDEX idx_pacientes_email ON pacientes(email);
CREATE INDEX idx_pacientes_estado ON pacientes(estado);
CREATE INDEX idx_pacientes_cliente ON pacientes(is_cliente);
CREATE INDEX idx_empresas_paciente ON empresas(paciente_id);
CREATE INDEX idx_contactos_emergencia_paciente ON contactos_emergencia(paciente_id);
CREATE INDEX idx_historial_medico_paciente ON historial_medico(paciente_id);
CREATE INDEX idx_datos_familia_paciente ON datos_familia(paciente_id);
CREATE INDEX idx_responsables_paciente ON responsables_paciente(paciente_id);
CREATE INDEX idx_documentos_paciente ON documentos_paciente(paciente_id);
CREATE INDEX idx_documentos_categoria ON documentos_paciente(categoria);
CREATE INDEX idx_clientes_activo ON clientes(activo);
CREATE INDEX idx_paciente_cliente ON paciente_cliente(paciente_id, cliente_id);
CREATE INDEX idx_historia_clinica_paciente ON historia_clinica(paciente_id);
CREATE INDEX idx_historia_clinica_doctor ON historia_clinica(doctor_id);
CREATE INDEX idx_historia_clinica_fecha ON historia_clinica(fecha);
CREATE INDEX idx_diagnosticos_paciente ON diagnosticos_paciente(paciente_id);
CREATE INDEX idx_diagnosticos_estado ON diagnosticos_paciente(estado);
CREATE INDEX idx_hospitalizaciones_paciente ON hospitalizaciones(paciente_id);
CREATE INDEX idx_hospitalizaciones_estado ON hospitalizaciones(estado);
CREATE INDEX idx_medicinas_activo ON medicinas(activo);
CREATE INDEX idx_medicinas_vencimiento ON medicinas(fecha_vencimiento);
CREATE INDEX idx_medicamentos_paciente ON medicamentos_paciente(paciente_id);
CREATE INDEX idx_medicamentos_estado ON medicamentos_paciente(estado);
CREATE INDEX idx_compras_fecha ON compras(fecha);
CREATE INDEX idx_compras_estado ON compras(estado);
CREATE INDEX idx_compras_proveedor ON compras(proveedor_id);
CREATE INDEX idx_ventas_fecha ON ventas(fecha);
CREATE INDEX idx_ventas_paciente ON ventas(paciente_id);
CREATE INDEX idx_ventas_cliente ON ventas(cliente_id);
CREATE INDEX idx_ventas_estado ON ventas(estado);
CREATE INDEX idx_caja_fecha ON caja(fecha);
CREATE INDEX idx_caja_tipo ON caja(tipo);
CREATE INDEX idx_cuentas_por_cobrar_estado ON cuentas_por_cobrar(estado);
CREATE INDEX idx_cuentas_por_cobrar_paciente ON cuentas_por_cobrar(paciente_id);
CREATE INDEX idx_cuentas_por_cobrar_cliente ON cuentas_por_cobrar(cliente_id);
CREATE INDEX idx_servicios_activo ON servicios(activo);
CREATE INDEX idx_servicios_facturados_paciente ON servicios_facturados(paciente_id);
CREATE INDEX idx_servicios_facturados_fecha ON servicios_facturados(fecha);
CREATE INDEX idx_reservas_fecha ON reservas(fecha_reserva);
CREATE INDEX idx_reservas_estado ON reservas(estado);
CREATE INDEX idx_agenda_doctor_fecha ON agenda(doctor_id, fecha);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_tabla ON audit_log(tabla_afectada);
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);

-- ============================================
-- INSERTS INICIALES
-- ============================================

-- Roles iniciales
INSERT INTO roles (nombre, descripcion) VALUES
('admin', 'Administrador del sistema'),
('doctor', 'Médico - Acceso a pacientes y clínica'),
('enfermera', 'Enfermera - Acceso limitado a historias'),
('recepcionista', 'Recepcionista - Gestión de citas y datos pacientes'),
('gerente_compras', 'Gerente de Compras - Gestión de inventario'),
('contador', 'Contador - Acceso a finanzas y reportes');

-- Permisos iniciales
INSERT INTO permissions (nombre, descripcion, modulo, accion) VALUES
-- Dashboard
('dashboard_view', 'Ver dashboard', 'dashboard', 'view'),

-- Pacientes
('pacientes_view', 'Ver pacientes', 'pacientes', 'view'),
('pacientes_create', 'Crear pacientes', 'pacientes', 'create'),
('pacientes_edit', 'Editar pacientes', 'pacientes', 'edit'),
('pacientes_delete', 'Eliminar pacientes', 'pacientes', 'delete'),

-- Historia Clínica
('historia_view', 'Ver historia clínica', 'historia_clinica', 'view'),
('historia_create', 'Crear registro clínico', 'historia_clinica', 'create'),
('historia_edit', 'Editar historia clínica', 'historia_clinica', 'edit'),

-- Medicinas
('medicinas_view', 'Ver medicinas', 'medicinas', 'view'),
('medicinas_edit', 'Editar medicinas', 'medicinas', 'edit'),
('medicinas_delete', 'Eliminar medicinas', 'medicinas', 'delete'),

-- Medicamentos
('medicamentos_view', 'Ver medicamentos asignados', 'medicamentos', 'view'),
('medicamentos_create', 'Asignar medicamentos', 'medicamentos', 'create'),
('medicamentos_edit', 'Editar medicamentos', 'medicamentos', 'edit'),
('medicamentos_delete', 'Eliminar medicamentos', 'medicamentos', 'delete'),

-- Compras
('compras_view', 'Ver compras', 'compras', 'view'),
('compras_create', 'Crear compras', 'compras', 'create'),
('compras_edit', 'Editar compras', 'compras', 'edit'),

-- Ventas
('ventas_view', 'Ver ventas', 'ventas', 'view'),
('ventas_create', 'Crear ventas', 'ventas', 'create'),

-- Caja
('caja_view', 'Ver caja', 'caja', 'view'),
('caja_edit', 'Editar movimientos caja', 'caja', 'edit'),

-- Clientes
('clientes_view', 'Ver clientes', 'clientes', 'view'),
('clientes_create', 'Crear clientes', 'clientes', 'create'),
('clientes_edit', 'Editar clientes', 'clientes', 'edit'),

-- Reportes
('reportes_view', 'Ver reportes', 'reportes', 'view'),
('reportes_export', 'Exportar reportes', 'reportes', 'export'),

-- Administración
('admin_users', 'Administrar usuarios', 'admin', 'all'),
('admin_config', 'Administrar configuración', 'admin', 'all'),
('audit_view', 'Ver logs de auditoría', 'audit', 'view');

-- ============================================
-- COMENTARIOS DE TABLAS
-- ============================================

COMMENT ON TABLE users IS 'Usuarios del sistema';
COMMENT ON TABLE roles IS 'Roles disponibles en el sistema';
COMMENT ON TABLE permissions IS 'Permisos por módulo';
COMMENT ON TABLE pacientes IS 'Registro principal de pacientes con todos los datos personales';
COMMENT ON TABLE empresas IS 'Información del lugar de trabajo de pacientes';
COMMENT ON TABLE contactos_emergencia IS 'Contactos de emergencia para pacientes';
COMMENT ON TABLE historial_medico IS 'Historial médico completo del paciente';
COMMENT ON TABLE datos_familia IS 'Información de familia del paciente';
COMMENT ON TABLE responsables_paciente IS 'Responsables asignados a pacientes';
COMMENT ON TABLE documentos_paciente IS 'Documentos y fotografías del paciente (DPI, pasaporte, etc)';
COMMENT ON TABLE clientes IS 'Clientes/empresas que contratan servicios';
COMMENT ON TABLE historia_clinica IS 'Registros de atenciones clínicas de pacientes';
COMMENT ON TABLE diagnosticos_paciente IS 'Diagnósticos activos y pasados de pacientes';
COMMENT ON TABLE hospitalizaciones IS 'Registro de hospitalizaciones';
COMMENT ON TABLE medicinas IS 'Inventario de medicinas disponibles';
COMMENT ON TABLE medicamentos_paciente IS 'Medicamentos asignados a pacientes';
COMMENT ON TABLE compras IS 'Registro de compras a proveedores';
COMMENT ON TABLE ventas IS 'Registro de ventas de medicinas y servicios';
COMMENT ON TABLE servicios IS 'Servicios médicos disponibles';
COMMENT ON TABLE servicios_facturados IS 'Servicios facturados a pacientes';
COMMENT ON TABLE caja IS 'Movimientos de caja (entradas y salidas)';
COMMENT ON TABLE cuentas_por_cobrar IS 'Cuentas pendientes de cobro';
COMMENT ON TABLE reservas IS 'Reservas de citas web';
COMMENT ON TABLE agenda IS 'Agenda de doctores con citas y disponibilidad';

-- ============================================
-- FIN DEL SCHEMA
-- ============================================
