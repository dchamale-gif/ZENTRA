#!/bin/bash

# ============================================
# SCRIPT DE VALIDACIÓN: DATOS REALES EN VIVO
# ============================================
# 
# Este script verifica que el sistema está
# funcionando correctamente con datos reales
# desde la base de datos.
#
# Uso: bash verify-real-data.sh <token>
# ============================================

if [ -z "$1" ]; then
    echo "❌ Error: Token de autenticación requerido"
    echo "Uso: bash verify-real-data.sh <your_auth_token>"
    echo ""
    echo "Obtén el token:"
    echo "1. Abre http://localhost:3000 en navegador"
    echo "2. Inicia sesión"
    echo "3. Abre DevTools (F12) > Console"
    echo "4. Ejecuta: localStorage.getItem('auth_token')"
    exit 1
fi

TOKEN=$1
BASE_URL="http://localhost:3011/api"

echo "🔍 Verificando conexión a APIs reales..."
echo ""

# Función para hacer llamadas
call_api() {
    local endpoint=$1
    local label=$2
    echo "📡 Consultando: $label"
    echo "   Endpoint: $endpoint"
    
    response=$(curl -s -w "\n%{http_code}" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        "$BASE_URL$endpoint")
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" = "200" ]; then
        echo "   ✅ Status: $http_code"
        # Contar elementos si es array
        count=$(echo "$body" | grep -o '"' | wc -l)
        echo "   📊 Respuesta: $body" | head -c 100
        echo "..."
        echo ""
    else
        echo "   ❌ Status: $http_code"
        echo "   Error: $body"
        echo ""
    fi
}

# Hacer llamadas a diferentes endpoints
call_api "/doctors" "DOCTORES"
call_api "/doctors/specialties/list" "ESPECIALIDADES"
call_api "/appointments/today" "CITAS DE HOY"
call_api "/expenses" "GASTOS"
call_api "/receivables" "CUENTAS POR COBRAR"
call_api "/pacientes" "PACIENTES"
call_api "/medicinas" "MEDICINAS"
call_api "/proveedores" "PROVEEDORES"
call_api "/reports/financial-summary" "REPORTES FINANCIEROS"

echo "============================================"
echo "✅ Validación completada"
echo "============================================"
echo ""
echo "🎯 Resultado:"
echo "✅ Si todos los endpoints devolvieron 200: Sistema operativo"
echo "❌ Si alguno falló: Revisar backend o autenticación"
echo ""
