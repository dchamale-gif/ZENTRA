// ============================================
// PAGO DIVIDIDO
// Una venta pagada con varias formas a la vez (por ejemplo, parte en efectivo y el
// resto con tarjeta). Lo usan el cobro del punto de venta y el formulario de Ventas.
// ============================================

const PagoDividido = {
    METODOS: [
        { id: 'efectivo', label: 'Efectivo', icon: 'fa-money-bill-wave' },
        { id: 'tarjeta', label: 'Tarjeta', icon: 'fa-credit-card' },
        { id: 'transferencia', label: 'Transferencia', icon: 'fa-building-columns' }
    ],
    LABELS: { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', credito: 'Crédito', mixto: 'Pago dividido' },

    // Pinta los campos dentro de container. getTotal() da el total a cubrir en ese momento.
    montar(container, { prefijo, getTotal, onChange = () => {} }) {
        container.classList.add('pago-dividido');
        container.innerHTML = `
            <p class="pago-dividido-ayuda">Escribe cuánto paga con cada forma. «Resto» completa lo que falta.</p>
            ${this.METODOS.map(metodo => `
                <div class="pago-dividido-fila">
                    <label for="${prefijo}-${metodo.id}"><i class="fas ${metodo.icon}" aria-hidden="true"></i> ${metodo.label}</label>
                    <input id="${prefijo}-${metodo.id}" class="form-input" type="text" inputmode="decimal" autocomplete="off"
                        placeholder="0.00" data-pago="${metodo.id}">
                    <button type="button" class="btn btn-secondary btn-sm" data-pago-resto="${metodo.id}"
                        aria-label="Completar con ${metodo.label.toLowerCase()} lo que falta">Resto</button>
                </div>`).join('')}
            <p class="pago-dividido-estado" data-pago-estado aria-live="polite"></p>`;
        container.addEventListener('input', () => {
            this.render(container, getTotal());
            onChange();
        });
        container.addEventListener('click', (event) => {
            const boton = event.target.closest('[data-pago-resto]');
            if (!boton) return;
            const metodo = boton.dataset.pagoResto;
            const otros = this.leer(container, metodo).centavos;
            const resto = Math.max(0, Math.round(getTotal() * 100) - otros);
            const input = container.querySelector(`[data-pago="${metodo}"]`);
            input.value = (resto / 100).toFixed(2);
            input.focus();
            this.render(container, getTotal());
            onChange();
        });
    },

    // Montos escritos; omitir deja fuera una forma (para calcular el «Resto»).
    leer(container, omitir = '') {
        let centavos = 0;
        let invalido = null;
        const pagos = [];
        container.querySelectorAll('[data-pago]').forEach(input => {
            const metodo = input.dataset.pago;
            if (metodo === omitir || !input.value.trim()) return;
            const monto = typeof parseMonto === 'function' ? parseMonto(input.value) : Number(input.value);
            if (!Number.isFinite(monto) || monto < 0) {
                invalido ||= input;
                return;
            }
            const parte = Math.round(monto * 100);
            if (parte > 0) pagos.push({ metodo, monto: parte / 100 });
            centavos += parte;
        });
        return { pagos, centavos, invalido };
    },

    // Revisa que las partes sumen el total. Devuelve { pagos } o { error, focus }.
    validar(container, total) {
        const { pagos, centavos, invalido } = this.leer(container);
        if (invalido) return { error: 'Escribe un monto válido, por ejemplo 150.50.', focus: invalido };
        const esperado = Math.round(total * 100);
        if (!pagos.length) {
            return { error: 'Escribe cuánto se paga con cada forma.', focus: container.querySelector('[data-pago]') };
        }
        if (centavos !== esperado) {
            const diferencia = formatQ(Math.abs(esperado - centavos) / 100);
            return {
                error: centavos < esperado ? `Los pagos no completan el total: faltan ${diferencia}.` : `Los pagos pasan del total: sobran ${diferencia}.`,
                focus: container.querySelector('[data-pago]')
            };
        }
        return { pagos };
    },

    render(container, total) {
        const estado = container.querySelector('[data-pago-estado]');
        if (!estado) return;
        const { centavos, invalido } = this.leer(container);
        const esperado = Math.round(total * 100);
        const diferencia = esperado - centavos;
        estado.classList.toggle('pago-dividido-ok', !invalido && diferencia === 0 && centavos > 0);
        estado.classList.toggle('pago-dividido-falta', Boolean(invalido) || diferencia !== 0);
        if (invalido) {
            estado.textContent = 'Hay un monto que no es válido.';
        } else if (diferencia === 0 && centavos > 0) {
            estado.textContent = `Total ${formatQ(total)} completo.`;
        } else if (diferencia > 0) {
            estado.textContent = `Total ${formatQ(total)} · faltan ${formatQ(diferencia / 100)}`;
        } else {
            estado.textContent = `Total ${formatQ(total)} · sobran ${formatQ(-diferencia / 100)}`;
        }
    },

    // Cuánto de lo escrito es en efectivo (para calcular el cambio).
    efectivo(container) {
        return this.leer(container).pagos.find(pago => pago.metodo === 'efectivo')?.monto || 0;
    },

    llenar(container, pagos = []) {
        container.querySelectorAll('[data-pago]').forEach(input => {
            const pago = pagos.find(entry => entry.metodo === input.dataset.pago);
            input.value = pago ? Number(pago.monto).toFixed(2) : '';
        });
    },

    limpiar(container) {
        this.llenar(container, []);
    },

    // «Efectivo Q50.00 + Tarjeta Q151.00»
    texto(pagos) {
        return (pagos || []).map(pago => `${this.LABELS[pago.metodo] || pago.metodo} ${formatQ(Number(pago.monto))}`).join(' + ');
    }
};
