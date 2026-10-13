#!/bin/bash

# ============================================
# ESTADO DE CUENTA - SCRIPTS RÁPIDOS
# Fecha: 2026-07-01
# Descripción: Ejecuta los comandos en este orden
# ============================================

echo "🔵 Estado de Cuenta - Instalación Rápida"
echo "=========================================="
echo ""

# Configurar variables
DB_NAME="zentra"
DB_USER="postgres"
DB_PATH="/Users/diego/SistemaContable/database"

echo "📍 Rutas:"
echo "  - DB: $DB_NAME"
echo "  - Usuario: $DB_USER"
echo "  - Path: $DB_PATH"
echo ""

# Paso 1
echo "✅ PASO 1: Ejecutar migración de Estado de Cuenta"
echo "Comando:"
echo "  psql -U $DB_USER -d $DB_NAME -f $DB_PATH/estado-de-cuenta-migration.sql"
echo ""
echo "Ejecuta esto en terminal:"
read -p "¿Deseas ejecutarlo ahora? (s/n): " response
if [ "$response" = "s" ]; then
    psql -U $DB_USER -d $DB_NAME -f $DB_PATH/estado-de-cuenta-migration.sql
    if [ $? -eq 0 ]; then
        echo "✅ Migración completada exitosamente"
    else
        echo "❌ Error en la migración"
        exit 1
    fi
fi

echo ""

# Paso 2 - Opcional
echo "✅ PASO 2: Cargar datos de ejemplo (OPCIONAL)"
echo "Comando:"
echo "  psql -U $DB_USER -d $DB_NAME -f $DB_PATH/facturacion-datos-ejemplo.sql"
echo ""
read -p "¿Deseas cargar datos de ejemplo? (s/n): " response
if [ "$response" = "s" ]; then
    psql -U $DB_USER -d $DB_NAME -f $DB_PATH/facturacion-datos-ejemplo.sql
    if [ $? -eq 0 ]; then
        echo "✅ Datos de ejemplo cargados"
    else
        echo "❌ Error cargando datos"
        exit 1
    fi
fi

echo ""
echo "✅ INSTALACIÓN COMPLETADA"
echo ""
echo "Próximos pasos:"
echo "  1. Reinicia el backend:   cd backend && npm start"
echo "  2. Recarga el navegador:  Cmd+Shift+R"
echo "  3. Ve a:  Facturación Mejorada"
echo "  4. Selecciona un paciente"
echo "  5. Haz clic en: '🖨️ Imprimir Estado de Cuenta'"
echo ""
