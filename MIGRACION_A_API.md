/**
 * 📝 GUÍA: Migrar Módulos del Frontend al Backend API
 * 
 * Este archivo muestra cómo refactorizar los módulos existentes
 * para que usen la API del backend en lugar de localStorage
 */

// ============================================
// EJEMPLO 1: PacientesModule
// ============================================

// ❌ ANTES (localStorage)
const PacientesModuleANTES = {
  pacientes: [],
  
  init() {
    this.pacientes = JSON.parse(localStorage.getItem('pacientes') || '[]');
  },
  
  add(paciente) {
    this.pacientes.push(paciente);
    localStorage.setItem('pacientes', JSON.stringify(this.pacientes));
  },
  
  get() {
    return this.pacientes;
  }
};

// ✅ DESPUÉS (API)
const PacientesModuleNUEVO = {
  api: null, // Se inyecta desde afuera
  pacientes: [],
  
  init(apiInstance) {
    this.api = apiInstance;
    this.loadPacientes();
  },
  
  async loadPacientes() {
    try {
      const response = await this.api.getPacientes();
      this.pacientes = response.pacientes;
      this.renderPacientes();
    } catch (error) {
      console.error('Error cargando pacientes:', error);
      alert('Error cargando pacientes: ' + error.message);
    }
  },
  
  async add(paciente) {
    try {
      const response = await this.api.createPaciente(paciente);
      this.pacientes.push(response.paciente);
      this.renderPacientes();
      alert('Paciente creado exitosamente');
    } catch (error) {
      console.error('Error creando paciente:', error);
      alert('Error: ' + error.message);
    }
  },
  
  async update(id, datos) {
    try {
      await this.api.updatePaciente(id, datos);
      // Recargar lista
      await this.loadPacientes();
      alert('Paciente actualizado');
    } catch (error) {
      alert('Error: ' + error.message);
    }
  },
  
  async delete(id) {
    if (!confirm('¿Eliminar paciente?')) return;
    
    try {
      await this.api.deletePaciente(id);
      await this.loadPacientes();
      alert('Paciente eliminado');
    } catch (error) {
      alert('Error: ' + error.message);
    }
  },
  
  get() {
    return this.pacientes;
  },
  
  renderPacientes() {
    // Tu lógica de renderizado existente
    console.log('Renderizando pacientes:', this.pacientes);
  }
};

// ============================================
// EJEMPLO 2: ReportsModule
// ============================================

// ✅ REPORTES con API
const ReportsModuleNUEVO = {
  api: null,
  
  init(apiInstance) {
    this.api = apiInstance;
  },
  
  async generateReport(filtros) {
    try {
      // Llamar a nuevo endpoint GET /api/reportes
      // (Este endpoint se debe crear en el backend)
      const response = await fetch(
        `http://localhost:3000/api/reportes?periodo=${filtros.periodo}&concepto=${filtros.concepto}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('zentra_token')}`
          }
        }
      );
      
      const data = await response.json();
      return data.reporte;
    } catch (error) {
      console.error('Error generando reporte:', error);
      throw error;
    }
  },
  
  async exportToExcel() {
    // El backend devuelve CSV que se descarga automáticamente
    const token = localStorage.getItem('zentra_token');
    window.location.href = 
      `http://localhost:3000/api/reportes/export?format=csv&token=${token}`;
  }
};

// ============================================
// EJEMPLO 3: Sistema de Login UI
// ============================================

// Agregar esta página HTML (login.html)
const loginHTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Zentra - Login</title>
  <style>
    .login-container {
      max-width: 400px;
      margin: 50px auto;
      padding: 20px;
      border: 1px solid #ddd;
      border-radius: 8px;
      background: #f9f9f9;
    }
    .login-container h1 {
      text-align: center;
      color: #333;
    }
    .form-group {
      margin: 15px 0;
    }
    .form-group label {
      display: block;
      margin-bottom: 5px;
      font-weight: bold;
    }
    .form-group input {
      width: 100%;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      box-sizing: border-box;
    }
    .btn {
      width: 100%;
      padding: 10px;
      background: #1e40af;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      margin-top: 10px;
    }
    .btn:hover {
      background: #1e3a8a;
    }
    .error {
      color: #dc2626;
      margin-top: 10px;
    }
    .spinner {
      display: none;
      text-align: center;
      margin-top: 10px;
    }
  </style>
