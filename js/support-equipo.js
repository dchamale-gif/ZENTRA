// Pestaña "Equipo": cuentas que entran al panel de soporte. Se crean, cambian de contraseña
// y se activan o desactivan aquí, sin entrar al servidor.
// Usa apiRequest, showMessage, escapeHtml (support.js) y openModal, closeModal, withButton,
// showCredentials (support-crm.js).

const equipo = { lista: [], yo: null, editando: null };

document.addEventListener('DOMContentLoaded', () => {
    if (!authManager.getUser()?.platformAdmin) return;
    document.getElementById('newStaffButton').addEventListener('click', () => abrirStaff(null));
    document.getElementById('staffForm').addEventListener('submit', guardarStaff);
    document.getElementById('staffBody').addEventListener('click', accionStaff);
    if (window.location.hash === '#equipo') cargarEquipo();
});

async function cargarEquipo() {
    try {
        const data = await apiRequest('/equipo');
        if (!data) return;
        equipo.lista = data.equipo;
        equipo.yo = data.yo;
        renderEquipo();
    } catch (error) {
        document.getElementById('staffBody').innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`;
    }
}

function renderEquipo() {
    const body = document.getElementById('staffBody');
    if (!equipo.lista.length) {
        body.innerHTML = '<tr><td colspan="5">Aún no hay usuarios de soporte.</td></tr>';
        return;
    }
    body.innerHTML = equipo.lista.map(persona => {
        const soyYo = persona.id === equipo.yo;
        const estado = persona.activo
            ? '<span class="status activa">Activo</span>'
            : '<span class="status inactiva">Desactivado</span>';
        const acceso = persona.ultimo_login ? new Date(persona.ultimo_login).toLocaleString('es-GT') : 'Nunca';
        const botonEstado = soyYo ? '' : persona.activo
            ? `<button class="secondary" type="button" data-staff="desactivar" data-id="${persona.id}"><i class="fas fa-user-slash" aria-hidden="true"></i> Desactivar</button>`
            : `<button class="secondary" type="button" data-staff="activar" data-id="${persona.id}"><i class="fas fa-user-check" aria-hidden="true"></i> Activar</button>`;
        return `<tr class="${persona.activo ? '' : 'inactive-row'}">
            <td><strong>${escapeHtml(persona.nombre)}</strong>${soyYo ? '<span class="user-tag">Tú</span>' : ''}</td>
            <td>${escapeHtml(persona.email)}</td>
            <td>${estado}</td>
            <td>${escapeHtml(acceso)}</td>
            <td><div class="row-actions">
                <button class="secondary" type="button" data-staff="password" data-id="${persona.id}"><i class="fas fa-key" aria-hidden="true"></i> Cambiar contraseña</button>
                ${botonEstado}
            </div></td>
        </tr>`;
    }).join('');
}

// persona = null: alta nueva; si no, cambio de contraseña de esa cuenta.
function abrirStaff(persona) {
    equipo.editando = persona;
    const nuevo = !persona;
    document.getElementById('staffForm').reset();
    document.querySelectorAll('[data-staff-new]').forEach(grupo => { grupo.hidden = !nuevo; });
    document.getElementById('staffName').required = nuevo;
    document.getElementById('staffEmail').required = nuevo;
    document.getElementById('staffTitle').textContent = nuevo ? 'Nuevo usuario de soporte' : 'Cambiar contraseña';
    document.getElementById('staffHint').textContent = nuevo
        ? 'Podrá entrar a este panel con su correo y contraseña desde la misma página de inicio de sesión.'
        : `Cuenta: ${persona.email}. La contraseña actual deja de funcionar.`;
    document.getElementById('staffSubmit').textContent = nuevo ? 'Crear usuario' : 'Cambiar contraseña';
    openModal('staffModal');
}

async function guardarStaff(event) {
    event.preventDefault();
    const boton = document.getElementById('staffSubmit');
    const password = document.getElementById('staffPassword').value;
    const persona = equipo.editando;
    await withButton(boton, async () => {
        try {
            const data = persona
                ? await apiRequest(`/equipo/${persona.id}/password`, { method: 'POST', body: JSON.stringify({ password }) })
                : await apiRequest('/equipo', {
                    method: 'POST',
                    body: JSON.stringify({
                        nombre: document.getElementById('staffName').value,
                        email: document.getElementById('staffEmail').value,
                        password
                    })
                });
            if (!data) return;
            closeModal('staffModal');
            showMessage(data.message);
            showCredentials(data, {
                hint: 'Compártelos con la persona por un medio privado (no se envían por correo).',
                note: 'Esta contraseña no se vuelve a mostrar. Si se pierde, usa «Cambiar contraseña».',
                passwordLabel: 'Contraseña'
            });
            await cargarEquipo();
        } catch (error) {
            alert(error.message);
        }
    });
}

async function accionStaff(event) {
    const boton = event.target.closest('[data-staff]');
    if (!boton) return;
    const persona = equipo.lista.find(item => item.id === Number(boton.dataset.id));
    if (!persona) return;
    if (boton.dataset.staff === 'password') {
        abrirStaff(persona);
        return;
    }
    const activo = boton.dataset.staff === 'activar';
    if (!activo && !confirm(`¿Desactivar a ${persona.email}? Pierde el acceso al panel de soporte de inmediato.`)) return;
    await withButton(boton, async () => {
        try {
            const data = await apiRequest(`/equipo/${persona.id}/estado`, { method: 'POST', body: JSON.stringify({ activo }) });
            if (!data) return;
            showMessage(data.message);
            await cargarEquipo();
        } catch (error) {
            alert(error.message);
        }
    });
}
