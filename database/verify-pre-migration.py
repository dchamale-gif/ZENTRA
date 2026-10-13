#!/usr/bin/env python3

"""
Script de verificación pre-migración
Valida que todo esté correctamente configurado antes de hacer cambios
"""

import os
import sys
import subprocess
from pathlib import Path
from dotenv import load_dotenv

class Checker:
    def __init__(self):
        self.checks_passed = 0
        self.checks_failed = 0
        self.root_dir = Path(__file__).parent.parent
        self.env_file = self.root_dir / "backend" / ".env"
    
    def header(self, msg):
        print(f"\n{'='*60}")
        print(f"📋 {msg}")
        print(f"{'='*60}\n")
    
    def success(self, msg):
        print(f"  ✅ {msg}")
        self.checks_passed += 1
    
    def error(self, msg):
        print(f"  ❌ {msg}")
        self.checks_failed += 1
    
    def warning(self, msg):
        print(f"  ⚠️  {msg}")
    
    def check_postgresql(self):
        """Verificar que PostgreSQL esté instalado"""
        self.header("1. Verificando PostgreSQL")
        
        try:
            result = subprocess.run(['psql', '--version'], 
                                   capture_output=True, text=True)
            self.success(f"PostgreSQL instalado: {result.stdout.strip()}")
        except FileNotFoundError:
            self.error("PostgreSQL no está instalado o no está en PATH")
            self.warning("Instala: brew install postgresql@15")
            return False
        
        return True
    
    def check_postgresql_running(self):
        """Verificar que PostgreSQL esté corriendo"""
        self.header("2. Verificando si PostgreSQL está corriendo")
        
        try:
            result = subprocess.run(['pg_isready', '-h', 'localhost'], 
                                   capture_output=True, text=True)
            if result.returncode == 0:
                self.success("PostgreSQL está corriendo en localhost")
                return True
            else:
                self.error("PostgreSQL no está corriendo")
                self.warning("Inicia: brew services start postgresql@15")
                return False
        except FileNotFoundError:
            self.error("No se puede verificar si PostgreSQL está corriendo")
            self.warning("pg_isready no encontrado")
            return False
    
    def check_env_file(self):
        """Verificar que existe .env"""
        self.header("3. Verificando archivo .env")
        
        if not self.env_file.exists():
            self.error(f"Archivo no encontrado: {self.env_file}")
            self.warning("Copia backend/.env.example a backend/.env y configúralo")
            return False
        
        self.success(f"Archivo encontrado: {self.env_file}")
        return True
    
    def check_env_variables(self):
        """Verificar variables de ambiente"""
        self.header("4. Verificando variables de ambiente")
        
        if not self.env_file.exists():
            self.error("No se puede leer .env")
            return False
        
        load_dotenv(self.env_file)
        
        required_vars = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']
        missing = []
        
        for var in required_vars:
            value = os.getenv(var)
            if value:
                # Ocultar contraseña
                display_value = '***' if var == 'DB_PASSWORD' else value
                self.success(f"{var} = {display_value}")
            else:
                missing.append(var)
                self.error(f"{var} no está configurado")
        
        if missing:
            self.warning(f"Variables faltantes: {', '.join(missing)}")
            return False
        
        return True
    
    def check_database_exists(self):
        """Verificar que la BD existe"""
        self.header("5. Verificando que base de datos existe")
        
        load_dotenv(self.env_file)
        
        db_name = os.getenv('DB_NAME')
        if not db_name:
            self.error("DB_NAME no configurado")
            return False
        
        try:
            result = subprocess.run([
                'psql', '-U', os.getenv('DB_USER', 'postgres'),
                '-h', os.getenv('DB_HOST', 'localhost'),
                '-d', db_name,
                '-c', 'SELECT 1;'
            ], capture_output=True, text=True, timeout=5)
            
            if result.returncode == 0:
                self.success(f"Base de datos '{db_name}' existe y es accesible")
                return True
            else:
                self.error(f"No se puede acceder a '{db_name}'")
                self.warning(f"Crea la BD: createdb {db_name}")
                return False
        except subprocess.TimeoutExpired:
            self.error("Timeout conectando a BD (PostgreSQL no responde)")
            return False
        except Exception as e:
            self.error(f"Error: {e}")
            return False
    
    def check_tables_exist(self):
        """Verificar que existen las tablas principales"""
        self.header("6. Verificando tablas principales")
        
        load_dotenv(self.env_file)
        
        required_tables = ['roles', 'permissions', 'users', 'user_roles']
        
        try:
            result = subprocess.run([
                'psql', '-U', os.getenv('DB_USER', 'postgres'),
                '-h', os.getenv('DB_HOST', 'localhost'),
                '-d', os.getenv('DB_NAME'),
                '-t', '-c',
                "SELECT table_name FROM information_schema.tables WHERE table_schema='public';"
            ], capture_output=True, text=True, timeout=5)
            
            if result.returncode != 0:
                self.error("No se puede consultar tablas")
                return False
            
            existing_tables = [line.strip() for line in result.stdout.strip().split('\n') if line.strip()]
            
            for table in required_tables:
                if table in existing_tables:
                    self.success(f"Tabla '{table}' existe")
                else:
                    self.error(f"Tabla '{table}' no existe")
                    self.warning("Ejecuta primero: psql -U postgres -d DB_NAME -f database/schema.sql")
                    return False
            
            return True
        except Exception as e:
            self.error(f"Error verificando tablas: {e}")
            return False
    
    def check_migration_script_exists(self):
        """Verificar que el script de migración existe"""
        self.header("7. Verificando scripts de migración")
        
        migration_file = self.root_dir / "database" / "migration-login-setup.sql"
        
        if migration_file.exists():
            self.success(f"Script de migración encontrado: {migration_file.name}")
            return True
        else:
            self.error(f"Script de migración no encontrado: {migration_file}")
            return False
    
    def check_node_dependencies(self):
        """Verificar que las dependencias Node están instaladas"""
        self.header("8. Verificando dependencias Node.js")
        
        backend_dir = self.root_dir / "backend"
        node_modules = backend_dir / "node_modules"
        
        if node_modules.exists():
            self.success("node_modules existe (dependencias instaladas)")
            return True
        else:
            self.warning("node_modules no existe")
            self.warning("Ejecuta: cd backend && npm install")
            return True  # No es error crítico, pero es necesario antes de npm start
    
    def run_all_checks(self):
        """Ejecutar todas las verificaciones"""
        print("\n" + "="*60)
        print("🔍 VERIFICACIÓN PRE-MIGRACIÓN - LOGIN Y REGISTRO")
        print("="*60)
        
        checks = [
            ("PostgreSQL instalado", self.check_postgresql),
            ("PostgreSQL corriendo", self.check_postgresql_running),
            ("Archivo .env existe", self.check_env_file),
            ("Variables de ambiente", self.check_env_variables),
            ("Base de datos existe", self.check_database_exists),
            ("Tablas principales", self.check_tables_exist),
            ("Script de migración", self.check_migration_script_exists),
            ("Dependencias Node.js", self.check_node_dependencies),
        ]
        
        for check_name, check_func in checks:
            try:
                if not check_func():
                    pass  # Ya registrado como error
            except Exception as e:
                self.error(f"Error en {check_name}: {e}")
        
        # Resumen
        self.header("📊 RESUMEN")
        print(f"  ✅ Verificaciones pasadas: {self.checks_passed}")
        print(f"  ❌ Verificaciones fallidas: {self.checks_failed}")
        
        if self.checks_failed == 0:
            print("\n" + "="*60)
            print("✅ TODAS LAS VERIFICACIONES PASARON")
            print("="*60)
            print("\n🚀 Ahora puedes ejecutar la migración:")
            print("   python3 database/migrate.py")
            print()
            return True
        else:
            print("\n" + "="*60)
            print("❌ ALGUNAS VERIFICACIONES FALLARON")
            print("="*60)
            print("\n⚠️  Soluciona los problemas arriba antes de continuar")
            print()
            return False

def main():
    checker = Checker()
    success = checker.run_all_checks()
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
