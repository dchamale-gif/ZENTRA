-- Dirección propia de cada empresa: <subdominio>.botengine-erp.com (BASE_DOMAIN en .env).
-- El slug lleva letras al azar para ser único; el subdominio es corto, lo elige la empresa al
-- registrarse y soporte lo puede cambiar. Solo lo usan las empresas con ERP (usa_erp).
BEGIN;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subdominio VARCHAR(42);
CREATE UNIQUE INDEX IF NOT EXISTS organizations_subdominio_key ON organizations (subdominio);

ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_subdominio_formato;
ALTER TABLE organizations ADD CONSTRAINT organizations_subdominio_formato
    CHECK (subdominio IS NULL OR subdominio ~ '^[a-z0-9]([a-z0-9-]{0,40}[a-z0-9])?$');

-- Empresas con ERP que aún no tienen: el nombre sin acentos, espacios ni signos.
-- Si queda vacío, es un nombre reservado o ya lo usa otra, se le agrega el id.
WITH base AS (
    SELECT id,
           left(regexp_replace(
               translate(lower(nombre), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'),
               '[^a-z0-9]+', '', 'g'), 30) AS sugerido
    FROM organizations
    WHERE subdominio IS NULL AND usa_erp
),
candidatos AS (
    SELECT id,
           CASE WHEN sugerido = ''
                  OR sugerido IN ('www', 'soporte', 'api', 'med', 'admin', 'app', 'mail', 'correo',
                                  'pruebas', 'status', 'static', 'cdn', 'ftp', 'smtp', 'erp', 'ns1', 'ns2', 'ns3')
                  OR EXISTS (SELECT 1 FROM organizations o WHERE o.subdominio = sugerido)
                THEN COALESCE(NULLIF(sugerido, ''), 'empresa') || id
                ELSE sugerido END AS subdominio,
           row_number() OVER (PARTITION BY sugerido ORDER BY id) AS orden
    FROM base
)
UPDATE organizations o
SET subdominio = CASE WHEN c.orden = 1 THEN c.subdominio ELSE c.subdominio || o.id END
FROM candidatos c
WHERE o.id = c.id;

COMMIT;
