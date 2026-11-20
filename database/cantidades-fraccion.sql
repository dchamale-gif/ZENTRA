-- Migración: artículos que se venden por fracción (por libra, metro, etc.: 1.5 lb, 0.25 lb).
-- El precio del artículo es por unidad (una libra); la línea cobra cantidad × precio.
-- Las cantidades pasan de INTEGER a DOUBLE PRECISION, redondeadas a 3 decimales por un trigger
-- (así llegan a la app como números: 7 o 1.5, no «7.000»). Los artículos sin la marca siguen
-- aceptando solo cantidades enteras (lo validan la app y el backend).
-- Idempotente; se aplica en cada arranque del contenedor migrate.

BEGIN;

ALTER TABLE codigos_articulos ADD COLUMN IF NOT EXISTS vende_fraccion BOOLEAN NOT NULL DEFAULT false;

-- Redondea a 3 decimales las columnas que recibe como argumentos.
CREATE OR REPLACE FUNCTION redondear_cantidades() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  columna TEXT;
  valor TEXT;
  cambios JSONB := '{}'::jsonb;
BEGIN
  FOREACH columna IN ARRAY TG_ARGV LOOP
    valor := to_jsonb(NEW) ->> columna;
    IF valor IS NOT NULL THEN
      cambios := cambios || jsonb_build_object(columna, round(valor::numeric, 3));
    END IF;
  END LOOP;
  IF cambios <> '{}'::jsonb THEN
    NEW := jsonb_populate_record(NEW, cambios);
  END IF;
  RETURN NEW;
END
$$;

DO $$
DECLARE
  objetivo RECORD;
BEGIN
  FOR objetivo IN
    SELECT * FROM (VALUES
      ('codigos_articulos', 'cantidad_disponible'),
      ('codigos_articulos', 'existencia_web_base'),
      ('venta_items', 'cantidad'),
      ('pos_cuenta_items', 'cantidad'),
      ('compra_items', 'cantidad'),
      ('ajuste_inventario_items', 'existencia_anterior'),
      ('ajuste_inventario_items', 'cantidad'),
      ('ajuste_inventario_items', 'existencia_nueva')
    ) AS t(tabla, columna)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = objetivo.tabla
        AND column_name = objetivo.columna AND data_type = 'integer'
    ) THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE DOUBLE PRECISION', objetivo.tabla, objetivo.columna);
    END IF;
  END LOOP;
END
$$;

DROP TRIGGER IF EXISTS codigos_articulos_redondear ON codigos_articulos;
CREATE TRIGGER codigos_articulos_redondear BEFORE INSERT OR UPDATE ON codigos_articulos
  FOR EACH ROW EXECUTE FUNCTION redondear_cantidades('cantidad_disponible', 'existencia_web_base');
DROP TRIGGER IF EXISTS venta_items_redondear ON venta_items;
CREATE TRIGGER venta_items_redondear BEFORE INSERT OR UPDATE ON venta_items
  FOR EACH ROW EXECUTE FUNCTION redondear_cantidades('cantidad');
DROP TRIGGER IF EXISTS pos_cuenta_items_redondear ON pos_cuenta_items;
CREATE TRIGGER pos_cuenta_items_redondear BEFORE INSERT OR UPDATE ON pos_cuenta_items
  FOR EACH ROW EXECUTE FUNCTION redondear_cantidades('cantidad');
DROP TRIGGER IF EXISTS compra_items_redondear ON compra_items;
CREATE TRIGGER compra_items_redondear BEFORE INSERT OR UPDATE ON compra_items
  FOR EACH ROW EXECUTE FUNCTION redondear_cantidades('cantidad');
DROP TRIGGER IF EXISTS ajuste_inventario_items_redondear ON ajuste_inventario_items;
CREATE TRIGGER ajuste_inventario_items_redondear BEFORE INSERT OR UPDATE ON ajuste_inventario_items
  FOR EACH ROW EXECUTE FUNCTION redondear_cantidades('existencia_anterior', 'cantidad', 'existencia_nueva');

COMMIT;
