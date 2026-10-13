const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outputRoot = path.join(root, 'ediciones');
const basicRoot = path.join(outputRoot, 'zentra-basico');
const medRoot = path.join(outputRoot, 'zentra-med');

const excludedNames = new Set([
  '.git',
  '.agents',
  '.DS_Store',
  '.env',
  'certs',
  'coverage',
  'ediciones',
  'node_modules'
]);

const medicalPages = [
  'pacientes',
  'medicinas',
  'historia-clinica',
  'saldo-paciente',
  'hospitalizaciones',
  'ordenes-medicas',
  'personal',
  'agenda',
  'reservas-web',
  'confirmaciones',
  'google-calendar',
  'alertas'
];

const medicalScripts = [
  'agenda-api.js',
  'agenda-avanzada.js',
  'agenda.js',
  'alertas.js',
  'confirmaciones.js',
  'facturacion-mejorada.js',
  'facturacion.js',
  'google-calendar.js',
  'historia-clinica.js',
  'hospitalizaciones.js',
  'medicinas.js',
  'ordenes-medicas.js',
  'pacientes-file-manager.js',
  'pacientes.js',
  'personal.js',
  'reservas-web.js',
  'saldo-paciente-facturacion-integrado.js',
  'saldo-paciente-integrado.js',
  'saldo-paciente.js'
];

const medicalBackendFiles = [
  'run-billing-migration.js',
  'src/db/migration.js',
  'src/utils/billing-helpers.js',
  'src/routes/billing-mejorada.js',
  'src/routes/billing.js',
  'src/routes/alertasRoutes.js',
  'src/routes/appointments.js',
  'src/routes/contactosEmergenciaRoutes.js',
  'src/routes/datosFamiliaRoutes.js',
  'src/routes/doctors.js',
  'src/routes/documentosPacienteRoutes.js',
  'src/routes/empresasRoutes.js',
  'src/routes/hospitalizaciones.js',
  'src/routes/laboratoriosRoutes.js',
  'src/routes/medicinas.js',
  'src/routes/ordenesRoutes.js',
  'src/routes/pacientes.js',
  'src/routes/personalMedicoRoutes.js',
  'src/routes/responsablesRoutes.js',
  'src/controllers/alertasController.js',
  'src/controllers/appointmentsController.js',
  'src/controllers/billingController.js',
  'src/controllers/billingMejoradoController.js',
  'src/controllers/contactosEmergenciaController.js',
  'src/controllers/datosFamiliaController.js',
  'src/controllers/doctorsController.js',
  'src/controllers/documentosPacienteController.js',
  'src/controllers/empresasController.js',
  'src/controllers/hospitalizacionesController.js',
  'src/controllers/laboratoriosController.js',
  'src/controllers/medicinasController.js',
  'src/controllers/ordenesController.js',
  'src/controllers/pacientesController.js',
  'src/controllers/personalMedicoController.js',
  'src/controllers/responsablesController.js'
];

const medicalRouteVariables = new Set([
  'alertasRoutes',
  'appointmentsRoutes',
  'billingMejoradaRoutes',
  'billingRoutes',
  'contactosEmergenciaRoutes',
  'datosFamiliaRoutes',
  'doctorsRoutes',
  'documentosPacienteRoutes',
  'empresasRoutes',
  'hospitalizacionesRoutes',
  'laboratoriosRoutes',
  'medicinasRoutes',
  'ordenesRoutes',
  'pacientesRoutes',
  'personalMedicoRoutes',
  'responsablesRoutes'
]);

const medicalRootFiles = [
  'database/DOCUMENTOS_PACIENTE_README.md',
  'database/FACTURACION_DATOS_EJEMPLO_README.md',
  'database/add-familia-subfamilia-medicinas.sql',
  'database/alter-documentos-paciente.sql',
  'database/billing-schema-extension.sql',
  'database/create-pacientes-table.sql',
  'database/facturacion-datos-ejemplo.sql',
  'database/facturacion-mejorada-migration.sql',
  'database/fix-contactos-emergencia-serial.sql',
  'database/fix-datos-familia-responsables-serial.sql',
  'database/fix-documentos-paciente.sql',
  'database/fix-empresas-id-serial.sql',
  'database/fix-historial-medico-tablas.sql',
  'database/medicamentos-familia-subfamilia-datos-ejemplo.sql',
  'database/ordenes-medicas-migration.sql',
  'database/personal-medico-migration.sql',
  'database/recreate-movement-tables.sql',
  'database/unificar-facturacion-ventas.sql',
  'facturacion-ejemplo.html',
  'facturacion-mejorada.html',
  'facturacion-testing.html',
  'install-billing-module.sh',
  'load-facturacion-datos-ejemplo.sh',
  'saldo-paciente.html'
];

