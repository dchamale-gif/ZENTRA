const crypto = require('crypto');
const pool = require('../db/platformConnection');
const authPool = require('../db/authConnection');
const { enviarVerificacion, reenviar, hashInutilizable } = require('../utils/onboarding');
const { leerContrato, registrarContrato, enviarDocumentos, previsualizar } = require('../utils/contratos');
const { MODULES, MODULE_KEYS } = require('../utils/modules');

const LICENSE_STATUSES = new Set(['trial', 'active', 'suspended', 'cancelled']);
const DEFAULT_MAX_USERS = 3;

// Devuelve el número de usuarios validado, o null si no es válido.
const parseMaxUsers = (value) => {
  const maxUsers = Number(value);
  return Number.isInteger(maxUsers) && maxUsers >= 1 && maxUsers <= 1000 ? maxUsers : null;
};

const ACTIVE_USERS_SQL = `(SELECT COUNT(*) FROM users u WHERE u.organization_id = organizations.id AND u.activo)::INTEGER AS active_users`;

const generateLicenseKey = () => {
  const value = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`;
};

const mapOrganization = (row) => ({
  id: row.id,
  name: row.nombre,
  sector: row.sector_comercial,
  email: row.email,
  nit: row.nit,
  status: row.subscription_status,
  plan: row.license_plan,
  licenseKey: row.license_key,
  licenseIssuedAt: row.license_issued_at,
  maxUsers: row.license_max_users,
  // null = todos los módulos habilitados
  modules: row.modulos_habilitados ?? null,
  // Facturación electrónica: solo soporte la habilita.
  fel: row.fel_habilitada === true,
  activeUsers: Number(row.active_users || 0),
  // Primer usuario de la empresa: si ya verificó su correo y si aún no crea su contraseña.
  admin: row.admin_estado || null,
  trialEndsAt: row.trial_ends_at,
  subscriptionStartedAt: row.subscription_started_at,
  subscriptionEndsAt: row.subscription_ends_at,
  daysRemaining: Number(row.days_remaining || 0),
  telefono: row.telefono ?? null,
  cuotaMensual: row.cuota_mensual === undefined || row.cuota_mensual === null ? null : Number(row.cuota_mensual),
  saldoPendiente: Number(row.saldo?.pendiente || 0),
  saldoVencido: Number(row.saldo?.vencido || 0),
  ultimoIngreso: row.ultimo_ingreso || null,
  createdAt: row.created_at
});

// Todas las empresas, con su cuota y lo que deben; el panel filtra por estado y vencimiento.
const listOrganizations = async (req, res) => {
  try {
    const result = await authPool.query(
      `SELECT id, nombre, sector_comercial, email, nit, telefono, subscription_status,
              license_plan, license_key, license_issued_at, license_max_users, modulos_habilitados, fel_habilitada, trial_ends_at,
              subscription_started_at, subscription_ends_at, created_at, cuota_mensual,
              ${ACTIVE_USERS_SQL},
              (SELECT json_build_object('email', u.email, 'verificado', u.email_verificado_en IS NOT NULL,
                                        'pendienteCambio', u.debe_cambiar_password)
               FROM users u WHERE u.organization_id = organizations.id
               ORDER BY u.created_at, u.id LIMIT 1) AS admin_estado,
              (SELECT json_build_object(
                        'pendiente', COALESCE(SUM(f.total), 0),
                        'vencido', COALESCE(SUM(f.total) FILTER (WHERE f.fecha_vencimiento < (NOW() AT TIME ZONE 'America/Guatemala')::DATE), 0))
               FROM facturas_plataforma f
               WHERE f.organization_id = organizations.id AND f.estado = 'pendiente') AS saldo,
              (SELECT MAX(u.ultimo_login) FROM users u WHERE u.organization_id = organizations.id) AS ultimo_ingreso,
              GREATEST(
                0,
                CEIL(EXTRACT(EPOCH FROM (
                  COALESCE(subscription_ends_at, trial_ends_at) - NOW()
                )) / 86400)
              ) AS days_remaining
       FROM organizations
       ORDER BY COALESCE(subscription_ends_at, trial_ends_at) ASC NULLS LAST, created_at DESC`
    );

    res.json({
      success: true,
      organizations: result.rows.map(mapOrganization)
    });
  } catch (error) {
    console.error('Error listando organizaciones:', error);
    res.status(500).json({ error: 'Error obteniendo empresas' });
  }
};

const getOrganization = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.id, o.nombre, o.sector_comercial, o.email, o.nit,
              o.subscription_status, o.license_plan, o.license_key,
              o.license_issued_at, o.license_max_users, o.modulos_habilitados, o.fel_habilitada, o.trial_ends_at,
              o.subscription_started_at, o.subscription_ends_at, o.created_at,
              COUNT(u.id)::INTEGER AS user_count,
              (COUNT(u.id) FILTER (WHERE u.activo))::INTEGER AS active_users
       FROM organizations o
       LEFT JOIN users u ON u.organization_id = o.id
       WHERE o.id = $1
       GROUP BY o.id`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }
    res.json({ success: true, organization: mapOrganization(result.rows[0]), users: result.rows[0].user_count });
  } catch (error) {
    console.error('Error obteniendo organización:', error);
    res.status(500).json({ error: 'Error obteniendo empresa' });
  }
};

