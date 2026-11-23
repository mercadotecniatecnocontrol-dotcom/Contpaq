import type { FiscalDatabaseState } from '../../src/types/fiscal';

export function syncAspelPendingOnServer(
  state: FiscalDatabaseState,
  empresaId: string,
  usuario: string,
): { nextState: FiscalDatabaseState; linkedCount: number } {
  let linkedCount = 0;
  const nowIso = new Date().toISOString();
  const todayStr = nowIso.slice(0, 10);

  const nextCfdis = state.cfdis.map((c) => {
    if (
      c.empresa_id === empresaId &&
      !c.solo_en_sat &&
      c.estatus_contable !== 'con_poliza'
    ) {
      linkedCount++;
      const prefix = c.direccion === 'E' ? 'IG' : 'EG';
      return {
        ...c,
        estatus_contable: 'con_poliza' as const,
        poliza_aspel: `${prefix}-2026-11-${String(200 + linkedCount).padStart(4, '0')}`,
        fecha_poliza: todayStr,
        cuenta_contable: c.direccion === 'E' ? '4100-001-000' : '5100-002-000',
      };
    }
    return c;
  });

  const nextState: FiscalDatabaseState = {
    ...state,
    cfdis: nextCfdis,
    aspel_configs: state.aspel_configs.map((cfg) =>
      cfg.empresa_id === empresaId
        ? { ...cfg, ultima_sincronizacion: nowIso, conectado: true, error_conexion: null }
        : cfg,
    ),
    bitacora: [
      {
        id: `bit-aspel-srv-${Date.now()}`,
        empresa_id: empresaId,
        usuario,
        rol: 'contador',
        modulo: 'Vinculaciones Aspel SAE (Backend)',
        accion: 'Sincronización de pólizas contables',
        detalle: `Se vincularon ${linkedCount} CFDI(s) pendientes con sus pólizas en Aspel SAE.`,
        fecha: nowIso,
      },
      ...state.bitacora,
    ],
  };

  return { nextState, linkedCount };
}
