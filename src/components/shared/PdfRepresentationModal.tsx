import React from 'react';
import { X, Printer, Download } from 'lucide-react';
import { useFiscal } from '../../context/FiscalContext';
import {
  CATALOGO_FORMA_PAGO,
  CATALOGO_REGIMEN,
  CATALOGO_TIPO_CFDI,
  CATALOGO_USO_CFDI,
  formatDateTime,
} from '../../utils/format';
import { downloadSingleCfdiXml } from '../../utils/exportExcel';
import { Money } from './Money';

export const PdfRepresentationModal: React.FC = () => {
  const { db, pdfCfdiUuid, closeCfdiPdf } = useFiscal();

  if (!pdfCfdiUuid) return null;
  const cfdi = db.cfdis.find((c) => c.uuid === pdfCfdiUuid);
  if (!cfdi) return null;

  const conceptos = db.conceptos.filter((c) => c.uuid === cfdi.uuid);

  return (
    <div className="animate-modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-[2px] sm:p-6">
      <div className="animate-modal-pop flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Toolbar */}
        <div className="no-print flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Representación impresa de CFDI {cfdi.version}
            </h3>
            <p className="text-xs text-slate-500">
              Generada por Portal Operativo Tecnocontrol · {cfdi.serie}-{cfdi.folio}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => downloadSingleCfdiXml(cfdi, conceptos)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              XML
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimir / Guardar PDF
            </button>
            <button
              type="button"
              onClick={closeCfdiPdf}
              title="Cerrar vista previa"
              aria-label="Cerrar vista previa"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Documento estilo factura profesional propia de Tecnocontrol */}
        <div className="flex-1 overflow-y-auto bg-slate-100 p-4 sm:p-8">
          <div className="mx-auto max-w-2xl rounded-lg border border-slate-200 bg-white p-6 sm:p-8 shadow-sm text-slate-900">
            <div className="flex flex-col justify-between gap-4 border-b-2 border-[#0e4b85] pb-4 sm:flex-row">
              <div>
                <img
                  src="./logotecno.png"
                  alt="Tecnocontrol"
                  className="mb-2 h-7 w-auto object-contain"
                />
                <p className="text-[11px] font-semibold uppercase tracking-widest text-blue-700">
                  Representación impresa de CFDI · Portal Tecnocontrol
                </p>
                <h2 className="mt-1 text-base font-bold">{cfdi.nombre_emisor}</h2>
                <p className="font-mono-code text-xs text-slate-600">RFC: {cfdi.rfc_emisor}</p>
                <p className="text-xs text-slate-600">
                  Régimen: {CATALOGO_REGIMEN[cfdi.regimen_emisor] || cfdi.regimen_emisor}
                </p>
              </div>
              <div className="sm:text-right">
                <span className="inline-block rounded bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
                  {CATALOGO_TIPO_CFDI[cfdi.tipo]?.toUpperCase()} · {cfdi.serie}-{cfdi.folio}
                </span>
                <p className="mt-2 text-[11px] text-slate-500">Folio Fiscal (UUID)</p>
                <p className="font-mono-code text-[11px] font-medium text-slate-800 break-all">
                  {cfdi.uuid}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Timbrado: {formatDateTime(cfdi.fecha_timbrado)}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 rounded-lg bg-slate-50 p-3.5 text-xs sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Receptor
                </p>
                <p className="mt-0.5 font-semibold text-slate-900">{cfdi.nombre_receptor}</p>
                <p className="font-mono-code text-slate-600">RFC: {cfdi.rfc_receptor}</p>
                <p className="text-slate-600">
                  Uso CFDI: {CATALOGO_USO_CFDI[cfdi.uso_cfdi] || cfdi.uso_cfdi}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Condiciones fiscales
                </p>
                <p>
                  Método de pago: <strong>{cfdi.metodo_pago || 'N/A'}</strong>
                </p>
                <p>
                  Forma de pago:{' '}
                  <strong>{CATALOGO_FORMA_PAGO[cfdi.forma_pago] || cfdi.forma_pago || 'N/A'}</strong>
                </p>
                <p>
                  Moneda: <strong>{cfdi.moneda}</strong> (T.C. {cfdi.tipo_cambio}) · Estatus SAT:{' '}
                  <strong className="uppercase">{cfdi.estatus_sat}</strong>
                </p>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-300 bg-slate-100 text-slate-700">
                    <th className="px-2.5 py-2 text-left">Clave</th>
                    <th className="px-2.5 py-2 text-left">Descripción</th>
                    <th className="px-2.5 py-2 text-right">Cant.</th>
                    <th className="px-2.5 py-2 text-right">P. Unitario</th>
                    <th className="px-2.5 py-2 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {conceptos.length > 0 ? (
                    conceptos.map((con) => (
                      <tr key={con.id}>
                        <td className="px-2.5 py-2 font-mono-code">{con.clave_prod_serv}</td>
                        <td className="px-2.5 py-2">{con.descripcion}</td>
                        <td className="px-2.5 py-2 text-right tabular-nums">{con.cantidad}</td>
                        <td className="px-2.5 py-2 text-right">
                          <Money value={con.valor_unitario} moneda={cfdi.moneda} />
                        </td>
                        <td className="px-2.5 py-2 text-right font-medium">
                          <Money value={con.importe} moneda={cfdi.moneda} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-2.5 py-2 font-mono-code">84111506</td>
                      <td className="px-2.5 py-2">Comprobante fiscal digital ({CATALOGO_TIPO_CFDI[cfdi.tipo]})</td>
                      <td className="px-2.5 py-2 text-right">1</td>
                      <td className="px-2.5 py-2 text-right">
                        <Money value={cfdi.subtotal} moneda={cfdi.moneda} />
                      </td>
                      <td className="px-2.5 py-2 text-right font-medium">
                        <Money value={cfdi.subtotal} moneda={cfdi.moneda} />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex justify-end">
              <div className="w-full max-w-xs space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Subtotal</span>
                  <Money value={cfdi.subtotal} moneda={cfdi.moneda} className="font-medium" />
                </div>
                {cfdi.descuento > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Descuento</span>
                    <Money value={-cfdi.descuento} moneda={cfdi.moneda} className="font-medium" />
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-600">IVA Trasladado</span>
                  <Money value={cfdi.iva_trasladado} moneda={cfdi.moneda} className="font-medium" />
                </div>
                {cfdi.iva_retenido > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">IVA Retenido</span>
                    <Money value={-cfdi.iva_retenido} moneda={cfdi.moneda} className="font-medium" />
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-300 pt-2 text-sm font-bold text-slate-900">
                  <span>Total ({cfdi.moneda})</span>
                  <Money value={cfdi.total} moneda={cfdi.moneda} />
                </div>
              </div>
            </div>

            <div className="mt-6 border-t border-slate-200 pt-3 text-[10px] text-slate-500">
              Este documento es una representación impresa de un CFDI generada únicamente con fines de consulta y análisis dentro del Módulo Fiscal SAT del Portal Tecnocontrol.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
