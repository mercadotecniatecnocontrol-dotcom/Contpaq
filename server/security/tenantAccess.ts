import type { Empresa, FiscalDatabaseState, RolEmpresa } from '../../src/types/fiscal';
import type { PublicAuthUser } from '../auth/authService';

const ROLE_WEIGHT: Record<RolEmpresa, number> = {
  consulta: 1,
  pagos: 2,
  contador: 3,
  propietario: 4,
};

/**
 * Calcula las empresas autorizadas y el rol real por empresa directamente
 * desde las membresías aceptadas del usuario autenticado (jamás desde headers del cliente).
 */
export function getAuthorizedEmpresaRoles(
  state: FiscalDatabaseState,
  userEmail: string,
): Map<string, RolEmpresa> {
  const emailNorm = String(userEmail || '').trim().toLowerCase();
  const existingEmpresaIds = new Set(state.empresas.map((e) => e.id));
  const map = new Map<string, RolEmpresa>();
  if (!emailNorm) return map;

  for (const membership of state.usuarios) {
    if (!membership || !membership.aceptado_en) continue;
    if (String(membership.correo || '').trim().toLowerCase() !== emailNorm) continue;
    if (!existingEmpresaIds.has(membership.empresa_id)) continue;

    const prev = map.get(membership.empresa_id);
    if (!prev || ROLE_WEIGHT[membership.rol] > ROLE_WEIGHT[prev]) {
      map.set(membership.empresa_id, membership.rol);
    }
  }
  return map;
}

/**
 * Resuelve y valida el acceso multi-empresa + RBAC por empresa para un endpoint.
 * Impide IDOR: si el cliente pide una empresa a la que no pertenece, responde 403.
 */
export function resolveAuthorizedTargetEmpresa(
  state: FiscalDatabaseState,
  user: PublicAuthUser,
  requestedEmpresaId?: string | null,
  allowedRoles?: RolEmpresa[],
):
  | {
      ok: true;
      empresaId: string;
      empresa: Empresa;
      rol: RolEmpresa;
      roleMap: Map<string, RolEmpresa>;
    }
  | {
      ok: false;
      statusCode: number;
      error: string;
    } {
  const roleMap = getAuthorizedEmpresaRoles(state, user.correo);
  if (roleMap.size === 0) {
    return {
      ok: false,
      statusCode: 403,
      error: 'Tu cuenta no tiene empresas activas asignadas en el portal.',
    };
  }

  const trimmedReq = String(requestedEmpresaId || '').trim();
  let targetEmpresaId = '';

  if (trimmedReq) {
    if (!roleMap.has(trimmedReq)) {
      return {
        ok: false,
        statusCode: 403,
        error: 'Acceso denegado: no tienes permisos sobre la empresa solicitada.',
      };
    }
    targetEmpresaId = trimmedReq;
  } else {
    targetEmpresaId = Array.from(roleMap.keys())[0];
  }

  const empresa = state.empresas.find((e) => e.id === targetEmpresaId);
  if (!empresa) {
    return {
      ok: false,
      statusCode: 404,
      error: 'Empresa no encontrada.',
    };
  }

  const rol = roleMap.get(targetEmpresaId)!;
  if (allowedRoles && !allowedRoles.includes(rol)) {
    return {
      ok: false,
      statusCode: 403,
      error: `Acceso denegado: tu rol '${rol}' en ${empresa.rfc} no tiene privilegios para esta operación.`,
    };
  }

  return {
    ok: true,
    empresaId: targetEmpresaId,
    empresa,
    rol,
    roleMap,
  };
}

/**
 * Filtra el estado completo fiscal para que GET /api/state únicamente devuelva
 * las empresas, CFDIs, bitácoras y metadatos autorizados para la sesión activa.
 */
