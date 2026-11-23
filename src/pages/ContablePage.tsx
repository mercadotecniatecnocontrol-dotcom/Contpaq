import React from 'react';
import {
  AlertTriangle,
  Download,
  RefreshCw,
  RotateCw,
  Server,
  WifiOff,
} from 'lucide-react';
import { useFiscal } from '../context/FiscalContext';
import { formatDateTime, formatShortDate } from '../utils/format';
import { exportToExcel } from '../utils/exportExcel';
import { RoleGuard } from '../components/shared/RoleGuard';
import { StatusBadge } from '../components/shared/StatusBadge';

export const ContablePage: React.FC = () => {
  const { db, activeEmpresa, currentUser, syncAspelNow, toggleAspelConnection, showToast } =
    useFiscal();

  const aspelConfig = db.aspel_configs.find((c) => c.empresa_id === activeEmpresa.id);
  const logs = db.contable_logs.filter((l) => l.empresa_id === activeEmpresa.id);
  const isReadOnly = currentUser.rol === 'consulta';

  const handleExport = () => {
    exportToExcel(
      logs.map((l) => ({
        Empresa: l.empresa_nombre,
        Sistema: l.sistema,
        GUID: l.guid,
        Fecha: formatDateTime(l.fecha),
        'Rango inicio': l.rango_inicio,
        'Rango fin': l.rango_fin,
        Dirección: l.direccion,
        'Total sincronizados': l.total_sincronizados,
        Estatus: l.estatus,
      })),
      `ADD_Bitacora_Contable_${activeEmpresa.rfc}`,
      'Bitacora_Contable',
    );
  };

  return (
    <RoleGuard
      allowedRoles={['propietario', 'contador', 'consulta']}
      sectionName="ADD y Bitácora Contable"
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              ADD y Bitácora Contable
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Historial de sincronizaciones entre el Módulo Fiscal SAT y Aspel SAE.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar Excel
            </button>
            {!isReadOnly && aspelConfig?.conectado && (
              <button
                type="button"
                onClick={syncAspelNow}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Sincronizar con Aspel SAE
              </button>
            )}
          </div>
        </div>

        {/* Estado de conexión con Aspel SAE */}
        {!aspelConfig ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 text-xs text-slate-700">
              <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
              <div>
                <p className="font-bold text-slate-900">Conexión con Aspel SAE pendiente de configurar</p>
                <p className="mt-0.5 text-slate-500">
                  Registra una empresa y proporciona los datos de conexión de Aspel SAE para iniciar
                  la sincronización real.
                </p>
              </div>
            </div>
            <StatusBadge variant="neutral">Sin configurar</StatusBadge>
          </div>
        ) : !aspelConfig.conectado ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 text-xs text-rose-900">
              <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
              <div>
                <p className="font-bold">Sin conexión con el servidor de Aspel SAE</p>
                <p className="mt-0.5 text-rose-800">
                  {aspelConfig.error_conexion ||
                    'No fue posible comunicarse con el agente contable de Aspel SAE.'}
                </p>
              </div>
            </div>
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => {
                  toggleAspelConnection();
                  showToast('Conexión con Aspel SAE restablecida');
                }}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer"
              >
                <RotateCw className="h-3.5 w-3.5" />
                Reintentar
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 text-xs">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <Server className="h-4 w-4" />
              </div>
              <div>
                <p className="font-bold text-slate-900">
                  Agente Aspel SAE conectado · {aspelConfig?.version_sae}
                </p>
                <p className="font-mono-code text-[11px] text-slate-500">
                  {aspelConfig?.servidor} / {aspelConfig?.base_datos}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge variant="success" dot pulse>
                En línea
              </StatusBadge>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => {
                    toggleAspelConnection();
                    showToast('Se simuló pérdida de conexión con Aspel SAE');
                  }}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50 cursor-pointer"
                >
                  Simular desconexión
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tabla de bitácora contable */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Empresa</th>
                  <th className="px-4 py-3 font-semibold">GUID</th>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Rango de fechas</th>
                  <th className="px-4 py-3 font-semibold">Dirección</th>
                  <th className="px-4 py-3 text-right font-semibold">Total sincronizados</th>
                  <th className="px-4 py-3 font-semibold">Estatus</th>
                </tr>
              </thead>
              <tbody className="stagger-rows divide-y divide-slate-100">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                      <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                      Aún no hay bitácora de sincronización contable para esta empresa.
                    </td>
                  </tr>
                ) : (
                  logs.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {row.empresa_nombre}
                      </td>
                      <td className="px-4 py-3 font-mono-code text-[11px] text-slate-600">
                        {row.guid}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                        {formatDateTime(row.fecha)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                        {formatShortDate(row.rango_inicio)} — {formatShortDate(row.rango_fin)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{row.direccion}</td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">
                        {row.total_sincronizados}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          variant={
                            row.estatus === 'Completada'
                              ? 'success'
                              : row.estatus === 'Con advertencias'
                                ? 'warning'
                                : 'danger'
                          }
                          dot
                        >
                          {row.estatus}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
};
