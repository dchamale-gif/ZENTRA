const fs = require('fs');

const getDbSslConfig = () => {
  if (process.env.DB_SSL !== 'require') return false;

  const ca = process.env.DB_SSL_CA ||
    (process.env.DB_SSL_CA_FILE ? fs.readFileSync(process.env.DB_SSL_CA_FILE, 'utf8') : null);

  if (process.env.NODE_ENV === 'production' && !ca) {
    throw new Error('DB_SSL=require necesita DB_SSL_CA o DB_SSL_CA_FILE en producción');
  }

  return {
    rejectUnauthorized: true,
    ...(ca && { ca })
  };
};

module.exports = { getDbSslConfig };
