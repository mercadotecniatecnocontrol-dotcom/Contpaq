import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CloudDownload,
  Download,
  Eye,
  FileCheck2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { useFiscal } from '../context/FiscalContext';
import { getConciliacionSat, getVisorSatAuditoria } from '../services/fiscalCalculations';
import {
  CATALOGO_REGIMEN,
  CATALOGO_TIPO_CFDI,
  formatDateTime,
  formatShortDate,
  shortUuid,
} from '../utils/format';
import { exportToExcel } from '../utils/exportExcel';
import { Money } from '../components/shared/Money';
import { RoleGuard } from '../components/shared/RoleGuard';
import { estatusSatBadge, StatusBadge } from '../components/shared/StatusBadge';

export const VisorSatPage: React.FC = () => {
  const {
    db,
    activeEmpresa,
    currentUser,
    openCfdiDetail,
    downloadMissingFromSat,
    triggerSyncNow,
    navigate,
  } = useFiscal();

  const [fechaIni, setFechaIni] = useState('2026-11-01');
  const [fechaFin, setFechaFin] = useState('2026-11-30');
  const [direccion, setDireccion] = useState<'ALL' | 'E' | 'R'>('ALL');
  const [metodo, setMetodo] = useState<'ALL' | 'PUE' | 'PPD'>('ALL');
  const [regimen, setRegimen] = useState('ALL');
  const [soloHastaCorteSat, setSoloHastaCorteSat] = useState(true);
  const [estatusTab, setEstatusTab] = useState<'todos' | 'vigente' | 'cancelado'>('todos');
  const [soloDiferencias, setSoloDiferencias] = useState(false);

  const activePeriodo = fechaFin.slice(0, 7) || '2026-11';

  const auditoria = useMemo(
    () => getVisorSatAuditoria(db, activeEmpresa, activePeriodo),
    [db, activeEmpresa, activePeriodo],
  );

  const conciliacion = useMemo(
    () =>
      getConciliacionSat(db, activeEmpresa.id, {
        fechaIni,
        fechaFin,
        direccion,
        metodo,
        regimen,
        soloHastaCorteSat,
      }),
    [db, activeEmpresa.id, fechaIni, fechaFin, direccion, metodo, regimen, soloHastaCorteSat],
  );

  const missingUuids = conciliacion.detalle
    .filter((d) => d.estadoConciliacion === 'solo_sat')
    .map((d) => d.cfdi.uuid);

  const filteredDetail = useMemo(
    () =>
      conciliacion.detalle.filter((item) => {
        if (estatusTab === 'vigente' && item.cfdi.estatus_sat !== 'vigente') return false;
        if (estatusTab === 'cancelado' && item.cfdi.estatus_sat !== 'cancelado') return false;
        if (soloDiferencias && item.estadoConciliacion === 'coincide') return false;
        return true;
      }),
    [conciliacion.detalle, estatusTab, soloDiferencias],
  );

  const totalDiffCount = conciliacion.resumen.reduce((s, r) => s + Math.abs(r.diffCount), 0);

  const handleExport = () => {
    exportToExcel(
      filteredDetail.map((d) => ({
        Conciliación:
          d.estadoConciliacion === 'coincide'
            ? 'Coincide'
            : d.estadoConciliacion === 'solo_sat'
              ? 'Solo en SAT'
              : 'Solo en Portal',
        UUID: d.cfdi.uuid,
        Dirección: d.cfdi.direccion === 'E' ? 'Emitido' : 'Recibido',
        Tipo: CATALOGO_TIPO_CFDI[d.cfdi.tipo] || d.cfdi.tipo,
        Fecha: d.cfdi.fecha_fiscal,
        Método: d.cfdi.metodo_pago,
        RFC: d.cfdi.direccion === 'E' ? d.cfdi.rfc_receptor : d.cfdi.rfc_emisor,
        Contraparte: d.cfdi.direccion === 'E' ? d.cfdi.nombre_receptor : d.cfdi.nombre_emisor,
        'Total MXN': d.cfdi.total_mxn,
        'Estatus SAT': d.cfdi.estatus_sat,
      })),
      `Conciliacion_SAT_${activeEmpresa.rfc}`,
      'Visor_SAT',
    );
  };

  return (
    <RoleGuard
      allowedRoles={['propietario', 'contador', 'consulta']}
      sectionName="Visor / Conciliación SAT"
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Conciliación SAT (Visor)
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Compara totales de metadatos oficiales del SAT contra los XML incorporados en el
              portal.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {currentUser.rol !== 'consulta' && (
              <button
                type="button"
                onClick={triggerSyncNow}
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Actualizar
              </button>
            )}
            {missingUuids.length > 0 && currentUser.rol !== 'consulta' && (
              <button
                type="button"
                onClick={() => downloadMissingFromSat(missingUuids)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm cursor-pointer"
              >
                <CloudDownload className="h-3.5 w-3.5" />
                Descargar {missingUuids.length} faltante(s)
              </button>
            )}
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar Excel
            </button>
          </div>
        </div>

        {/* Banner de estatus de Declaración del Período + Corte SAT */}
        <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-xs text-emerald-950 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <FileCheck2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="font-semibold">{auditoria.declaracion.mensaje}</span>
          </div>
          <span className="text-[11px] font-medium text-emerald-800">
            Sincronizado con el SAT: {formatDateTime(db.fecha_corte_sat)}
          </span>
        </div>

        {/* Aviso fecha de corte SAT + interruptor */}
        <div className="flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5 text-xs text-blue-950">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
            <div>
              <p className="font-semibold">
                Fecha de corte de información SAT: {formatDateTime(db.fecha_corte_sat)}
              </p>
              <p className="mt-0.5 text-blue-800">
                Los totales SAT provienen de la solicitud de metadatos.{' '}
                {totalDiffCount === 0
                  ? 'Este periodo cuadra con diferencia 0.'
                  : `Se detectaron ${totalDiffCount} comprobante(s) con diferencia pendiente de descarga.`}
              </p>
            </div>
          </div>

          <label className="flex shrink-0 items-center gap-2 text-xs font-semibold text-blue-900 cursor-pointer">
            <input
              type="checkbox"
              name="visor-corte-sat"
              checked={soloHastaCorteSat}
              onChange={(e) => setSoloHastaCorteSat(e.target.checked)}
              className="h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
            />
            Ver solo hasta corte SAT
          </label>
        </div>

        {/* Filtros */}
        <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <label className="mb-1 block font-semibold text-slate-600">Desde</label>
            <input
              type="date"
              name="visor-desde"
              aria-label="Fecha desde"
              value={fechaIni}
              onChange={(e) => setFechaIni(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5"
            />
          </div>
          <div>
            <label className="mb-1 block font-semibold text-slate-600">Hasta</label>
            <input
              type="date"
              name="visor-hasta"
              aria-label="Fecha hasta"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5"
            />
          </div>
          <div>
            <label className="mb-1 block font-semibold text-slate-600">Dirección</label>
            <select
              name="visor-direccion"
              aria-label="Dirección CFDI"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value as 'ALL' | 'E' | 'R')}
              className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5"
            >
              <option value="ALL">Emitidos y Recibidos</option>
              <option value="E">Solo Emitidos</option>
              <option value="R">Solo Recibidos</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block font-semibold text-slate-600">Método pago</label>
            <select
              name="visor-metodo"
              aria-label="Método de pago"
              value={metodo}
              onChange={(e) => setMetodo(e.target.value as 'ALL' | 'PUE' | 'PPD')}
              className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5"
            >
              <option value="ALL">PUE y PPD</option>
              <option value="PUE">Solo PUE</option>
              <option value="PPD">Solo PPD</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block font-semibold text-slate-600">Régimen fiscal</label>
            <select
              name="visor-regimen"
              aria-label="Régimen fiscal"
              value={regimen}
              onChange={(e) => setRegimen(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5"
            >
              <option value="ALL">Todos los regímenes</option>
              {Object.entries(CATALOGO_REGIMEN).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-1.5">
            <button
              type="button"
              onClick={() => {
                setFechaIni('2026-10-01');
                setFechaFin('2026-10-31');
              }}
              className="flex-1 rounded-xl bg-slate-100 py-1.5 font-semibold text-slate-700 hover:bg-slate-200 cursor-pointer"
            >
              Oct (0 dif.)
            </button>
            <button
              type="button"
              onClick={() => {
                setFechaIni('2026-11-01');
                setFechaFin('2026-11-30');
              }}
              className="flex-1 rounded-xl bg-slate-100 py-1.5 font-semibold text-slate-700 hover:bg-slate-200 cursor-pointer"
            >
              Nov 2026
            </button>
          </div>
        </div>

        {/* Bloque Comparativo 1 y 2: Ingresos Nominales (Pagos provisionales / Visor SAT / Portal) e IVA */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {/* Bloque 1: Comparativa Ingresos nominales */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Comparativa — Ingresos nominales ({activePeriodo})
                </h2>
                <p className="text-[11px] text-slate-500">
                  Pagos provisionales SAT vs. Visor de facturas SAT vs. Cálculo en Portal
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSoloDiferencias(true)}
                className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 cursor-pointer"
              >
                Explorar discrepancias
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-3">
                <span className="text-[11px] font-medium text-slate-500">
                  Pagos provisionales SAT
                </span>
                <p className="mt-1 text-base font-bold text-slate-900">
                  <Money value={auditoria.ingresosNominales.pagosProvisionalesSat} animate />
                </p>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  Declaración: {auditoria.declaracion.fechaPresentacion}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <span className="text-[11px] font-medium text-slate-500">
                  Visor de facturas SAT
                </span>
                <p className="mt-1 text-base font-bold text-slate-900">
                  <Money value={auditoria.ingresosNominales.visorFacturasSat} animate />
                </p>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  Corte: {formatShortDate(db.fecha_corte_sat)}
                </p>
              </div>

              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3">
                <span className="text-[11px] font-semibold text-blue-800">
                  Cálculo en Portal
                </span>
                <p className="mt-1 text-base font-bold text-blue-950">
                  <Money value={auditoria.ingresosNominales.calculoPortal} animate />
                </p>
                <p
                  className={`mt-0.5 text-[10px] font-semibold ${
                    Math.abs(auditoria.ingresosNominales.discrepanciaVisor) < 0.01
                      ? 'text-emerald-700'
                      : 'text-amber-800'
                  }`}
                >
                  Discrepancia vs. Visor:{' '}
                  <Money value={auditoria.ingresosNominales.discrepanciaVisor} />
                </p>
              </div>
            </div>
          </div>

          {/* Bloque 2: Comparativa IVA (Visor IVA SAT vs Cálculo en Portal) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Comparativa — IVA ({activePeriodo})
                </h2>
                <p className="text-[11px] text-slate-500">
                  Visor de IVA SAT vs. Cálculo en flujo del Portal Tecnocontrol
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('iva', { periodo: activePeriodo })}
                className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 cursor-pointer"
              >
                Explorar discrepancias
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-3">
                <span className="text-[11px] font-bold uppercase text-slate-500">
                  Visor de IVA SAT
                </span>
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Trasladado:</span>
                    <span className="font-bold text-slate-900">
                      <Money value={auditoria.ivaComparativa.visorSatTrasladado} />
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Acreditable:</span>
                    <span className="font-bold text-slate-900">
                      <Money value={auditoria.ivaComparativa.visorSatAcreditable} />
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3">
                <span className="text-[11px] font-bold uppercase text-blue-800">
                  Cálculo en Portal
                </span>
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-blue-900">Trasladado:</span>
                    <span className="font-bold text-blue-950">
                      <Money value={auditoria.ivaComparativa.portalTrasladado} />{' '}
                      <span className="text-[10px] font-normal text-amber-800">
                        (Dif. <Money value={auditoria.ivaComparativa.discrepanciaTrasladado} />)
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-blue-900">Acreditable:</span>
                    <span className="font-bold text-emerald-800">
                      <Money value={auditoria.ivaComparativa.portalAcreditable} />{' '}
                      <span className="text-[10px] font-normal text-amber-800">
                        (Dif. <Money value={auditoria.ivaComparativa.discrepanciaAcreditable} />)
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3 Tarjetas comparativas SAT / Portal / Diferencia */}
        <div className="stagger-grid grid grid-cols-1 gap-4 lg:grid-cols-3">
          {conciliacion.resumen.map((card) => {
            const balanced = card.diffCount === 0 && Math.abs(card.diffMonto) < 0.01;
            return (
              <div key={card.tipo} className="card-interactive rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-900">{card.label}</h3>
                  {balanced ? (
                    <StatusBadge variant="success">
                      <CheckCircle2 className="h-3 w-3" /> Cuadrado
                    </StatusBadge>
                  ) : (
                    <StatusBadge variant="warning" dot pulse>
                      Diferencia
                    </StatusBadge>
                  )}
                </div>

                <div className="mt-3 space-y-2 text-xs">
                  <div className="grid grid-cols-3 items-center rounded-lg bg-slate-50 px-3 py-2">
                    <span className="font-semibold text-slate-600">SAT</span>
                    <span className="text-center tabular-nums text-slate-700">
                      {card.satCount} CFDI
                    </span>
                    <span className="text-right font-semibold text-slate-900">
                      <Money value={card.satMonto} animate />
                    </span>
                  </div>
                  <div className="grid grid-cols-3 items-center rounded-lg bg-slate-50 px-3 py-2">
                    <span className="font-semibold text-slate-600">Portal</span>
                    <span className="text-center tabular-nums text-slate-700">
                      {card.portalCount} CFDI
                    </span>
                    <span className="text-right font-semibold text-slate-900">
                      <Money value={card.portalMonto} animate />
                    </span>
                  </div>
                  <div
                    className={`grid grid-cols-3 items-center rounded-lg px-3 py-2 font-bold transition-colors duration-300 ${balanced
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'bg-amber-50 text-amber-900'
                      }`}
                  >
                    <span>Diferencia</span>
                    <span className="text-center tabular-nums">{card.diffCount} CFDI</span>
                    <span className="text-right">
                      <Money value={card.diffMonto} animate />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bloque 3: Alertas fiscales encontradas (Tablas comparativas lado a lado Emitidos vs Recibidos) */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/70 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Alertas fiscales encontradas (Auditoría Visor SAT)
                </h2>
                <p className="text-[11px] text-slate-500">
                  Comparativa lado a lado de comprobantes con observaciones de llenado o riesgo fiscal
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('indicadores')}
              className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
            >
              Ver todos los indicadores →
            </button>
          </div>

          <div className="grid grid-cols-1 divide-y divide-slate-200 xl:grid-cols-2 xl:divide-x xl:divide-y-0">
            {/* Lado izquierdo: CFDIs Emitidos */}
            <div className="p-4">
              <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-blue-800">
                CFDIs Emitidos
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-2.5 py-2 font-semibold">Tipo de Alerta</th>
                      <th className="px-2 py-2 text-center font-semibold">No. CFDIs</th>
                      <th className="px-2.5 py-2 text-right font-semibold">Subtotal</th>
                      <th className="px-2.5 py-2 text-right font-semibold">IVA</th>
                      <th className="px-2.5 py-2 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditoria.alertasComparativas.map((row) => (
                      <tr key={`emit-${row.codigo}`} className="hover:bg-slate-50/70">
                        <td className="px-2.5 py-2.5 font-medium text-slate-800">{row.titulo}</td>
                        <td className="px-2 py-2.5 text-center">
                          <span
                            className={`inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold ${
                              row.emitidos.count > 0
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {row.emitidos.count}
                          </span>
                        </td>
                        <td className="px-2.5 py-2.5 text-right tabular-nums text-slate-700">
                          <Money value={row.emitidos.subtotal} />
                        </td>
                        <td className="px-2.5 py-2.5 text-right tabular-nums text-slate-700">
                          <Money value={row.emitidos.iva} />
                        </td>
                        <td className="px-2.5 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                          <Money value={row.emitidos.total} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Lado derecho: CFDIs Recibidos */}
            <div className="p-4">
              <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-amber-800">
                CFDIs Recibidos
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-2.5 py-2 font-semibold">Tipo de Alerta</th>
                      <th className="px-2 py-2 text-center font-semibold">No. CFDIs</th>
                      <th className="px-2.5 py-2 text-right font-semibold">Subtotal</th>
                      <th className="px-2.5 py-2 text-right font-semibold">IVA</th>
                      <th className="px-2.5 py-2 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditoria.alertasComparativas.map((row) => (
                      <tr key={`rec-${row.codigo}`} className="hover:bg-slate-50/70">
                        <td className="px-2.5 py-2.5 font-medium text-slate-800">{row.titulo}</td>
                        <td className="px-2 py-2.5 text-center">
                          <span
                            className={`inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold ${
                              row.recibidos.count > 0
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {row.recibidos.count}
                          </span>
                        </td>
                        <td className="px-2.5 py-2.5 text-right tabular-nums text-slate-700">
                          <Money value={row.recibidos.subtotal} />
                        </td>
                        <td className="px-2.5 py-2.5 text-right tabular-nums text-slate-700">
                          <Money value={row.recibidos.iva} />
                        </td>
                        <td className="px-2.5 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                          <Money value={row.recibidos.total} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Tabla detalle conciliación */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['todos', `Todos (${conciliacion.detalle.length})`],
                  [
                    'vigente',
                    `Vigentes (${conciliacion.detalle.filter((d) => d.cfdi.estatus_sat === 'vigente').length})`,
                  ],
                  [
                    'cancelado',
                    `Cancelados (${conciliacion.detalle.filter((d) => d.cfdi.estatus_sat === 'cancelado').length})`,
                  ],
                ] as const
              ).map(([k, lbl]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setEstatusTab(k)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold cursor-pointer ${estatusTab === k
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                  {lbl}
                </button>
              ))}
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                name="visor-solo-diferencias"
                checked={soloDiferencias}
                onChange={(e) => setSoloDiferencias(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              Mostrar solo diferencias (UUID en un solo lado)
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Conciliación</th>
                  <th className="px-4 py-3 font-semibold">UUID</th>
                  <th className="px-4 py-3 font-semibold">Dirección / Tipo</th>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Contraparte</th>
                  <th className="px-4 py-3 text-right font-semibold">Total MXN</th>
                  <th className="px-4 py-3 font-semibold">Estatus SAT</th>
                  <th className="px-4 py-3 text-right font-semibold">Ver</th>
                </tr>
              </thead>
              <tbody className="stagger-rows divide-y divide-slate-100">
                {filteredDetail.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                      Sin registros para mostrar con los filtros actuales.
                    </td>
                  </tr>
                ) : (
                  filteredDetail.map(({ cfdi, estadoConciliacion }) => (
                    <tr
                      key={cfdi.uuid}
                      className={
                        estadoConciliacion !== 'coincide' ? 'bg-amber-50/50' : 'hover:bg-slate-50/70'
                      }
                    >
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {estadoConciliacion === 'coincide' ? (
                          <StatusBadge variant="success">Coincide</StatusBadge>
                        ) : estadoConciliacion === 'solo_sat' ? (
                          <StatusBadge variant="warning" dot>
                            Solo en SAT
                          </StatusBadge>
                        ) : (
                          <StatusBadge variant="danger" dot>
                            Solo en Portal
                          </StatusBadge>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono-code text-[11px] text-slate-700">
                        {shortUuid(cfdi.uuid)}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-700">
                        {cfdi.direccion === 'E' ? 'Emitido' : 'Recibido'} ·{' '}
                        {CATALOGO_TIPO_CFDI[cfdi.tipo]}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">
                        {formatShortDate(cfdi.fecha_fiscal)}
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-2.5 text-slate-800">
                        {cfdi.direccion === 'E' ? cfdi.nombre_receptor : cfdi.nombre_emisor}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-right font-semibold text-slate-900">
                        <Money value={cfdi.total_mxn} />
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {estatusSatBadge(cfdi.estatus_sat)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => openCfdiDetail(cfdi.uuid)}
                          title="Ver detalle del CFDI"
                          aria-label="Ver detalle del CFDI"
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-700 cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
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