export function filterStateForUser(
  state: FiscalDatabaseState,
  user: PublicAuthUser,
): FiscalDatabaseState {
  const emailNorm = user.correo.trim().toLowerCase();
  const roleMap = getAuthorizedEmpresaRoles(state, user.correo);

  const allowedIds = new Set(roleMap.keys());
  const ownerIds = new Set<string>();
  const nonPagosIds = new Set<string>();
  const userAdminIds = new Set<string>();

  for (const [empId, rol] of roleMap.entries()) {
    if (rol === 'propietario') ownerIds.add(empId);
    if (rol !== 'pagos') nonPagosIds.add(empId);
    if (rol === 'propietario' || rol === 'contador') userAdminIds.add(empId);
  }

  const cfdis = state.cfdis.filter((c) => allowedIds.has(c.empresa_id));
  const allowedCfdiUuids = new Set(cfdis.map((c) => c.uuid));

  return {
    empresas: state.empresas.filter((e) => allowedIds.has(e.id)),
    usuarios: state.usuarios.filter(
      (u) =>
        allowedIds.has(u.empresa_id) &&
        (userAdminIds.has(u.empresa_id) || u.correo.trim().toLowerCase() === emailNorm),
    ),
    efirmas: state.efirmas.filter((ef) => ownerIds.has(ef.empresa_id)),
    descargas: state.descargas.filter((d) => allowedIds.has(d.empresa_id)),
    cfdis,
    relaciones: state.relaciones.filter((r) => allowedIds.has(r.empresa_id)),
    pagos: state.pagos.filter((p) => allowedIds.has(p.empresa_id)),
    conceptos: state.conceptos.filter((con) => allowedCfdiUuids.has(con.uuid)),
    ajustes: state.ajustes.filter((a) => nonPagosIds.has(a.empresa_id)),
    totales_sat: state.totales_sat.filter((t) => nonPagosIds.has(t.empresa_id)),
    documentos: state.documentos.filter((d) => nonPagosIds.has(d.empresa_id)),
    indicadores_custom: state.indicadores_custom.filter(
      (i) => i.empresa_id === 'global' || nonPagosIds.has(i.empresa_id),
    ),
    grupos_indicadores: state.grupos_indicadores,
    notificaciones: state.notificaciones.filter((n) => allowedIds.has(n.empresa_id)),
    bitacora: state.bitacora.filter((b) => nonPagosIds.has(b.empresa_id)),
    contable_logs: state.contable_logs.filter((l) => nonPagosIds.has(l.empresa_id)),
    aspel_configs: state.aspel_configs.filter((a) => nonPagosIds.has(a.empresa_id)),
    consumos: state.consumos.filter((c) => nonPagosIds.has(c.empresa_id)),
    lista_efos: state.lista_efos,
    fecha_corte_sat: state.fecha_corte_sat,
  };
}

/**
 * Fusiona un PUT /api/state respetando estrictamente:
 * - Solo roles con permiso de escritura (propietario, contador, pagos; nunca consulta)
 * - Aislamiento total: jamás altera ni borra datos de empresas ajenas al usuario
 * - e.firma y usuarios solo modificables por propietario de esa empresa
 * - Bitácora estrictamente append-only (impide borrado de auditoría)
 */
