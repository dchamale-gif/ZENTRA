#!/bin/bash
# Script para desplegar frontend en el servidor

set -e  # Exit on error

echo "🚀 Iniciando deploy del frontend..."

# Variables
REMOTE_USER="root"
REMOTE_HOST="178.128.72.110"
REMOTE_PATH="/opt/stack/ZentraHSC"
LOCAL_PATH="/Users/diego/SistemaContable"

# Crear carpeta public en el servidor
echo "📁 Creando carpeta public en el servidor..."
ssh ${REMOTE_USER}@${REMOTE_HOST} "mkdir -p ${REMOTE_PATH}/public"

# Copiar archivos del frontend
echo "📦 Copiando archivos del frontend..."
scp -r ${LOCAL_PATH}/index.html ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/public/
scp -r ${LOCAL_PATH}/login.html ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/public/
scp -r ${LOCAL_PATH}/css ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/public/
scp -r ${LOCAL_PATH}/js ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/public/
scp -r ${LOCAL_PATH}/img ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/public/
scp -r ${LOCAL_PATH}/data ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/public/

# Actualizar código del backend
echo "🔄 Actualizando código del backend..."
ssh ${REMOTE_USER}@${REMOTE_HOST} "cd ${REMOTE_PATH}/backend && git pull origin main"

# Reiniciar la aplicación
echo "♻️  Reiniciando aplicación con pm2..."
ssh ${REMOTE_USER}@${REMOTE_HOST} "pm2 restart zentra-app"

# Mostrar logs
echo "📋 Logs de la aplicación:"
ssh ${REMOTE_USER}@${REMOTE_HOST} "pm2 logs zentra-app --lines 20"

echo "✅ Deploy completado"
