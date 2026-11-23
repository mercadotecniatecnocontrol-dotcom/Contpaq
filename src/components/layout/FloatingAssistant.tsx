import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Send, Maximize2, RotateCcw, Paperclip, Compass, HelpCircle } from 'lucide-react';
import { useFiscal } from '../../context/FiscalContext';
import { getContextualSuggestions, type AssistantMessage } from '../../services/assistantEngine';
import { PAGE_GUIDE_CATALOG } from '../../services/pageGuideEngine';
import { AssistantMessageView } from '../shared/AssistantMessageView';

export const FloatingAssistant: React.FC = () => {
  const {
    activeEmpresa,
    activeRoute,
    navigate,
    currentUser,
    assistantMessages,
    assistantThinking,
    attachedDocs,
    floatingAssistantOpen: open,
    setFloatingAssistantOpen: setOpen,
    explainCurrentPageWithAssistant,
    sendAssistantMessage,
    removeAttachedDoc,
    clearAssistantMessages,
    addCustomIndicator,
  } = useFiscal();

  const [input, setInput] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [open, assistantMessages.length, assistantThinking]);

  // En la pantalla dedicada del asistente no duplicamos el botón flotante
  if (activeRoute === 'asistente') return null;

  const contextualChips = getContextualSuggestions(activeRoute);
  const activePageGuide = PAGE_GUIDE_CATALOG[activeRoute] || PAGE_GUIDE_CATALOG.dashboard;

  const handleSend = async (preset?: string) => {
    const q = (preset ?? input).trim();
    if (!q && pendingFiles.length === 0) return;
    const files = pendingFiles;
    setInput('');
    setPendingFiles([]);
    await sendAssistantMessage(q, files.length > 0 ? files : null);
  };

  const handleSaveInd = (msg: AssistantMessage) => {
    if (!msg.suggestedIndicator) return;
    addCustomIndicator({
      codigo: `IA_${Date.now().toString().slice(-5)}`,
      nombre: msg.suggestedIndicator.nombre,
      descripcion: msg.suggestedIndicator.descripcion,
      grupo: msg.suggestedIndicator.grupo,
      aplica_emitidos: msg.suggestedIndicator.aplica_emitidos,
      aplica_recibidos: msg.suggestedIndicator.aplica_recibidos,
      severidad: 'media',
      filtros: msg.suggestedIndicator.filtros,
      creado_con_ia: true,
    });
    setSavedIds((prev) => new Set(prev).add(msg.id));
  };

  return (
    <div className="no-print fixed right-4 bottom-4 z-40 sm:right-6 sm:bottom-6">
      {open ? (
        <div className="animate-modal-pop flex h-[540px] max-h-[82vh] w-[370px] max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between bg-gradient-to-r from-[#08335e] to-[#0e4b85] px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-xs font-semibold">Asistente Tecno (En vivo)</p>
                <p className="text-[10px] text-blue-100 truncate max-w-[175px]">
                  {activeEmpresa.rfc} · Solo Portal Fiscal
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {assistantMessages.length > 0 && (
                <button
                  type="button"
                  onClick={clearAssistantMessages}
                  title="Limpiar chat"
                  className="rounded-lg p-1.5 text-blue-100 hover:bg-white/15 hover:text-white cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate('asistente');
                }}
                title="Abrir pantalla completa"
                className="rounded-lg p-1.5 text-blue-100 hover:bg-white/15 hover:text-white cursor-pointer"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                title="Cerrar chat"
                className="rounded-lg p-1.5 text-blue-100 hover:bg-white/15 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Barra contextual de la pantalla actual */}
          <div className="flex items-center justify-between gap-2 border-b border-blue-100 bg-blue-50/90 px-3 py-2 text-[11px]">
            <div className="flex min-w-0 items-center gap-1.5 text-slate-700">
              <Compass className="h-3.5 w-3.5 shrink-0 text-blue-700" />
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900 leading-tight">
                  {activePageGuide.nombreCorto}
                </p>
                <p className="truncate text-[10px] text-slate-500 leading-tight">
                  {activePageGuide.ubicacionMenu.replace(/^Menú lateral →\s*/i, '')}
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={assistantThinking}
              onClick={() => void explainCurrentPageWithAssistant(activeRoute)}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-[10px] font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
            >
              <HelpCircle className="h-3 w-3" />
              Explicar página
            </button>
          </div>

          {attachedDocs.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto border-b border-blue-100 bg-blue-50/70 px-3 py-1.5 text-[10px]">
              <span className="shrink-0 font-semibold text-blue-900">
                {attachedDocs.length} doc(s):
              </span>
              {attachedDocs.map((d) => (
                <span
                  key={d.id}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-blue-200 bg-white px-1.5 py-0.5 text-slate-700"
                >
                  <span className="max-w-[95px] truncate font-medium">{d.fileName}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachedDoc(d.id)}
                    className="text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3.5 text-xs">
            {assistantMessages.length === 0 ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-slate-700">
                  <p className="font-semibold text-slate-900">
                    Hola, {currentUser.nombre.split(' ')[1] || currentUser.nombre}
                  </p>
                  <p className="mt-1 text-slate-600">
                    Respondo dudas y consulto datos en tiempo real de{' '}
                    <strong>{activeEmpresa.razon_social}</strong>. Sugerencias para esta pantalla:
                  </p>
                </div>
                <div className="space-y-1.5">
                  {contextualChips.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void handleSend(s)}
                      className="block w-full rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-2 text-left font-medium text-blue-800 hover:bg-blue-100/70 transition-colors cursor-pointer"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {assistantMessages.map((m) => (
                  <AssistantMessageView
                    key={m.id}
                    message={m}
                    compact
                    onFollowUp={(fq) => void handleSend(fq)}
                    onAfterNavigate={() => setOpen(false)}
                    isIndicatorSaved={savedIds.has(m.id)}
                    onSaveIndicator={handleSaveInd}
                  />
                ))}
                {assistantThinking && (
                  <div className="animate-msg-in flex justify-start">
                    <div className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2 text-[11px] text-slate-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-ping" />
                      Analizando datos en tiempo real...
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </>
            )}
          </div>

          <div className="border-t border-slate-200 bg-white p-2.5">
            {pendingFiles.length > 0 && (
              <div className="mb-1.5 flex flex-wrap gap-1">
                {pendingFiles.map((f, i) => (
                  <span
                    key={`${f.name}-${i}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-0.5 text-[11px] text-blue-800"
                  >
                    <span className="max-w-[140px] truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      className="cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSend();
              }}
              className="flex items-center gap-1.5"
            >
              <input
                ref={fileRef}
                type="file"
                name="floating-asistente-archivos"
                aria-label="Adjuntar documentos al asistente"
                multiple
                accept=".pdf,.docx,.pptx,.xlsx,.xls,.csv,.xml,.zip,.txt,.json,.md,.html"
                onChange={(e) => {
                  if (e.target.files) {
                    setPendingFiles((prev) => [...prev, ...Array.from(e.target.files!)].slice(0, 8));
                  }
                  e.target.value = '';
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                title="Adjuntar documentos (PDF, Excel, CSV, XML, ZIP, TXT)"
                aria-label="Adjuntar documentos"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-blue-700 cursor-pointer"
              >
                <Paperclip className="h-3.5 w-3.5" />
              </button>
              <input
                type="text"
                name="floating-asistente-consulta"
                aria-label="Consulta rápida en Asistente Tecno"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  attachedDocs.length > 0
                    ? 'Pregunte sobre sus documentos adjuntos...'
                    : 'Consulte el portal o adjunte PDF/Excel/XML...'
                }
                className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={assistantThinking || (!input.trim() && pendingFiles.length === 0)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 cursor-pointer"
                aria-label="Enviar"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="animate-float-glow btn-tactile group flex items-center gap-2 rounded-full bg-gradient-to-r from-[#0b3c6c] via-[#0e4b85] to-[#1a5f9e] animate-ambient-gradient px-4 py-3 text-xs font-semibold text-white ring-1 ring-white/25 cursor-pointer"
        >
          <Sparkles className="h-4 w-4 text-blue-100 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
          <span className="hidden sm:inline">Asistente Tecno</span>
        </button>
      )}
    </div>
  );
};
