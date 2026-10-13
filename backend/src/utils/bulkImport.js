const MAX_IMPORT_ROWS = 5000;

const text = (value) => {
  if (value === undefined || value === null) return null;
  const result = String(value).trim();
  return result === '' ? null : result;
};

const number = (value) => {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const parsed = Number(String(value).replace(/[Q$,\s]/gi, ''));
  return Number.isFinite(parsed) ? parsed : NaN;
};

const bool = (value, fallback = true) => {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return !['0', 'false', 'no', 'inactivo', 'n'].includes(String(value).trim().toLowerCase());
};

const validateRows = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    const error = new Error('El archivo no contiene filas para importar');
    error.status = 400;
    throw error;
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    const error = new Error(`Máximo ${MAX_IMPORT_ROWS} filas por importación`);
    error.status = 400;
    throw error;
  }
};

/**
 * Ejecuta el procesamiento fila por fila dentro de una transacción.
 * Cada fila usa un SAVEPOINT para que un error no invalide el resto.
 * Si dryRun es true se revierte todo al final (solo valida).
 */
const runImport = async (pool, rows, processRow, { dryRun = false } = {}) => {
  validateRows(rows);
  const summary = { total: rows.length, created: 0, updated: 0, failed: 0, errors: [] };
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2;
      await client.query('SAVEPOINT import_row');
      try {
        const outcome = await processRow(client, rows[index], index);
        await client.query('RELEASE SAVEPOINT import_row');
        if (outcome === 'updated') summary.updated += 1;
        else summary.created += 1;
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT import_row');
        summary.failed += 1;
        summary.errors.push({
          row: rowNumber,
          message: error.expose ? error.message : 'No se pudo guardar la fila'
        });
        if (!error.expose) console.error(`Error importando fila ${rowNumber}:`, error.message);
      }
    }
    await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
    return summary;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const rowError = (message) => {
  const error = new Error(message);
  error.expose = true;
  return error;
};

module.exports = { text, number, bool, runImport, rowError, MAX_IMPORT_ROWS };
