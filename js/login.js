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

    // Llegada desde el enlace del correo de verificación.
    const correo = new URLSearchParams(window.location.search).get('correo');
    const mensajesCorreo = {
        verificado: ['¡Correo confirmado! Te enviamos tu usuario y contraseña temporal; revisa tu bandeja de entrada (y la de spam).', 'success'],
        'ya-verificado': ['Este correo ya estaba confirmado. Entra con los datos que te enviamos por correo.', 'info'],
        vencido: ['El enlace venció. Pide a soporte que te envíe uno nuevo.', 'warning'],
        invalido: ['El enlace no es válido. Revisa que lo copiaste completo o pide uno nuevo a soporte.', 'warning'],
        'error-envio': ['Confirmamos el enlace, pero no pudimos enviarte la contraseña. Abre el enlace de nuevo en unos minutos o escribe a soporte.', 'error']
    };
    if (mensajesCorreo[correo]) showAlert(mensajesCorreo[correo][0], mensajesCorreo[correo][1], 0);

    cargarSitio();

    // Llegada desde otra dirección con la sesión ya puesta (ver irConTraspaso).
    const sesion = new URLSearchParams(window.location.search).get('sesion');
    if (sesion) {
        history.replaceState(null, '', window.location.pathname);
        if (sesion === 'vencida') {
            showAlert('El enlace para entrar venció o ya se usó. Inicia sesión otra vez.', 'warning', 0);
        } else {
            entrarConSesion();
            return;
        }
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

async function entrarConSesion() {
    showAlert('Entrando…', 'info', 0);
    const result = await authManager.cargarSesion();
    if (!result.success) {
        showAlert('No pudimos abrir tu sesión. Inicia sesión otra vez.', 'warning', 0);
        return;
    }
    if (result.platformAdmin) redirectToSupportPanel();
    else redirectToDashboard();
}

// ---------- Dirección: botengine-erp.com, soporte. o <empresa>. ----------

let sitio = null;

// «Café La Ceiba» → cafelaceiba (igual que el servidor).
function sugerirSubdominio(nombre) {
    return String(nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 30);
}

async function cargarSitio() {
    try {
        const response = await fetch('/api/auth/sitio', { credentials: 'same-origin' });
        if (!response.ok) return;
        sitio = await response.json();
    } catch (error) {
        return;
    }
    const titulo = document.getElementById('loginTitulo');
    const subtitulo = document.getElementById('loginSubtitulo');
    const ocultarRegistro = () => { document.getElementById('signupSection').hidden = true; };

    if (sitio.tipo === 'empresa') {
        ocultarRegistro();
        if (sitio.existe) {
            subtitulo.textContent = `Entra a ${sitio.empresa}.`;
            document.title = `${sitio.empresa} · BotEngine ERP`;
        } else {
            const alerta = showAlert('Esta dirección no corresponde a ninguna empresa. ', 'warning', 0);
            if (sitio.urlRaiz) {
                const enlace = document.createElement('a');
                enlace.href = sitio.urlRaiz;
                enlace.className = 'alert-link';
                enlace.textContent = 'Ir al inicio de sesión general';
                alerta?.querySelector('span')?.appendChild(enlace);
            }
        }
    } else if (sitio.tipo === 'soporte') {
        ocultarRegistro();
        titulo.textContent = 'Panel de soporte';
        subtitulo.textContent = 'Solo para el equipo de BotEngine.';
        document.title = 'Soporte · BotEngine ERP';
    }

    // Al registrarse se elige la dirección de la empresa.
    if (sitio.base) {
        document.getElementById('subdominioSufijo').textContent = `.${sitio.base}`;
        document.getElementById('subdominioGrupo').hidden = false;
        const nombre = document.getElementById('empresaNombre');
        const sub = document.getElementById('empresaSubdominio');
        nombre.addEventListener('input', () => {
            if (!sub.dataset.editado) sub.value = sugerirSubdominio(nombre.value);
        });
        sub.addEventListener('input', () => {
            sub.dataset.editado = sub.value ? '1' : '';
            sub.value = sub.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
        });
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
        showAlert('Escribe tu correo electrónico.', 'error');
        document.getElementById('email').focus();
        return;
    }

    if (!isValidEmail(email)) {
        showAlert('Escribe un correo válido, por ejemplo nombre@empresa.com.', 'error');
        document.getElementById('email').focus();
        return;
    }

    if (!password) {
        showAlert('Escribe tu contraseña.', 'error');
        document.getElementById('password').focus();
        return;
    }

    if (password.length < 6) {
        showAlert('La contraseña tiene al menos 6 caracteres. Revísala.', 'error');
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
                if (result.traspaso) {
                    irConTraspaso(result.traspaso);
                } else if (result.platformAdmin) {
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
        showAlert(friendlyError(error), 'error');
        setButtonLoading(submitBtn, false);
    }
}

// showRegister() y showLogin() están en login.html para que los botones funcionen
// desde que se pinta la página, antes de que termine de descargar este archivo.


// Errores junto al campo: el formulario es largo y un aviso arriba queda fuera de la vista.
function setFieldError(input, message) {
    clearFieldError(input);
    input.setAttribute('aria-invalid', 'true');
    const error = document.createElement('small');
    error.className = 'field-error';
    error.id = `${input.id}Error`;
    error.textContent = message;
    input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), error.id].filter(Boolean).join(' '));
    input.closest('.form-group').appendChild(error);
}

function clearFieldError(input) {
    const error = document.getElementById(`${input.id}Error`);
    if (!error) return;
    error.remove();
    input.removeAttribute('aria-invalid');
    const describedBy = (input.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== error.id);
    if (describedBy.length) input.setAttribute('aria-describedby', describedBy.join(' '));
    else input.removeAttribute('aria-describedby');
}

