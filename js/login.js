// ============================================
// LOGIN.JS - MANEJO DEL FORMULARIO DE LOGIN
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    initializeLoginForm();
});

function initializeLoginForm() {
    const loginForm = document.getElementById('loginForm');
    
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }

    const accessReason = new URLSearchParams(window.location.search).get('access');
    if (accessReason === 'trial_expired') {
        showAlert('Tu prueba gratuita finalizó. Contacta a soporte para activar tu suscripción.', 'warning', 0);
    } else if (accessReason === 'organization_blocked') {
        showAlert('El acceso de tu empresa está suspendido. Contacta a soporte.', 'warning', 0);
    }

    // Si ya hay sesión activa, redirigir al dashboard
    if (authManager.isAuthenticated() && !authManager.isTokenExpired()) {
        if (authManager.getUser()?.platformAdmin) {
            redirectToSupportPanel();
        } else {
            redirectToDashboard();
        }
    }
}

/**
 * Manejar envío del formulario de login
 */
async function handleLogin(event) {
    event.preventDefault();

    const form = event.target;
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const rememberMe = document.querySelector('input[name="rememberMe"]').checked;
    const submitBtn = form.querySelector('button[type="submit"]');

    // Validaciones
    if (!email) {
        showAlert('Por favor ingresa tu email', 'error');
        document.getElementById('email').focus();
        return;
    }

    if (!isValidEmail(email)) {
        showAlert('Por favor ingresa un email válido', 'error');
        document.getElementById('email').focus();
        return;
    }

    if (!password) {
        showAlert('Por favor ingresa tu contraseña', 'error');
        document.getElementById('password').focus();
        return;
    }

    if (password.length < 6) {
        showAlert('La contraseña debe tener al menos 6 caracteres', 'error');
        document.getElementById('password').focus();
        return;
    }

    // Mostrar estado de carga
    setButtonLoading(submitBtn, true);

    try {
        // Intentar login
        const result = await authManager.login(email, password);

        if (result.success) {
            showAlert('Bienvenido, ' + result.user.nombre, 'success', 2000);

            // Guardar preferencia de "recuérdame"
            if (rememberMe) {
                localStorage.setItem('rememberEmail', email);
            } else {
                localStorage.removeItem('rememberEmail');
            }

            // Redirigir tras mostrar brevemente el mensaje de bienvenida
            setTimeout(() => {
                if (result.platformAdmin) {
                    redirectToSupportPanel();
                } else {
                    redirectToDashboard();
                }
            }, 800);
        } else {
            showAlert(result.error, 'error');
            setButtonLoading(submitBtn, false);

            // Limpiar contraseña
            document.getElementById('password').value = '';
            document.getElementById('password').focus();
        }
    } catch (error) {
        console.error('Error inesperado:', error);
        showAlert('Error inesperado: ' + error.message, 'error');
        setButtonLoading(submitBtn, false);
    }
}

/**
 * Mostrar formulario de registro
 */
function showRegister() {
    document.getElementById('loginPanel').classList.add('hidden');
    document.getElementById('registerPanel').classList.remove('hidden');
    document.getElementById('alertContainer').innerHTML = '';
    document.getElementById('empresaNombre').focus();
}

function showLogin() {
    document.getElementById('registerPanel').classList.add('hidden');
    document.getElementById('loginPanel').classList.remove('hidden');
    document.getElementById('alertContainer').innerHTML = '';
    document.getElementById('email').focus();
}

async function handleRegister(event) {
    event.preventDefault();
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const password = document.getElementById('registerPassword').value;
    const passwordConfirm = document.getElementById('registerPasswordConfirm').value;

    if (password.length < 8) {
        showAlert('La contraseña debe tener al menos 8 caracteres', 'error');
        return;
    }
    if (password !== passwordConfirm) {
        showAlert('Las contraseñas no coinciden', 'error');
        return;
    }

    setButtonLoading(submitBtn, true);
    const result = await authManager.register({
        empresaNombre: document.getElementById('empresaNombre').value.trim(),
        empresaSector: document.getElementById('empresaSector').value.trim(),
        empresaCorreo: document.getElementById('empresaCorreo').value.trim(),
        empresaNit: document.getElementById('empresaNit').value.trim(),
        empresaTelefono: document.getElementById('registerTelefono').value.trim(),
        empresaDireccion: document.getElementById('empresaDireccion').value.trim(),
        nombre: document.getElementById('registerNombre').value.trim(),
        apellido: document.getElementById('registerApellido').value.trim(),
        telefono: document.getElementById('registerTelefono').value.trim(),
        email: document.getElementById('registerEmail').value.trim(),
        password
    });

    if (!result.success) {
        showAlert(result.error, 'error');
        setButtonLoading(submitBtn, false);
        return;
    }

    showAlert(`Empresa creada. Tu prueba vence el ${new Date(result.organization.trialEndsAt).toLocaleDateString('es-GT')}.`, 'success', 2500);
    openSupportWhatsApp();
    setTimeout(redirectToDashboard, 2500);
}

function openSupportWhatsApp() {
    const companyName = document.getElementById('empresaNombre').value.trim();
    const sector = document.getElementById('empresaSector').value.trim();
    const companyEmail = document.getElementById('empresaCorreo').value.trim();
    if (!companyName || !sector || !companyEmail || !isValidEmail(companyEmail)) {
        showAlert('Completa nombre de empresa, sector comercial y un correo válido antes de contactar soporte.', 'error');
        return;
    }
    const nit = document.getElementById('empresaNit').value.trim() || 'No indicado';
    const contactName = `${document.getElementById('registerNombre').value.trim()} ${document.getElementById('registerApellido').value.trim()}`;
    const phone = document.getElementById('registerTelefono').value.trim() || 'No indicado';
    const address = document.getElementById('empresaDireccion').value.trim() || 'No indicada';
    const message = [
        'Hola, necesito apoyo para configurar mi empresa en BotEngine ERP.',
        '',
        `Empresa: ${companyName}`,
        `Sector comercial: ${sector}`,
        `Correo de la empresa: ${companyEmail}`,
        `NIT: ${nit}`,
        `Teléfono: ${phone}`,
        `Dirección: ${address}`,
        `Persona de contacto: ${contactName}`
    ].join('\n');

    window.open(
        `https://wa.me/50239959782?text=${encodeURIComponent(message)}`,
        '_blank',
        'noopener'
    );
}

/**
 * Mostrar formulario de olvido de contraseña
 */
function showForgotPassword(event) {
    event.preventDefault();
    showAlert('La funcionalidad de recuperación de contraseña aún se está desarrollando', 'info');
    
    // En el futuro, esto podría abrir un modal para recuperar contraseña
}

/**
 * Recordar email si está guardado
 */
function rememberEmail() {
    const savedEmail = localStorage.getItem('rememberEmail');
    if (savedEmail) {
        document.getElementById('email').value = savedEmail;
        document.querySelector('input[name="rememberMe"]').checked = true;
        document.getElementById('password').focus();
    }
}

// Ejecutar al cargar
rememberEmail();
