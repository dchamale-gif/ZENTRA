-- Migración: existencia sincronizada en las dos direcciones con la página web.
-- existencia_web_base es la existencia en que coincidieron el ERP y la web en la última
-- sincronización; con ella se suman los movimientos de cada lado sin que uno borre al otro.
-- NULL = el artículo aún no se ha conciliado con la web.
-- Idempotente; se aplica en cada arranque del contenedor migrate.

ALTER TABLE codigos_articulos ADD COLUMN IF NOT EXISTS existencia_web_base INTEGER;