export function mergeScopedStateUpdate(
  currentState: FiscalDatabaseState,
  incoming: FiscalDatabaseState,
  user: PublicAuthUser,
):
  | { ok: true; nextState: FiscalDatabaseState }
  | { ok: false; statusCode: number; error: string } {
  const emailNorm = user.correo.trim().toLowerCase();
  const roleMap = getAuthorizedEmpresaRoles(currentState, user.correo);

  const writableIds = new Set<string>();
  const ownerIds = new Set<string>();
  const taxWritableIds = new Set<string>();

  for (const [empId, rol] of roleMap.entries()) {
    if (rol === 'propietario' || rol === 'contador' || rol === 'pagos') {
      writableIds.add(empId);
    }
    if (rol === 'propietario' || rol === 'contador') {
      taxWritableIds.add(empId);
    }
    if (rol === 'propietario') {
      ownerIds.add(empId);
    }
  }

  if (writableIds.size === 0) {
    return {
      ok: false,
      statusCode: 403,
      error: 'Acceso denegado: tu rol actual es de solo lectura y no puede guardar cambios.',
    };
  }

  const existingEmpresaIds = new Set(currentState.empresas.map((e) => e.id));
  const incomingEmpresas = Array.isArray(incoming.empresas) ? incoming.empresas : [];
  const newEmpresas = incomingEmpresas.filter((e) => e && e.id && !existingEmpresaIds.has(e.id));

  if (newEmpresas.length > 0 && ownerIds.size === 0) {
    return {
      ok: false,
      statusCode: 403,
      error: 'Acceso denegado: únicamente un propietario puede registrar nuevas empresas.',
    };
  }

  const newEmpresaIds = new Set(newEmpresas.map((e) => e.id));
  const effectiveWritableIds = new Set([...writableIds, ...newEmpresaIds]);
  const effectiveTaxWritableIds = new Set([...taxWritableIds, ...newEmpresaIds]);
  const effectiveOwnerIds = new Set([...ownerIds, ...newEmpresaIds]);

  // Rechazar cualquier intento explícito de tocar empresas ajenas
  for (const emp of incomingEmpresas) {
    if (emp?.id && existingEmpresaIds.has(emp.id) && !writableIds.has(emp.id)) {
      return {
        ok: false,
        statusCode: 403,
        error: 'Acceso denegado: no puedes modificar empresas que no pertenecen a tu cuenta.',
      };
    }
  }

  const assertScopedRows = (
    rows: Array<{ empresa_id?: string }> | undefined,
    allowedSet: Set<string>,
    label: string,
  ): string | null => {
    if (!Array.isArray(rows)) return null;
    for (const row of rows) {
      if (!row?.empresa_id) continue;
      if (row.empresa_id === 'global' && label === 'indicadores') continue;
      if (!allowedSet.has(row.empresa_id)) {
        return `Acceso denegado: intento de modificar ${label} en una empresa sin permisos.`;
      }
    }
    return null;
  };

  const scopeError =
    assertScopedRows(incoming.cfdis, effectiveWritableIds, 'CFDIs') ||
    assertScopedRows(incoming.descargas, effectiveWritableIds, 'descargas') ||
    assertScopedRows(incoming.relaciones, effectiveWritableIds, 'relaciones') ||
    assertScopedRows(incoming.pagos, effectiveWritableIds, 'pagos') ||
    assertScopedRows(incoming.notificaciones, effectiveWritableIds, 'notificaciones');
  if (scopeError) {
    return { ok: false, statusCode: 403, error: scopeError };
  }

  const mergeByEmpresa = <T extends { empresa_id: string }>(
    currentRows: T[],
    incomingRows: T[] | undefined,
    allowedSet: Set<string>,
  ): T[] => {
    const preserved = currentRows.filter((r) => !allowedSet.has(r.empresa_id));
    if (!Array.isArray(incomingRows)) return currentRows;
    const scopedIncoming = incomingRows.filter((r) => r && allowedSet.has(r.empresa_id));
    return [...scopedIncoming, ...preserved];
  };

  // Empresas: preservar ajenas + aplicar cambios solo sobre las autorizadas (y altas nuevas de propietario)
  const preservedEmpresas = currentState.empresas.filter((e) => !effectiveWritableIds.has(e.id));
  const incomingWritableEmpresas = incomingEmpresas.filter(
    (e) => e && effectiveWritableIds.has(e.id),
  );
  // Evitar que un rol no-propietario borre una empresa existente
  const finalWritableEmpresas =
    ownerIds.size > 0
      ? incomingWritableEmpresas
      : currentState.empresas
          .filter((e) => writableIds.has(e.id))
          .map((existing) => incomingWritableEmpresas.find((inc) => inc.id === existing.id) || existing);
  const mergedEmpresas = [...finalWritableEmpresas, ...preservedEmpresas];

  // Usuarios: únicamente propietarios pueden modificar usuarios de sus empresas;
  // garantizar membresía propietaria para empresas recién creadas
  let mergedUsuarios = mergeByEmpresa(currentState.usuarios, incoming.usuarios, effectiveOwnerIds);
  for (const newEmp of newEmpresas) {
    const hasOwnerMembership = mergedUsuarios.some(
      (u) => u.empresa_id === newEmp.id && u.correo.trim().toLowerCase() === emailNorm && u.aceptado_en,
    );
    if (!hasOwnerMembership) {
      mergedUsuarios = [
        ...mergedUsuarios,
        {
          id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          usuario_id: user.id,
          empresa_id: newEmp.id,
          nombre: user.nombre,
          correo: user.correo,
          rol: 'propietario',
          invitado_por: 'Sistema',
          invitado_en: new Date().toISOString(),
          aceptado_en: new Date().toISOString(),
        },
      ];
    }
  }

  // CFDIs y Conceptos aislados por empresa
  const mergedCfdis = mergeByEmpresa(currentState.cfdis, incoming.cfdis, effectiveWritableIds);
  const untouchedUuids = new Set(
    currentState.cfdis
      .filter((c) => !effectiveWritableIds.has(c.empresa_id))
      .map((c) => c.uuid),
  );
  const allowedNewUuids = new Set(
    mergedCfdis.filter((c) => effectiveWritableIds.has(c.empresa_id)).map((c) => c.uuid),
  );
  const preservedConceptos = currentState.conceptos.filter((con) => untouchedUuids.has(con.uuid));
  const incomingConceptos = Array.isArray(incoming.conceptos)
    ? incoming.conceptos.filter((con) => con && allowedNewUuids.has(con.uuid))
    : currentState.conceptos.filter((con) => allowedNewUuids.has(con.uuid));

  // Bitácora estrictamente append-only (impide eliminar historial de auditoría)
  const existingBitacoraIds = new Set(currentState.bitacora.map((b) => b.id));
  const newBitacoraEntries = Array.isArray(incoming.bitacora)
    ? incoming.bitacora.filter(
        (b) => b && b.id && !existingBitacoraIds.has(b.id) && effectiveWritableIds.has(b.empresa_id),
      )
    : [];
  const mergedBitacora = [...newBitacoraEntries, ...currentState.bitacora];

  // Indicadores personalizados (preservar globales + ajenos)
  const preservedIndicadores = currentState.indicadores_custom.filter(
    (i) => i.empresa_id === 'global' || !effectiveTaxWritableIds.has(i.empresa_id),
  );
  const incomingIndicadores = Array.isArray(incoming.indicadores_custom)
    ? incoming.indicadores_custom.filter(
        (i) => i && i.empresa_id !== 'global' && effectiveTaxWritableIds.has(i.empresa_id),
      )
    : currentState.indicadores_custom.filter((i) => effectiveTaxWritableIds.has(i.empresa_id));

  const nextState: FiscalDatabaseState = {
    empresas: mergedEmpresas,
    usuarios: mergedUsuarios,
    efirmas: mergeByEmpresa(currentState.efirmas, incoming.efirmas, effectiveOwnerIds),
    descargas: mergeByEmpresa(currentState.descargas, incoming.descargas, effectiveWritableIds),
    cfdis: mergedCfdis,
    relaciones: mergeByEmpresa(currentState.relaciones, incoming.relaciones, effectiveWritableIds),
    pagos: mergeByEmpresa(currentState.pagos, incoming.pagos, effectiveWritableIds),
    conceptos: [...incomingConceptos, ...preservedConceptos],
    ajustes: mergeByEmpresa(currentState.ajustes, incoming.ajustes, effectiveTaxWritableIds),
    totales_sat: mergeByEmpresa(
      currentState.totales_sat,
      incoming.totales_sat,
      effectiveTaxWritableIds,
    ),
    documentos: mergeByEmpresa(
      currentState.documentos,
      incoming.documentos,
      effectiveTaxWritableIds,
    ),
    indicadores_custom: [...incomingIndicadores, ...preservedIndicadores],
    grupos_indicadores:
      Array.isArray(incoming.grupos_indicadores) && effectiveTaxWritableIds.size > 0
        ? Array.from(new Set([...currentState.grupos_indicadores, ...incoming.grupos_indicadores]))
        : currentState.grupos_indicadores,
    notificaciones: mergeByEmpresa(
      currentState.notificaciones,
      incoming.notificaciones,
      effectiveWritableIds,
    ),
    bitacora: mergedBitacora,
    contable_logs: mergeByEmpresa(
      currentState.contable_logs,
      incoming.contable_logs,
      effectiveTaxWritableIds,
    ),
    aspel_configs: mergeByEmpresa(
      currentState.aspel_configs,
      incoming.aspel_configs,
      effectiveTaxWritableIds,
    ),
    consumos: mergeByEmpresa(currentState.consumos, incoming.consumos, effectiveWritableIds),
    lista_efos: currentState.lista_efos,
    fecha_corte_sat: currentState.fecha_corte_sat,
  };

  return { ok: true, nextState };
}