function shouldCopy(source) {
  const name = path.basename(source);
  if (excludedNames.has(name)) return false;
  if (name.endsWith('.log') || name.endsWith('.backup') || name.endsWith('.bak')) return false;
  if (name.startsWith('.env.') && name !== '.env.example') return false;
  return true;
}

function copyProject(destination) {
  function copyDirectory(source, target) {
    fs.mkdirSync(target, { recursive: true });

    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      const sourcePath = path.join(source, entry.name);
      if (!shouldCopy(sourcePath)) continue;

      const targetPath = path.join(target, entry.name);
      if (entry.isDirectory()) {
        copyDirectory(sourcePath, targetPath);
      } else if (entry.isSymbolicLink()) {
        fs.symlinkSync(fs.readlinkSync(sourcePath), targetPath);
      } else {
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
  }

  copyDirectory(root, destination);
}

function read(relativePath) {
  return fs.readFileSync(path.join(basicRoot, relativePath), 'utf8');
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(basicRoot, relativePath), content);
}

function removeBalancedDiv(html, id) {
  const marker = `<div id="page-${id}"`;
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) return html;

  const start = html.lastIndexOf('\n', markerIndex) + 1;
  const tagPattern = /<\/?div\b[^>]*>/gi;
  tagPattern.lastIndex = markerIndex;
  let depth = 0;
  let match;

  while ((match = tagPattern.exec(html))) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (depth === 0) {
      let end = tagPattern.lastIndex;
      while (html[end] === '\r' || html[end] === '\n') end++;
      return html.slice(0, start) + html.slice(end);
    }
  }

  throw new Error(`No se encontro el cierre de page-${id}`);
}

