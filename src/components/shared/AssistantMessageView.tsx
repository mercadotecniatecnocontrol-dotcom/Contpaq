import React from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  Paperclip,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AssistantMessage } from '../../services/assistantEngine';
import { useFiscal } from '../../context/FiscalContext';
import { formatMoney, MASKED_AMOUNT } from '../../utils/format';
import { exportToExcel } from '../../utils/exportExcel';

interface AssistantMessageViewProps {
  message: AssistantMessage;
  compact?: boolean;
  onFollowUp?: (text: string) => void;
  onAfterNavigate?: () => void;
  isIndicatorSaved?: boolean;
  onSaveIndicator?: (msg: AssistantMessage) => void;
}

// Renderiza **negritas** y `código` de forma segura sin dangerouslySetInnerHTML
function renderInlineFormatting(line: string): React.ReactNode[] {
  const tokens = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((tok, i) => {
    if (tok.startsWith('**') && tok.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold">
          {tok.slice(2, -2)}
        </strong>
      );
    }
    if (tok.startsWith('`') && tok.endsWith('`')) {
      return (
        <code
          key={i}
          className="rounded bg-slate-100 px-1 py-0.5 font-mono-code text-[11px] text-blue-800"
        >
          {tok.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={i}>{tok}</React.Fragment>;
  });
}

export const AssistantMessageView: React.FC<AssistantMessageViewProps> = ({
  message,
  compact = false,
  onFollowUp,
  onAfterNavigate,
  isIndicatorSaved = false,
  onSaveIndicator,
}) => {
  const { ocultarMontos, navigate, openCfdiDetail } = useFiscal();

  const isUser = message.sender === 'user';
  const lines = message.text.split('\n');

  const handleExportTable = () => {
    if (!message.table) return;
    const { headers, rows, exportName } = message.table;
    const objects = rows.map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h] = row[idx] ?? '';
      });
      return obj;
    });
    exportToExcel(objects, exportName || 'Consulta_Asistente_Tecno', 'Asistente');
  };

  return (
    <div className={`animate-msg-in flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`rounded-2xl shadow-xs ${
          compact ? 'max-w-[94%] px-3 py-2.5 text-xs' : 'max-w-full sm:max-w-[88%] px-4 py-3.5 text-xs'
        } ${
          isUser
            ? 'bg-blue-600 text-white'
            : message.offTopic
              ? 'border border-amber-200 bg-amber-50/60 text-slate-800'
              : 'border border-slate-200 bg-white text-slate-800'
        }`}
      >
        {(message.attachmentNames && message.attachmentNames.length > 0
          ? message.attachmentNames
          : message.attachmentName
            ? [message.attachmentName]
            : []
        ).length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {(message.attachmentNames && message.attachmentNames.length > 0
              ? message.attachmentNames
              : [message.attachmentName!]
            ).map((name, idx) => (
              <span
                key={`${name}-${idx}`}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] ${
                  isUser ? 'bg-white/15 text-white' : 'bg-blue-50 text-blue-700'
                }`}
              >
                <Paperclip className="h-3 w-3 shrink-0" /> {name}
              </span>
            ))}
          </div>
        )}

        {message.offTopic && (
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100/80 px-2.5 py-0.5 text-[10px] font-semibold text-amber-900">
            <ShieldAlert className="h-3 w-3" /> IA dedicada solo al Módulo Fiscal SAT
          </div>
        )}

        {message.interpretationNote && !isUser && (
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-blue-200/80 bg-blue-50/70 px-2.5 py-0.5 text-[10px] text-blue-800">
            <Sparkles className="h-2.5 w-2.5 shrink-0 text-blue-600" />
            <span>{renderInlineFormatting(message.interpretationNote)}</span>
          </div>
        )}

        {/* Texto formateado con viñetas y negritas */}
        <div className={`space-y-1.5 leading-relaxed ${compact ? 'text-xs' : 'text-[13px]'}`}>
          {lines.map((line, idx) => {
            const trimmed = line.trim();
            if (!trimmed) return <div key={idx} className="h-0.5" />;
            if (trimmed.startsWith('•')) {
              return (
                <div key={idx} className="flex items-start gap-2 pl-0.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" />
                  <span>{renderInlineFormatting(trimmed.slice(1).trim())}</span>
                </div>
              );
            }
            return <p key={idx}>{renderInlineFormatting(line)}</p>;
          })}
        </div>

        {/* Tabla estructurada + botón Exportar Excel */}
        {message.table && (
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {!compact && (
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-3 py-1.5">
                <span className="text-[11px] font-semibold text-slate-600">
                  {message.table.rows.length} registro(s) en tiempo real
                </span>
                <button
                  type="button"
                  onClick={handleExportTable}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer"
                >
                  <Download className="h-3 w-3" /> Exportar Excel
                </button>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className={`w-full text-left ${compact ? 'text-[11px]' : 'text-xs'}`}>
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    {message.table.headers.map((h) => (
                      <th key={h} className="px-2.5 py-2 font-semibold whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(compact ? message.table.rows.slice(0, 5) : message.table.rows).map((r, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50/70">
                      {r.map((cell, cIdx) => (
                        <td key={cIdx} className="px-2.5 py-1.5 text-slate-800">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Gráfica interactiva */}
        {message.chart && !compact && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <p className="mb-2 text-xs font-semibold text-slate-700">{message.chart.title}</p>
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={message.chart.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickFormatter={(v) => {
                      const isCur = message.chart?.isCurrency !== false;
                      if (isCur && ocultarMontos) return '•••';
                      const num = Number(v);
                      if (isCur) return `$${Math.round(num / 1000)}k`;
                      return Math.abs(num) >= 1000
                        ? `${(num / 1000).toFixed(1)}k`
                        : String(Math.round(num * 100) / 100);
                    }}
                  />
                  <Tooltip
                    formatter={(val: number) => {
                      const isCur = message.chart?.isCurrency !== false;
                      if (isCur) return ocultarMontos ? MASKED_AMOUNT : formatMoney(val);
                      return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(val);
                    }}
                  />
                  <Bar
                    dataKey="valor"
                    name={message.chart.series1Label}
                    fill="#0e4b85"
                    radius={[5, 5, 0, 0]}
                    animationDuration={650}
                  />
                  {message.chart.series2Label && (
                    <Bar
                      dataKey="valor2"
                      name={message.chart.series2Label}
                      fill="#9fb4c8"
                      radius={[5, 5, 0, 0]}
                      animationDuration={800}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Propuesta de indicador con IA */}
        {message.suggestedIndicator && (
          <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3.5">
            <p className="font-bold text-blue-950">{message.suggestedIndicator.nombre}</p>
            <p className="mt-0.5 text-blue-800">{message.suggestedIndicator.descripcion}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {message.suggestedIndicator.filtros.map((f, i) => (
                <span
                  key={i}
                  className="rounded-md border border-blue-200 bg-white px-2 py-0.5 font-mono-code text-[11px] text-slate-700"
                >
                  {f.campo} {f.operador} {f.valor}
                </span>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {isIndicatorSaved ? (
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Guardado en Indicadores
                </span>
              ) : (
                onSaveIndicator && (
                  <button
                    type="button"
                    onClick={() => onSaveIndicator(message)}
                    className="btn-tactile rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-700 cursor-pointer"
                  >
                    Aprobar y guardar indicador
                  </button>
                )
              )}
              <button
                type="button"
                onClick={() => {
                  navigate('indicadores');
                  onAfterNavigate?.();
                }}
                className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 font-medium text-blue-700 hover:bg-blue-50 cursor-pointer"
              >
                Ir a Indicadores
              </button>
            </div>
          </div>
        )}

        {/* Acciones directas sobre el portal (navegar o abrir CFDI en 1 clic) */}
        {message.actions && message.actions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {message.actions.map((act, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  if (act.cfdiUuid) {
                    openCfdiDetail(act.cfdiUuid);
                  } else if (act.route) {
                    navigate(act.route, act.preset);
                    onAfterNavigate?.();
                  }
                }}
                className="btn-tactile inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50/80 px-2.5 py-1.5 text-[11px] font-semibold text-blue-800 hover:bg-blue-100 cursor-pointer"
              >
                {act.cfdiUuid ? (
                  <ExternalLink className="h-3 w-3" />
                ) : (
                  <ArrowRight className="h-3 w-3" />
                )}
                {act.label}
              </button>
            ))}
          </div>
        )}

        {/* Preguntas sugeridas de seguimiento */}
        {message.followUps && message.followUps.length > 0 && onFollowUp && (
          <div className="mt-3 border-t border-slate-100 pt-2.5">
            <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <Sparkles className="h-3 w-3 text-blue-500" /> Siguiente consulta sugerida
            </p>
            <div className="flex flex-wrap gap-1.5">
              {message.followUps.map((fq) => (
                <button
                  key={fq}
                  type="button"
                  onClick={() => onFollowUp(fq)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 transition-colors cursor-pointer"
                >
                  {fq}
                </button>
              ))}
            </div>
          </div>
        )}

        {message.vistaConsultada && !isUser && (
          <p className="mt-2.5 flex items-center gap-1 text-[10px] text-slate-400">
            <Database className="h-3 w-3" /> Fuente en vivo: {message.vistaConsultada}
          </p>
        )}
      </div>
    </div>
  );
};
