import React from 'react';
import {
  X,
  Download,
  FileText,
  Link2,
  Receipt,
  CheckCircle2,
  Clock,
  Building2,
  CreditCard,
  Briefcase,
  Truck,
} from 'lucide-react';
import { useFiscal } from '../../context/FiscalContext';
import {
  CATALOGO_FORMA_PAGO,
  CATALOGO_REGIMEN,
  CATALOGO_TIPO_CFDI,
  CATALOGO_TIPO_RELACION,
  CATALOGO_USO_CFDI,
  formatDateTime,
  formatShortDate,
} from '../../utils/format';
import { downloadSingleCfdiXml } from '../../utils/exportExcel';
import { Money } from './Money';
import { estatusSatBadge, StatusBadge } from './StatusBadge';

export const CfdiDetailModal: React.FC = () => {
  const { db, selectedCfdiUuid, closeCfdiDetail, openCfdiPdf, openCfdiDetail } = useFiscal();

  if (!selectedCfdiUuid) return null;

  const cfdi = db.cfdis.find((c) => c.uuid === selectedCfdiUuid);
  if (!cfdi) return null;

  const conceptos = db.conceptos.filter((c) => c.uuid === cfdi.uuid);
  const relaciones = db.relaciones.filter(
    (r) => r.uuid === cfdi.uuid || r.uuid_relacionado === cfdi.uuid,
  );
  const pagosAplicados = db.pagos.filter(
    (p) => p.uuid_documento === cfdi.uuid || p.uuid_pago === cfdi.uuid,
  );

  return (
    <div className="animate-modal-backdrop fixed inset-0 z-50 flex justify-end bg-slate-900/45 backdrop-blur-[2px]">
      <div className="animate-drawer-right flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
                {cfdi.direccion === 'E' ? 'Emitido' : 'Recibido'} ·{' '}
                {CATALOGO_TIPO_CFDI[cfdi.tipo] || cfdi.tipo}
              </span>
              {estatusSatBadge(cfdi.estatus_sat)}
              <StatusBadge variant="info">CFDI {cfdi.version}</StatusBadge>
            </div>
            <h3 className="mt-2 text-base font-semibold text-slate-900">
              {cfdi.serie}-{cfdi.folio}{' '}
              <span className="font-mono-code text-xs font-normal text-slate-500 break-all">
                {cfdi.uuid}
              </span>
            </h3>
          </div>
          <button
            type="button"
            onClick={closeCfdiDetail}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Acciones rápidas */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => downloadSingleCfdiXml(cfdi, conceptos)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              Descargar XML
            </button>
            <button
              type="button"
              onClick={() => openCfdiPdf(cfdi.uuid)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer"
            >
              <FileText className="h-3.5 w-3.5" />
              Vista PDF (Representación impresa)
            </button>
          </div>

          {/* Emisor & Receptor */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <Building2 className="h-3.5 w-3.5" /> Emisor
              </div>
              <p className="mt-1.5 text-sm font-semibold text-slate-900">{cfdi.nombre_emisor}</p>
              <p className="font-mono-code text-xs text-slate-600">{cfdi.rfc_emisor}</p>
              <p className="mt-1 text-xs text-slate-500">
                Régimen: {CATALOGO_REGIMEN[cfdi.regimen_emisor] || cfdi.regimen_emisor}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <Building2 className="h-3.5 w-3.5" /> Receptor
              </div>
              <p className="mt-1.5 text-sm font-semibold text-slate-900">{cfdi.nombre_receptor}</p>
              <p className="font-mono-code text-xs text-slate-600">{cfdi.rfc_receptor}</p>
              <p className="mt-1 text-xs text-slate-500">
                Uso CFDI: {CATALOGO_USO_CFDI[cfdi.uso_cfdi] || cfdi.uso_cfdi}
              </p>
            </div>
          </div>

          {/* Datos fiscales y pago */}
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-3">
            <div>
              <span className="text-[11px] text-slate-500">Fecha de emisión</span>
              <p className="text-xs font-medium text-slate-900">{formatDateTime(cfdi.fecha_emision)}</p>
            </div>
            <div>
              <span className="text-[11px] text-slate-500">Fecha timbrado</span>
              <p className="text-xs font-medium text-slate-900">{formatDateTime(cfdi.fecha_timbrado)}</p>
            </div>
            <div>
              <span className="text-[11px] text-slate-500">Método de pago</span>
              <p className="text-xs font-medium text-slate-900">{cfdi.metodo_pago || '—'}</p>
            </div>
            <div>
              <span className="text-[11px] text-slate-500">Forma de pago</span>
              <p className="text-xs font-medium text-slate-900">
                {CATALOGO_FORMA_PAGO[cfdi.forma_pago] || cfdi.forma_pago || '—'}
              </p>
            </div>
            <div>
              <span className="text-[11px] text-slate-500">Moneda / T.C.</span>
              <p className="text-xs font-medium text-slate-900">
                {cfdi.moneda} {cfdi.moneda !== 'MXN' ? `(${cfdi.tipo_cambio})` : ''}
              </p>
            </div>
            <div>
              <span className="text-[11px] text-slate-500">Origen / Cancelación</span>
              <p className="text-xs font-medium text-slate-900">
                {cfdi.origen === 'sat' ? 'Descarga SAT' : 'Carga manual'}
                {cfdi.fecha_cancelacion ? ` · Canc. ${formatShortDate(cfdi.fecha_cancelacion)}` : ''}
              </p>
            </div>
          </div>

          {/* Impuestos y totales */}
          <div className="rounded-xl border border-slate-200 p-4">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Resumen de importes e impuestos
            </h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <span className="text-xs text-slate-500">Subtotal</span>
                <p className="text-sm font-semibold text-slate-900">
                  <Money value={cfdi.subtotal} moneda={cfdi.moneda} />
                </p>
              </div>
              <div>
                <span className="text-xs text-slate-500">Descuento</span>
                <p className="text-sm font-semibold text-slate-900">
                  <Money value={cfdi.descuento} moneda={cfdi.moneda} />
                </p>
              </div>
              <div>
                <span className="text-xs text-slate-500">IVA Trasladado</span>
                <p className="text-sm font-semibold text-slate-900">
                  <Money value={cfdi.iva_trasladado} moneda={cfdi.moneda} />
                </p>
              </div>
              <div>
                <span className="text-xs text-slate-500">IVA Retenido</span>
                <p className="text-sm font-semibold text-slate-900">
                  <Money value={cfdi.iva_retenido} moneda={cfdi.moneda} />
                </p>
              </div>
              <div>
                <span className="text-xs text-slate-500">ISR Retenido</span>
                <p className="text-sm font-semibold text-slate-900">
                  <Money value={cfdi.isr_retenido} moneda={cfdi.moneda} />
                </p>
              </div>
              <div className="rounded-lg bg-blue-50/70 px-3 py-1.5">
                <span className="text-xs font-medium text-blue-700">Total MXN</span>
                <p className="text-base font-bold text-blue-900">
                  <Money value={cfdi.total_mxn} />
                </p>
              </div>
            </div>
          </div>

          {/* Conceptos */}
          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <Receipt className="h-3.5 w-3.5" /> Conceptos ({conceptos.length || 1})
            </h4>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">Clave SAT</th>
                    <th className="px-3 py-2 font-medium">Descripción</th>
                    <th className="px-3 py-2 text-right font-medium">Cant.</th>
                    <th className="px-3 py-2 text-right font-medium">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {conceptos.length > 0 ? (
                    conceptos.map((con) => (
                      <tr key={con.id}>
                        <td className="px-3 py-2 font-mono-code text-slate-600">
                          {con.clave_prod_serv}
                        </td>
                        <td className="px-3 py-2 text-slate-800">{con.descripcion}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                          {con.cantidad}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-slate-900">
                          <Money value={con.importe} moneda={cfdi.moneda} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-3 py-2 font-mono-code text-slate-600">84111506</td>
                      <td className="px-3 py-2 text-slate-800">
                        {cfdi.tipo === 'P'
                          ? 'Pago (Complemento para recepción de pagos 2.0)'
                          : cfdi.tipo === 'N'
                            ? 'Pago de nómina'
                            : 'Concepto general del comprobante fiscal'}
                      </td>
                      <td className="px-3 py-2 text-right">1</td>
                      <td className="px-3 py-2 text-right font-medium">
                        <Money value={cfdi.subtotal} moneda={cfdi.moneda} />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* CFDI Relacionados */}
          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <Link2 className="h-3.5 w-3.5" /> CFDI relacionados ({relaciones.length})
            </h4>
            {relaciones.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-3 py-2.5 text-xs text-slate-500">
                Sin comprobantes relacionados registrados.
              </p>
            ) : (
              <div className="space-y-2">
                {relaciones.map((r) => {
                  const otherUuid = r.uuid === cfdi.uuid ? r.uuid_relacionado : r.uuid;
                  const exists = db.cfdis.some((c) => c.uuid === otherUuid);
                  return (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                    >
                      <div>
                        <span className="font-medium text-slate-800">
                          {CATALOGO_TIPO_RELACION[r.tipo_relacion] || `Tipo ${r.tipo_relacion}`}
                        </span>
                        <p className="font-mono-code text-[11px] text-slate-500">{otherUuid}</p>
                      </div>
                      {exists && (
                        <button
                          type="button"
                          onClick={() => openCfdiDetail(otherUuid)}
                          className="text-xs font-medium text-blue-600 hover:underline cursor-pointer"
                        >
                          Abrir relacionado
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pagos aplicados (REP) */}
          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <CreditCard className="h-3.5 w-3.5" /> Complementos de pago aplicados (
              {pagosAplicados.length})
            </h4>
            {pagosAplicados.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-3 py-2.5 text-xs text-slate-500">
                Sin pagos (REP) ligados a este comprobante.
              </p>
            ) : (
              <div className="space-y-2">
                {pagosAplicados.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-xl border border-slate-200 bg-white p-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">
                        Parcialidad #{p.num_parcialidad} · Fecha pago: {formatShortDate(p.fecha_pago)}
                      </span>
                      <span className="font-semibold text-emerald-700">
                        Pagado: <Money value={p.importe_pagado} />
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap justify-between gap-2 text-[11px] text-slate-500">
                      <span>
                        REP: <span className="font-mono-code">{p.uuid_pago}</span>
                      </span>
                      <span>
                        Saldo insoluto: <Money value={p.saldo_insoluto} />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Complemento Nómina 1.2 (si existe) */}
          {cfdi.nomina_info && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
              <h4 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-indigo-800">
                <Briefcase className="h-3.5 w-3.5" /> Complemento Nómina 1.2 ({cfdi.nomina_info.tipo_nomina})
              </h4>
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                <div>
                  <span className="text-[11px] text-slate-500">Periodo pagado</span>
                  <p className="font-medium text-slate-900">
                    {formatShortDate(cfdi.nomina_info.fecha_inicial)} —{' '}
                    {formatShortDate(cfdi.nomina_info.fecha_final)}
                  </p>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500">Fecha de pago / Días</span>
                  <p className="font-medium text-slate-900">
                    {formatShortDate(cfdi.nomina_info.fecha_pago)} ({cfdi.nomina_info.num_dias_pagados} d)
                  </p>
                </div>
                {cfdi.nomina_info.curp && (
                  <div>
                    <span className="text-[11px] text-slate-500">CURP / Emp.</span>
                    <p className="font-mono-code font-medium text-slate-900">
                      {cfdi.nomina_info.curp}
                      {cfdi.nomina_info.num_empleado ? ` · #${cfdi.nomina_info.num_empleado}` : ''}
                    </p>
                  </div>
                )}
                <div>
                  <span className="text-[11px] text-slate-500">Total Percepciones</span>
                  <p className="font-semibold text-emerald-700">
                    <Money value={cfdi.nomina_info.total_percepciones} />
                  </p>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500">Total Deducciones</span>
                  <p className="font-semibold text-rose-700">
                    <Money value={cfdi.nomina_info.total_deducciones} />
                  </p>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500">Otros Pagos</span>
                  <p className="font-semibold text-slate-800">
                    <Money value={cfdi.nomina_info.total_otros_pagos} />
                  </p>
                </div>
              </div>
              {(cfdi.nomina_info.puesto || cfdi.nomina_info.departamento) && (
                <p className="mt-2 text-[11px] text-slate-600">
                  {cfdi.nomina_info.puesto ? `Puesto: ${cfdi.nomina_info.puesto}` : ''}
                  {cfdi.nomina_info.departamento ? ` · Depto: ${cfdi.nomina_info.departamento}` : ''}
                </p>
              )}
            </div>
          )}

          {/* Complemento Carta Porte (si existe) */}
          {cfdi.carta_porte_info && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
              <h4 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-blue-800">
                <Truck className="h-3.5 w-3.5" /> Complemento Carta Porte {cfdi.carta_porte_info.version}
              </h4>
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                <div>
                  <span className="text-[11px] text-slate-500">Transporte internacional</span>
                  <p className="font-medium text-slate-900">{cfdi.carta_porte_info.transp_internac}</p>
                </div>
                {cfdi.carta_porte_info.total_dist_rec && (
                  <div>
                    <span className="text-[11px] text-slate-500">Distancia recorrida</span>
                    <p className="font-medium text-slate-900">
                      {cfdi.carta_porte_info.total_dist_rec} km
                    </p>
                  </div>
                )}
                {cfdi.carta_porte_info.num_mercancias && (
                  <div>
                    <span className="text-[11px] text-slate-500">Mercancías / Peso</span>
                    <p className="font-medium text-slate-900">
                      {cfdi.carta_porte_info.num_mercancias} partidas
                      {cfdi.carta_porte_info.peso_bruto_total
                        ? ` (${cfdi.carta_porte_info.peso_bruto_total} ${cfdi.carta_porte_info.unidad_peso || 'KGM'})`
                        : ''}
                    </p>
                  </div>
                )}
                {cfdi.carta_porte_info.origen && (
                  <div>
                    <span className="text-[11px] text-slate-500">Origen</span>
                    <p className="font-medium text-slate-900">{cfdi.carta_porte_info.origen}</p>
                  </div>
                )}
                {cfdi.carta_porte_info.destino && (
                  <div>
                    <span className="text-[11px] text-slate-500">Destino</span>
                    <p className="font-medium text-slate-900">{cfdi.carta_porte_info.destino}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Estado Contable Aspel SAE */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">
                Estado contable (Aspel SAE)
              </span>
              {cfdi.estatus_contable === 'con_poliza' ? (
                <StatusBadge variant="success">
                  <CheckCircle2 className="h-3 w-3" /> Con póliza
                </StatusBadge>
              ) : (
                <StatusBadge variant="warning">
                  <Clock className="h-3 w-3" />{' '}
                  {cfdi.estatus_contable === 'pendiente' ? 'Pendiente de póliza' : 'Sin registro'}
                </StatusBadge>
              )}
            </div>
            {cfdi.poliza_aspel && (
              <p className="mt-1.5 text-xs text-slate-600">
                Póliza <strong>{cfdi.poliza_aspel}</strong> · Cuenta{' '}
                <span className="font-mono-code">{cfdi.cuenta_contable}</span> · Fecha{' '}
                {formatShortDate(cfdi.fecha_poliza)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
