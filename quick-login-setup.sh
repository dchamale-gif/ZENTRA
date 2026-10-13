#!/bin/bash
# SCRIPT RÁPIDO PARA CONFIGURAR EL LOGIN
# Ejecutar: bash quick-login-setup.sh

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║        🚀 CONFIGURACIÓN RÁPIDA - LOGIN ZENTRA         ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# PASO 1: Verificar Node.js
echo "📋 PASO 1: Verificando Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js no está instalado"
    echo "   Instalar desde: https://nodejs.org/"
    exit 1
fi
echo "✅ Node.js: $(node --version)"
echo ""

# PASO 2: Verificar PostgreSQL
echo "📋 PASO 2: Verificando PostgreSQL..."
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL no está instalado"
    echo "   Instalar: brew install postgresql@15"
    exit 1
fi
echo "✅ PostgreSQL: $(psql --version)"

# Iniciar PostgreSQL
echo "   Iniciando servicio..."
brew services start postgresql@15 2>/dev/null || true
sleep 2
echo "✅ PostgreSQL iniciado"
echo ""

# PASO 3: Crear base de datos
echo "📋 PASO 3: Creando base de datos..."
psql -U postgres -c "CREATE DATABASE zentra;" 2>/dev/null || echo "   (BD probablemente ya existe)"
echo "✅ Base de datos zentra"
echo ""

# PASO 4: Cargar schema
echo "📋 PASO 4: Cargando schema de BD..."
psql -U postgres -d zentra -f database/schema.sql > /dev/null
echo "✅ Schema cargado"
echo ""

# PASO 5: Instalar dependencias
echo "📋 PASO 5: Instalando dependencias del backend..."
cd backend
npm install --silent
echo "✅ Dependencias instaladas"
cd ..
echo ""

# PASO 6: Crear usuario de prueba
echo "📋 PASO 6: Creando usuario de prueba..."
cd backend
node create-test-user.js
cd ..
echo ""

# PASO 7: Instrucciones finales
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              ✅ CONFIGURACIÓN COMPLETADA                   ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "🚀 PASOS FINALES:"
echo ""
echo "1️⃣  INICIAR BACKEND:"
echo "   cd backend"
echo "   npm start"
echo ""
echo "2️⃣  ABRIR FRONTEND (en otra terminal):"
echo "   - Usar VS Code Live Server en index.html"
echo "   - O ejecutar: python3 -m http.server 5500"
echo ""
echo "3️⃣  ACCEDER A:"
echo "   📱 http://localhost:5500/login.html"
echo ""
echo "4️⃣  CREDENCIALES:"
echo "   📧 admin@zentra.com"
echo "   🔐 admin123"
echo ""
echo "═════════════════════════════════════════════════════════════"
