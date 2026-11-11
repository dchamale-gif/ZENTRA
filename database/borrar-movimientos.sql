-- Migración: borrar los movimientos de una empresa anteriores a una fecha (por ejemplo, las
-- pruebas de antes de empezar a operar). Se conservan artículos, clientes, proveedores,
-- usuarios y configuración; la existencia de los artículos no se toca.
--
-- Se borran, con fecha anterior a p_desde:
--   · ventas (con sus líneas, cobros y documentos FEL) y compras (con sus líneas);
--   · movimientos de caja (gastos, ingresos y los de esas ventas y compras, aunque sean de hoy);
--   · depósitos, ajustes de inventario, cierres de caja que se quedan sin cobros;
--   · cuentas del punto de venta cobradas o anuladas (las abiertas se quedan).
-- Al final se recalcula el saldo de cada movimiento de caja que queda.
--
-- La llama el panel de soporte (zentra_platform). Corre con los permisos del dueño y sin
-- RLS, así que cada consulta filtra por empresa. Con p_ejecutar = false solo cuenta.

CREATE OR REPLACE FUNCTION borrar_movimientos_antes(
    p_organization_id INTEGER, p_desde DATE, p_confirmacion TEXT, p_ejecutar BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org INTEGER := p_organization_id;
    v_nombre TEXT;
    v_usa_erp BOOLEAN;
    v_ventas TEXT[];
    v_compras TEXT[];
    v_conteo JSONB;
    v_hoy DATE := (NOW() AT TIME ZONE 'America/Guatemala')::DATE;
BEGIN
    SELECT nombre, usa_erp INTO v_nombre, v_usa_erp FROM organizations WHERE id = v_org FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Empresa no encontrada';
    END IF;
    IF NOT v_usa_erp THEN
        RAISE EXCEPTION '% no usa BotEngine ERP; no tiene movimientos', v_nombre;
    END IF;
    IF p_desde IS NULL OR p_desde > v_hoy THEN
        RAISE EXCEPTION 'La fecha no puede ser posterior a hoy';
    END IF;

    v_ventas := ARRAY(SELECT id FROM ventas WHERE organization_id = v_org AND fecha < p_desde);
    v_compras := ARRAY(SELECT id FROM compras WHERE organization_id = v_org AND fecha < p_desde);

    v_conteo := jsonb_build_object(
        'empresa', v_nombre,
        'desde', p_desde,
        'ventas', cardinality(v_ventas),
        'compras', cardinality(v_compras),
        'cobros', (SELECT COUNT(*) FROM pagos_factura WHERE organization_id = v_org AND venta_id = ANY(v_ventas)),
        -- Cobros hechos desde la fecha a ventas anteriores: también se van con su venta.
        'cobrosRecientes', (SELECT COUNT(*) FROM pagos_factura
                            WHERE organization_id = v_org AND venta_id = ANY(v_ventas) AND fecha >= p_desde),
        'facturasFel', (SELECT COUNT(*) FROM fel_documentos WHERE organization_id = v_org AND venta_id = ANY(v_ventas)),
        'caja', (SELECT COUNT(*) FROM caja WHERE organization_id = v_org
                 AND (fecha < p_desde OR referencia_venta_id = ANY(v_ventas) OR referencia_compra_id = ANY(v_compras))),
        'depositos', (SELECT COUNT(*) FROM depositos_caja WHERE organization_id = v_org AND fecha < p_desde),
        'ajustes', (SELECT COUNT(*) FROM ajustes_inventario WHERE organization_id = v_org AND fecha < p_desde),
        'cuentasPos', (SELECT COUNT(*) FROM pos_cuentas WHERE organization_id = v_org AND estado <> 'abierta'
                       AND (venta_id = ANY(v_ventas)
                            OR (venta_id IS NULL AND ((created_at AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE 'America/Guatemala')::DATE < p_desde))),
        'cierres', (SELECT COUNT(*) FROM cierres_caja c WHERE c.organization_id = v_org
                    AND (c.created_at AT TIME ZONE 'America/Guatemala')::DATE < p_desde
                    AND NOT EXISTS (SELECT 1 FROM pagos_factura p WHERE p.cierre_id = c.id
                                    AND NOT (p.venta_id = ANY(v_ventas))))
    );

    IF NOT p_ejecutar THEN
        RETURN v_conteo;
    END IF;
    IF lower(btrim(coalesce(p_confirmacion, ''))) <> lower(btrim(v_nombre)) THEN
        RAISE EXCEPTION 'El nombre escrito no coincide con el de la empresa';
    END IF;

    DELETE FROM caja WHERE organization_id = v_org
        AND (fecha < p_desde OR referencia_venta_id = ANY(v_ventas) OR referencia_compra_id = ANY(v_compras));
    DELETE FROM depositos_caja WHERE organization_id = v_org AND fecha < p_desde;
    DELETE FROM pos_cuentas WHERE organization_id = v_org AND estado <> 'abierta'
        AND (venta_id = ANY(v_ventas)
             OR (venta_id IS NULL AND ((created_at AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE 'America/Guatemala')::DATE < p_desde));
    -- Cuentas por cobrar del esquema anterior, si existen.
    IF to_regclass('public.cuentas_por_cobrar') IS NOT NULL THEN
        IF to_regclass('public.pagos_cuentas') IS NOT NULL THEN
            DELETE FROM pagos_cuentas WHERE cuenta_id IN (
                SELECT id FROM cuentas_por_cobrar WHERE organization_id = v_org AND referencia_venta_id = ANY(v_ventas));
        END IF;
        DELETE FROM cuentas_por_cobrar WHERE organization_id = v_org AND referencia_venta_id = ANY(v_ventas);
    END IF;
    -- Líneas, cobros y documentos FEL se borran en cascada.
    DELETE FROM ventas WHERE organization_id = v_org AND id = ANY(v_ventas);
    DELETE FROM compras WHERE organization_id = v_org AND id = ANY(v_compras);
    DELETE FROM ajustes_inventario WHERE organization_id = v_org AND fecha < p_desde;
    DELETE FROM cierres_caja c WHERE c.organization_id = v_org
        AND (c.created_at AT TIME ZONE 'America/Guatemala')::DATE < p_desde
        AND NOT EXISTS (SELECT 1 FROM pagos_factura p WHERE p.cierre_id = c.id);

    -- Saldo de caja de los movimientos que quedan, en el orden en que se registraron.
    WITH saldos AS (
        SELECT id,
               SUM(CASE WHEN tipo = 'entrada' THEN monto WHEN tipo = 'salida' THEN -monto ELSE 0 END)
                   OVER (ORDER BY created_at, id) AS posterior,
               CASE WHEN tipo = 'entrada' THEN monto WHEN tipo = 'salida' THEN -monto ELSE 0 END AS delta
        FROM caja
        WHERE organization_id = v_org AND COALESCE(estado, 'activo') = 'activo'
    )
    UPDATE caja c SET saldo_anterior = s.posterior - s.delta, saldo_posterior = s.posterior
    FROM saldos s WHERE c.id = s.id AND c.organization_id = v_org;

    RETURN v_conteo;
END;
$$;

REVOKE ALL ON FUNCTION borrar_movimientos_antes(INTEGER, DATE, TEXT, BOOLEAN) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zentra_platform') THEN
        GRANT EXECUTE ON FUNCTION borrar_movimientos_antes(INTEGER, DATE, TEXT, BOOLEAN) TO zentra_platform;
    END IF;
END $$;
