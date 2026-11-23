import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Compass,
  FileArchive,
  FileCode2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  HelpCircle,
  History,
  Paperclip,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { useFiscal } from '../context/FiscalContext';
import { formatDateTime } from '../utils/format';
import {
  type AssistantMessage,
  SUGERENCIAS_ASISTENTE,
} from '../services/assistantEngine';
import {
  ALL_PAGE_GUIDES_ORDERED,
  PAGE_GUIDE_CATALOG,
} from '../services/pageGuideEngine';
import type { DocumentFormat } from '../services/documentAnalyzer';
import { StatusBadge } from '../components/shared/StatusBadge';
import { AssistantMessageView } from '../components/shared/AssistantMessageView';

const ACCEPTED_DOC_TYPES = '.pdf,.docx,.pptx,.xlsx,.xls,.csv,.xml,.zip,.txt,.json,.md,.html';

const EXTRA_QUICK_PROMPTS = [
  'Guía paso a paso para usar el portal',
  '¿Qué asuntos fiscales requieren atención urgente?',
  'Compara octubre contra septiembre',
  '¿Qué gastos de octubre no son deducibles?',
  '¿Dónde encuentro la constancia y opinión del SAT?',
  'Muéstrame todas las rutas del portal',
];

function FormatIcon({ format }: { format: DocumentFormat }) {
  if (format === 'excel' || format === 'csv' || format === 'sat_metadata') {
    return <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700 shrink-0" />;
  }
  if (format === 'zip') {
    return <FileArchive className="h-3.5 w-3.5 text-amber-700 shrink-0" />;
  }
  if (format === 'xml') {
    return <FileCode2 className="h-3.5 w-3.5 text-blue-700 shrink-0" />;
  }
  return <FileText className="h-3.5 w-3.5 text-rose-700 shrink-0" />;
}

interface SavedChatSession {
  id: string;
  empresaId: string;
  title: string;
  createdAt: string;
  messagesCount: number;
  preview: string;
  firstPrompt: string;
}

const CHAT_HISTORY_STORAGE_KEY = 'tecnocontrol_assistant_history_v1';

