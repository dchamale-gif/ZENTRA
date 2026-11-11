-- Migración: clientes de BotEngine que no usan el ERP (bots, páginas web, automatizaciones...).
-- Viven en organizations para compartir facturas, cobros, notas y contratos con los del ERP,
-- pero sin usuarios ni licencia: usa_erp = false. Estado 'active' = cliente vigente
-- (entra en las mensualidades), 'cancelled' = cliente inactivo.

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS usa_erp BOOLEAN NOT NULL DEFAULT true;
-- Lo que se le presta; también es el concepto de su mensualidad si no usa el ERP.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS servicios VARCHAR(255);
