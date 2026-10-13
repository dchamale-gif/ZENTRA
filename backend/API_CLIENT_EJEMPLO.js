/**
 * API CLIENT - Ejemplo de integración frontend-backend
 * 
 * Este archivo muestra cómo el frontend JavaScript debe conectarse
 * al backend Node.js + Express
 */

class ZentraAPI {
  constructor(baseURL = 'http://localhost:3000/api') {
    this.baseURL = baseURL;
    this.token = localStorage.getItem('zentra_token');
  }

  // ====================================
  // MÉTODOS AUXILIARES
  // ====================================

  /**
   * Realizar petición fetch con manejo de errores
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Agregar JWT si existe
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Si es 401, token expiró
      if (response.status === 401) {
        this.logout();
        throw new Error('Sesión expirada. Inicia sesión nuevamente.');
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Error ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  /**
   * Guardar token en localStorage
   */
  setToken(token) {
    this.token = token;
    localStorage.setItem('zentra_token', token);
  }

  /**
   * Limpiar token (logout)
   */
  logout() {
    this.token = null;
    localStorage.removeItem('zentra_token');
  }

  // ====================================
  // AUTENTICACIÓN
  // ====================================

  /**
   * Registrar nuevo usuario
   * @param {Object} userData - { email, password, nombre, apellido, telefono }
   * @returns {Promise}
   */
  async register(userData) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  /**
   * Login
   * @param {string} email
   * @param {string} password
   * @returns {Promise}
   */
  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (data.token) {
      this.setToken(data.token);
    }

    return data;
  }

  /**
   * Obtener perfil del usuario actual
   * @returns {Promise}
   */
  async getProfile() {
    return this.request('/auth/profile');
  }

  /**
   * Logout
   * @returns {Promise}
   */
  async logout() {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } finally {
      this.logout();
    }
  }

  // ====================================
  // PACIENTES
  // ====================================

  /**
   * Listar todos los pacientes
   * @returns {Promise}
   */
  async getPacientes() {
    return this.request('/pacientes');
  }

  /**
   * Obtener paciente por ID
   * @param {number} id
   * @returns {Promise}
   */
  async getPacienteById(id) {
    return this.request(`/pacientes/${id}`);
  }

  /**
   * Crear nuevo paciente
   * @param {Object} pacienteData
   * @returns {Promise}
   */
  async createPaciente(pacienteData) {
    return this.request('/pacientes', {
      method: 'POST',
      body: JSON.stringify(pacienteData),
    });
  }

  /**
   * Actualizar paciente
   * @param {number} id
   * @param {Object} pacienteData
   * @returns {Promise}
   */
  async updatePaciente(id, pacienteData) {
    return this.request(`/pacientes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(pacienteData),
    });
  }

  /**
   * Eliminar paciente (soft delete)
   * @param {number} id
   * @returns {Promise}
   */
  async deletePaciente(id) {
    return this.request(`/pacientes/${id}`, {
      method: 'DELETE',
    });
  }
}

// ====================================
// EJEMPLOS DE USO
// ====================================

// Crear instancia global
const api = new ZentraAPI();

// EJEMPLO 1: Registro
async function ejemploRegistro() {
  try {
    const response = await api.register({
      email: 'doctor@zentra.com',
      password: 'password123',
      nombre: 'Juan',
      apellido: 'Pérez',
      telefono: '3001234567'
    });
    console.log('Usuario registrado:', response);
  } catch (error) {
    console.error('Error en registro:', error.message);
  }
}

// EJEMPLO 2: Login
async function ejemploLogin() {
  try {
    const response = await api.login('doctor@zentra.com', 'password123');
    console.log('Login exitoso', response);
    console.log('Token guardado:', api.token.substring(0, 20) + '...');
  } catch (error) {
    console.error('Error en login:', error.message);
  }
}

// EJEMPLO 3: Obtener pacientes
async function ejemploObtenerPacientes() {
  try {
    const response = await api.getPacientes();
    console.log(`${response.total} pacientes encontrados:`, response.pacientes);
  } catch (error) {
    console.error('Error obteniendo pacientes:', error.message);
  }
}

// EJEMPLO 4: Crear paciente
async function ejemploCrearPaciente() {
  try {
    const response = await api.createPaciente({
      cedula: '1234567890',
      nombre: 'Carlos',
      apellido: 'García',
      edad: 35,
      genero: 'M',
      tipo_sangre: 'O+',
      telefono: '3009876543',
      email: 'carlos@mail.com',
      alergias: 'Penicilina'
    });
    console.log('Paciente creado:', response);
  } catch (error) {
    console.error('Error creando paciente:', error.message);
  }
}

// EJEMPLO 5: Actualizar paciente
async function ejemploActualizarPaciente(id) {
  try {
    const response = await api.updatePaciente(id, {
      telefono: '3001111111',
      email: 'nuevo@mail.com'
    });
    console.log('Paciente actualizado:', response);
  } catch (error) {
    console.error('Error actualizando paciente:', error.message);
  }
}

// ====================================
// EJECUTAR EJEMPLOS
// ====================================

// Para probar, ejecutar en consola:
// await ejemploLogin();
// await ejemploObtenerPacientes();
// await ejemploCrearPaciente();
