import type { FiscalDatabaseState } from '../../src/types/fiscal';

/**
 * Conector Aspel SAE (en espera de credenciales reales Firebird/SQL Server).
 * No fabrica pólizas ni números ficticios.
 */
export function syncAspelPendingOnServer(
  state: FiscalDatabaseState,
  empresaId: string,
  usuario: string,
): { nextState: FiscalDatabaseState; linkedCount: number } {
  const nowIso = new Date().toISOString();

  const nextState: FiscalDatabaseState = {
    ...state,
    bitacora: [
      {
        id: `bit-aspel-srv-${Date.now()}`,
        empresa_id: empresaId,
        usuario,
        rol: 'contador',
        modulo: 'Vinculaciones Aspel SAE',
        accion: 'Consulta de sincronización Aspel SAE',
        detalle: 'Conector Aspel SAE sin configuración activa para la empresa seleccionada.',
        fecha: nowIso,
      },
      ...state.bitacora,
    ],
  };

  return { nextState, linkedCount: 0 };
}
