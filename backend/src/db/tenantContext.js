const { AsyncLocalStorage } = require('async_hooks');

const tenantStorage = new AsyncLocalStorage();

const runWithTenant = (organizationId, callback) => {
  return tenantStorage.run({ organizationId }, callback);
};

const getTenantId = () => tenantStorage.getStore()?.organizationId || null;

module.exports = {
  runWithTenant,
  getTenantId
};
