import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  FileArchive,
  History,
  RefreshCw,
  RotateCw,
  Upload,
  X,
} from 'lucide-react';
import { useFiscal } from '../context/FiscalContext';
import { StatusBadge } from '../components/shared/StatusBadge';
import { AnimatedNumber } from '../components/shared/AnimatedNumber';
import { CATALOGO_REGIMEN, formatDateTime } from '../utils/format';
import { exportToExcel } from '../utils/exportExcel';
import {
  type BatchImportSummary,
  extractXmlTextsFromFiles,
  processXmlBatchForEmpresa,
} from '../utils/zipProcessor';

const HISTORICAL_YEARS = [2026, 2025, 2024, 2023, 2022, 2021];

export const SincronizacionPage: React.FC = () => {
  const {
    db,
    activeEmpresa,
    currentUser,
    triggerSyncNow,
    retrySyncRow,
    triggerHistoricalSync,
    importManualCfdis,
    addEmpresa,
    selectEmpresa,
    navigate,
    showToast,
  } = useFiscal();

  const [pageSize, setPageSize] = useState<5 | 10 | 25>(10);
  const [page, setPage] = useState(1);
  const [manualModal, setManualModal] = useState(false);
  const [histModal, setHistModal] = useState(false);
  const [selectedYears, setSelectedYears] = useState<number[]>([2025]);

  // Estado de carga masiva XML / ZIP
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [summary, setSummary] = useState<BatchImportSummary | null>(null);

  const isReadOnly = currentUser.rol === 'consulta';

  const logsEmpresa = useMemo(
    () =>
      db.descargas
        .filter((d) => d.empresa_id === activeEmpresa.id)
        .sort((a, b) => b.inicio.localeCompare(a.inicio)),
    [db.descargas, activeEmpresa.id],
  );

  const companyCfdiCount = useMemo(
    () => db.cfdis.filter((c) => c.empresa_id === activeEmpresa.id && !c.solo_en_sat).length,
    [db.cfdis, activeEmpresa.id],
  );

  const totalPages = Math.max(1, Math.ceil(logsEmpresa.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedLogs = logsEmpresa.slice((safePage - 1) * pageSize, safePage * pageSize);

  const ultimaConsulta = logsEmpresa[0]?.inicio;

  const handleExport = () => {
    exportToExcel(
      logsEmpresa.map((d) => ({
        Periodo: d.periodo,
        Tipo: d.tipo,
        Formato: d.formato.toUpperCase(),
        'ID Solicitud SAT': d.id_solicitud_sat,
        'CFDI Emitidos': d.cfdi_emitidos,
        'CFDI Recibidos': d.cfdi_recibidos,
        Inicio: formatDateTime(d.inicio),
        Fin: d.fin ? formatDateTime(d.fin) : 'En proceso',
        Estado: d.estado,
        Error: d.error || '',
      })),
      `Sincronizacion_SAT_${activeEmpresa.rfc}`,
      'Bitacora_SAT',
    );
  };

  const runBatchOnXmlTexts = async (
    xmlEntries: Array<{ name: string; xml: string }>,
    targetEmpresa = activeEmpresa,
    sourceLabel = 'Carga manual XML/ZIP',
  ) => {
    setIsProcessing(true);
    setProgress({ done: 0, total: xmlEntries.length });

    try {
      const existing = new Set(db.cfdis.map((c) => c.uuid.toUpperCase()));
      const result = await processXmlBatchForEmpresa(
        xmlEntries,
        targetEmpresa,
        existing,
        (done, total) => setProgress({ done, total }),
      );
      setSummary(result);

      if (result.imported.length > 0) {
        importManualCfdis(result.imported, {
          empresaId: targetEmpresa.id,
          sourceLabel,
        });
      } else if (result.totalXmlScanned === 0) {
        showToast('No se encontraron archivos .xml dentro de la selección');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFilesSelected = async (fileList: FileList | File[] | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setIsProcessing(true);
    setSummary(null);

    try {
      const xmlEntries = await extractXmlTextsFromFiles(files);
      const hasZip = files.some((f) => f.name.toLowerCase().endsWith('.zip'));
      const label = hasZip
        ? `Carga ZIP (${files.find((f) => f.name.toLowerCase().endsWith('.zip'))?.name || 'paquete.zip'})`
        : `Carga manual (${files.length} XML)`;
      await runBatchOnXmlTexts(xmlEntries, activeEmpresa, label);
    } catch {
      setIsProcessing(false);
      showToast('Error al descomprimir el archivo .zip. Verifica que no esté dañado.');
    }
  };

  const handleAutoCreateEmpresaAndImport = async () => {
    if (!summary?.suggestedRfc || !summary.rawXmlTexts.length) return;
    const sug = summary.suggestedRfc;

    const existingEmp = db.empresas.find((e) => e.rfc.toUpperCase() === sug.rfc.toUpperCase());
    const target = existingEmp
      ? (selectEmpresa(existingEmp.id), existingEmp)
      : addEmpresa({
        rfc: sug.rfc,
        razon_social: sug.razonSocial || sug.rfc,
        regimen: sug.regimen || '601',
        regimen_descripcion: (CATALOGO_REGIMEN[sug.regimen] || 'General de Ley Personas Morales').replace(
          /^\d+\s*-\s*/,
          '',
        ),
        tipo_persona: sug.rfc.length === 13 ? 'fisica' : 'moral',
        codigo_postal: '',
      });

    await runBatchOnXmlTexts(summary.rawXmlTexts, target, `Carga ZIP SAT (${target.rfc})`);
  };

  const toggleYear = (y: number) => {
    setSelectedYears((prev) =>
      prev.includes(y) ? prev.filter((item) => item !== y) : [...prev, y].sort((a, b) => b - a),
    );
  };

  const monthlyRequestsCount = selectedYears.reduce((sum, y) => sum + (y === 2026 ? 11 : 12), 0);

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Sincronización SAT / Gestor de documentos
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Bitácora diaria de descargas y carga masiva real de paquetes <strong>.zip / .xml</strong>{' '}
            (CFDI 4.0/3.3, Pagos 2.0, Nómina 1.2 y Carta Porte).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="btn-tactile inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar Excel
          </button>
          {!isReadOnly && (
            <>
              <button
                type="button"
                onClick={() => {
                  setSummary(null);
                  setProgress({ done: 0, total: 0 });
                  setManualModal(true);
                }}
                className="btn-tactile inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm cursor-pointer"
              >
                <Upload className="h-3.5 w-3.5" />
                Cargar XML / ZIP
              </button>
              <button
                type="button"
                onClick={() => setHistModal(true)}
                className="btn-tactile inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <History className="h-3.5 w-3.5" />
                Descarga histórica
              </button>
              <button
                type="button"
                onClick={triggerSyncNow}
                className="btn-tactile inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Actualizar SAT
              </button>
            </>
          )}
        </div>
      </div>

      {/* Aviso si no hay empresa registrada o no hay CFDIs aún */}
      {!activeEmpresa.id ? (
        <div className="animate-fade-up flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-blue-950">
            <p className="font-bold">Aún no hay una empresa (RFC) registrada</p>
            <p className="mt-0.5 text-blue-800">
              Registra tu empresa en <strong>Empresas (RFC)</strong> para importar tus archivos{' '}
              <strong>.zip</strong> o <strong>.xml</strong> del SAT.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('empresas')}
            className="btn-tactile rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer"
          >
            Registrar empresa (RFC)
          </button>
        </div>
      ) : companyCfdiCount === 0 ? (
        <div className="animate-fade-up flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-blue-950">
            <p className="font-bold">
              Sin comprobantes cargados para {activeEmpresa.razon_social}
              {activeEmpresa.rfc ? ` (${activeEmpresa.rfc})` : ''}
            </p>
            <p className="mt-0.5 text-blue-800">
              Arrastra un archivo <strong>.zip</strong> o archivos <strong>.xml</strong> del SAT
              para actualizar automáticamente el Dashboard, IVA, ISR y los indicadores fiscales.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setSummary(null);
                setManualModal(true);
              }}
              className="btn-tactile rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer"
            >
              Subir ZIP / XML ahora
            </button>
          </div>
        </div>
      ) : null}

      {/* Barra de estado de última consulta */}
      <div className="stagger-grid grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card-interactive rounded-2xl border border-slate-200 bg-white p-4">
          <span className="text-xs font-medium text-slate-500">Última consulta / carga</span>
          <p className="mt-1 text-sm font-bold text-slate-900">
            {ultimaConsulta ? formatDateTime(ultimaConsulta) : 'Sin cargas aún'}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Descarga automática diaria a las 02:00 h y carga masiva ZIP/XML
          </p>
        </div>
        <div className="card-interactive rounded-2xl border border-slate-200 bg-white p-4">
          <span className="text-xs font-medium text-slate-500">CFDIs sincronizados en empresa</span>
          <p className="mt-1 text-sm font-bold text-slate-900">
            <AnimatedNumber value={companyCfdiCount} /> comprobantes únicos
          </p>
          <p className="mt-0.5 text-[11px] text-emerald-600">
            Upsert por UUID activo — Pagos 2.0, Nómina 1.2 y Carta Porte
          </p>
        </div>
        <div className="card-interactive rounded-2xl border border-slate-200 bg-white p-4">
          <span className="text-xs font-medium text-slate-500">Pagos (REP) vinculados</span>
          <p className="mt-1 text-sm font-bold text-slate-900">
            <AnimatedNumber
              value={db.pagos.filter((p) => p.empresa_id === activeEmpresa.id).length}
            />{' '}
            documentos relacionados
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Alimentan automáticamente IVA en flujo e ISR cobrado
          </p>
        </div>
      </div>

      {/* Tabla Bitácora de descargas SAT */}
      <div className="panel-surface overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 text-xs">
          <div>
            <h2 className="font-bold text-slate-900">
              Bitácora de ejecuciones y cargas recientes ({logsEmpresa.length})
            </h2>
            <p className="text-[11px] text-slate-500">
              Historial de las últimas solicitudes programadas y cargas manuales (el total acumulado
              de la empresa es de <strong>{companyCfdiCount} CFDIs únicos</strong>).
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Periodo / Origen</th>
                <th className="px-4 py-3 font-semibold">Formato</th>
                <th className="px-4 py-3 text-right font-semibold">Emitidos</th>
                <th className="px-4 py-3 text-right font-semibold">Recibidos</th>
                <th className="px-4 py-3 font-semibold">Inicio</th>
                <th className="px-4 py-3 font-semibold">Fin</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 text-right font-semibold">Acción</th>
              </tr>
            </thead>
            <tbody className="stagger-rows divide-y divide-slate-100">
              {pagedLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                    No existen registros de sincronización todavía. Sube un ZIP/XML para comenzar.
                  </td>
                </tr>
              ) : (
                pagedLogs.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{row.periodo}</p>
                      <p className="font-mono-code text-[10px] text-slate-400">
                        {row.id_solicitud_sat}
                      </p>
                      {row.error && (
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-rose-600">
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          {row.error}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge variant="neutral">{row.formato.toUpperCase()}</StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">
                      {row.cfdi_emitidos}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">
                      {row.cfdi_recibidos}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {formatDateTime(row.inicio)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {row.fin ? formatDateTime(row.fin) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {row.estado === 'Completada' ? (
                        <StatusBadge variant="success" dot>
                          Completada
                        </StatusBadge>
                      ) : row.estado === 'Procesando' ? (
                        <StatusBadge variant="info" dot pulse>
                          Procesando
                        </StatusBadge>
                      ) : (
                        <StatusBadge variant="danger" dot>
                          Error
                        </StatusBadge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.estado === 'Error' && !isReadOnly ? (
                        <button
                          type="button"
                          onClick={() => retrySyncRow(row.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-100 cursor-pointer"
                        >
                          <RotateCw className="h-3 w-3" />
                          Reintentar
                        </button>
                      ) : row.estado === 'Procesando' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-blue-600">
                          <Clock className="h-3 w-3 animate-spin" />
                          Consultando SAT
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Verificado
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación exacta 5, 10 y 25 */}
        <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-4 py-3 text-xs sm:flex-row">
          <div className="flex items-center gap-2 text-slate-600">
            <span>Mostrar</span>
            <select
              name="sync-page-size"
              aria-label="Cantidad de registros por página"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value) as 5 | 10 | 25);
                setPage(1);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 font-medium text-slate-800"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
            </select>
            <span>de {logsEmpresa.length} registros</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700 disabled:opacity-40 cursor-pointer"
            >
              Anterior
            </button>
            <span className="px-2 text-slate-600">
              Página <strong>{safePage}</strong> de {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700 disabled:opacity-40 cursor-pointer"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      {/* Modal Carga Masiva de XML y ZIP */}
      {manualModal && (
        <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]">
          <div className="animate-modal-pop flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Carga masiva de XML y paquetes .ZIP (SAT)
                </h2>
                <p className="text-xs text-slate-500">
                  Empresa activa: <strong>{activeEmpresa.razon_social}</strong> (
                  <span className="font-mono-code">{activeEmpresa.rfc}</span>)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManualModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-6 text-xs">
              {/* Dropzone drag-and-drop */}
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  handleFilesSelected(e.dataTransfer.files);
                }}
                className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-all cursor-pointer ${isDragging
                  ? 'border-blue-600 bg-blue-50 scale-[1.01]'
                  : 'border-slate-300 bg-slate-50/80 hover:border-blue-400 hover:bg-blue-50/40'
                  }`}
              >
                <FileArchive className="h-9 w-9 text-blue-600" />
                <span className="text-sm font-semibold text-slate-800">
                  Arrastra aquí tus paquetes .ZIP del SAT o archivos .XML
                </span>
                <span className="max-w-md text-[11px] text-slate-500">
                  Descompresión 100 % local en tu navegador · Lee CFDI 4.0 / 3.3, Complemento de
                  Pagos 2.0 (REP), Nómina 1.2, Carta Porte y Relacionados sin duplicar UUIDs.
                </span>
                <input
                  type="file"
                  multiple
                  accept=".xml,.zip"
                  onChange={(e) => {
                    handleFilesSelected(e.target.files);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
              </label>

              {/* Progreso en vivo */}
              {isProcessing && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3.5">
                  <div className="mb-1.5 flex items-center justify-between font-semibold text-blue-900">
                    <span>Procesando y validando comprobantes...</span>
                    <span className="tabular-nums">
                      {progress.done} / {progress.total || '…'}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-blue-200/70">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all duration-200"
                      style={{
                        width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 35}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Resumen del lote procesado */}
              {summary && (
                <div className="animate-fade-up space-y-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5">
                      <span className="text-[10px] font-semibold uppercase text-emerald-700">
                        Importados
                      </span>
                      <p className="text-lg font-bold tabular-nums text-emerald-900">
                        {summary.imported.length}
                      </p>
                      <p className="text-[10px] text-emerald-700">
                        {summary.emitidosCount} E · {summary.recibidosCount} R
                      </p>
                    </div>
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-2.5">
                      <span className="text-[10px] font-semibold uppercase text-blue-700">
                        Complementos
                      </span>
                      <p className="text-lg font-bold tabular-nums text-blue-900">
                        {summary.pagosRepCount + summary.nominasCount + summary.cartaPorteCount}
                      </p>
                      <p className="text-[10px] text-blue-700">
                        {summary.pagosRepCount} REP · {summary.nominasCount} Nóm ·{' '}
                        {summary.cartaPorteCount} CP
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                      <span className="text-[10px] font-semibold uppercase text-slate-500">
                        Duplicados
                      </span>
                      <p className="text-lg font-bold tabular-nums text-slate-800">
                        {summary.duplicatesCount}
                      </p>
                      <p className="text-[10px] text-slate-500">Omitidos por UUID</p>
                    </div>
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5">
                      <span className="text-[10px] font-semibold uppercase text-rose-700">
                        Rechazados
                      </span>
                      <p className="text-lg font-bold tabular-nums text-rose-900">
                        {summary.rfcMismatchCount + summary.errorsCount}
                      </p>
                      <p className="text-[10px] text-rose-700">
                        {summary.rfcMismatchCount} RFC · {summary.errorsCount} XML
                      </p>
                    </div>
                  </div>

                  {/* Detección inteligente de RFC real del ZIP */}
                  {summary.suggestedRfc && (
                    <div className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-2.5 text-amber-950">
                        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                        <div>
                          <p className="font-bold">
                            Detectamos {summary.suggestedRfc.count} XMLs del RFC{' '}
                            <span className="font-mono-code">{summary.suggestedRfc.rfc}</span>
                          </p>
                          <p className="mt-0.5 text-[11px] text-amber-800">
                            {summary.suggestedRfc.razonSocial} (Régimen{' '}
                            {summary.suggestedRfc.regimen}). ¿Deseas registrar esta empresa e
                            importar todo el paquete en 1 clic?
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleAutoCreateEmpresaAndImport}
                        className="btn-tactile shrink-0 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer"
                      >
                        Crear empresa e importar
                      </button>
                    </div>
                  )}

                  {/* Lista detallada (hasta 60 renglones visibles + exportar Excel completo) */}
                  <div className="rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
                      <span className="font-semibold text-slate-700">
                        Detalle del archivo ({summary.entries.length} XMLs leídos)
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          exportToExcel(
                            summary.entries.map((e) => ({
                              Archivo: e.file,
                              Resultado: e.status,
                              Detalle: e.message,
                            })),
                            `Reporte_Carga_XML_${activeEmpresa.rfc}`,
                            'Carga_XML',
                          )
                        }
                        className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline cursor-pointer"
                      >
                        <Download className="h-3 w-3" /> Exportar reporte Excel
                      </button>
                    </div>
                    <div className="max-h-44 space-y-1 overflow-y-auto p-2.5">
                      {summary.entries.slice(0, 60).map((r, i) => (
                        <div
                          key={i}
                          className={`rounded-lg px-2.5 py-1.5 text-[11px] ${r.status === 'imported'
                            ? 'bg-emerald-50 text-emerald-800'
                            : r.status === 'duplicate'
                              ? 'bg-slate-100 text-slate-700'
                              : 'bg-rose-50 text-rose-800'
                            }`}
                        >
                          <span className="font-semibold">{r.file}:</span> {r.message}
                        </div>
                      ))}
                      {summary.entries.length > 60 && (
                        <p className="pt-1 text-center text-[11px] text-slate-400">
                          Mostrando primeros 60 de {summary.entries.length} registros. Descarga el
                          reporte Excel para ver todos.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-slate-100 px-6 py-3.5">
              <button
                type="button"
                onClick={() => setManualModal(false)}
                className="btn-tactile rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Descarga Histórica */}
      {histModal && (
        <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]">
          <div className="animate-modal-pop w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900">
                Descarga histórica SAT (hasta 5 años)
              </h2>
              <button
                type="button"
                onClick={() => setHistModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <p className="text-slate-600">
                Selecciona los ejercicios que deseas incorporar. El sistema divide automáticamente
                cada año en <strong>solicitudes mensuales</strong> para respetar los límites del Web
                Service del SAT.
              </p>

              <div className="grid grid-cols-3 gap-2">
                {HISTORICAL_YEARS.map((y) => {
                  const active = selectedYears.includes(y);
                  return (
                    <button
                      key={y}
                      type="button"
                      onClick={() => toggleYear(y)}
                      className={`rounded-xl border px-3 py-2.5 font-semibold transition-colors cursor-pointer ${active
                        ? 'border-blue-600 bg-blue-50 text-blue-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                      {y}
                    </button>
                  );
                })}
              </div>

              <div className="rounded-xl bg-slate-50 p-3 text-slate-700">
                Solicitudes mensuales a programar: <strong>{monthlyRequestsCount}</strong> (emitidos
                y recibidos).
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setHistModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 font-medium text-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={selectedYears.length === 0}
                  onClick={() => {
                    triggerHistoricalSync(selectedYears);
                    setHistModal(false);
                  }}
                  className="btn-tactile rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-40 cursor-pointer"
                >
                  Iniciar descarga histórica
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
