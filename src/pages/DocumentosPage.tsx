import React, { useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  FileCheck2,
  FileText,
  Printer,
  Upload,
  X,
} from 'lucide-react';
import type { SentidoDocumento, TipoDocumentoFiscal } from '../types/fiscal';
import { useFiscal } from '../context/FiscalContext';
import { formatShortDate } from '../utils/format';
import { RoleGuard } from '../components/shared/RoleGuard';
import { StatusBadge } from '../components/shared/StatusBadge';

const DOC_TYPES: Array<{ tipo: TipoDocumentoFiscal; label: string; sub: string }> = [
  {
    tipo: 'constancia',
    label: 'Constancia de Situación Fiscal (CSF)',
    sub: 'Padrón de contribuyentes y régimen vigente SAT',
  },
  {
    tipo: 'opinion_sat',
    label: 'Opinión de Cumplimiento SAT (32-D)',
    sub: 'Cumplimiento de obligaciones fiscales federales',
  },
  {
    tipo: 'opinion_imss',
    label: 'Opinión de Cumplimiento IMSS',
    sub: 'Cumplimiento en materia de seguridad social',
  },
];

export const DocumentosPage: React.FC = () => {
  const { db, activeEmpresa, currentUser, updateDocumentoFiscal } = useFiscal();
  const [selectedTipo, setSelectedTipo] = useState<TipoDocumentoFiscal>('opinion_sat');
  const [uploadOpen, setUploadOpen] = useState(false);

  const [sentido, setSentido] = useState<SentidoDocumento>('positiva');
  const [folio, setFolio] = useState('');
  const [notas, setNotas] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const isReadOnly = currentUser.rol === 'consulta';

  const docsEmpresa = db.documentos.filter((d) => d.empresa_id === activeEmpresa.id);
  const activeDoc = docsEmpresa.find((d) => d.tipo === selectedTipo);

  const openUploadFor = (tipo: TipoDocumentoFiscal) => {
    setSelectedTipo(tipo);
    const existing = docsEmpresa.find((d) => d.tipo === tipo);
    setSentido(tipo === 'constancia' ? 'vigente' : existing?.sentido || 'positiva');
    setFolio(existing?.folio_documento || `26ND${Math.floor(10000000 + Math.random() * 89999999)}`);
    setNotas(existing?.notas || '');
    setPdfFile(null);
    setUploadOpen(true);
  };

  const handleSaveDoc = (e: React.FormEvent) => {
    e.preventDefault();
    const blobUrl = pdfFile ? URL.createObjectURL(pdfFile) : activeDoc?.blob_url;
    const fileName =
      pdfFile?.name ||
      `${selectedTipo.toUpperCase()}_${activeEmpresa.rfc}_${new Date().toISOString().slice(0, 7)}.pdf`;

    updateDocumentoFiscal({
      tipo: selectedTipo,
      sentido: selectedTipo === 'constancia' ? 'vigente' : sentido,
      folio_documento: folio.trim() || 'S/F',
      archivo_nombre: fileName,
      blob_url: blobUrl,
      notas: notas.trim() || undefined,
    });
    setUploadOpen(false);
  };

  return (
    <RoleGuard allowedRoles={['propietario', 'contador', 'consulta']} sectionName="Datos fiscales">
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Datos fiscales</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Constancia de Situación Fiscal y Opiniones de Cumplimiento (SAT e IMSS) con vista
              previa.
            </p>
          </div>
          {!isReadOnly && (
            <button
              type="button"
              onClick={() => openUploadFor(selectedTipo)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" />
              Cargar actualización mensual (PDF)
            </button>
          )}
        </div>

        {/* Recordatorio día 1 de cada mes */}
        <div className="flex items-start gap-2.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
          <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <p>
            <strong>Recordatorio mensual (día 1 de cada mes):</strong> El SAT y el IMSS no ofrecen
            Web Service oficial para descargar automáticamente estos documentos; realiza la carga
            manual aquí. Si la opinión SAT es <strong>negativa</strong>, la tarjeta del Dashboard
            pasa a rojo y se notifica a Dirección.
          </p>
        </div>

        {/* Split layout: lista izquierda, vista previa PDF derecha */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Lista de los 3 documentos */}
          <div className="stagger-grid space-y-3 lg:col-span-4">
            {DOC_TYPES.map((dt) => {
              const doc = docsEmpresa.find((d) => d.tipo === dt.tipo);
              const selected = selectedTipo === dt.tipo;
              const isNeg = doc?.sentido === 'negativa';

              return (
                <button
                  key={dt.tipo}
                  type="button"
                  onClick={() => setSelectedTipo(dt.tipo)}
                  className={`card-interactive w-full rounded-2xl border p-4 text-left cursor-pointer ${selected
                    ? isNeg
                      ? 'border-rose-400 bg-rose-50/50 ring-2 ring-rose-500/15'
                      : 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-500/15'
                    : 'border-slate-200 bg-white hover:border-blue-300'
                    }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isNeg
                          ? 'bg-rose-100 text-rose-700'
                          : selected
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-600'
                          }`}
                      >
                        {isNeg ? (
                          <AlertTriangle className="h-4 w-4" />
                        ) : (
                          <FileCheck2 className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900">{dt.label}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">{dt.sub}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11px]">
                    <span className="text-slate-500">
                      Consulta: {doc ? formatShortDate(doc.fecha_consulta) : 'Pendiente'}
                    </span>
                    {doc ? (
                      <StatusBadge
                        variant={
                          doc.sentido === 'negativa'
                            ? 'danger'
                            : doc.sentido === 'positiva'
                              ? 'success'
                              : 'info'
                        }
                        dot
                      >
                        {doc.sentido === 'positiva'
                          ? 'Positiva'
                          : doc.sentido === 'negativa'
                            ? 'Negativa'
                            : 'Vigente'}
                      </StatusBadge>
                    ) : (
                      <StatusBadge variant="neutral">Sin archivo</StatusBadge>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Panel derecho: Vista previa PDF */}
          <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white lg:col-span-8">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-slate-900">
                  {activeDoc?.titulo || DOC_TYPES.find((d) => d.tipo === selectedTipo)?.label}
                </p>
                <p className="truncate text-[11px] text-slate-500">
                  {activeDoc
                    ? `${activeDoc.archivo_nombre} · Folio ${activeDoc.folio_documento} · Consulta ${formatShortDate(activeDoc.fecha_consulta)}`
                    : 'Sin archivo cargado aún'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => openUploadFor(selectedTipo)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Reemplazar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 cursor-pointer"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Imprimir
                </button>
              </div>
            </div>

            {/* Si el usuario subió un PDF real, lo mostramos en iframe; si no, vista previa fiel del documento */}
            <div key={selectedTipo} className="animate-fade-up flex-1 bg-slate-100 p-4 sm:p-6">
              {activeDoc?.blob_url ? (
                <iframe
                  src={activeDoc.blob_url}
                  title={activeDoc.titulo}
                  className="h-[520px] w-full rounded-xl border border-slate-200 bg-white"
                />
              ) : activeDoc ? (
                <div className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-xs text-slate-900">
                  <div className="flex items-start justify-between border-b-2 border-[#0e4b85] pb-4">
                    <div>
                      <img
                        src="./logotecno.png"
                        alt="Tecnocontrol"
                        className="mb-2 h-6 w-auto object-contain"
                      />
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Vista previa de documento oficial · Resguardo Tecnocontrol
                      </p>
                      <h2 className="mt-1 text-base font-bold">{activeDoc.titulo}</h2>
                    </div>
                    {activeDoc.sentido === 'negativa' ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-bold text-white">
                        <AlertTriangle className="h-3.5 w-3.5" /> NEGATIVA
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white">
                        <CheckCircle2 className="h-3.5 w-3.5" />{' '}
                        {activeDoc.sentido.toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-4 text-xs sm:grid-cols-2">
                    <div>
                      <span className="text-[10px] font-semibold uppercase text-slate-500">
                        Contribuyente
                      </span>
                      <p className="mt-0.5 font-bold text-slate-900">
                        {activeEmpresa.razon_social}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold uppercase text-slate-500">
                        RFC
                      </span>
                      <p className="mt-0.5 font-mono-code font-bold text-slate-900">
                        {activeEmpresa.rfc}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold uppercase text-slate-500">
                        Régimen Fiscal
                      </span>
                      <p className="mt-0.5 font-medium text-slate-800">
                        {activeEmpresa.regimen} · {activeEmpresa.regimen_descripcion}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold uppercase text-slate-500">
                        Folio / Fecha emisión
                      </span>
                      <p className="mt-0.5 font-mono-code font-medium text-slate-800">
                        {activeDoc.folio_documento} · {formatShortDate(activeDoc.fecha_consulta)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-slate-200 p-4 text-xs leading-relaxed text-slate-700">
                    <p className="font-semibold text-slate-900">Dictamen / Notas del documento:</p>
                    <p className="mt-1">
                      {activeDoc.notas ||
                        'Documento vigente incorporado al expediente fiscal digital del Portal Operativo Tecnocontrol.'}
                    </p>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" /> {activeDoc.archivo_nombre}
                    </span>
                    <span>C.P. {activeEmpresa.codigo_postal}</span>
                  </div>
                </div>
              ) : (
                <div className="flex h-80 flex-col items-center justify-center text-center text-slate-500">
                  <FileText className="h-10 w-10 text-slate-300" />
                  <p className="mt-2 text-sm font-semibold text-slate-700">
                    Documento aún no cargado para {activeEmpresa.rfc}
                  </p>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => openUploadFor(selectedTipo)}
                      className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer"
                    >
                      Subir PDF ahora
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal carga manual de documento */}
        {uploadOpen && (
          <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]">
            <div className="animate-modal-pop w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-base font-bold text-slate-900">
                  Actualizar documento fiscal
                </h2>
                <button
                  type="button"
                  onClick={() => setUploadOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <form onSubmit={handleSaveDoc} className="mt-4 space-y-3.5 text-xs">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Documento</label>
                  <select
                    value={selectedTipo}
                    onChange={(e) => {
                      const t = e.target.value as TipoDocumentoFiscal;
                      setSelectedTipo(t);
                      if (t === 'constancia') setSentido('vigente');
                      else if (sentido === 'vigente') setSentido('positiva');
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  >
                    {DOC_TYPES.map((d) => (
                      <option key={d.tipo} value={d.tipo}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedTipo !== 'constancia' && (
                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">
                      Sentido de la opinión
                    </label>
                    <select
                      value={sentido}
                      onChange={(e) => setSentido(e.target.value as SentidoDocumento)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2"
                    >
                      <option value="positiva">Positiva (al corriente)</option>
                      <option value="negativa">Negativa (alerta roja + notifica Dirección)</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="mb-1 block font-semibold text-slate-700">
                    Folio del documento
                  </label>
                  <input
                    type="text"
                    required
                    value={folio}
                    onChange={(e) => setFolio(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono-code"
                  />
                </div>

                <div>
                  <label className="mb-1 block font-semibold text-slate-700">
                    Archivo PDF (opcional)
                  </label>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-2.5 file:py-1 file:text-xs"
                  />
                </div>

                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Notas</label>
                  <textarea
                    rows={2}
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    placeholder="Observaciones de la consulta mensual..."
                    className="w-full rounded-xl border border-slate-200 p-2.5"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setUploadOpen(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 font-medium text-slate-700 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 cursor-pointer"
                  >
                    Guardar documento
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
};
