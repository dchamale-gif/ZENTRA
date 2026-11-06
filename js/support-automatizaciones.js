// Pestaña "Automatizaciones" del panel de soporte: muestra dentro del panel el portal
// AutomatizacionBotEngine (Selenium), que el servidor publica en /pruebas solo para
// quien tiene sesión de soporte. El portal se carga la primera vez que se abre la pestaña.

const RUTA_AUTOMATIZACIONES = '/pruebas/';
let automatizacionesCargadas = false;

document.addEventListener('DOMContentLoaded', () => {
    if (!authManager.getUser()?.platformAdmin) return;
    document.getElementById('autoReload').addEventListener('click', recargarAutomatizaciones);
    if (window.location.hash === '#automatizaciones') cargarAutomatizaciones();
});

async function cargarAutomatizaciones({ forzar = false } = {}) {
    if (automatizacionesCargadas && !forzar) return;
    const frame = document.getElementById('autoFrame');
    const estado = document.getElementById('autoEstado');
    estado.className = 'card empty-note';
    estado.textContent = 'Conectando con el portal de automatizaciones...';
    estado.hidden = false;
    frame.hidden = true;

    let respuesta = null;
    try {
        respuesta = await fetch(`${RUTA_AUTOMATIZACIONES}login`, { cache: 'no-store', redirect: 'manual' });
    } catch (error) {
        respuesta = null;
    }

    // Sin sesión de soporte el servidor no deja pasar al portal.
    if (respuesta && (respuesta.status === 401 || respuesta.status === 403)) {
        window.location.href = '/login.html';
        return;
    }
    if (!respuesta || !(respuesta.ok || respuesta.type === 'opaqueredirect')) {
        mostrarAutomatizacionesApagadas(respuesta ? respuesta.status : 0);
        return;
    }

    frame.src = RUTA_AUTOMATIZACIONES;
    frame.hidden = false;
    estado.hidden = true;
    automatizacionesCargadas = true;
}

function recargarAutomatizaciones() {
    const frame = document.getElementById('autoFrame');
    if (automatizacionesCargadas && frame.contentWindow) frame.contentWindow.location.reload();
    else cargarAutomatizaciones({ forzar: true });
}

function mostrarAutomatizacionesApagadas(status) {
    const estado = document.getElementById('autoEstado');
    estado.className = 'card auto-off';
    estado.innerHTML = `
        <h3>El portal de automatizaciones no responde</h3>
        <p>Puede estar arrancando (tarda cerca de un minuto) o no estar encendido en el servidor.
        Para encenderlo, agrega <code>COMPOSE_PROFILES=automatizaciones</code> al archivo .env del
        servidor y ejecuta <code>docker compose up -d --build</code>.${status ? ` (Respuesta ${status})` : ''}</p>
        <button class="secondary" type="button" id="autoRetry"><i class="fas fa-rotate" aria-hidden="true"></i> Reintentar</button>`;
    document.getElementById('autoRetry').addEventListener('click', () => cargarAutomatizaciones({ forzar: true }));
}