export const AsistentePage: React.FC = () => {
  const {
    db,
    activeEmpresa,
    currentUser,
    assistantMessages,
    assistantThinking,
    attachedDocs,
    previousRoute,
    explainCurrentPageWithAssistant,
    sendAssistantMessage,
    removeAttachedDoc,
    clearAttachedDocs,
    clearAssistantMessages,
    addCustomIndicator,
    navigate,
  } = useFiscal();

  const [input, setInput] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [savedIndicatorMsgIds, setSavedIndicatorMsgIds] = useState<Set<string>>(new Set());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pageGuideOpen, setPageGuideOpen] = useState(false);
  const previousGuide = PAGE_GUIDE_CATALOG[previousRoute] || PAGE_GUIDE_CATALOG.dashboard;
  const [chatHistory, setChatHistory] = useState<SavedChatSession[]>(() => {
    try {
      const raw = localStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const consumo = db.consumos.find((c) => c.empresa_id === activeEmpresa.id);
  const opinionSat = db.documentos.find(
    (d) => d.empresa_id === activeEmpresa.id && d.tipo === 'opinion_sat',
  );
  const opinionNegativa = opinionSat?.sentido === 'negativa';
  const firstName =
    currentUser.nombre
      .replace(/^(Ing\.|Lic\.|C\.P\.)\s*/i, '')
      .split(' ')[0] || currentUser.nombre;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [assistantMessages.length, assistantThinking]);

  const appendPendingFiles = (files: FileList | File[]) => {
    const incoming = Array.from(files);
    if (incoming.length === 0) return;
    setPendingFiles((prev) => {
      const existingNames = new Set(prev.map((f) => `${f.name}-${f.size}`));
      const unique = incoming.filter((f) => !existingNames.has(`${f.name}-${f.size}`));
      return [...prev, ...unique].slice(0, 10);
    });
  };

  const saveCurrentSessionToHistory = () => {
    const userMsgs = assistantMessages.filter((m) => m.sender === 'user');
    if (userMsgs.length === 0) return;
    const firstQ = userMsgs[0].text;
    const lastA =
      [...assistantMessages].reverse().find((m) => m.sender === 'assistant')?.text || '';
    const session: SavedChatSession = {
      id: `chat-${Date.now()}`,
      empresaId: activeEmpresa.id,
      title: firstQ.slice(0, 70),
      createdAt: new Date().toISOString(),
      messagesCount: assistantMessages.length,
      preview: lastA.replace(/[*#_]/g, '').slice(0, 120),
      firstPrompt: firstQ,
    };
    setChatHistory((prev) => {
      const next = [session, ...prev.filter((s) => s.title !== session.title)].slice(0, 20);
      localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleNewConversation = () => {
    saveCurrentSessionToHistory();
    clearAssistantMessages();
  };

  const handleDeleteHistoryItem = (id: string) => {
    setChatHistory((prev) => {
      const next = prev.filter((s) => s.id !== id);
      localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleSend = async (preset?: string) => {
    const text = (preset ?? input).trim();
    if (!text && pendingFiles.length === 0) return;
    const filesToSend = pendingFiles;
    setInput('');
    setPendingFiles([]);
    await sendAssistantMessage(text, filesToSend.length > 0 ? filesToSend : null);
  };

  const handleSaveSuggestedIndicator = (msg: AssistantMessage) => {
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
    setSavedIndicatorMsgIds((prev) => new Set(prev).add(msg.id));
  };

  return (
    <div
      className="relative mx-auto flex min-h-[calc(100vh-8.5rem)] max-w-4xl flex-col justify-between space-y-4"
      onDragOver={(e) => {
        e.preventDefault();
        if (!isDragging) setIsDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          appendPendingFiles(e.dataTransfer.files);
        }
      }}
    >
      {/* Overlay visual para Drag & Drop */}
      {isDragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-blue-950/25 backdrop-blur-[2px]">
          <div className="animate-modal-pop flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-blue-500 bg-white px-10 py-8 text-center shadow-2xl">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              <UploadCloud className="h-7 w-7" />
            </div>
            <p className="text-base font-bold text-slate-900">
              Suelte sus documentos para analizarlos
            </p>
            <p className="max-w-sm text-xs text-slate-500">
              Admite <strong>PDF</strong>, <strong>Word (.docx)</strong>,{' '}
              <strong>PowerPoint (.pptx)</strong>, <strong>Excel / CSV</strong>,{' '}
              <strong>XML CFDI</strong>, <strong>ZIP SAT</strong> y <strong>TXT / JSON</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Banner superior de cumplimiento SAT + contexto del Asistente */}
      <div className="space-y-2.5">
        <button
          type="button"
          onClick={() => navigate('documentos')}
          className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-2xl border px-4 py-2.5 text-xs transition-colors cursor-pointer ${
            opinionNegativa
              ? 'border-rose-300 bg-rose-50 text-rose-900 hover:bg-rose-100/70'
              : opinionSat
                ? 'border-emerald-200 bg-emerald-50/70 text-emerald-950 hover:bg-emerald-100/70'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-2">
            {opinionNegativa ? (
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
            ) : opinionSat ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <HelpCircle className="h-4 w-4 shrink-0 text-slate-400" />
            )}
            <span className="font-semibold">
              {opinionNegativa
                ? 'Atención requerida en obligaciones fiscales | Opinión negativa SAT'
                : opinionSat
                  ? 'Tus obligaciones están al día | Opinión positiva SAT'
                  : 'Opinión de cumplimiento SAT (32-D) pendiente de cargar'}
            </span>
          </div>
          <span className="font-bold underline">Ver detalle →</span>
        </button>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="font-bold text-slate-900">
                Asistente Tecno · IA dedicada al Portal Fiscal SAT
              </p>
              <p className="text-[11px] text-slate-500">
                Respuestas en tiempo real y análisis multi-documento sobre{' '}
                <strong>{activeEmpresa.rfc}</strong> · PDF, Excel, CSV, XML, ZIP y TXT
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge variant="success" dot pulse>
              En tiempo real
            </StatusBadge>
            <StatusBadge variant="info">
              <ShieldCheck className="h-3 w-3" /> Solo portal
            </StatusBadge>
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              {consumo?.consultas_ia_mes || 0} consulta(s) este mes
            </span>
            <button
              type="button"
              onClick={() => {
                setHistoryOpen(false);
                setPageGuideOpen((v) => !v);
              }}
              title="Elegir cualquier pantalla del portal para que el Asistente la explique"
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold cursor-pointer ${
                pageGuideOpen
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-blue-200 bg-blue-50/50 text-blue-800 hover:bg-blue-100/70'
              }`}
            >
              <Compass className="h-3.5 w-3.5" />
              Explicar pantallas y rutas
            </button>
            <button
              type="button"
              onClick={() => {
                saveCurrentSessionToHistory();
                setPageGuideOpen(false);
                setHistoryOpen((v) => !v);
              }}
              title="Mostrar historial de chats"
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold cursor-pointer ${
                historyOpen
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <History className="h-3.5 w-3.5" />
              Mostrar historial de chats ({chatHistory.length})
            </button>
            {assistantMessages.length > 0 && (
              <button
                type="button"
                onClick={handleNewConversation}
                title="Guardar en historial e iniciar nueva conversación"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" /> Nuevo chat
              </button>
            )}
          </div>
        </div>

        {/* Panel desplegable: Explicar cualquier pantalla del portal y sus rutas */}
        {pageGuideOpen && (
          <div className="animate-fade-up rounded-2xl border border-blue-200 bg-white p-4 text-xs shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-blue-600" />
                <div>
                  <p className="font-bold text-slate-900">
                    ¿De qué pantalla del portal tiene dudas?
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Seleccione cualquier vista para que Asistente Tecno explique sus funciones, rutas conectadas, cifras en vivo y dudas frecuentes.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {previousRoute !== 'asistente' && (
                  <button
                    type="button"
                    onClick={() => {
                      setPageGuideOpen(false);
                      void explainCurrentPageWithAssistant(previousRoute);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700 cursor-pointer"
                  >
                    <Sparkles className="h-3 w-3" />
                    Explicar donde estaba ({previousGuide.nombreCorto})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPageGuideOpen(false)}
                  aria-label="Cerrar selector de pantallas"
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {ALL_PAGE_GUIDES_ORDERED.map((guide) => (
                <button
                  key={guide.route}
                  type="button"
                  disabled={assistantThinking}
                  onClick={() => {
                    setPageGuideOpen(false);
                    void explainCurrentPageWithAssistant(guide.route);
                  }}
                  className="group rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/70 disabled:opacity-50 cursor-pointer"
                >
                  <p className="truncate font-semibold text-slate-900 group-hover:text-blue-900">
                    {guide.nombreCorto}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-slate-500 group-hover:text-blue-700">
                    {guide.ubicacionMenu.replace(/^Menú lateral →\s*/i, '')}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Panel desplegable de Historial de Chats */}
        {historyOpen && (
          <div className="animate-fade-up rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <span className="font-bold text-slate-900">
                Historial de conversaciones guardadas
              </span>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                aria-label="Cerrar historial"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {chatHistory.length === 0 ? (
              <p className="py-4 text-center text-slate-500">
                Aún no hay conversaciones archivadas. Al iniciar un nuevo chat o abrir este panel con
                mensajes activos se guardan automáticamente.
              </p>
            ) : (
              <div className="mt-2.5 max-h-52 space-y-2 overflow-y-auto">
                {chatHistory.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 hover:border-blue-200 hover:bg-blue-50/40"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryOpen(false);
                        void handleSend(item.firstPrompt);
                      }}
                      className="min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <p className="truncate font-semibold text-slate-900">{item.title}</p>
                      <p className="truncate text-[11px] text-slate-500">
                        {formatDateTime(item.createdAt)} · {item.messagesCount} msg(s) ·{' '}
                        {item.preview}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteHistoryItem(item.id)}
                      title="Eliminar del historial"
                      aria-label="Eliminar del historial"
                      className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bandeja de documentos acumulados en la memoria de la conversación */}
      {attachedDocs.length > 0 && (
        <div className="animate-fade-up rounded-2xl border border-blue-200/80 bg-blue-50/50 px-4 py-2.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold text-blue-950">
              <FolderOpen className="h-4 w-4 text-blue-700" />
              <span>
                Documentos en contexto ({attachedDocs.length})
              </span>
              <span className="hidden text-[11px] font-normal text-blue-700 sm:inline">
                — Puede consultarlos, cruzarlos contra el portal o compararlos entre sí
              </span>
            </div>
            <div className="flex items-center gap-2">
              {attachedDocs.length >= 2 && (
                <button
                  type="button"
                  onClick={() => void handleSend('Compara los documentos adjuntos')}
                  className="rounded-lg border border-blue-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-800 hover:bg-blue-100 cursor-pointer"
                >
                  Comparar documentos
                </button>
              )}
              <button
                type="button"
                onClick={clearAttachedDocs}
                className="text-[11px] font-medium text-slate-500 hover:text-rose-700 cursor-pointer"
              >
                Quitar todos
              </button>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {attachedDocs.map((doc) => (
              <div
                key={doc.id}
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-2.5 py-1 text-[11px] text-slate-800 shadow-2xs"
              >
                <FormatIcon format={doc.format} />
                <button
                  type="button"
                  onClick={() => void handleSend(`Resúmeme los datos principales de ${doc.fileName}`)}
                  className="max-w-[165px] truncate font-semibold hover:text-blue-700 cursor-pointer"
                  title={`${doc.fileName} · ${doc.categoryLabel}`}
                >
                  {doc.fileName}
                </button>
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                  {doc.categoryLabel}
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachedDoc(doc.id)}
                  title="Quitar del contexto"
                  className="ml-0.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Área de conversación o pantalla de bienvenida */}
      <div className="flex-1 space-y-4">
        {assistantMessages.length === 0 ? (
          <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-slate-200 bg-white px-5 py-10 text-center shadow-sm">
            <div className="pointer-events-none absolute -top-24 left-1/2 h-56 w-80 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-500/10 via-blue-300/15 to-rose-400/10 blur-3xl" />
            <img
              src="./logotecno.png"
              alt="Tecnocontrol"
              className="relative mb-5 h-9 w-auto object-contain"
            />
            <div className="animate-subtle-float relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0b3c6c] via-[#0e4b85] to-[#246eb0] animate-ambient-gradient text-white shadow-md shadow-blue-900/20">
              <Sparkles className="h-6 w-6" />
            </div>
            <h1 className="animate-fade-up relative mt-4 text-2xl font-bold tracking-tight text-slate-900">
              Buen día, {firstName}
            </h1>
            <p
              className="animate-fade-up relative mt-1.5 max-w-xl text-sm text-slate-500"
              style={{ ['--delay' as string]: '70ms' }}
            >
              Soy <strong>Asistente Tecno</strong>, su asesor fiscal y guía dedicado exclusivamente
              al Módulo Fiscal SAT de{' '}
              <strong className="text-slate-700">{activeEmpresa.razon_social}</strong>. Consúlteme
              cifras en tiempo real, rutas del portal, o adjunte/arrastre documentos{' '}
              <strong>PDF, Word, Excel, CSV, XML, ZIP o TXT</strong> para comprender de qué tratan,
              extraer sus datos clave y cruzarlos con su empresa.
            </p>

            {/* 3 sugerencias principales requeridas por la guía */}
            <div className="stagger-grid relative mt-7 grid w-full max-w-2xl grid-cols-1 gap-2.5 sm:grid-cols-3">
              {SUGERENCIAS_ASISTENTE.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void handleSend(s)}
                  className="card-interactive rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 text-left text-xs font-semibold text-slate-800 hover:border-blue-400 hover:bg-blue-50/60 hover:text-blue-900 cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Consultas avanzadas rápidas */}
            <div className="relative mt-4 flex max-w-2xl flex-wrap items-center justify-center gap-2">
              {previousRoute !== 'asistente' && (
                <button
                  type="button"
                  onClick={() => void explainCurrentPageWithAssistant(previousRoute)}
                  className="inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-blue-800 hover:bg-blue-100 transition-colors cursor-pointer"
                >
                  <Compass className="h-3 w-3" />
                  Explícame la pantalla {previousGuide.nombreCorto} y sus rutas
                </button>
              )}
              {EXTRA_QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void handleSend(q)}
                  className="btn-tactile rounded-full border border-blue-200 bg-blue-50/70 px-3 py-1.5 text-[11px] font-medium text-blue-800 hover:bg-blue-100 cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {assistantMessages.map((m) => (
              <AssistantMessageView
                key={m.id}
                message={m}
                onFollowUp={(fq) => void handleSend(fq)}
                isIndicatorSaved={savedIndicatorMsgIds.has(m.id)}
                onSaveIndicator={handleSaveSuggestedIndicator}
              />
            ))}

            {assistantThinking && (
              <div className="animate-msg-in flex justify-start">
                <div className="inline-flex items-center gap-2.5 rounded-2xl border border-blue-200 bg-white px-4 py-3 text-xs text-slate-600 shadow-xs">
                  <span className="flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-bounce" />
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-bounce"
                      style={{ animationDelay: '120ms' }}
                    />
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-bounce"
                      style={{ animationDelay: '240ms' }}
                    />
                  </span>
                  <span>Analizando información y documentos en vivo para {activeEmpresa.rfc}...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Caja de entrada fija al fondo */}
      <div className="sticky bottom-3 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-lg">
        {pendingFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {pendingFiles.map((f, idx) => (
              <div
                key={`${f.name}-${idx}`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-2.5 py-1 text-xs text-blue-900"
              >
                <Paperclip className="h-3 w-3 text-blue-600" />
                <span className="max-w-[200px] truncate font-medium">{f.name}</span>
                <button
                  type="button"
                  onClick={() =>
                    setPendingFiles((prev) => prev.filter((_, i) => i !== idx))
                  }
                  className="text-blue-600 hover:text-rose-700 cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            ref={fileInputRef}
            type="file"
            name="asistente-archivos"
            aria-label="Adjuntar documentos para análisis"
            multiple
            accept={ACCEPTED_DOC_TYPES}
            onChange={(e) => {
              if (e.target.files) appendPendingFiles(e.target.files);
              e.target.value = '';
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Adjuntar uno o varios documentos (PDF, Excel, CSV, XML, ZIP, TXT)"
            aria-label="Adjuntar uno o varios documentos"
            className="btn-tactile rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50 hover:text-blue-700 cursor-pointer"
          >
            <Paperclip className="h-4 w-4" />
          </button>

          <input
            type="text"
            name="asistente-consulta"
            aria-label="Escriba su consulta fiscal o pregunta sobre el portal"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              attachedDocs.length > 0
                ? 'Pregunte sobre sus documentos adjuntos, compárelos o consulte cifras del portal...'
                : 'Escriba su consulta fiscal, ruta del portal o adjunte PDF / Excel / XML / ZIP...'
            }
            className="flex-1 bg-transparent px-2 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />

          <button
            type="submit"
            disabled={assistantThinking || (!input.trim() && pendingFiles.length === 0)}
            className="btn-tactile inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40 cursor-pointer"
          >
            <Send className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Enviar</span>
          </button>
        </form>
      </div>
    </div>
  );
};
