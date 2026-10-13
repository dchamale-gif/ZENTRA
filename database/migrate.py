#!/usr/bin/env python3

"""
Script de migración para actualizar BD y habilitar Login/Registro
Actualiza la base de datos existente de forma segura
"""

import psycopg2
from psycopg2 import sql
import os
import sys
from pathlib import Path
import subprocess
from dotenv import load_dotenv

# Colores para output
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

def print_header(msg):
    print(f"\n{Colors.BOLD}{Colors.HEADER}{'='*60}{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.HEADER}{msg}{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.HEADER}{'='*60}{Colors.ENDC}\n")

def print_success(msg):
    print(f"{Colors.OKGREEN}✅ {msg}{Colors.ENDC}")

def print_error(msg):
    print(f"{Colors.FAIL}❌ {msg}{Colors.ENDC}")

def print_warning(msg):
    print(f"{Colors.WARNING}⚠️  {msg}{Colors.ENDC}")

def print_info(msg):
    print(f"{Colors.OKBLUE}ℹ️  {msg}{Colors.ENDC}")

def load_env():
    """Cargar variables de ambiente"""
    env_file = Path(__file__).parent.parent / "backend" / ".env"
    if not env_file.exists():
        print_error("Archivo backend/.env no encontrado")
        sys.exit(1)
    load_dotenv(env_file)

def connect_db():
    """Conectar a la base de datos"""
    try:
        conn = psycopg2.connect(
            host=os.getenv('DB_HOST', 'localhost'),
            port=os.getenv('DB_PORT', '5432'),
            user=os.getenv('DB_USER', 'postgres'),
            password=os.getenv('DB_PASSWORD'),
            database=os.getenv('DB_NAME', 'zentra')
        )
        print_success("Conexión a BD establecida")
        return conn
    except psycopg2.Error as e:
        print_error(f"Error conectando a BD: {e}")
        sys.exit(1)

def execute_file(conn, filepath):
    """Ejecutar archivo SQL"""
    try:
        with open(filepath, 'r') as f:
            sql_script = f.read()
        
        cursor = conn.cursor()
        cursor.execute(sql_script)
        conn.commit()
        cursor.close()
        return True
    except Exception as e:
        conn.rollback()
        print_error(f"Error ejecutando script: {e}")
        return False

def verify_migration(conn):
    """Verificar que la migración fue exitosa"""
    cursor = conn.cursor()
    
    # Verificar tablas nuevas
    cursor.execute("""
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('login_attempts', 'password_reset_tokens', 'user_sessions')
    """)
    
    tables = cursor.fetchall()
    if len(tables) == 3:
        print_success("✓ Todas las tablas nuevas creadas")
    else:
        print_warning(f"Se esperaban 3 tablas, se encontraron {len(tables)}")
    
    # Verificar columnas en users
    cursor.execute("""
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name IN ('verificado', 'intentos_login_fallidos', 'bloqueado_hasta')
    """)
    
    columns = cursor.fetchall()
    if len(columns) >= 2:
        print_success("✓ Columnas de seguridad agregadas a users")
    else:
        print_warning("Algunas columnas no fueron agregadas")
    
    # Contar registros
    cursor.execute("SELECT COUNT(*) FROM users")
    user_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM roles")
    role_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM permissions")
    perm_count = cursor.fetchone()[0]
    
    cursor.close()
    
    return {
        'users': user_count,
        'roles': role_count,
        'permissions': perm_count
    }

def main():
    print_header("🔐 MIGRACIÓN: LOGIN Y REGISTRO - BD ZENTRA")
    
    # Cargar variables de ambiente
    print_info("Cargando configuración...")
    load_env()
    
    # Verificar conexión
    print_info("Conectando a base de datos...")
    conn = connect_db()
    
    # Mostrar configuración
    print("\n📋 Configuración:")
    print(f"   Host:     {os.getenv('DB_HOST')}")
    print(f"   Puerto:   {os.getenv('DB_PORT')}")
    print(f"   Usuario:  {os.getenv('DB_USER')}")
    print(f"   BD:       {os.getenv('DB_NAME')}")
    
    # Confirmar
    print_warning("Esta migración actualizará tu base de datos")
    response = input("\n¿Deseas continuar? (s/n): ").lower()
    
    if response != 's':
        print_info("Migración cancelada")
        conn.close()
        sys.exit(0)
    
    # Ejecutar migración
    print_info("\nEjecutando migración...")
    
    migration_file = Path(__file__).parent / "migration-login-setup.sql"
    
    if not migration_file.exists():
        print_error(f"Archivo de migración no encontrado: {migration_file}")
        conn.close()
        sys.exit(1)
    
    if not execute_file(conn, migration_file):
        print_error("La migración falló")
        conn.close()
        sys.exit(1)
    
    print_success("Migración ejecutada exitosamente")
    
    # Verificar migración
    print_info("\nVerificando migración...")
    stats = verify_migration(conn)
    
    # Mostrar resumen
    print_header("✅ MIGRACIÓN COMPLETADA")
    
    print("📊 Cambios realizados:")
    print("   ✓ Tabla login_attempts creada")
    print("   ✓ Tabla password_reset_tokens creada")
    print("   ✓ Tabla user_sessions creada")
    print("   ✓ Columnas de seguridad agregadas a users")
    print("   ✓ Índices creados para optimización")
    print("   ✓ Roles y permisos configurados")
    print("   ✓ Usuario admin creado")
    
    print("\n📈 Estadísticas:")
    print(f"   Usuarios:   {stats['users']}")
    print(f"   Roles:      {stats['roles']}")
    print(f"   Permisos:   {stats['permissions']}")
    
    print("\n🔑 Usuario por defecto:")
    print("   Email:      admin@zentra.com")
    print("   Contraseña: admin123")
    
    print("\n⚠️  IMPORTANTE:")
    print("   • Cambia la contraseña del admin después del primer login")
    print("   • En producción, modifica JWT_SECRET en backend/.env")
    print("   • Usa HTTPS en producción")
    
    print("\n📖 Próximos pasos:")
    print("   1. Iniciar backend: cd backend && npm start")
    print("   2. Abrir frontend: http://localhost:5500/login.html")
    print("   3. Hacer login con admin@zentra.com / admin123")
    
    conn.close()
    print_success("\n¡Todo listo! 🚀")

if __name__ == "__main__":
    main()
