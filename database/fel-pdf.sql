-- Migración: copia del PDF oficial que genera el certificador (INFILE) para cada factura.
-- Se descarga la primera vez que se imprime y se vuelve a pedir si la factura cambia de estado
-- (por ejemplo, al anularla). Así reimprimir no depende de que el certificador responda.
-- Idempotente; se aplica en cada arranque del contenedor migrate.

BEGIN;

ALTER TABLE fel_documentos ADD COLUMN IF NOT EXISTS pdf BYTEA;
-- Estado de la factura cuando se guardó el PDF (certificado o anulado).
ALTER TABLE fel_documentos ADD COLUMN IF NOT EXISTS pdf_estado VARCHAR(20);

COMMIT;