function createBasicFrontend() {
  let html = read('index.html');

  for (const page of medicalPages) {
    const escapedPage = page.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const navPattern = new RegExp(
      `\\s*<a[^>]+data-page="${escapedPage}"[^>]*>[\\s\\S]*?<\\/a>`,
      'g'
    );
    html = html.replace(navPattern, '');
    html = removeBalancedDiv(html, page);
  }

  html = html
    .replace(/\s*<!-- M[ÓO]DULO M[ÉE]DICO -->\s*<div class="nav-section-title">M[ÓO]DULO M[ÉE]DICO<\/div>/g, '')
    .replace(/\s*<!-- M[ÓO]DULO AGENDA -->\s*<div class="nav-section-title">AGENDA M[ÉE]DICA<\/div>/g, '')
    .replace(/\s*<script src="js\/(?:agenda-api|agenda-avanzada|agenda|alertas|confirmaciones|google-calendar|historia-clinica|hospitalizaciones|medicinas|ordenes-medicas|pacientes-file-manager|pacientes|personal|reservas-web|saldo-paciente-facturacion-integrado|saldo-paciente-integrado|saldo-paciente)\.js"><\/script>/g, '')
    .replace(/\s*<section class="executive-section"[\s\S]*?<\/section>/, '')
    .replaceAll('Zentra MED', 'Zentra')
    .replaceAll('ZENTRA MED', 'ZENTRA');

  write('index.html', html);

  for (const script of medicalScripts) {
    fs.rmSync(path.join(basicRoot, 'js', script), { force: true });
  }

  for (const file of medicalRootFiles) {
    fs.rmSync(path.join(basicRoot, file), { force: true });
  }

  const appPath = 'js/app.js';
  const app = read(appPath)
    .replaceAll('Zentra MED', 'Zentra')
    .replaceAll('ZENTRA MED', 'ZENTRA');
  write(appPath, app);

  const dashboardPath = 'js/dashboard-financiero.js';
  const dashboard = read(dashboardPath)
    .replace(/\n\s*try \{\n\s*const response = await fetch\(\n\s*APIHelper\.baseURL \+ '\/reports\/executive-summary',[\s\S]*?No se pudo cargar el resumen operativo:', error\.message\);\n\s*\}/, '')
    .replace(/\n\s*this\.renderExecutiveSummary\(\);/, '')
    .replace(/\n\s*this\.renderOperationalCharts\(\);/, '');
  write(dashboardPath, dashboard);

  for (const file of ['login.html', 'frontend-server.js']) {
    const target = path.join(basicRoot, file);
    if (!fs.existsSync(target)) continue;
    write(file, read(file).replaceAll('Zentra MED', 'Zentra').replaceAll('ZENTRA MED', 'ZENTRA'));
  }
}

function createBasicBackend() {
  let server = read('backend/server.js');
  server = server
    .split('\n')
    .filter(line => {
      const routeVariable = [...medicalRouteVariables].find(variable => line.includes(variable));
      const obsoleteMedicalComment = line.trim().startsWith('//') &&
        /(paciente|medicina|facturaci[oó]n|doctor|personal m[eé]dico|cita|hospitalizaci[oó]n|contacto de emergencia|historial m[eé]dico|datos familiares|responsables del paciente|documentos.*paciente)/i.test(line);
      return !routeVariable && !obsoleteMedicalComment;
    })
    .join('\n')
    .replace("const { runMigrations } = require('./src/db/migration');\n", '')
    .replace(
      /\/\/ Ejecutar migraciones al iniciar[\s\S]*?module\.exports = app;/,
      `app.listen(PORT, () => {\n  console.log(\`Zentra API disponible en http://0.0.0.0:\${PORT}\`);\n});\n\nmodule.exports = app;`
    )
    .replaceAll('ZENTRA MED', 'ZENTRA')
    .replaceAll('Zentra MED', 'Zentra');
  write('backend/server.js', server);

  const reportsRoutePath = 'backend/src/routes/reports.js';
  const reportsRoute = read(reportsRoutePath).replace(
    /\n\/\/ Resumen operativo ejecutivo\nrouter\.get\('\/executive-summary',[\s\S]*?\n\}\);\n/,
    ''
  );
  write(reportsRoutePath, reportsRoute);

  for (const relativePath of medicalBackendFiles) {
    fs.rmSync(path.join(basicRoot, 'backend', relativePath), { force: true });
  }

  const packagePath = 'backend/package.json';
  const packageJson = JSON.parse(read(packagePath));
  packageJson.name = 'zentra-backend';
  packageJson.description = 'Backend base de Zentra para modulos administrativos y contables';
  write(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

  const envPath = '.env.example';
  write(envPath, read(envPath).replaceAll('zentra_med', 'zentra_base'));
}

function writeEditionReadmes() {
  fs.writeFileSync(path.join(basicRoot, 'EDICION.md'), `# Zentra Basico\n\nEdicion para demostraciones y replicas de clientes sin interfaz ni API medica.\n\n## Alcance\n\n- Autenticacion y administracion.\n- Articulos, inventario, proveedores, compras y ventas.\n- Caja, cuentas por cobrar, estados de cuenta, gastos y reportes.\n- Sin pacientes, medicinas, historia clinica, hospitalizaciones, ordenes medicas ni agenda.\n\n## Compatibilidad de datos\n\nEl esquema SQL historico se conserva porque varios controladores contables actuales todavia admiten referencias opcionales a pacientes y medicinas. Estas tablas no se exponen por interfaz ni API en esta edicion. Antes de usar esta carpeta como producto generico definitivo, conviene migrar esas referencias a clientes y articulos.\n\n## Inicio\n\n1. Configure \`.env\` desde \`.env.example\`.\n2. Ejecute \`npm install\` dentro de \`backend\`.\n3. Ejecute \`npm start\` dentro de \`backend\`.\n4. Sirva la raiz con \`node frontend-server.js\`.\n`);

  fs.writeFileSync(path.join(medRoot, 'EDICION.md'), `# Zentra MED\n\nCopia completa de Zentra con los modulos administrativos, contables y medicos.\n\n## Inicio\n\n1. Configure \`.env\` desde \`.env.example\`.\n2. Ejecute \`npm install\` dentro de \`backend\`.\n3. Ejecute \`npm start\` dentro de \`backend\`.\n4. Sirva la raiz con \`node frontend-server.js\`.\n`);
}

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });
copyProject(medRoot);
copyProject(basicRoot);
createBasicFrontend();
createBasicBackend();
writeEditionReadmes();

console.log(`Ediciones creadas en ${outputRoot}`);