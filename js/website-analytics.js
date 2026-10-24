// Visitas del sitio web (vienen de WebBotEngine a través de /api/platform/website-analytics)
document.addEventListener('DOMContentLoaded', () => {
    if (!authManager.getUser()?.platformAdmin) return;
    document.getElementById('analyticsDays').addEventListener('change', loadWebsiteAnalytics);
    loadWebsiteAnalytics();
});

const formatNumber = (value) => Number(value || 0).toLocaleString('es-GT');
const formatDay = (day) => new Date(`${day}T12:00:00`).toLocaleDateString('es-GT', { day: 'numeric', month: 'short' });

async function loadWebsiteAnalytics() {
    const container = document.getElementById('analyticsBody');
    const days = document.getElementById('analyticsDays').value;
    try {
        const response = await authManager.fetchWithAuth(`/api/platform/website-analytics?days=${days}`);
        if (!response) return;
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudieron cargar las visitas');
        container.innerHTML = renderAnalytics(data);
        bindChartTooltip(container.querySelector('.daily-chart'));
    } catch (error) {
        container.innerHTML = `<div class="card empty-note">No se pudieron cargar las visitas: ${escapeHtml(error.message)}. Revisa que la clave del sitio esté configurada en el servidor y vuelve a intentar.</div>`;
    }
}

function renderAnalytics(data) {
    const { totals } = data;
    const stat = (label, visitors, views) => `
        <div class="card stat">
            <div class="label">${label}</div>
            <div class="value">${formatNumber(visitors)}</div>
            <div class="sub">personas · ${formatNumber(views)} páginas vistas</div>
        </div>`;

    return `
        <div class="stat-grid">
            ${stat('Hoy', totals.today.visitors, totals.today.views)}
            ${stat('Últimos 7 días', totals.week.visitors, totals.week.views)}
            ${stat(`Últimos ${data.days} días`, totals.period.visitors, totals.period.views)}
        </div>
        <div class="card chart-card">
            <h3>Personas por día</h3>
            ${renderDailyChart(fillDays(data.daily, data.days))}
        </div>
        <div class="analytics-lists">
            ${renderRank('Páginas más vistas', data.pages.map(p => [p.path === '/' ? 'Inicio' : p.path, p.views]), 'vistas')}
            ${renderRank('De dónde llegan', data.sources.map(s => [s.source, s.visitors]), 'personas')}
            ${renderRank('Dispositivo', data.devices.map(d => [d.device, d.visitors]), 'personas')}
        </div>`;
}

// Completa con ceros los días sin visitas para que el eje no salte
function fillDays(daily, days) {
    const byDay = new Map(daily.map(entry => [entry.day, entry]));
    const result = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const key = date.toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' });
        result.push(byDay.get(key) || { day: key, views: 0, visitors: 0 });
    }
    return result;
}

function renderDailyChart(series) {
    const max = Math.max(1, ...series.map(entry => entry.visitors));
    if (series.every(entry => entry.visitors === 0)) {
        return '<p class="empty-note">Todavía no hay visitas registradas en este periodo. Aparecerán aquí cuando alguien entre al sitio.</p>';
    }
    const bars = series.map(entry => `
        <div class="bar" tabindex="0" data-day="${escapeHtml(formatDay(entry.day))}" data-visitors="${entry.visitors}" data-views="${entry.views}"
             aria-label="${escapeHtml(formatDay(entry.day))}: ${entry.visitors} personas">
            <span style="height:${(entry.visitors / max) * 100}%"></span>
        </div>`).join('');
    return `
        <div class="daily-chart">${bars}</div>
        <div class="chart-axis"><span>${formatDay(series[0].day)}</span><span>Máximo: ${formatNumber(max)} personas</span><span>${formatDay(series[series.length - 1].day)}</span></div>`;
}

function bindChartTooltip(chart) {
    if (!chart) return;
    const tip = document.createElement('div');
    tip.className = 'chart-tip hidden';
    chart.appendChild(tip);
    const show = (bar) => {
        tip.innerHTML = `<strong>${bar.dataset.day}</strong><br>${formatNumber(bar.dataset.visitors)} personas · ${formatNumber(bar.dataset.views)} vistas`;
        const barBox = bar.getBoundingClientRect();
        const chartBox = chart.getBoundingClientRect();
        const center = barBox.left - chartBox.left + barBox.width / 2;
        tip.style.left = `${Math.min(Math.max(center, 70), chartBox.width - 70)}px`;
        tip.style.top = `${barBox.bottom - chartBox.top - bar.firstElementChild.offsetHeight - 6}px`;
        tip.classList.remove('hidden');
    };
    const hide = () => tip.classList.add('hidden');
    chart.querySelectorAll('.bar').forEach(bar => {
        bar.addEventListener('mouseenter', () => show(bar));
        bar.addEventListener('focus', () => show(bar));
        bar.addEventListener('mouseleave', hide);
        bar.addEventListener('blur', hide);
    });
}

function renderRank(title, rows, unit) {
    const max = Math.max(1, ...rows.map(([, count]) => count));
    const body = rows.length
        ? rows.map(([name, count]) => `
            <div class="rank-row">
                <span class="name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
                <span class="count">${formatNumber(count)} ${unit}</span>
                <span class="track"><span style="width:${(count / max) * 100}%"></span></span>
            </div>`).join('')
        : '<p class="empty-note">Sin datos en este periodo.</p>';
    return `<div class="card list-card"><h3>${title}</h3>${body}</div>`;
}