</head>
<body>
  <div class="login-container">
    <h1>🏥 Zentra</h1>
    <form id="loginForm">
      <div class="form-group">
        <label for="email">Email:</label>
        <input type="email" id="email" name="email" required>
      </div>
      <div class="form-group">
        <label for="password">Contraseña:</label>
        <input type="password" id="password" name="password" required>
      </div>
      <button type="submit" class="btn">Iniciar Sesión</button>
      <div class="spinner" id="spinner">Cargando...</div>
      <div class="error" id="error"></div>
    </form>
  </div>

  <script src="js/api-client.js"></script>
  <script>
    const api = new ZentraAPI();
    
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const spinner = document.getElementById('spinner');
      const error = document.getElementById('error');
      
      error.textContent = '';
      spinner.style.display = 'block';
      
      try {
        const response = await api.login(email, password);
        
        // Guardar datos del usuario
        localStorage.setItem('zentra_user', JSON.stringify(response.user));
        
        // Redirigir a dashboard
        window.location.href = 'index.html';
      } catch (err) {
        error.textContent = err.message;
        spinner.style.display = 'none';
      }
    });
  </script>
</body>
</html>
`;

// ============================================
// EJEMPLO 4: Proteger rutas (verificar login)
// ============================================

// Agregar al inicio de index.html
const protectRoute = () => {
  const token = localStorage.getItem('zentra_token');
  const user = localStorage.getItem('zentra_user');
  
  if (!token || !user) {
    // Redirigir a login si no está autenticado
    window.location.href = 'login.html';
    return false;
  }
  
  return true;
};

// En el HTML principal:
// <script>
//   if (!protectRoute()) {
//     // No ejecutar más código
//     throw new Error('No autenticado');
//   }
// </script>

// ============================================
// EJEMPLO 5: Inicializar módulos con API
// ============================================

// Al cargar la página (después de verificar login)
document.addEventListener('DOMContentLoaded', async () => {
  // Verificar autenticación
  if (!protectRoute()) return;
  
  // Crear instancia de API
  const api = new ZentraAPI('http://localhost:3000/api');
  
  // Verificar que token es válido
  try {
    await api.getProfile();
  } catch (error) {
    // Token inválido, ir a login
    localStorage.removeItem('zentra_token');
    window.location.href = 'login.html';
    return;
  }
  
  // Inicializar módulos con API
  PacientesModuleNUEVO.init(api);
  ReportsModuleNUEVO.init(api);
  
  // El resto del código de inicialización
  // ...
});

// ============================================
// EJEMPLO 6: Mostrar datos del usuario actual
// ============================================

const displayUserInfo = () => {
  const user = JSON.parse(localStorage.getItem('zentra_user'));
  
  if (user) {
    const userElement = document.querySelector('.user-info');
    if (userElement) {
      userElement.innerHTML = `
        <p>${user.nombre} ${user.apellido}</p>
        <small>${user.roles.join(', ')}</small>
        <button onclick="logout()">Logout</button>
      `;
    }
  }
};

const logout = async () => {
  const api = new ZentraAPI();
  try {
    await api.logout();
    localStorage.removeItem('zentra_token');
    localStorage.removeItem('zentra_user');
    window.location.href = 'login.html';
  } catch (error) {
    console.error('Error en logout:', error);
  }
};

// ============================================
// RESUMEN DE CAMBIOS
// ============================================

/*

PASO A PASO PARA MIGRAR:

1. CARGAR CLIENTE API
   <script src="js/api-client.js"></script>

2. CREAR PÁGINA LOGIN
   - Copiar loginHTML
   - Autenticar con API
   - Guardar token en localStorage

3. PROTEGER RUTAS
   - Verificar token al cargar
   - Redirigir a login si no existe

4. ACTUALIZAR MÓDULOS
   - Agregar parámetro 'api' a init()
   - Reemplazar localStorage.getItem() con api.getPacientes()
   - Reemplazar localStorage.setItem() con api.createPaciente()
   - Agregar try/catch para manejo de errores

5. MOSTRAR USUARIO
   - Obtener datos de localStorage
   - Mostrar nombre y roles
   - Agregar botón logout

6. ELIMINAR localStorage
   - Mantener solo token y user data
   - Eliminar de otros módulos

BENEFICIOS:

✓ Datos persistentes en BD (no en navegador)
✓ Auditoría automática de cambios
✓ Acceso desde múltiples dispositivos
✓ Control de permisos centralizado
✓ Mejor seguridad y escalabilidad

*/