const createOrganization = async (req, res) => {
  let client;
  try {
    const {
      name,
      sector,
      email,
      nit,
      adminName,
      plan = 'Demo',
      durationDays = 30,
      maxUsers = DEFAULT_MAX_USERS
    } = req.body;
    const days = Number(durationDays);
    const userLimit = parseMaxUsers(maxUsers);
    const correo = String(email || '').trim().toLowerCase();
    if (!String(name || '').trim() || !String(sector || '').trim() ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      return res.status(400).json({ error: 'Nombre, sector y correo válido son requeridos' });
    }
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      return res.status(400).json({ error: 'La duración debe estar entre 1 y 3650 días' });
    }
    if (!userLimit) {
      return res.status(400).json({ error: 'Los usuarios permitidos deben estar entre 1 y 1000' });
    }
    const nombreAdmin = String(adminName || '').trim().replace(/\s+/g, ' ').slice(0, 100) || 'Administrador';
    // Datos comerciales para la propuesta y el contrato; null si no se pidió enviarlos.
    const contrato = leerContrato(req.body);

    // Empresa y administrador en una sola transacción (rol de autenticación, que puede crear usuarios).
    client = await authPool.connect();
    await client.query('BEGIN');
    const existente = await client.query('SELECT 1 FROM users WHERE email = $1', [correo]);
    if (existente.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Ya existe un usuario con el correo ${correo}; usa otro correo para el administrador` });
    }
    const result = await client.query(
      `INSERT INTO organizations
       (nombre, slug, sector_comercial, email, nit, subscription_status,
        license_plan, license_key, license_issued_at, license_max_users,
        trial_started_at, trial_ends_at, modulos_habilitados, fel_habilitada)
       VALUES ($1, $2, $3, $4, $5, 'trial', $6, $7, NOW(), $9, NOW(), NOW() + ($8 * INTERVAL '1 day'), $10, $11)
       RETURNING id, nombre, sector_comercial, email, nit, subscription_status,
                 license_plan, license_key, license_issued_at, license_max_users, modulos_habilitados, fel_habilitada, trial_ends_at,
                 subscription_started_at, subscription_ends_at, created_at,
                 $8 AS days_remaining`,
      [
        String(name).trim().slice(0, 150),
        `${String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-${crypto.randomBytes(3).toString('hex')}`,
        String(sector).trim().slice(0, 150),
        correo,
        nit ? String(nit).trim().slice(0, 30) : null,
        String(plan).trim().slice(0, 50) || 'Demo',
        generateLicenseKey(),
        days,
        userLimit,
        // Con contrato, la empresa queda solo con los módulos contratados (null = todos).
        contrato && contrato.modulos.length < MODULE_KEYS.size ? contrato.modulos : null,
        contrato ? contrato.fel : false
      ]
    );
    const organization = result.rows[0];
    const usuario = await client.query(
      `INSERT INTO users
       (organization_id, email, password_hash, nombre, activo, verificado, debe_cambiar_password, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, false, true, NOW(), NOW())
       RETURNING id`,
      [organization.id, correo, await hashInutilizable(), nombreAdmin]
    );
    await client.query(
      `INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE nombre = 'admin'`,
      [usuario.rows[0].id]
    );
    const registro = contrato && await registrarContrato(client, {
      organizationId: organization.id,
      contrato,
      cliente: { nombre: organization.nombre, nit: organization.nit, contacto: nombreAdmin, correo },
      usuarios: userLimit
    });
    await client.query('COMMIT');
    client.release();
    client = null;

    // Si el correo no sale, la empresa queda creada y se reenvía desde el panel.
    let correoVerificacion = { enviado: true };
    try {
      await enviarVerificacion({ userId: usuario.rows[0].id, email: correo, nombre: nombreAdmin, empresa: organization.nombre });
    } catch (error) {
      correoVerificacion = { enviado: false, error: error.expose ? error.message : 'No se pudo enviar el correo' };
      if (!error.expose) console.error('Error enviando verificación:', error);
    }

    let documentos = null;
    if (registro) {
      documentos = { numero: registro.datos.numero, enviado: true };
      try {
        await enviarDocumentos(registro);
      } catch (error) {
        documentos = { ...documentos, enviado: false, error: error.expose ? error.message : 'No se pudieron generar o enviar los documentos' };
        if (!error.expose) console.error('Error enviando documentos de contratación:', error);
      }
    }
    const avisoDocumentos = !documentos ? ''
      : documentos.enviado
        ? ` También enviamos la propuesta, el contrato, el anexo y el acta (${documentos.numero}).`
        : ` Los documentos ${documentos.numero} no salieron: ${documentos.error}.`;

    res.status(201).json({
      success: true,
      message: (correoVerificacion.enviado
        ? `Empresa agregada. Enviamos el enlace de verificación a ${correo}.`
        : `Empresa agregada, pero el correo no salió: ${correoVerificacion.error}. Usa «Reenviar correo».`) + avisoDocumentos,
      organization: mapOrganization({ ...organization, admin_estado: { email: correo, verificado: false, pendienteCambio: true } }),
      correo: correoVerificacion,
      documentos
    });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
    if (error.expose) return res.status(error.status || 400).json({ error: error.message });
    console.error('Error creando organización desde soporte:', error);
    res.status(500).json({ error: 'Error agregando empresa' });
  }
};

// Documentos y correo que recibiría el cliente con los datos del formulario de alta, sin crear
// ni enviar nada. Los datos del cliente se recortan igual que en createOrganization.
const previewContractDocuments = async (req, res) => {
  try {
    const { name, email, nit, adminName, maxUsers = DEFAULT_MAX_USERS } = req.body;
    const correo = String(email || '').trim().toLowerCase();
    const userLimit = parseMaxUsers(maxUsers);
    if (!String(name || '').trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      return res.status(400).json({ error: 'Nombre y correo válido son requeridos' });
    }
    if (!userLimit) {
      return res.status(400).json({ error: 'Los usuarios permitidos deben estar entre 1 y 1000' });
    }
    const contrato = leerContrato(req.body);
    if (!contrato) return res.status(400).json({ error: 'Marca «Enviar contrato y documentos» para verlos' });
    const contacto = String(adminName || '').trim().replace(/\s+/g, ' ').slice(0, 100) || 'Administrador';
    const { datos, documentos, correo: mensaje } = await previsualizar({
      contrato,
      cliente: { nombre: String(name).trim().slice(0, 150), nit: nit ? String(nit).trim().slice(0, 30) : null, contacto, correo },
      usuarios: userLimit
    });
    res.json({
      success: true,
      numero: datos.numero,
      correo: { para: correo, asunto: mensaje.asunto, html: mensaje.html },
      documentos: documentos.map(({ nombre, contenido }) => ({ nombre, pdf: contenido.toString('base64') }))
    });
  } catch (error) {
    if (error.expose) return res.status(error.status || 400).json({ error: error.message });
    console.error('Error generando la vista previa de documentos:', error);
    res.status(500).json({ error: 'Error generando la vista previa de los documentos' });
  }
};

// Reenvía el enlace de verificación o, si ya verificó y no ha entrado, credenciales nuevas.
const resendOnboardingEmail = async (req, res) => {
  try {
    const message = await reenviar(req.params.id);
    res.json({ success: true, message });
  } catch (error) {
    if (error.expose) return res.status(error.status || 400).json({ error: error.message });
    console.error('Error reenviando correo:', error);
    res.status(500).json({ error: 'Error reenviando el correo' });
  }
};

// Baja de una empresa suspendida: queda cancelada, sus usuarios se desactivan y sus correos
// se renombran (baja-<id>-correo) para poder usarlos en otra empresa. No se borra ningún dato.
const deactivateOrganization = async (req, res) => {
  let client;
  try {
    client = await authPool.connect();
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT id, nombre, subscription_status FROM organizations WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    const organization = rows[0];
    if (!organization) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }
    if (!['suspended', 'cancelled'].includes(organization.subscription_status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Suspende la empresa antes de darla de baja' });
    }
    const confirmacion = String(req.body.confirmacion || '').trim().toLowerCase();
    if (confirmacion !== organization.nombre.trim().toLowerCase()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'El nombre escrito no coincide con el de la empresa' });
    }
    const usuarios = await client.query(
      `UPDATE users SET email = LEFT('baja-' || id || '-' || email, 150), activo = false, updated_at = NOW()
       WHERE organization_id = $1 AND email NOT LIKE 'baja-%'
       RETURNING id`,
      [organization.id]
    );
    await client.query(
      'DELETE FROM email_verification_tokens WHERE user_id IN (SELECT id FROM users WHERE organization_id = $1)',
      [organization.id]
    );
    await client.query(
      `UPDATE organizations SET subscription_status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [organization.id]
    );
    await client.query('COMMIT');
    const liberados = usuarios.rowCount;
    res.json({
      success: true,
      message: `${organization.nombre} quedó dada de baja; ${liberados} ${liberados === 1 ? 'correo quedó libre' : 'correos quedaron libres'} para usarse en otra empresa`
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Error dando de baja la empresa:', error);
    res.status(500).json({ error: 'Error dando de baja la empresa' });
  } finally {
    if (client) client.release();
  }
};

// Impide bajar la capacidad por debajo de los usuarios que ya están activos.
const checkActiveUsersFit = async (organizationId, userLimit) => {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::INTEGER AS active_users FROM users WHERE organization_id = $1 AND activo',
    [organizationId]
  );
  const activeUsers = rows[0].active_users;
  return activeUsers > userLimit
    ? `La empresa tiene ${activeUsers} usuarios activos; desactiva algunos antes de bajar la licencia a ${userLimit}.`
    : null;
};

const updateUserLimit = async (req, res) => {
  try {
    const userLimit = parseMaxUsers(req.body.maxUsers);
    if (!userLimit) {
      return res.status(400).json({ error: 'Los usuarios permitidos deben estar entre 1 y 1000' });
    }
    const limitError = await checkActiveUsersFit(req.params.id, userLimit);
    if (limitError) return res.status(409).json({ error: limitError });

    const result = await pool.query(
      `UPDATE organizations
       SET license_max_users = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, nombre, sector_comercial, email, nit, subscription_status,
                 license_plan, license_key, license_issued_at, license_max_users, modulos_habilitados, fel_habilitada, trial_ends_at,
                 subscription_started_at, subscription_ends_at, created_at,
                 ${ACTIVE_USERS_SQL},
                 GREATEST(0, CEIL(EXTRACT(EPOCH FROM (
                   COALESCE(subscription_ends_at, trial_ends_at) - NOW()
                 )) / 86400)) AS days_remaining`,
      [userLimit, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }
    res.json({
      success: true,
      message: `Licencia actualizada a ${userLimit} usuarios`,
      organization: mapOrganization(result.rows[0])
    });
  } catch (error) {
    console.error('Error actualizando usuarios de la licencia:', error);
    res.status(500).json({ error: 'Error actualizando usuarios de la licencia' });
  }
};

const listModules = (req, res) => {
  res.json({ success: true, modules: MODULES.map(({ key, label }) => ({ key, label })) });
};

// Habilita o quita módulos a una empresa (y FEL, si viene); los usuarios lo ven al recargar.
const updateModules = async (req, res) => {
  try {
    const { modules, fel } = req.body;
    if (!Array.isArray(modules) || modules.some((key) => !MODULE_KEYS.has(key))) {
      return res.status(400).json({ error: 'Lista de módulos no válida' });
    }
    if (fel !== undefined && typeof fel !== 'boolean') {
      return res.status(400).json({ error: 'Indica si la facturación electrónica queda habilitada' });
    }
    const all = modules.length === MODULE_KEYS.size;
    const result = await pool.query(
      `UPDATE organizations SET modulos_habilitados = $1, fel_habilitada = COALESCE($3, fel_habilitada), updated_at = NOW()
       WHERE id = $2
       RETURNING id, nombre, sector_comercial, email, nit, subscription_status,
                 license_plan, license_key, license_issued_at, license_max_users, modulos_habilitados, fel_habilitada, trial_ends_at,
                 subscription_started_at, subscription_ends_at, created_at,
                 ${ACTIVE_USERS_SQL},
                 GREATEST(0, CEIL(EXTRACT(EPOCH FROM (
                   COALESCE(subscription_ends_at, trial_ends_at) - NOW()
                 )) / 86400)) AS days_remaining`,
      [all ? null : [...new Set(modules)], req.params.id, fel ?? null]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Empresa no encontrada' });
    res.json({
      success: true,
      message: all ? 'La empresa tiene todos los módulos' : `Módulos actualizados (${modules.length} habilitados)`,
      organization: mapOrganization(result.rows[0])
    });
  } catch (error) {
    console.error('Error actualizando módulos:', error);
    res.status(500).json({ error: 'Error actualizando módulos' });
  }
};

const updateLicense = async (req, res) => {
  try {
    const {
      status = 'active',
      plan = 'Demo',
      durationDays = 365,
      generateNewKey = false,
      maxUsers
    } = req.body;
    const days = Number(durationDays);
    const userLimit = maxUsers === undefined || maxUsers === null ? null : parseMaxUsers(maxUsers);
    if (!LICENSE_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Estado de licencia inválido' });
    }
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      return res.status(400).json({ error: 'La duración debe estar entre 1 y 3650 días' });
    }
    if (maxUsers !== undefined && maxUsers !== null && !userLimit) {
      return res.status(400).json({ error: 'Los usuarios permitidos deben estar entre 1 y 1000' });
    }
    if (userLimit) {
      const limitError = await checkActiveUsersFit(req.params.id, userLimit);
      if (limitError) return res.status(409).json({ error: limitError });
    }

    const newKey = generateLicenseKey();
    const result = await pool.query(
      `UPDATE organizations
       SET subscription_status = $1,
           license_plan = $2,
           license_key = CASE WHEN $6 = true THEN $3 ELSE COALESCE(license_key, $3) END,
           license_issued_at = CASE WHEN $6 = true OR license_issued_at IS NULL THEN NOW() ELSE license_issued_at END,
           license_max_users = COALESCE($7::INTEGER, license_max_users),
           subscription_started_at = CASE WHEN $1 = 'active' THEN NOW() ELSE subscription_started_at END,
           subscription_ends_at = CASE WHEN $1 = 'active'
             THEN NOW() + ($4 * INTERVAL '1 day')
             ELSE subscription_ends_at
           END,
           updated_at = NOW()
       WHERE id = $5
       RETURNING id, nombre, sector_comercial, email, nit, subscription_status,
                 license_plan, license_key, license_issued_at, license_max_users, modulos_habilitados, fel_habilitada, trial_ends_at,
                 subscription_started_at, subscription_ends_at, created_at,
                 ${ACTIVE_USERS_SQL},
                 GREATEST(
                   0,
                   CEIL(EXTRACT(EPOCH FROM (
                     COALESCE(
                       CASE WHEN $1 = 'active' THEN NOW() + ($4 * INTERVAL '1 day') ELSE subscription_ends_at END,
                       trial_ends_at
                     ) - NOW()
                   )) / 86400)
                 ) AS days_remaining`,
      [status, String(plan).trim().slice(0, 50) || 'Demo', newKey, days, req.params.id, Boolean(generateNewKey), userLimit]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    res.json({
      success: true,
      message: status === 'active'
        ? (generateNewKey ? `Nueva licencia generada: ${result.rows[0].license_key}` : 'Licencia habilitada')
        : `Licencia marcada como ${status}`,
      organization: mapOrganization(result.rows[0])
    });
  } catch (error) {
    console.error('Error actualizando licencia:', error);
    res.status(500).json({ error: 'Error actualizando licencia' });
  }
};

// Resumen de visitas del sitio web (WebBotEngine). La clave queda en el servidor.
const getWebsiteAnalytics = async (req, res) => {
  const baseUrl = (process.env.WEBSITE_ANALYTICS_URL || '').replace(/\/$/, '');
  const apiKey = (process.env.WEBSITE_ANALYTICS_KEY || '').trim();
  if (!baseUrl || !apiKey) {
    return res.status(503).json({ error: 'Configura WEBSITE_ANALYTICS_URL y WEBSITE_ANALYTICS_KEY en el servidor' });
  }
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 7), 365);
  try {
    const response = await fetch(`${baseUrl}/api/analytics/summary?days=${days}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(502).json({ error: data.error || `El sitio respondió ${response.status}` });
    }
    res.json(data);
  } catch (error) {
    console.error('Error consultando visitas del sitio:', error.message);
    res.status(502).json({ error: 'No se pudo conectar con el sitio web' });
  }
};

module.exports = {
  resendOnboardingEmail,
  previewContractDocuments,
  deactivateOrganization,
  getWebsiteAnalytics,
  createOrganization,
  listOrganizations,
  getOrganization,
  updateLicense,
  updateUserLimit,
  listModules,
  updateModules
};
