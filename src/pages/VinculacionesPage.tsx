import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  Eye,
  Link2,
  RefreshCw,
  RotateCw,
  Search,
  WifiOff,
} from 'lucide-react';
import { useFiscal } from '../context/FiscalContext';
import { formatDateTime, formatShortDate, shortUuid } from '../utils/format';
import { exportToExcel } from '../utils/exportExcel';
import { Money } from '../components/shared/Money';
import { AnimatedNumber } from '../components/shared/AnimatedNumber';
import { RoleGuard } from '../components/shared/RoleGuard';
import { StatusBadge } from '../components/shared/StatusBadge';

export const VinculacionesPage: React.FC = () => {
  const {
    db,
    activeEmpresa,
    currentUser,
    toggleAspelConnection,
    syncAspelNow,
    assignPolizaAspel,
    openCfdiDetail,
    showToast,
  } = useFiscal();

  const [statusFilter, setStatusFilter] = useState<'todos' | 'con_poliza' | 'pendiente' | 'sin_registro'>(
    'todos',
  );
  const [search, setSearch] = useState('');

  const isReadOnly = currentUser.rol === 'consulta';
  const aspelConfig = db.aspel_configs.find((c) => c.empresa_id === activeEmpresa.id);

  const companyCfdis = useMemo(
    () =>
      db.cfdis.filter(
        (c) => c.empresa_id === activeEmpresa.id && !c.solo_en_sat && c.fecha_fiscal >= '2026-10-01',
      ),
    [db.cfdis, activeEmpresa.id],
  );

  const counts = useMemo(
    () => ({
      con_poliza: companyCfdis.filter((c) => c.estatus_contable === 'con_poliza').length,
      pendiente: companyCfdis.filter((c) => c.estatus_contable === 'pendiente').length,
      sin_registro: companyCfdis.filter(
        (c) => !c.estatus_contable || c.estatus_contable === 'sin_registro',
      ).length,
    }),
    [companyCfdis],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companyCfdis.filter((c) => {
      const st = c.estatus_contable || 'sin_registro';
      if (statusFilter !== 'todos' && st !== statusFilter) return false;
      if (!q) return true;
      const cp = c.direccion === 'E' ? c.nombre_receptor : c.nombre_emisor;
      return (
        c.uuid.toLowerCase().includes(q) ||
        cp.toLowerCase().includes(q) ||
        (c.poliza_aspel || '').toLowerCase().includes(q)
      );
    });
  }, [companyCfdis, statusFilter, search]);

  const handleExport = () => {
    exportToExcel(
      filtered.map((c) => ({
        UUID: c.uuid,
        Folio: `${c.serie}-${c.folio}`,
        Dirección: c.direccion === 'E' ? 'Emitido' : 'Recibido',
        Fecha: c.fecha_fiscal,
        Contraparte: c.direccion === 'E' ? c.nombre_receptor : c.nombre_emisor,
        'Total MXN': c.total_mxn,
        'Estatus contable': c.estatus_contable || 'sin_registro',
        'Póliza Aspel SAE': c.poliza_aspel || '',
        'Cuenta contable': c.cuenta_contable || '',
        'Fecha póliza': c.fecha_poliza || '',
      })),
      `Vinculaciones_AspelSAE_${activeEmpresa.rfc}`,
      'Vinculaciones',
    );
  };

  return (
    <RoleGuard
      allowedRoles={['propietario', 'contador', 'consulta']}
      sectionName="Vinculaciones (Aspel SAE)"
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Vinculaciones — Aspel SAE
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Consulta el estado contable y póliza asociada de cada CFDI mediante la integración
              Tecnocontrol ↔ Aspel SAE.
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
                Vincular pendientes
              </button>
            )}
          </div>
        </div>

        {/* Tarjeta de estado de conexión Aspel SAE */}
        <div
          className={`rounded-2xl border p-5 ${
            aspelConfig?.conectado
              ? 'border-slate-200 bg-white'
              : 'border-rose-200 bg-rose-50'
          }`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                  aspelConfig?.conectado
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-rose-100 text-rose-700'
                }`}
              >
                {aspelConfig?.conectado ? (
                  <Link2 className="h-5 w-5" />
                ) : (
                  <WifiOff className="h-5 w-5" />
                )}
              </div>
              <div className="text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-900">
                    Conector Aspel SAE — {activeEmpresa.razon_social}
                  </h2>
                  <StatusBadge variant={aspelConfig?.conectado ? 'success' : 'danger'} dot pulse>
                    {aspelConfig?.conectado ? 'Conectado' : 'Sin conexión'}
                  </StatusBadge>
                </div>
                {aspelConfig?.conectado ? (
                  <p className="mt-1 text-slate-600">
                    Servidor <span className="font-mono-code">{aspelConfig.servidor}</span> · Base{' '}
                    <span className="font-mono-code">{aspelConfig.base_datos}</span> · Última sync:{' '}
                    {formatDateTime(aspelConfig.ultima_sincronizacion)}
                  </p>
                ) : (
                  <p className="mt-1 font-medium text-rose-800">
                    {aspelConfig?.error_conexion ||
                      'No hay conexión activa con el servicio de Aspel SAE.'}
                  </p>
                )}
              </div>
            </div>

            {!isReadOnly && (
              <div className="flex items-center gap-2">
                {aspelConfig?.conectado ? (
                  <button
                    type="button"
                    onClick={() => {
                      toggleAspelConnection();
                      showToast('Se pausó temporalmente la conexión con Aspel SAE');
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Simular caída
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      toggleAspelConnection();
                      showToast('Conexión con Aspel SAE restaurada');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                    Reintentar conexión
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Resumen de pólizas */}
        <div className="stagger-grid grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="card-interactive rounded-2xl border border-slate-200 bg-white p-4">
            <span className="text-xs font-medium text-slate-500">Con póliza en Aspel SAE</span>
            <p className="mt-1 text-2xl font-bold text-emerald-700">
              <AnimatedNumber value={counts.con_poliza} />
            </p>
          </div>
          <div className="card-interactive rounded-2xl border border-slate-200 bg-white p-4">
            <span className="text-xs font-medium text-slate-500">Pendientes de contabilizar</span>
            <p className="mt-1 text-2xl font-bold text-amber-700">
              <AnimatedNumber value={counts.pendiente} />
            </p>
          </div>
          <div className="card-interactive rounded-2xl border border-slate-200 bg-white p-4">
            <span className="text-xs font-medium text-slate-500">Sin registro contable</span>
            <p className="mt-1 text-2xl font-bold text-slate-700">
              <AnimatedNumber value={counts.sin_registro} />
            </p>
          </div>
        </div>

        {/* Tabla por UUID */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['todos', `Todos (${companyCfdis.length})`],
                  ['con_poliza', `Con póliza (${counts.con_poliza})`],
                  ['pendiente', `Pendientes (${counts.pendiente})`],
                  ['sin_registro', `Sin registro (${counts.sin_registro})`],
                ] as const
              ).map(([k, lbl]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setStatusFilter(k)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                    statusFilter === k
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>

            <div className="relative sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                name="vinc-busqueda"
                aria-label="Buscar por UUID, póliza o contraparte"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="UUID, póliza o contraparte..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-8 text-xs focus:border-blue-500 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">UUID / Folio</th>
                  <th className="px-4 py-3 font-semibold">Dir.</th>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Contraparte</th>
                  <th className="px-4 py-3 text-right font-semibold">Total MXN</th>
                  <th className="px-4 py-3 font-semibold">Estado contable</th>
                  <th className="px-4 py-3 font-semibold">Póliza / Cuenta</th>
                  <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="stagger-rows divide-y divide-slate-100">
                {filtered.map((c) => {
                  const st = c.estatus_contable || 'sin_registro';
                  return (
                    <tr key={c.uuid} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <p className="font-semibold text-slate-900">
                          {c.serie}-{c.folio}
                        </p>
                        <p className="font-mono-code text-[10px] text-slate-500">
                          {shortUuid(c.uuid)}
                        </p>
                      </td>
                      <td className="px-4 py-2.5">{c.direccion === 'E' ? 'Emitido' : 'Recibido'}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">
                        {formatShortDate(c.fecha_fiscal)}
                      </td>
                      <td className="max-w-[190px] truncate px-4 py-2.5 text-slate-800">
                        {c.direccion === 'E' ? c.nombre_receptor : c.nombre_emisor}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-right font-semibold">
                        <Money value={c.total_mxn} />
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {st === 'con_poliza' ? (
                          <StatusBadge variant="success">
                            <CheckCircle2 className="h-3 w-3" /> Con póliza
                          </StatusBadge>
                        ) : st === 'pendiente' ? (
                          <StatusBadge variant="warning">
                            <Clock className="h-3 w-3" /> Pendiente
                          </StatusBadge>
                        ) : (
                          <StatusBadge variant="neutral">Sin registro</StatusBadge>
                        )}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {c.poliza_aspel ? (
                          <div>
                            <p className="font-mono-code font-semibold text-slate-800">
                              {c.poliza_aspel}
                            </p>
                            <p className="font-mono-code text-[10px] text-slate-500">
                              Cta. {c.cuenta_contable}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-right">
                        <div className="inline-flex items-center gap-1">
                          {st !== 'con_poliza' && !isReadOnly && aspelConfig?.conectado && (
                            <button
                              type="button"
                              onClick={() =>
                                assignPolizaAspel(
                                  c.uuid,
                                  `${c.direccion === 'E' ? 'IG' : 'EG'}-2026-11-${Math.floor(1000 + Math.random() * 8999)}`,
                                  c.direccion === 'E' ? '4100-001-000' : '5100-001-000',
                                )
                              }
                              className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100 cursor-pointer"
                            >
                              Vincular
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openCfdiDetail(c.uuid)}
                            title="Ver detalle del CFDI"
                            aria-label="Ver detalle del CFDI"
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
};