function showRegisterStatus(message, type) {
    const status = document.getElementById('registerStatus');
    status.innerHTML = '';
    if (!message) return;
    const alert = document.createElement('div');
    alert.className = `alert ${type}`;
    alert.textContent = message;
    status.appendChild(alert);
}

function validateRegisterForm() {
    const value = id => document.getElementById(id).value.trim();
    const password = document.getElementById('registerPassword').value;
    const companyEmail = value('empresaCorreo');
    const checks = [
        ['empresaNombre', !value('empresaNombre'), 'Escribe el nombre de tu empresa.'],
        ['registerNombre', !value('registerNombre'), 'Escribe tu nombre.'],
        ['registerApellido', !value('registerApellido'), 'Escribe tu apellido.'],
        ['registerEmail', !isValidEmail(value('registerEmail')), 'Escribe un correo válido, por ejemplo nombre@empresa.com.'],
        ['registerPassword', password.length < 8, 'La contraseña necesita al menos 8 caracteres.'],
        ['registerPassword', !/[a-zA-Z]/.test(password) || !/\d/.test(password), 'La contraseña necesita letras y números.'],
        ['registerPasswordConfirm', password !== document.getElementById('registerPasswordConfirm').value, 'Las contraseñas no coinciden. Escríbela otra vez.'],
        ['empresaCorreo', companyEmail && !isValidEmail(companyEmail), 'El correo de la empresa no es válido. Corrígelo o déjalo vacío.'],
        ['empresaSubdominio', !document.getElementById('subdominioGrupo').hidden && value('empresaSubdominio') &&
            !/^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/.test(value('empresaSubdominio')),
            'Usa solo letras sin acentos, números y guiones (sin guion al inicio ni al final).']
    ];
    const failed = new Set();
    checks.forEach(([id, invalid, message]) => {
        if (!invalid || failed.has(id)) return;
        failed.add(id);
        setFieldError(document.getElementById(id), message);
    });
    return [...failed];
}

async function handleRegister(event) {
    event.preventDefault();
    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn.disabled) return;

    form.querySelectorAll('input').forEach(clearFieldError);
    showRegisterStatus('');
    const invalid = validateRegisterForm();
    if (invalid.length) {
        const first = document.getElementById(invalid[0]);
        if (first.closest('details')) first.closest('details').open = true;
        first.focus();
        showRegisterStatus(invalid.length === 1 ? 'Revisa el campo marcado en rojo.' : `Revisa los ${invalid.length} campos marcados en rojo.`, 'error');
        return;
    }

    const value = id => document.getElementById(id).value.trim();
    setButtonLoading(submitBtn, true);
    const result = await authManager.register({
        empresaNombre: value('empresaNombre'),
        empresaSector: value('empresaSector'),
        empresaCorreo: value('empresaCorreo'),
        empresaNit: value('empresaNit'),
        empresaTelefono: value('registerTelefono'),
        empresaDireccion: value('empresaDireccion'),
        nombre: value('registerNombre'),
        apellido: value('registerApellido'),
        telefono: value('registerTelefono'),
        email: value('registerEmail'),
        password: document.getElementById('registerPassword').value,
        empresaSubdominio: document.getElementById('subdominioGrupo').hidden ? undefined : value('empresaSubdominio')
    });

    if (!result.success) {
        showRegisterStatus(result.error, 'error');
        if (result.field === 'empresaSubdominio') {
            const sub = document.getElementById('empresaSubdominio');
            setFieldError(sub, result.error);
            sub.focus();
        }
        if (/registrado/i.test(result.error || '')) {
            setFieldError(document.getElementById('registerEmail'), 'Este correo ya tiene cuenta. Inicia sesión o usa otro correo.');
        }
        setButtonLoading(submitBtn, false);
        return;
    }

    const direccion = result.organization?.url ? ` Tu dirección es ${result.organization.url.replace('https://', '')}.` : '';
    showRegisterStatus(`¡Listo! Tu empresa fue creada. La prueba gratuita vence el ${new Date(result.organization.trialEndsAt).toLocaleDateString('es-GT')}.${direccion} Entrando al panel…`, 'success');
    setTimeout(() => (result.traspaso ? irConTraspaso(result.traspaso) : redirectToDashboard()), result.traspaso ? 3000 : 1800);
}

document.addEventListener('input', event => {
    if (event.target.matches?.('#registerForm input')) clearFieldError(event.target);
});

// El soporte no exige llenar el formulario: se incluyen solo los datos que ya se escribieron.
function openSupportWhatsApp() {
    const value = id => document.getElementById(id)?.value.trim() || '';
    const contactName = `${value('registerNombre')} ${value('registerApellido')}`.trim();
    const details = [
        ['Empresa', value('empresaNombre')],
        ['Sector comercial', value('empresaSector')],
        ['Correo', value('registerEmail') || value('email')],
        ['Persona de contacto', contactName]
    ].filter(([, text]) => text).map(([label, text]) => `${label}: ${text}`);
    const message = ['Hola, tengo una consulta sobre BotEngine ERP.', ...(details.length ? ['', ...details] : [])].join('\n');

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
    const alert = showAlert('Para restablecer tu contraseña, pide ayuda al administrador de tu empresa o escríbenos por WhatsApp. ', 'info', 0);
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'alert-link';
    link.textContent = 'Abrir WhatsApp';
    link.addEventListener('click', openSupportWhatsApp);
    alert?.querySelector('span')?.appendChild(link);
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
