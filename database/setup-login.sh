#!/bin/bash

# ============================================
# SCRIPT PARA ACTUALIZAR BD - LOGIN Y REGISTRO
# ============================================
# Este script actualiza la base de datos existente
# para que funcione el login y registro
# 
# Uso: bash database/setup-login.sh
# ============================================

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║      🔐 ACTUALIZAR BD PARA LOGIN Y REGISTRO               ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Verificar que PostgreSQL está disponible
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL no está instalado"
    exit 1
fi

# Solicitar credenciales si no están en .env
if [ ! -f "backend/.env" ]; then
    echo "❌ Archivo backend/.env no encontrado"
    echo "   Por favor crear el archivo primero"
    exit 1
fi

# Cargar variables de ambiente
export $(grep -v '^#' backend/.env | xargs)

DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_USER=${DB_USER:-postgres}
DB_NAME=${DB_NAME:-zentra}

echo "📋 Configuración:"
echo "   Host: $DB_HOST"
echo "   Puerto: $DB_PORT"
echo "   Usuario: $DB_USER"
echo "   BD: $DB_NAME"
echo ""

# Solicitar contraseña si es necesario
if [ -z "$DB_PASSWORD" ]; then
    echo "🔐 Ingresa la contraseña de PostgreSQL:"
    read -s DB_PASSWORD
    echo ""
fi

# Verificar conexión
echo "📡 Verificando conexión a BD..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT NOW();" > /dev/null 2>&1

if [ $? -ne 0 ]; then
    echo "❌ No se pudo conectar a la base de datos"
    echo "   Verifica las credenciales en backend/.env"
    exit 1
fi

echo "✅ Conexión exitosa"
echo ""

# Ejecutar el script de migración
echo "🔧 Ejecutando migración..."
echo ""

PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f database/migration-login-setup.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║           ✅ MIGRACIÓN COMPLETADA CON ÉXITO               ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    echo "📊 Resumen de cambios:"
    echo "   ✓ Actualizadas columnas en tabla users"
    echo "   ✓ Creada tabla login_attempts"
    echo "   ✓ Creada tabla password_reset_tokens"
    echo "   ✓ Creada tabla user_sessions"
    echo "   ✓ Creados índices de optimización"
    echo "   ✓ Insertados roles y permisos"
    echo "   ✓ Creado usuario admin"
    echo ""
    echo "🔑 Usuario por defecto:"
    echo "   Email:      admin@zentra.com"
    echo "   Contraseña: admin123"
    echo ""
    echo "⚠️  IMPORTANTE: Cambia la contraseña en producción"
    echo ""
    
    # Obtener estadísticas
    echo "📈 Estadísticas de BD:"
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "
    SELECT 
        'Usuarios: ' || count(*) FROM users
    UNION ALL
    SELECT 'Roles: ' || count(*) FROM roles
    UNION ALL
    SELECT 'Permisos: ' || count(*) FROM permissions;
    "
else
    echo ""
    echo "❌ ERROR EN LA MIGRACIÓN"
    echo "   Revisa los errores arriba"
    exit 1
fi
