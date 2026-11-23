-- =============================================================================
-- SEGURIDAD BACKEND (PostgreSQL / Supabase) — MÓDULO FISCAL SAT TECNOCONTROL
-- Defensa contra: SQL Injection, escalamiento de privilegios, fuga multi-tenant,
-- lectura de llaves privadas de e.firma y alteración de bitácora de auditoría.
-- =============================================================================

-- 1. Asegurar esquema aislado y sin privilegios públicos excesivos
CREATE SCHEMA IF NOT EXISTS fiscal;
REVOKE ALL ON SCHEMA fiscal FROM PUBLIC;
GRANT USAGE ON SCHEMA fiscal TO authenticated;

-- 2. Funciones auxiliares RBAC seguras contra search_path hijacking
CREATE OR REPLACE FUNCTION fiscal.user_role_in_empresa(p_empresa_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = fiscal, pg_temp
AS $$
  SELECT ue.rol
  FROM fiscal.usuarios_empresa ue
  WHERE ue.empresa_id = p_empresa_id
    AND ue.usuario_id = auth.uid()
    AND ue.aceptado_en IS NOT NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION fiscal.has_role(p_empresa_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = fiscal, pg_temp
AS $$
  SELECT COALESCE(fiscal.user_role_in_empresa(p_empresa_id) = ANY(p_roles), false);
$$;

REVOKE ALL ON FUNCTION fiscal.user_role_in_empresa(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION fiscal.has_role(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fiscal.user_role_in_empresa(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION fiscal.has_role(uuid, text[]) TO authenticated;

-- 3. Activar y forzar Row Level Security (RLS) en las 15 tablas del módulo
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'empresas', 'efirma', 'usuarios_empresa', 'descargas', 'cfdi',
    'cfdi_relaciones', 'cfdi_pagos', 'cfdi_conceptos', 'impuesto_ajustes',
    'totales_sat', 'documentos_fiscales', 'indicadores', 'indicador_resultados',
    'notificaciones', 'bitacora'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF to_regclass('fiscal.' || tbl) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE fiscal.%I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('ALTER TABLE fiscal.%I FORCE ROW LEVEL SECURITY', tbl);
      EXECUTE format('REVOKE ALL ON TABLE fiscal.%I FROM anon', tbl);
    END IF;
  END LOOP;
END $$;

-- 4. Aislamiento estricto de la e.firma (FIEL)
-- Solo el rol 'propietario' ve metadatos; los bytes cifrados (.cer, .key, password)
-- jamás pueden consultarse vía SELECT desde el navegador (solo Edge Functions con service_role).
-- Ejemplo de revocación por columna (ajustar nombres si difieren):
-- REVOKE SELECT (cer_cifrado, key_cifrado, password_cifrado) ON fiscal.efirma FROM authenticated, anon;

DROP POLICY IF EXISTS efirma_owner_only_select ON fiscal.efirma;
CREATE POLICY efirma_owner_only_select ON fiscal.efirma
  FOR SELECT TO authenticated
  USING (fiscal.has_role(empresa_id, ARRAY['propietario']));

-- 5. Políticas de solo lectura para CFDIs (todos los roles autorizados de la empresa)
DROP POLICY IF EXISTS cfdi_tenant_select ON fiscal.cfdi;
CREATE POLICY cfdi_tenant_select ON fiscal.cfdi
  FOR SELECT TO authenticated
  USING (fiscal.has_role(empresa_id, ARRAY['propietario', 'contador', 'consulta', 'pagos']));

-- 6. Impuestos (IVA / ISR): bloqueado para el rol 'pagos'; edición solo Propietario y Contador
DROP POLICY IF EXISTS impuesto_ajustes_select ON fiscal.impuesto_ajustes;
CREATE POLICY impuesto_ajustes_select ON fiscal.impuesto_ajustes
  FOR SELECT TO authenticated
  USING (fiscal.has_role(empresa_id, ARRAY['propietario', 'contador', 'consulta']));

DROP POLICY IF EXISTS impuesto_ajustes_write ON fiscal.impuesto_ajustes;
CREATE POLICY impuesto_ajustes_write ON fiscal.impuesto_ajustes
  FOR ALL TO authenticated
  USING (fiscal.has_role(empresa_id, ARRAY['propietario', 'contador']))
  WITH CHECK (fiscal.has_role(empresa_id, ARRAY['propietario', 'contador']));

-- 7. Bitácora de auditoría INMUTABLE (solo INSERT y SELECT; prohibido UPDATE / DELETE)
REVOKE UPDATE, DELETE ON TABLE fiscal.bitacora FROM authenticated, anon;

DROP POLICY IF EXISTS bitacora_select ON fiscal.bitacora;
CREATE POLICY bitacora_select ON fiscal.bitacora
  FOR SELECT TO authenticated
  USING (fiscal.has_role(empresa_id, ARRAY['propietario', 'contador']));

DROP POLICY IF EXISTS bitacora_insert ON fiscal.bitacora;
CREATE POLICY bitacora_insert ON fiscal.bitacora
  FOR INSERT TO authenticated
  WITH CHECK (fiscal.has_role(empresa_id, ARRAY['propietario', 'contador', 'consulta', 'pagos']));

-- 8. Consultas parametrizadas inmunes a SQL Injection para Asistente Tecno
-- Regla obligatoria: NUNCA usar SQL dinámico (EXECUTE '...' || input); usar exclusivamente
-- parámetros tipados ($1, $2) y vistas agregadas en modo SECURITY INVOKER (respeta RLS).
CREATE OR REPLACE FUNCTION fiscal.rpc_resumen_iva_periodo(
  p_empresa_id uuid,
  p_periodo text -- Formato estricto YYYY-MM validado por regex
)
RETURNS TABLE (
  iva_trasladado numeric,
  iva_acreditable numeric,
  iva_retenido numeric
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = fiscal, pg_temp
AS $$
BEGIN
  IF p_periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Periodo inválido. Use formato YYYY-MM.';
  END IF;

  IF NOT fiscal.has_role(p_empresa_id, ARRAY['propietario', 'contador', 'consulta']) THEN
    RAISE EXCEPTION 'Acceso denegado por política RBAC.';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN c.direccion = 'E' THEN c.iva_trasladado ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN c.direccion = 'R' THEN c.iva_trasladado ELSE 0 END), 0),
    COALESCE(SUM(c.iva_retenido), 0)
  FROM fiscal.cfdi c
  WHERE c.empresa_id = p_empresa_id
    AND to_char(c.fecha_fiscal, 'YYYY-MM') = p_periodo
    AND c.estatus_sat = 'vigente';
END;
$$;
