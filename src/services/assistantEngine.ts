import type {
  Cfdi,
  Empresa,
  FiscalDatabaseState,
  FiscalRoute,
  ReglaFiltroPersonalizado,
} from '../types/fiscal';
import type { RouteFilterPreset } from '../context/FiscalContext';
import {
  evaluateIndicadores,
  getConciliacionSat,
  getIsrPeriodo,
  getIvaFlujoPeriodo,
  getPpdPendientesCobro,
  getResumenMensual,
} from './fiscalCalculations';
import {
  analyzeUserIntent,
  basicNormalize,
  fuzzyWordMatch,
  type SemanticTopic,
} from './nluEngine';
import {
  CATALOGO_FORMA_PAGO,
  CATALOGO_TIPO_CFDI,
  CATALOGO_TIPO_RELACION,
  CATALOGO_USO_CFDI,
  daysUntil,
  formatMoney,
  formatShortDate,
  getAvailableYears,
  shortUuid,
} from '../utils/format';
import {
  answerQuestionAboutDocuments,
  buildBatchDocumentUploadReport,
  type AnalyzedDocument,
} from './documentAnalyzer';
import { parseCfdiXml } from '../utils/xmlParser';
import { detectSecurityThreat } from '../utils/security';
import {
  buildPageExplanationMessage,
  detectPageExplanationIntent,
  PAGE_GUIDE_CATALOG,
} from './pageGuideEngine';

export interface AssistantTableData {
  headers: string[];
  rows: string[][];
  exportName?: string;
}

export interface AssistantChartData {
  title: string;
  data: Array<{ label: string; valor: number; valor2?: number }>;
  series1Label: string;
  series2Label?: string;
  isCurrency?: boolean;
}

export interface AssistantAction {
  label: string;
  route?: FiscalRoute;
  preset?: RouteFilterPreset;
  cfdiUuid?: string;
}

export interface AssistantMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  attachmentName?: string;
  attachmentNames?: string[];
  interpretationNote?: string;
  table?: AssistantTableData;
  chart?: AssistantChartData;
  actions?: AssistantAction[];
  followUps?: string[];
  vistaConsultada?: string;
  offTopic?: boolean;
  securityBlocked?: boolean;
  suggestedIndicator?: {
    nombre: string;
    descripcion: string;
    grupo: string;
    aplica_emitidos: boolean;
    aplica_recibidos: boolean;
    filtros: ReglaFiltroPersonalizado[];
  };
}

export interface AssistantSessionMemory {
  lastPeriodo?: string;
  lastYear?: string;
  lastTopic?: string;
}

export const SUGERENCIAS_ASISTENTE = [
  'Resumen de IVA del mes pasado',
  'Mis ingresos del año por mes',
  'Facturas PPD pendientes de cobro',
];

export function getContextualSuggestions(route: FiscalRoute): string[] {
  const guide = PAGE_GUIDE_CATALOG[route] || PAGE_GUIDE_CATALOG.dashboard;
  const explainChip = `Explícame esta página (${guide.nombreCorto}) y sus rutas`;

  switch (route) {
    case 'iva':
      return [
        explainChip,
        'Explícame el IVA de octubre y por qué quedó a cargo',
        '¿Cómo se calcula el IVA en flujo (PUE vs PPD)?',
        'Compara octubre contra septiembre',
      ];
    case 'isr':
      return [
        explainChip,
        '¿Qué gastos de octubre no son deducibles y por qué?',
        'Resumen de ISR de octubre',
        '¿Cuánto debo contemplar de impuestos este mes?',
      ];
    case 'visor':
      return [
        explainChip,
        '¿Qué diferencias tenemos contra el SAT actualmente?',
        '¿Qué facturas están en proceso de cancelación?',
        '¿Qué asuntos fiscales requieren atención urgente?',
      ];
    case 'indicadores':
      return [
        explainChip,
        '¿Qué asuntos fiscales requieren atención urgente?',
        '¿Qué pasa si un proveedor está en lista 69-B?',
        'Crear indicador con IA: Facturas en USD mayores a 50000',
      ];
    case 'emitidos':
      return [
        explainChip,
        '¿Quién nos debe dinero actualmente (PPD)?',
        '¿Quiénes son nuestros mejores clientes del año?',
        '¿Qué pasó con la factura FAC-1202?',
      ];
    case 'recibidos':
      return [
        explainChip,
        '¿Quiénes son nuestros principales proveedores?',
        '¿Qué gastos no son deducibles y por qué?',
        '¿Tenemos proveedores en lista 69-B (EFOS)?',
      ];
    case 'vinculaciones':
    case 'contable':
      return [
        explainChip,
        '¿Qué facturas faltan por vincular en Aspel SAE?',
        '¿Cómo está la conexión con Aspel SAE?',
        'Resumen ejecutivo de la empresa',
      ];
    case 'efirma':
      return [
        explainChip,
        '¿Cuándo vence nuestra e.firma y la de las demás empresas?',
        '¿Cuál es la diferencia entre e.firma (FIEL) y CSD?',
        '¿Cómo renuevo la e.firma en el portal?',
      ];
    case 'sincronizacion':
      return [
        explainChip,
        '¿Cómo cargo un paquete ZIP descargado del SAT?',
        'Me salió un error en la descarga, ¿qué hago?',
        'Necesito descargar XML de hace 3 años',
      ];
    case 'documentos':
      return [
        explainChip,
        '¿Cuál es el documento que dice si estamos bien con el SAT?',
        '¿Cómo está nuestra opinión de cumplimiento SAT e IMSS?',
        'Muéstrame todas las rutas del portal',
      ];
    default:
      return [
        explainChip,
        '¿Qué asuntos fiscales requieren atención urgente?',
        'Guía paso a paso para usar el portal',
        '¿Quién nos debe dinero actualmente?',
      ];
  }
}

function formalAddress(userName?: string): string {
  if (!userName) return '';
  const parts = userName.trim().split(/\s+/);
  if (parts.length >= 2 && /^(ing\.|lic\.|c\.p\.|dr\.|m\.?)/i.test(parts[0])) {
    return `${parts[0]} ${parts[1]}`;
  }
  return parts[0];
}

export function parseNaturalLanguageToIndicator(prompt: string): {
  nombre: string;
  descripcion: string;
  grupo: string;
  aplica_emitidos: boolean;
  aplica_recibidos: boolean;
  filtros: ReglaFiltroPersonalizado[];
} {
  const q = basicNormalize(prompt);
  const filtros: ReglaFiltroPersonalizado[] = [];

  const soloRecibidos = q.includes('recibid') || q.includes('proveedor') || q.includes('gasto');
  const soloEmitidos = q.includes('emitid') || q.includes('cliente') || q.includes('venta');
  const aplica_emitidos = soloEmitidos || !soloRecibidos;
  const aplica_recibidos = soloRecibidos || !soloEmitidos;

  if (q.includes('dolar') || q.includes('usd')) {
    filtros.push({ campo: 'moneda', operador: 'eq', valor: 'USD' });
  }
  if (q.includes('efectivo')) {
    filtros.push({ campo: 'forma_pago', operador: 'eq', valor: '01' });
  }
  if (q.includes('pue')) {
    filtros.push({ campo: 'metodo_pago', operador: 'eq', valor: 'PUE' });
  } else if (q.includes('ppd')) {
    filtros.push({ campo: 'metodo_pago', operador: 'eq', valor: 'PPD' });
  }
  if (q.includes('s01')) {
    filtros.push({ campo: 'uso_cfdi', operador: 'eq', valor: 'S01' });
  } else if (q.includes('g03')) {
    filtros.push({ campo: 'uso_cfdi', operador: 'eq', valor: 'G03' });
  }
  if (q.includes('cancelad')) {
    filtros.push({ campo: 'estatus_sat', operador: 'eq', valor: 'cancelado' });
  } else if (q.includes('proceso')) {
    filtros.push({ campo: 'estatus_sat', operador: 'eq', valor: 'en_cancelacion' });
  }

  const amountMatch = q.match(/(?:mayor(?:es)? a|mas de|arriba de|>)\s*\$?\s*([\d,]+)/);
  if (amountMatch) {
    filtros.push({ campo: 'total_mxn', operador: 'gt', valor: amountMatch[1].replace(/,/g, '') });
  }

  const lowerMatch = q.match(/(?:menor(?:es)? a|menos de|<)\s*\$?\s*([\d,]+)/);
  if (lowerMatch) {
    filtros.push({ campo: 'total_mxn', operador: 'lt', valor: lowerMatch[1].replace(/,/g, '') });
  }

  if (filtros.length === 0) {
    filtros.push({ campo: 'tipo', operador: 'eq', valor: 'I' });
    filtros.push({ campo: 'total_mxn', operador: 'gt', valor: '50000' });
  }

  const cleanTitle = prompt.trim().replace(/^crear indicador\s*(con ia)?[:\-]?\s*/i, '');
  const nombre =
    cleanTitle.length > 6
      ? cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1, 65)
      : 'Indicador generado por Asistente Tecno';

  return {
    nombre,
    descripcion: `Regla generada a partir de su instrucción: "${prompt.trim()}". Le recomiendo verificar las condiciones antes de guardarla.`,
    grupo: 'Control cambiario',
    aplica_emitidos,
    aplica_recibidos,
    filtros,
  };
}

// =========================================================================
// DIRECTORIO OFICIAL DE LOS 17 APARTADOS DEL PORTAL
// =========================================================================
interface PortalDirectoryEntry {
  id: number;
  topic: SemanticTopic;
  nombre: string;
  rutaHash: string;
  route?: FiscalRoute;
  menuUbicacion: string;
  roles: string;
  queEncuentra: string;
}

const PORTAL_DIRECTORY: PortalDirectoryEntry[] = [
  {
    id: 1,
    topic: 'empresas_rfc',
    nombre: 'Selector de empresas (RFC)',
    rutaHash: '#fiscal/empresas',
    route: 'empresas',
    menuUbicacion: 'Menú lateral → Configuración → Empresas (RFC) (o selector superior izquierdo)',
    roles: 'Todos los roles (alta de empresa exclusiva de Propietario)',
    queEncuentra: 'Listado de RFCs en tarjetas o lista, búsqueda rápida, orden A–Z / RFC / último acceso, favoritas y alta de empresa.',
  },
  {
    id: 2,
    topic: 'efirma',
    nombre: 'e.firma (FIEL)',
    rutaHash: '#fiscal/efirma',
    route: 'efirma',
    menuUbicacion: 'Menú lateral → Configuración → e.firma (FIEL)',
    roles: 'Exclusivo Propietario',
    queEncuentra: 'Estado de la e.firma, número de serie, expiración, alertas 30/15/5 días y renovación cifrada de .cer y .key.',
  },
  {
    id: 3,
    topic: 'usuarios_roles',
    nombre: 'Usuarios y roles',
    rutaHash: '#fiscal/usuarios',
    route: 'usuarios',
    menuUbicacion: 'Menú lateral → Configuración → Usuarios y roles',
    roles: 'Propietario y Contador',
    queEncuentra: 'Invitación de colaboradores por correo del portal, asignación de roles (Propietario, Contador, Consulta, Pagos) y bitácora de auditoría.',
  },
  {
    id: 4,
    topic: 'sincronizacion_zip',
    nombre: 'Sincronización SAT / Gestor de documentos',
    rutaHash: '#fiscal/sincronizacion',
    route: 'sincronizacion',
    menuUbicacion: 'Menú lateral → Comprobantes SAT → Sincronización',
    roles: 'Todos los roles (carga y descargas excepto Consulta)',
    queEncuentra: 'Bitácora diaria SAT (5/10/25), Actualizar SAT, Carga masiva de .XML y .ZIP, Modo empresa limpia y Descarga histórica hasta 5 años.',
  },
  {
    id: 5,
    topic: 'emitidos',
    nombre: 'CFDIs emitidos',
    rutaHash: '#fiscal/emitidos',
    route: 'emitidos',
    menuUbicacion: 'Menú lateral → Comprobantes SAT → CFDIs emitidos',
    roles: 'Todos los roles',
    queEncuentra: 'Facturas de ingresos, egresos, pagos (REP), nóminas y traslados emitidos; filtros PUE/PPD, estatus SAT, columnas configurables, descarga ZIP, PDF y Excel.',
  },
  {
    id: 6,
    topic: 'recibidos',
    nombre: 'CFDIs recibidos',
    rutaHash: '#fiscal/recibidos',
    route: 'recibidos',
    menuUbicacion: 'Menú lateral → Comprobantes SAT → CFDIs recibidos',
    roles: 'Todos los roles',
    queEncuentra: 'Comprobantes fiscales recibidos de proveedores con filtros avanzados, descarga ZIP, representación impresa PDF y Excel.',
  },
  {
    id: 7,
    topic: 'dashboard',
    nombre: 'Dashboard Fiscal',
    rutaHash: '#fiscal/dashboard',
    route: 'dashboard',
    menuUbicacion: 'Menú lateral → Panorama → Dashboard',
    roles: 'Propietario, Contador y Consulta',
    queEncuentra: 'KPIs de Ingresos, Gastos, Deducciones ISR e IVA, gráfica Ene–Dic, opinión SAT, CFDIs en cancelación, ingresos nominales con desglose y estado Aspel SAE.',
  },
  {
    id: 8,
    topic: 'iva',
    nombre: 'Impuestos IVA',
    rutaHash: '#fiscal/iva',
    route: 'iva',
    menuUbicacion: 'Menú lateral → Impuestos → Impuestos IVA',
    roles: 'Propietario, Contador y Consulta',
    queEncuentra: 'IVA trasladado, acreditable, retenido y saldo a cargo/favor en flujo (PUE + REP proporcional) e interruptores para excluir CFDI con motivo.',
  },
  {
    id: 9,
    topic: 'isr',
    nombre: 'Impuestos ISR',
    rutaHash: '#fiscal/isr',
    route: 'isr',
    menuUbicacion: 'Menú lateral → Impuestos → Impuestos ISR',
    roles: 'Propietario, Contador y Consulta',
    queEncuentra: 'Ingresos cobrados y deducciones autorizadas (excluyendo automáticamente cancelados, uso S01 y 69-B definitivo) con interruptores de ajuste.',
  },
  {
    id: 10,
    topic: 'ocultar_montos',
    nombre: 'Ocultar montos (Ícono de ojo)',
    rutaHash: 'Barra superior derecha (Global)',
    menuUbicacion: 'Barra superior derecha → botón "Ocultar montos" (ícono de ojo)',
    roles: 'Todos los roles',
    queEncuentra: 'Reemplaza inmediatamente todas las cifras monetarias del portal por ••••• y guarda la preferencia por usuario.',
  },
  {
    id: 11,
    topic: 'visor_sat',
    nombre: 'Conciliación SAT (Visor SAT)',
    rutaHash: '#fiscal/visor',
    route: 'visor',
    menuUbicacion: 'Menú lateral → Control y cumplimiento → Conciliación SAT',
    roles: 'Propietario, Contador y Consulta',
    queEncuentra: 'Comparativa SAT vs Portal (Ingresos, Egresos, Pagos), fecha de corte SAT, marcas "Solo en SAT / Solo en Portal" y descarga de faltantes.',
  },
  {
    id: 12,
    topic: 'documentos_fiscales',
    nombre: 'Datos fiscales (CSF y Opiniones)',
    rutaHash: '#fiscal/documentos',
    route: 'documentos',
    menuUbicacion: 'Menú lateral → Control y cumplimiento → Datos fiscales',
    roles: 'Propietario, Contador y Consulta',
    queEncuentra: 'Constancia de Situación Fiscal (CSF), Opinión de Cumplimiento SAT (32-D) y Opinión IMSS con vista previa PDF y recordatorio mensual.',
  },
  {
    id: 13,
    topic: 'indicadores',
    nombre: 'Indicadores de consistencia y riesgo',
    rutaHash: '#fiscal/indicadores',
    route: 'indicadores',
    menuUbicacion: 'Menú lateral → Control y cumplimiento → Indicadores',
    roles: 'Propietario, Contador y Consulta',
    queEncuentra: 'Las 13 reglas fiscales SAT (69-B, sustituciones 04, pagos fuera de periodo, efectivo > $2,000, S01, etc.), grupos, constructor de filtros e indicadores con IA.',
  },
  {
    id: 14,
    topic: 'aspel_sae',
    nombre: 'ADD y Bitácora Contable',
    rutaHash: '#fiscal/contable',
    route: 'contable',
    menuUbicacion: 'Menú lateral → Control y cumplimiento → ADD y Bitácora',
    roles: 'Propietario, Contador y Consulta',
    queEncuentra: 'Bitácora de sincronizaciones hacia Aspel SAE (empresa, GUID, rango, dirección, total y estatus).',
  },
  {
    id: 15,
    topic: 'aspel_sae',
    nombre: 'Vinculaciones (Aspel SAE)',
    rutaHash: '#fiscal/vinculaciones',
    route: 'vinculaciones',
    menuUbicacion: 'Menú lateral → Control y cumplimiento → Vinculaciones SAE',
    roles: 'Propietario, Contador y Consulta',
    queEncuentra: 'Conexión con Aspel SAE y estado contable de cada UUID (Con póliza, Pendiente o Sin registro, número de póliza y cuenta contable).',
  },
  {
    id: 16,
    topic: 'consumo',
    nombre: 'Usos y consumos',
    rutaHash: '#fiscal/consumo',
    route: 'consumo',
    menuUbicacion: 'Menú lateral → Control y cumplimiento → Usos y consumos',
    roles: 'Propietario, Contador y Consulta',
    queEncuentra: 'Volumen de CFDIs históricos, avance del ejercicio frente al límite, consultas mensuales al asistente IA y uso de almacenamiento.',
  },
  {
    id: 17,
    topic: 'notificaciones',
    nombre: 'Asistente Tecno y Centro de notificaciones',
    rutaHash: '#fiscal/asistente (+ campana superior)',
    route: 'asistente',
    menuUbicacion: 'Menú lateral → Panorama → Asistente Tecno (y botón de campana en la barra superior)',
    roles: 'Todos los roles',
    queEncuentra: 'Asistente inteligente en tiempo real y centro de notificaciones (Todas / No leídas / Leídas y configuración por tipo de evento).',
  },
];

function findDirectoryForTopic(topic: SemanticTopic): PortalDirectoryEntry | undefined {
  if (topic === 'descarga_historica' || topic === 'sincronizacion_error') {
    return PORTAL_DIRECTORY.find((d) => d.route === 'sincronizacion');
  }
  if (topic === 'efos_69b' || topic === 'efectivo_bancarizado') {
    return PORTAL_DIRECTORY.find((d) => d.route === 'indicadores');
  }
  if (topic === 'non_deductible') {
    return PORTAL_DIRECTORY.find((d) => d.route === 'isr');
  }
  if (topic === 'ppd_pendientes' || topic === 'ppd_rep_workflow' || topic === 'nomina') {
    return PORTAL_DIRECTORY.find((d) => d.route === 'emitidos');
  }
  if (topic === 'aspel_sae') {
    return PORTAL_DIRECTORY.find((d) => d.route === 'vinculaciones');
  }
  return PORTAL_DIRECTORY.find((d) => d.topic === topic);
}

function routeLocationSentence(topic: SemanticTopic): string {
  const dir = findDirectoryForTopic(topic);
  if (!dir) return '';
  return `\n\n**Ubicación en el portal:** puede consultarlo directamente en **${dir.nombre}** (\`${dir.rutaHash}\` · ${dir.menuUbicacion}).`;
}

export function runAssistantQuery(
  prompt: string,
  state: FiscalDatabaseState,
  empresa: Empresa,
  ocultarMontos: boolean,
  options?: {
    userName?: string;
    currentRoute?: FiscalRoute;
    previousRoute?: FiscalRoute;
    attachmentName?: string;
    attachmentXmlText?: string;
    attachedDocs?: AnalyzedDocument[];
    newlyAttachedDocs?: AnalyzedDocument[];
    memory?: AssistantSessionMemory;
  },
): { message: AssistantMessage; nextMemory: AssistantSessionMemory } {
  const now = new Date().toISOString();
  const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const memory: AssistantSessionMemory = { ...(options?.memory || {}) };
  const trato = formalAddress(options?.userName);
  const saludoNombre = trato ? `, ${trato}` : '';

  const companyCfdis = state.cfdis.filter(
    (c) => c.empresa_id === empresa.id && !c.solo_en_sat,
  );

  // =========================================================================
  // BARRERA DE SEGURIDAD (BLOQUEO DE INYECCIÓN SQL, XSS Y PATH TRAVERSAL)
  // =========================================================================
  const threat = detectSecurityThreat(prompt);
  if (threat.blocked) {
    return {
      message: {
        id,
        sender: 'assistant',
        timestamp: now,
        offTopic: true,
        securityBlocked: true,
        vistaConsultada: 'Política de seguridad · Portal Tecnocontrol',
        text: `Solicitud bloqueada por política de seguridad${saludoNombre}.\n\n• **Motivo:** ${threat.detail}\n• **Protección activa:** el Módulo Fiscal SAT valida todas las consultas por seguridad y este evento ha sido registrado en la bitácora de auditoría.`,
      },
      nextMemory: memory,
    };
  }

  // =========================================================================
  // ANÁLISIS COGNITIVO NLU (tolerante a mala ortografía y distintas redacciones)
  // =========================================================================
  const hasAnyAttachment = Boolean(
    options?.attachmentName ||
      (options?.newlyAttachedDocs && options.newlyAttachedDocs.length > 0),
  );
  const intent = analyzeUserIntent(prompt, hasAnyAttachment);
  const qNorm = intent.normalized;

  // Resolver periodo y año usando meses detectados por NLU + memoria conversacional
  const years = getAvailableYears(companyCfdis);
  const year = intent.year || memory.lastYear || years[0] || '2026';
  let periodo = memory.lastPeriodo || `${year}-10`;
  let periodoLabel = `octubre de ${year}`;
  let explicitMonth = false;

  if (intent.months.length > 0) {
    periodo = `${year}-${intent.months[0].mm}`;
    periodoLabel = `${intent.months[0].label} de ${year}`;
    explicitMonth = true;
  } else if (qNorm.includes('mes pasado') || qNorm.includes('mes anterior')) {
    periodo = `${year}-10`;
    periodoLabel = `octubre de ${year}`;
    explicitMonth = true;
  } else if (qNorm.includes('este mes') || qNorm.includes('mes actual') || qNorm.includes('hoy')) {
    periodo = `${year}-11`;
    periodoLabel = `noviembre de ${year}`;
    explicitMonth = true;
  } else if (memory.lastPeriodo) {
    const mm = memory.lastPeriodo.slice(5, 7);
    const names: Record<string, string> = {
      '01': 'enero', '02': 'febrero', '03': 'marzo', '04': 'abril', '05': 'mayo', '06': 'junio',
      '07': 'julio', '08': 'agosto', '09': 'septiembre', '10': 'octubre', '11': 'noviembre', '12': 'diciembre',
    };
    periodoLabel = `${names[mm] || 'octubre'} de ${memory.lastPeriodo.slice(0, 4)}`;
  }

  const wantsLocation = intent.goals.has('locate');

  const makeReply = (
    partial: Omit<AssistantMessage, 'id' | 'sender' | 'timestamp'>,
    memPatch?: Partial<AssistantSessionMemory>,
  ) => ({
    message: {
      id,
      sender: 'assistant' as const,
      timestamp: now,
      interpretationNote: partial.offTopic ? undefined : intent.interpretationNote,
      ...partial,
    },
    nextMemory: {
      ...memory,
      ...(explicitMonth ? { lastPeriodo: periodo, lastYear: year } : {}),
      ...memPatch,
    },
  });

  // =========================================================================
  // 0. ANÁLISIS MULTI-FORMATO DE DOCUMENTOS ADJUNTOS Y MEMORIA DOCUMENTAL
  // =========================================================================
  const allAttachedDocs = options?.attachedDocs || [];
  const newlyAttached = options?.newlyAttachedDocs || [];

  if (newlyAttached.length > 0) {
    const contextDocs = allAttachedDocs.length > 0 ? allAttachedDocs : newlyAttached;
    const report = buildBatchDocumentUploadReport(
      newlyAttached,
      contextDocs,
      intent.normalized || prompt,
      state,
      empresa,
      ocultarMontos,
      saludoNombre,
    );
    return makeReply(
      {
        ...report,
        interpretationNote: undefined,
      },
      { lastTopic: 'document' },
    );
  }

  if (allAttachedDocs.length > 0) {
    const docAnswer = answerQuestionAboutDocuments(
      intent.normalized || prompt,
      allAttachedDocs,
      state,
      empresa,
      ocultarMontos,
      saludoNombre,
      {
        recentlyDiscussedDoc: memory.lastTopic === 'document',
        portalTopic: intent.primaryTopic,
        portalScore: intent.topicScore,
      },
    );
    if (docAnswer) {
      return makeReply(
        {
          ...docAnswer,
          interpretationNote: intent.wasTypoCorrected
            ? `Interpreté su consulta sobre **los documentos adjuntos en sesión**`
            : undefined,
        },
        { lastTopic: 'document' },
      );
    }
  }

  // Respaldo legacy para XML único en texto plano
  if (options?.attachmentXmlText && options.attachmentName?.toLowerCase().endsWith('.xml')) {
    const existing = new Set(state.cfdis.map((c) => c.uuid.toUpperCase()));
    const parsed = parseCfdiXml(options.attachmentXmlText, empresa, new Set());
    if (parsed.ok && parsed.cfdi) {
      const c = parsed.cfdi;
      const yaExiste = existing.has(c.uuid.toUpperCase());
      const obs: string[] = [];
      if (c.metodo_pago === 'PUE' && c.forma_pago === '99') {
        obs.push('combina método PUE con forma de pago 99 (inconsistencia SAT)');
      }
      if (c.direccion === 'R' && c.metodo_pago === 'PUE' && c.forma_pago === '01' && c.total_mxn > 2000) {
        obs.push('no es deducible para ISR (Art. 27 LISR) por pago en efectivo superior a $2,000.00 MXN');
      }
      if (c.direccion === 'R' && c.uso_cfdi === 'S01') {
        obs.push('registra uso S01 (Sin efectos fiscales), excluido de deducciones');
      }
      const cpRfc = (c.direccion === 'E' ? c.rfc_receptor : c.rfc_emisor).toUpperCase();
      const efosHit = state.lista_efos.find((e) => e.rfc.toUpperCase() === cpRfc);
      if (efosHit) obs.push(`contraparte (${cpRfc}) en lista Art. 69-B con estatus **${efosHit.situacion}**`);

      return makeReply({
        vistaConsultada: `Auditoría XML en vivo · ${options.attachmentName}`,
        text: `Con gusto${saludoNombre}. He analizado el comprobante **${options.attachmentName}** para **${empresa.razon_social}**: es un CFDI **${c.direccion === 'E' ? 'emitido' : 'recibido'}** tipo **${CATALOGO_TIPO_CFDI[c.tipo]}** (v${c.version}), folio **${c.serie}-${c.folio}**, fecha **${formatShortDate(c.fecha_fiscal)}**, total **${formatMoney(c.total, ocultarMontos, c.moneda)}**.\n\n• **Estado en el portal:** ${yaExiste ? 'Ya se encuentra incorporado.' : 'Aún no ha sido importado.'}\n• **Dictamen fiscal:** ${obs.length === 0 ? 'Sin inconsistencias ni alertas detectadas.' : `Atención: ${obs.join('; ')}.`}`,
        table: {
          exportName: `Auditoria_XML_${c.folio}`,
          headers: ['Campo CFDI', 'Valor verificado'],
          rows: [
            ['UUID', c.uuid],
            ['Emisor', `${c.nombre_emisor} (${c.rfc_emisor})`],
            ['Receptor', `${c.nombre_receptor} (${c.rfc_receptor})`],
            ['Método / Forma / Uso', `${c.metodo_pago || 'N/A'} · ${c.forma_pago || 'N/A'} · ${c.uso_cfdi}`],
            ['Subtotal / IVA / Total', `${formatMoney(c.subtotal, ocultarMontos, c.moneda)} / ${formatMoney(c.iva_trasladado, ocultarMontos)} / ${formatMoney(c.total, ocultarMontos, c.moneda)}`],
          ],
        },
        actions: yaExiste
          ? [{ label: 'Abrir CFDI en portal', cfdiUuid: c.uuid }]
          : [{ label: 'Ir a Sincronización para importarlo', route: 'sincronizacion' }],
      });
    }
    return makeReply({
      vistaConsultada: `Validación XML · ${options.attachmentName}`,
      text: `Lamento informarle${saludoNombre} que no fue posible validar **${options.attachmentName}**: ${parsed.error || 'estructura CFDI no válida'}. Si pertenece a otro RFC, puede cargarlo en **Sincronización** (\`#fiscal/sincronizacion\`), donde el portal detectará el contribuyente automáticamente.`,
      actions: [{ label: 'Ir a Sincronización', route: 'sincronizacion' }],
    });
  }

  // =========================================================================
  // 0.5. EXPLICACIÓN CONTEXTUAL DE LA PÁGINA ACTUAL, SUS RUTAS Y DUDAS
  // =========================================================================
  const pageExplainTarget = detectPageExplanationIntent(
    prompt,
    options?.currentRoute || 'dashboard',
    options?.previousRoute,
  );
  if (pageExplainTarget) {
    const pageReply = buildPageExplanationMessage(
      pageExplainTarget,
      state,
      empresa,
      ocultarMontos,
      saludoNombre,
      periodo,
    );
    return makeReply(
      {
        ...pageReply,
        interpretationNote: undefined,
      },
      { lastTopic: pageExplainTarget },
    );
  }

  // =========================================================================
  // 1. SALUDO FORMAL
  // =========================================================================
  if (/^(hola|buen(os|as)|saludos|hey|que tal)\b/.test(qNorm) && intent.tokens.length <= 5) {
    const enCanc = companyCfdis.filter((c) => c.estatus_sat === 'en_cancelacion').length;
    const ppd = getPpdPendientesCobro(state, empresa.id);
    return makeReply({
      vistaConsultada: 'Asistente Tecno · Sesión activa',
      text: `Buen día${saludoNombre}. Estoy a sus órdenes como **Asistente Tecno**, especialista exclusivo del **Módulo Fiscal SAT** para **${empresa.razon_social} (${empresa.rfc})**.\n\nAl momento, le informo que cuenta con **${ppd.length} factura(s) PPD pendientes de cobro** y **${enCanc} comprobante(s) en proceso de cancelación**. Puede plantearme cualquier duda fiscal, pedirme cifras en tiempo real o preguntarme cómo utilizar cualquier apartado del portal.`,
      followUps: [
        'Guía paso a paso para usar el portal',
        '¿Qué asuntos fiscales requieren atención urgente?',
        'Explícame el IVA de octubre',
      ],
    });
  }

  // =========================================================================
  // 2. GUARDIA ESTRICTA DE DOMINIO (INCLUSO CON MALA ORTOGRAFÍA)
  // =========================================================================
  if (intent.isOffTopic) {
    return makeReply({
      offTopic: true,
      vistaConsultada: 'Política de alcance exclusivo · Portal Tecnocontrol',
      text: `Le ofrezco una disculpa${saludoNombre}, pero mi función está dedicada de forma exclusiva al **Módulo Fiscal SAT del Portal Operativo Tecnocontrol**. No atiendo consultas ajenas a esta plataforma, pero con mucho gusto puedo apoyarle con sus CFDIs, impuestos IVA/ISR, conciliación SAT, riesgos fiscales, Aspel SAE o indicarle cómo usar cualquier apartado del portal.`,
      followUps: [
        'Guía paso a paso para usar el portal',
        '¿Qué asuntos fiscales requieren atención urgente?',
        'Muéstrame todas las rutas del portal',
      ],
    });
  }

  // =========================================================================
  // 3. INSPECCIÓN DIRECTA DE FOLIO O UUID (SIEMPRE PRIORITARIO SI LO MENCIONA)
  // =========================================================================
  const uuidMatch = prompt.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
  const folioMatch = prompt.match(/\b([A-Z]{1,4})[- ]?(\d{2,6})\b/i);
  let targetCfdi: Cfdi | undefined;

  if (uuidMatch) {
    targetCfdi = state.cfdis.find((c) => c.uuid.toUpperCase() === uuidMatch[0].toUpperCase());
  } else if (
    folioMatch &&
    !/^202\d$/.test(folioMatch[0]) &&
    !/69-?b/i.test(folioMatch[0]) &&
    !/32-?d/i.test(folioMatch[0])
  ) {
    targetCfdi = companyCfdis.find(
      (c) => c.serie.toUpperCase() === folioMatch[1].toUpperCase() && c.folio === folioMatch[2],
    );
  }

  if (targetCfdi) {
    const pagosDoc = state.pagos.filter(
      (p) => p.uuid_documento === targetCfdi!.uuid || p.uuid_pago === targetCfdi!.uuid,
    );
    const rels = state.relaciones.filter(
      (r) => r.uuid === targetCfdi!.uuid || r.uuid_relacionado === targetCfdi!.uuid,
    );
    const pagadoTotal = pagosDoc
      .filter((p) => p.uuid_documento === targetCfdi!.uuid)
      .reduce((s, p) => s + p.importe_pagado, 0);
    const saldoPend = Math.max(0, Number((targetCfdi.total - pagadoTotal).toFixed(2)));
    const cpNombre = targetCfdi.direccion === 'E' ? targetCfdi.nombre_receptor : targetCfdi.nombre_emisor;
    const cpRfc = targetCfdi.direccion === 'E' ? targetCfdi.rfc_receptor : targetCfdi.rfc_emisor;

    const hallazgos: string[] = [];
    if (targetCfdi.estatus_sat === 'en_cancelacion') hallazgos.push('se encuentra **en proceso de cancelación** ante el SAT');
    else if (targetCfdi.estatus_sat === 'cancelado') hallazgos.push(`fue **cancelado** el ${formatShortDate(targetCfdi.fecha_cancelacion)}`);
    if (targetCfdi.metodo_pago === 'PPD') {
      hallazgos.push(
        pagadoTotal > targetCfdi.total + 0.01
          ? `presenta **sobrepago vía REP** (${formatMoney(pagadoTotal, ocultarMontos)} vs total de ${formatMoney(targetCfdi.total, ocultarMontos)})`
          : saldoPend > 1
            ? `mantiene un **saldo pendiente de ${formatMoney(saldoPend, ocultarMontos)}** (liquidado al momento: ${formatMoney(pagadoTotal, ocultarMontos)})`
            : 'está **liquidado al 100 %** con complemento de pago',
      );
    }
    if (rels.length > 0) {
      hallazgos.push(`tiene **${rels.length} relación(es) CFDI** (${rels.map((r) => CATALOGO_TIPO_RELACION[r.tipo_relacion] || `tipo ${r.tipo_relacion}`).join(', ')})`);
    }
    hallazgos.push(targetCfdi.poliza_aspel ? `contabilizado en **Aspel SAE** con póliza **${targetCfdi.poliza_aspel}**` : '**pendiente de póliza en Aspel SAE**');

    return makeReply({
      vistaConsultada: `Expediente completo CFDI ${targetCfdi.serie}-${targetCfdi.folio}`,
      text: `Con gusto le informo el detalle completo del comprobante **${targetCfdi.serie}-${targetCfdi.folio}**${saludoNombre}:\n\nEs un CFDI **${targetCfdi.direccion === 'E' ? 'emitido a' : 'recibido de'} ${cpNombre}** (\`${cpRfc}\`) el **${formatShortDate(targetCfdi.fecha_fiscal)}**, por un total de **${formatMoney(targetCfdi.total, ocultarMontos, targetCfdi.moneda)}** (IVA: **${formatMoney(targetCfdi.iva_trasladado, ocultarMontos)}**, método **${targetCfdi.metodo_pago || 'N/A'}**).\n\n**Situación actual:** ${hallazgos.join('; ')}.`,
      table: {
        exportName: `Detalle_${targetCfdi.serie}_${targetCfdi.folio}`,
        headers: ['Atributo', 'Valor registrado'],
        rows: [
          ['Folio / UUID', `${targetCfdi.serie}-${targetCfdi.folio} (${shortUuid(targetCfdi.uuid)})`],
          ['Estatus SAT', targetCfdi.estatus_sat.toUpperCase()],
          ['Método / Forma / Uso', `${targetCfdi.metodo_pago || 'N/A'} · ${CATALOGO_FORMA_PAGO[targetCfdi.forma_pago] || targetCfdi.forma_pago || 'N/A'} · ${CATALOGO_USO_CFDI[targetCfdi.uso_cfdi] || targetCfdi.uso_cfdi}`],
          ['Subtotal / IVA / Total', `${formatMoney(targetCfdi.subtotal, ocultarMontos, targetCfdi.moneda)} / ${formatMoney(targetCfdi.iva_trasladado, ocultarMontos)} / ${formatMoney(targetCfdi.total, ocultarMontos, targetCfdi.moneda)}`],
          ['Estado Aspel SAE', targetCfdi.poliza_aspel ? `${targetCfdi.poliza_aspel} (cta. ${targetCfdi.cuenta_contable})` : 'Pendiente'],
        ],
      },
      actions: [{ label: `Abrir ${targetCfdi.serie}-${targetCfdi.folio}`, cfdiUuid: targetCfdi.uuid }],
    });
  }

  // =========================================================================
  // 4. DESPACHO LÓGICO POR TEMA SEMÁNTICO + METAS (RUTA + GUÍA + DATOS)
  // =========================================================================
  switch (intent.primaryTopic) {
    case 'onboarding_guide': {
      return makeReply({
        vistaConsultada: 'Guía maestra de uso · Portal Fiscal SAT Tecnocontrol',
        text: `Con mucho gusto le guío paso a paso para aprovechar correctamente el **Módulo Fiscal SAT**${saludoNombre}. El flujo de trabajo recomendado es el siguiente:\n\n• **1. Selección de empresa y seguridad:** confirme en el selector superior izquierdo el RFC activo (actualmente **${empresa.razon_social}**) y verifique la vigencia de su **e.firma (FIEL)** en \`#fiscal/efirma\` (solo Propietario) y el acceso de su equipo en \`#fiscal/usuarios\`.\n• **2. Obtención de comprobantes:** en **Sincronización** (\`#fiscal/sincronizacion\`) consulte la bitácora diaria de descargas SAT, solicite descargas históricas (hasta 5 años) o arrastre sus paquetes \`.zip\` / \`.xml\` reales.\n• **3. Revisión operativa y tablero:** analice ingresos, gastos y gráfica anual en **Dashboard** (\`#fiscal/dashboard\`), o filtre, exporte a Excel y descargue XML/PDF en **CFDIs emitidos** (\`#fiscal/emitidos\`) y **CFDIs recibidos** (\`#fiscal/recibidos\`).\n• **4. Pre-determinación de impuestos:** valide mes a mes su flujo en **Impuestos IVA** (\`#fiscal/iva\`) e **Impuestos ISR** (\`#fiscal/isr\`), donde puede excluir comprobantes registrando su motivo contable.\n• **5. Control y cumplimiento:** concilie totales contra el SAT en **Conciliación SAT** (\`#fiscal/visor\`), revise riesgos y proveedores 69-B en **Indicadores** (\`#fiscal/indicadores\`), resguarde su constancia y opiniones en **Datos fiscales** (\`#fiscal/documentos\`) y verifique pólizas en **Vinculaciones SAE** (\`#fiscal/vinculaciones\`).`,
        actions: [
          { label: 'Ir al Dashboard', route: 'dashboard' },
          { label: 'Ir a Sincronización', route: 'sincronizacion' },
          { label: 'Ver las 17 rutas', route: 'asistente' },
        ],
        followUps: ['Muéstrame todas las rutas del portal', '¿Qué asuntos fiscales requieren atención urgente?'],
      });
    }

    case 'portal_scope': {
      return makeReply({
        vistaConsultada: 'Alcance oficial del Módulo Fiscal SAT',
        text: `Le confirmo con claridad${saludoNombre}: este **Módulo Fiscal SAT** está diseñado exclusivamente para **descarga, lectura, conciliación y análisis fiscal**. **No emite ni timbra CFDI** y tampoco lleva la contabilidad electrónica.\n\n• Para timbrar facturas o complementos de pago debe continuar utilizando su sistema de facturación habitual; en cuanto el SAT los timbra, el portal los descarga automáticamente para analizarlos.\n• Para el seguimiento contable, el portal se vincula con **Aspel SAE** en **Vinculaciones SAE** (\`#fiscal/vinculaciones\`) para mostrar qué UUIDs ya tienen póliza registrada.`,
        actions: [
          { label: 'Ir a Sincronización', route: 'sincronizacion' },
          { label: 'Ir a Vinculaciones SAE', route: 'vinculaciones' },
        ],
      });
    }

    case 'portal_all_routes': {
      return makeReply({
        vistaConsultada: 'Directorio oficial · 17 apartados del Módulo Fiscal SAT',
        text: `Con gusto${saludoNombre}. El **Módulo Fiscal SAT** se integra por **17 apartados** accesibles desde el menú lateral izquierdo y la barra superior. A continuación le presento el mapa completo con cada ruta exacta y su finalidad:`,
        table: {
          exportName: 'Directorio_Rutas_Portal_Fiscal',
          headers: ['#', 'Apartado', 'Ruta', 'Ubicación y qué encontrará'],
          rows: PORTAL_DIRECTORY.map((d) => [String(d.id), d.nombre, d.rutaHash, `${d.menuUbicacion}. ${d.queEncuentra}`]),
        },
        actions: [
          { label: 'Dashboard', route: 'dashboard' },
          { label: 'Sincronización', route: 'sincronizacion' },
          { label: 'Conciliación SAT', route: 'visor' },
        ],
      });
    }

    case 'create_indicator': {
      const parsed = parseNaturalLanguageToIndicator(prompt);
      return makeReply({
        vistaConsultada: 'Indicadores · Constructor asistido',
        text: `Con gusto${saludoNombre}. Estructuré una regla personalizada con **${parsed.filtros.length} condición(es)** para **${empresa.razon_social}**. Le invito a verificar las condiciones debajo y pulsar **Aprobar y guardar indicador** para activarla en \`#fiscal/indicadores\`.`,
        suggestedIndicator: parsed,
      });
    }

    case 'ocultar_montos': {
      return makeReply({
        vistaConsultada: 'Guía del portal · Privacidad de cifras (Global)',
        text: `Con mucho gusto${saludoNombre}. Para ocultar de inmediato todas las cantidades antes de compartir su pantalla:\n\n• Ubique el botón **Ocultar montos** (ícono de ojo) en la **barra superior derecha**, junto a la campana de notificaciones.\n• Al activarlo, todas las cifras de tarjetas, tablas, gráficas y respuestas de este asistente se sustituyen automáticamente por \`•••••\`.\n• Su preferencia queda guardada por usuario y puede volver a mostrar los montos con otro clic en el mismo botón.`,
      });
    }

    case 'descarga_historica': {
      return makeReply({
        vistaConsultada: 'Guía operativa · Descarga histórica SAT (#fiscal/sincronizacion)',
        text: `Con gusto le indico cómo incorporar XML de ejercicios anteriores${saludoNombre}:\n\n• **Ruta exacta:** **Sincronización** (\`#fiscal/sincronizacion\` · Menú lateral → Comprobantes SAT → Sincronización).\n• **Procedimiento:** haga clic en el botón **Descarga histórica**, seleccione los años que necesita (el portal admite **hasta 5 años atrás**) y confirme.\n• **Control de límites SAT:** el sistema divide automáticamente cada ejercicio en **solicitudes mensuales** (emitidos y recibidos) para respetar las restricciones del Web Service del SAT sin duplicar UUIDs.\n• Si usted ya cuenta con los paquetes \`.zip\` descargados previamente, también puede cargarlos al instante con el botón **Cargar XML / ZIP**.`,
        actions: [{ label: 'Ir a Sincronización', route: 'sincronizacion' }],
      });
    }

    case 'sincronizacion_error': {
      const desc = state.descargas.filter((d) => d.empresa_id === empresa.id);
      const errores = desc.filter((d) => d.estado === 'Error');
      return makeReply({
        vistaConsultada: 'Diagnóstico · Bitácora de Sincronización SAT',
        text:
          errores.length > 0
            ? `He revisado la bitácora de descargas de **${empresa.razon_social}**${saludoNombre} y efectivamente identifiqué **${errores.length} solicitud(es) con error**: el periodo **${errores[0].periodo}** devolvió *"${errores[0].error || 'error temporal del servicio SAT'}"*.\n\n• **¿Por qué ocurre?** El Web Service de Descarga Masiva del SAT suele presentar ventanas breves de mantenimiento (como el código 5004); esto **no afecta** sus CFDIs ya descargados ni genera duplicados.\n• **Cómo resolverlo:** ingrese a **Sincronización** (\`#fiscal/sincronizacion\`), localice la fila en rojo y presione el botón **Reintentar** para relanzar la solicitud.`
            : `Revisé la bitácora de **${empresa.razon_social}** y actualmente **no existen descargas con error**; todas las ejecuciones recientes concluyeron correctamente. Si desea lanzar una consulta inmediata del día, puede usar **Actualizar SAT** en \`#fiscal/sincronizacion\`.`,
        table:
          errores.length > 0
            ? {
                exportName: `Errores_Descarga_${empresa.rfc}`,
                headers: ['Periodo', 'Tipo', 'Solicitud SAT', 'Detalle del error'],
                rows: errores.map((e) => [e.periodo, e.tipo, e.id_solicitud_sat, e.error || 'Error SAT']),
              }
            : undefined,
        actions: [{ label: 'Ir a Sincronización para reintentar', route: 'sincronizacion' }],
      });
    }

    case 'sincronizacion_zip': {
      return makeReply({
        vistaConsultada: 'Guía operativa · Carga masiva XML / ZIP (#fiscal/sincronizacion)',
        text: `Con gusto le indico cómo cargar sus comprobantes o paquetes del SAT${saludoNombre}:\n\n• **Ruta directa:** **Sincronización** (\`#fiscal/sincronizacion\` · Menú lateral → Comprobantes SAT → Sincronización).\n• **Si desea trabajar sin datos de prueba:** presione primero **Modo empresa limpia** para vaciar los CFDIs demo de la empresa activa.\n• **Carga de archivos:** haga clic en **Cargar XML / ZIP** y arrastre uno o varios archivos \`.xml\` o paquetes \`.zip\` descargados del SAT.\n• El sistema descomprime en su navegador, interpreta **CFDI 4.0/3.3, Pagos 2.0, Nómina 1.2 y Carta Porte**, omite duplicados por UUID y, si el ZIP corresponde a un RFC diferente, le ofrece crear esa empresa limpia e importar todo en un clic.`,
        actions: [{ label: 'Ir a Sincronización ahora', route: 'sincronizacion' }],
      });
    }

    case 'ppd_rep_workflow': {
      const pendientes = getPpdPendientesCobro(state, empresa.id);
      return makeReply({
        vistaConsultada: 'Procedimiento SAT · Flujo PPD → Complemento de Pago (REP 2.0)',
        text: `Excelente pregunta${saludoNombre}. Cuando un cliente liquida una factura emitida con método **PPD**, el procedimiento correcto es:\n\n• **1. Emisión del REP 2.0:** dado que este portal es solo de lectura y análisis, el área de Facturación o Contabilidad debe emitir y timbrar el **Complemento para Recepción de Pagos (REP 2.0)** en su sistema facturador, referenciando el UUID de la factura PPD y la fecha real de la transferencia.\n• **2. Plazo oficial del SAT:** debe expedirse a más tardar el **día 5 natural del mes siguiente** al que se recibió el pago (de lo contrario, el indicador *"Pagos fuera de periodo"* lo señalará como incidencia).\n• **3. Reflejo automático en este portal:** en cuanto el REP queda timbrado, la sincronización diaria de las 02:00 h (o una carga manual en \`#fiscal/sincronizacion\`) lo incorpora y **detona automáticamente el IVA trasladado y el ingreso cobrado de ISR** en el mes del pago.\n\nActualmente **${empresa.razon_social}** tiene **${pendientes.length} factura(s) PPD pendiente(s) de cobro** por **${formatMoney(pendientes.reduce((s, p) => s + p.pendiente, 0), ocultarMontos)}**.`,
        table:
          pendientes.length > 0
            ? {
                exportName: `PPD_Pendientes_${empresa.rfc}`,
                headers: ['Folio', 'Cliente', 'Emisión', 'Saldo insoluto'],
                rows: pendientes.map((p) => [`${p.cfdi.serie}-${p.cfdi.folio}`, p.cfdi.nombre_receptor, p.cfdi.fecha_fiscal, formatMoney(p.pendiente, ocultarMontos, p.cfdi.moneda)]),
              }
            : undefined,
        actions: [
          { label: 'Ver emitidos PPD', route: 'emitidos' },
          { label: 'Ir a Sincronización', route: 'sincronizacion' },
        ],
      });
    }

    case 'compare_months': {
      const [m1, m2] = intent.months.length >= 2 ? intent.months : [{ mm: '10', label: 'octubre' }, { mm: '09', label: 'septiembre' }];
      const p1 = `${year}-${m1.mm}`;
      const p2 = `${year}-${m2.mm}`;
      const l1 = `${m1.label} de ${year}`;
      const l2 = `${m2.label} de ${year}`;
      const resumenAnual = getResumenMensual(state, empresa.id, year);
      const r1 = resumenAnual.find((r) => r.periodo === p1);
      const r2 = resumenAnual.find((r) => r.periodo === p2);

      if (r1 && r2) {
        const diffIng = r1.ingresosNetos - r2.ingresosNetos;
        const pctIng = r2.ingresosNetos > 0 ? ((diffIng / r2.ingresosNetos) * 100).toFixed(1) : '0.0';
        const diffGto = r1.gastos - r2.gastos;
        const iva1 = r1.ivaTrasladado - r1.ivaAcreditable - r1.ivaRetenido;
        const iva2 = r2.ivaTrasladado - r2.ivaAcreditable - r2.ivaRetenido;

        return makeReply({
          vistaConsultada: `Comparativo mensual (${p1} vs ${p2})`,
          text: `Con gusto le presento el comparativo entre **${l1}** y **${l2}** para **${empresa.razon_social}**${saludoNombre}:\n\n• **Ingresos netos:** en **${l1}** sumaron **${formatMoney(r1.ingresosNetos, ocultarMontos)}** contra **${formatMoney(r2.ingresosNetos, ocultarMontos)}** en **${l2}** (${diffIng >= 0 ? `incremento de **${formatMoney(diffIng, ocultarMontos)}** / +${pctIng} %` : `disminución de **${formatMoney(Math.abs(diffIng), ocultarMontos)}** / ${pctIng} %`}).\n• **Gastos:** variaron de **${formatMoney(r2.gastos, ocultarMontos)}** a **${formatMoney(r1.gastos, ocultarMontos)}** (**${formatMoney(diffGto, ocultarMontos)}**).\n• **IVA en flujo estimado:** pasó de **${formatMoney(iva2, ocultarMontos)}** en ${l2} a **${formatMoney(iva1, ocultarMontos)}** en ${l1}.`,
          table: {
            exportName: `Comparativo_${p1}_vs_${p2}`,
            headers: ['Rubro', l2, l1, 'Variación'],
            rows: [
              ['Ingresos netos', formatMoney(r2.ingresosNetos, ocultarMontos), formatMoney(r1.ingresosNetos, ocultarMontos), formatMoney(diffIng, ocultarMontos)],
              ['Gastos', formatMoney(r2.gastos, ocultarMontos), formatMoney(r1.gastos, ocultarMontos), formatMoney(diffGto, ocultarMontos)],
              ['Margen operativo bruto', formatMoney(r2.ingresosNetos - r2.gastos, ocultarMontos), formatMoney(r1.ingresosNetos - r1.gastos, ocultarMontos), formatMoney((r1.ingresosNetos - r1.gastos) - (r2.ingresosNetos - r2.gastos), ocultarMontos)],
              ['IVA en flujo (a cargo/favor)', formatMoney(iva2, ocultarMontos), formatMoney(iva1, ocultarMontos), formatMoney(iva1 - iva2, ocultarMontos)],
              ['Deducciones ISR', formatMoney(r2.isrDeducciones, ocultarMontos), formatMoney(r1.isrDeducciones, ocultarMontos), formatMoney(r1.isrDeducciones - r2.isrDeducciones, ocultarMontos)],
            ],
          },
          chart: {
            title: `Comparativo ${l2} vs ${l1} (MXN)`,
            series1Label: 'Ingresos netos',
            series2Label: 'Gastos',
            data: [
              { label: r2.mesCorto, valor: r2.ingresosNetos, valor2: r2.gastos },
              { label: r1.mesCorto, valor: r1.ingresosNetos, valor2: r1.gastos },
            ],
          },
          actions: [{ label: 'Ver gráfica completa en Dashboard', route: 'dashboard', preset: { periodo: p1 } }],
        });
      }
      break;
    }

    case 'urgent_priorities': {
      const puntos: string[] = [];
      const rows: string[][] = [];

      const efosDef = companyCfdis.filter(
        (c) =>
          c.direccion === 'R' &&
          state.lista_efos.some((e) => e.rfc.toUpperCase() === c.rfc_emisor.toUpperCase() && e.situacion === 'Definitivo'),
      );
      if (efosDef.length > 0) {
        const f = efosDef[0];
        puntos.push(`**Prioridad Crítica — Proveedor 69-B definitivo:** el comprobante **${f.serie}-${f.folio}** de **${f.nombre_emisor}** (**${formatMoney(f.total_mxn, ocultarMontos)}**) está excluido de deducciones ISR y requiere revisión documental inmediata.`);
        rows.push(['Crítica', 'Proveedor 69-B definitivo', `${f.serie}-${f.folio} (${f.nombre_emisor})`, formatMoney(f.total_mxn, ocultarMontos)]);
      }

      const enCanc = companyCfdis.filter((c) => c.estatus_sat === 'en_cancelacion');
      if (enCanc.length > 0) {
        puntos.push(`**Prioridad Alta — CFDIs en proceso de cancelación (${enCanc.length}):** ${enCanc.map((c) => `**${c.serie}-${c.folio}** (${c.direccion === 'E' ? 'emitido' : 'recibido'})`).join(' y ')} por **${formatMoney(enCanc.reduce((s, c) => s + c.total_mxn, 0), ocultarMontos)}** (recuerde el plazo SAT de 3 días hábiles).`);
        enCanc.forEach((c) => rows.push(['Alta', 'En proceso de cancelación', `${c.serie}-${c.folio}`, formatMoney(c.total_mxn, ocultarMontos)]));
      }

      const inds = evaluateIndicadores(state, empresa, periodo);
      const sust = inds.find((i) => i.indicador.codigo === 'SUST_AMBOS_VIGENTES');
      if (sust && sust.conteo_ejercicio > 0) {
        puntos.push(`**Prioridad Alta — Sustitución 04 con ambos comprobantes vigentes:** **${sust.conteo_ejercicio} caso(s)** con riesgo de duplicar ingreso e IVA si no se cancela la factura sustituida.`);
        rows.push(['Alta', 'Sustitución 04 ambos vigentes', `${sust.conteo_ejercicio} CFDI`, 'Riesgo duplicidad']);
      }

      const visorNov = getConciliacionSat(state, empresa.id, {
        fechaIni: `${year}-11-01`,
        fechaFin: `${year}-11-30`,
        direccion: 'ALL',
        metodo: 'ALL',
        regimen: 'ALL',
        soloHastaCorteSat: true,
      });
      const faltantesSat = visorNov.detalle.filter((d) => d.estadoConciliacion === 'solo_sat');
      if (faltantesSat.length > 0) {
        puntos.push(`**Prioridad Media — Conciliación SAT:** falta descargar **${faltantesSat.length} XML** de noviembre (**${formatMoney(faltantesSat.reduce((s, x) => s + x.cfdi.total_mxn, 0), ocultarMontos)}**) en \`#fiscal/visor\`.`);
        rows.push(['Media', 'Diferencia en Visor SAT', `${faltantesSat.length} XML solo en SAT`, formatMoney(faltantesSat.reduce((s, x) => s + x.cfdi.total_mxn, 0), ocultarMontos)]);
      }

      return makeReply({
        vistaConsultada: 'Auditoría prioritaria en tiempo real',
        text:
          puntos.length === 0
            ? `Me complace informarle${saludoNombre} que **${empresa.razon_social}** no presenta pendientes críticos ni alertas urgentes al momento.`
            : `Con base en el diagnóstico en vivo de **${empresa.razon_social}**, le sugiero atender estos **${puntos.length} asuntos en orden de prioridad**:\n\n${puntos.map((p) => `• ${p}`).join('\n')}`,
        table: rows.length > 0 ? { exportName: `Plan_Prioridades_${empresa.rfc}`, headers: ['Prioridad', 'Hallazgo', 'Referencia', 'Impacto'], rows } : undefined,
        actions: [
          { label: 'Revisar Indicadores', route: 'indicadores' },
          { label: 'Abrir Conciliación SAT', route: 'visor' },
        ],
      });
    }

    case 'non_deductible': {
      const efosDefSet = new Set(
        state.lista_efos.filter((e) => e.situacion === 'Definitivo').map((e) => e.rfc.toUpperCase()),
      );
      const scope = explicitMonth
        ? companyCfdis.filter((c) => c.direccion === 'R' && c.fecha_fiscal.startsWith(periodo))
        : companyCfdis.filter((c) => c.direccion === 'R' && c.fecha_fiscal.startsWith(year));

      const noDed: Array<{ cfdi: Cfdi; motivo: string }> = [];
      for (const c of scope) {
        if (c.estatus_sat === 'cancelado') noDed.push({ cfdi: c, motivo: 'CFDI cancelado ante el SAT' });
        else if (efosDefSet.has(c.rfc_emisor.toUpperCase())) noDed.push({ cfdi: c, motivo: 'Proveedor en Art. 69-B definitivo (EFOS)' });
        else if (c.uso_cfdi === 'S01') noDed.push({ cfdi: c, motivo: 'Uso CFDI S01 — Sin efectos fiscales' });
        else if (c.metodo_pago === 'PUE' && c.forma_pago === '01' && c.total_mxn > 2000) {
          noDed.push({ cfdi: c, motivo: 'Efectivo > $2,000 MXN (Art. 27 fracc. III LISR)' });
        }
      }

      const scopeLabel = explicitMonth ? periodoLabel : `el ejercicio ${year}`;
      return makeReply({
        vistaConsultada: `Auditoría de deducibilidad ISR (${scopeLabel})`,
        text:
          noDed.length === 0
            ? `En **${scopeLabel}** no se detectaron gastos recibidos con restricción de deducibilidad por uso S01, efectivo mayor a $2,000 o proveedores 69-B definitivo.${wantsLocation ? routeLocationSentence('non_deductible') : ''}`
            : `Para **${scopeLabel}**, identifiqué **${noDed.length} gasto(s) no deducibles o restringidos** que suman **${formatMoney(noDed.reduce((s, x) => s + x.cfdi.total_mxn, 0), ocultarMontos)}**:\n\n${noDed.map((n) => `• **${n.cfdi.serie}-${n.cfdi.folio}** de **${n.cfdi.nombre_emisor}** (${formatMoney(n.cfdi.total_mxn, ocultarMontos)}): ${n.motivo}.`).join('\n')}\n\nLos comprobantes **S01**, **cancelados** y **69-B definitivo** se excluyen automáticamente en **Impuestos ISR** (\`#fiscal/isr\`); para pagos en efectivo mayores a $2,000 le recomiendo desactivar manualmente su interruptor con el motivo contable.`,
        table:
          noDed.length > 0
            ? {
                exportName: `No_Deducibles_${empresa.rfc}`,
                headers: ['Folio', 'Fecha', 'Proveedor', 'Total MXN', 'Fundamento'],
                rows: noDed.map((n) => [`${n.cfdi.serie}-${n.cfdi.folio}`, n.cfdi.fecha_fiscal, n.cfdi.nombre_emisor, formatMoney(n.cfdi.total_mxn, ocultarMontos), n.motivo]),
              }
            : undefined,
        actions: [{ label: 'Revisar en Impuestos ISR', route: 'isr', preset: { periodo } }],
      });
    }

    case 'efos_69b': {
      const efosHits = companyCfdis
        .map((c) => {
          const rfc = (c.direccion === 'E' ? c.rfc_receptor : c.rfc_emisor).toUpperCase();
          const entry = state.lista_efos.find((e) => e.rfc.toUpperCase() === rfc);
          return entry ? { cfdi: c, entry } : null;
        })
        .filter((x): x is { cfdi: Cfdi; entry: FiscalDatabaseState['lista_efos'][number] } => Boolean(x));

      return makeReply({
        vistaConsultada: 'Art. 69-B CFF · Listas EFOS (#fiscal/indicadores)',
        text: `Cuando un proveedor aparece en la **lista negra del SAT (Art. 69-B CFF / EFOS)**, el impacto depende de su situación jurídica:\n\n• **Presunto:** se encuentra en proceso de aclaración ante el SAT; el portal emite alerta preventiva para que recabe evidencia de materialidad.\n• **Definitivo (no desvirtuado):** sus comprobantes pierden validez fiscal; el módulo **los excluye automáticamente de Deducciones ISR** y los marca en rojo.\n\nEn **${empresa.razon_social}** se detectaron **${efosHits.length} comprobante(s)** vinculados con RFCs en lista 69-B:${routeLocationSentence('efos_69b')}`,
        table:
          efosHits.length > 0
            ? {
                exportName: `Proveedores_69B_${empresa.rfc}`,
                headers: ['Folio', 'Proveedor', 'RFC', 'Estatus 69-B', 'Total MXN'],
                rows: efosHits.map((h) => [`${h.cfdi.serie}-${h.cfdi.folio}`, h.cfdi.nombre_emisor, h.entry.rfc, h.entry.situacion, formatMoney(h.cfdi.total_mxn, ocultarMontos)]),
              }
            : undefined,
        actions: [{ label: 'Abrir Indicadores 69-B', route: 'indicadores' }],
      });
    }

    case 'visor_sat': {
      const nov = getConciliacionSat(state, empresa.id, {
        fechaIni: `${year}-11-01`,
        fechaFin: `${year}-11-30`,
        direccion: 'ALL',
        metodo: 'ALL',
        regimen: 'ALL',
        soloHastaCorteSat: true,
      });
      const faltantes = nov.detalle.filter((d) => d.estadoConciliacion !== 'coincide');
      return makeReply({
        vistaConsultada: `Conciliación SAT · #fiscal/visor`,
        text: `Para revisar diferencias cuando sus facturas no cuadran contra el SAT, debe ingresar a **Conciliación SAT** (\`#fiscal/visor\` · Menú lateral → Control y cumplimiento → Conciliación SAT).\n\nAl corte SAT del **${formatShortDate(state.fecha_corte_sat)}**, **octubre ya se encuentra cuadrado en cero**, mientras que en **noviembre** ${faltantes.length === 0 ? 'tampoco existen diferencias pendientes' : `hay **${faltantes.length} diferencia(s)**: ${faltantes.map((f) => `el CFDI **${f.cfdi.serie}-${f.cfdi.folio}** de **${f.cfdi.nombre_emisor}** por **${formatMoney(f.cfdi.total_mxn, ocultarMontos)}** solo aparece en metadatos del SAT`).join(', ')}. Puede descargarlo en un clic desde esa pantalla`}.`,
        table: {
          exportName: `Conciliacion_SAT_${empresa.rfc}`,
          headers: ['Tipo', 'SAT (#)', 'Portal (#)', 'Dif. (#)', 'Dif. Monto'],
          rows: nov.resumen.map((r) => [r.label, String(r.satCount), String(r.portalCount), String(r.diffCount), formatMoney(r.diffMonto, ocultarMontos)]),
        },
        actions: [{ label: 'Abrir Conciliación SAT', route: 'visor' }],
      });
    }

    case 'documentos_fiscales': {
      const docs = state.documentos.filter((d) => d.empresa_id === empresa.id);
      const opSat = docs.find((d) => d.tipo === 'opinion_sat');
      return makeReply({
        vistaConsultada: 'Expediente · Datos fiscales',
        text: `El documento oficial que acredita si la empresa está al corriente con sus obligaciones fiscales es la **Opinión de Cumplimiento SAT (32-D)**, resguardada junto con la **Constancia de Situación Fiscal (CSF)** y la **Opinión IMSS** en el apartado **Datos fiscales** (\`#fiscal/documentos\` · Menú lateral → Control y cumplimiento → Datos fiscales).\n\nActualmente, la opinión SAT de **${empresa.razon_social}** se encuentra en sentido **${opSat?.sentido?.toUpperCase() || 'SIN CARGAR'}**${opSat ? ` (folio \`${opSat.folio_documento}\`, consulta del ${formatShortDate(opSat.fecha_consulta)})` : ''}. Recuerde que se actualiza de forma manual con recordatorio el día 1 de cada mes.`,
        table: {
          exportName: `Documentos_Fiscales_${empresa.rfc}`,
          headers: ['Documento oficial', 'Estatus', 'Folio', 'Última consulta'],
          rows: docs.map((d) => [d.titulo, d.sentido.toUpperCase(), d.folio_documento, formatShortDate(d.fecha_consulta)]),
        },
        actions: [{ label: 'Ir a Datos fiscales', route: 'documentos' }],
      });
    }

    case 'efirma': {
      const asksCsdDiff = qNorm.includes('csd') || qNorm.includes('sello');
      const activeEf = state.efirmas.find((e) => e.empresa_id === empresa.id);
      const activeDays = activeEf ? daysUntil(activeEf.vigencia_hasta) : null;
      const rows = state.empresas.map((emp) => {
        const ef = state.efirmas.find((e) => e.empresa_id === emp.id);
        const rem = ef ? daysUntil(ef.vigencia_hasta) : null;
        return [emp.razon_social, emp.rfc, ef ? formatShortDate(ef.vigencia_hasta) : 'Sin cargar', rem === null ? 'Sin registro' : rem < 0 ? `Vencida (hace ${Math.abs(rem)} d)` : `${rem} días`];
      });

      const intro = asksCsdDiff
        ? `La **e.firma (FIEL)** es indispensable para autenticarse ante el Web Service de Descarga Masiva del SAT; en cambio, el **Sello Digital (CSD)** solo sirve para timbrar CFDI y es rechazado para descargas.`
        : `Para consultar o renovar la **e.firma (FIEL)** debe ingresar al apartado **e.firma (FIEL)** (\`#fiscal/efirma\` · Menú lateral → Configuración → e.firma). Por seguridad, esta pantalla es **exclusiva del rol Propietario** y los archivos \`.cer\`, \`.key\` y contraseña nunca regresan al navegador.`;

      return makeReply({
        vistaConsultada: 'Configuración · e.firma (FIEL)',
        text: `${intro}\n\n${activeEf ? `En **${empresa.razon_social}**, el certificado vigente (serie \`${activeEf.numero_serie}\`) vence el **${formatShortDate(activeEf.vigencia_hasta)}** (${activeDays !== null && activeDays < 0 ? `vencido hace ${Math.abs(activeDays)} días` : `restan **${activeDays} días**`}).` : `**${empresa.razon_social}** aún no tiene e.firma registrada.`}`,
        table: { exportName: 'Vigencia_Efirma_Empresas', headers: ['Empresa', 'RFC', 'Expiración', 'Estatus'], rows },
        actions: [{ label: 'Ir a e.firma (FIEL)', route: 'efirma' }],
      });
    }

    case 'usuarios_roles': {
      const wantsReadOnly = qNorm.includes('solo vea') || qNorm.includes('solo lectura') || qNorm.includes('no modifique');
      const users = state.usuarios.filter((u) => u.empresa_id === empresa.id);
      return makeReply({
        vistaConsultada: 'Configuración · Usuarios y roles',
        text: `Con gusto le indico cómo gestionar colaboradores${saludoNombre}:\n\n• **Ruta exacta:** **Usuarios y roles** (\`#fiscal/usuarios\` · Menú lateral → Configuración → Usuarios y roles).\n• **Pasos:** haga clic en **Invitar usuario**, ingrese el nombre y correo corporativo del portal y seleccione el rol adecuado.${wantsReadOnly ? `\n• **Rol recomendado para su caso:** asigne el rol **Consulta**, ya que otorga acceso de **solo lectura** (podrá ver tableros y reportes, pero no verá la e.firma ni podrá invitar usuarios ni modificar impuestos).` : '\n• **Roles disponibles:** **Propietario** (acceso total incluida e.firma), **Contador** (todo excepto e.firma), **Consulta** (solo lectura) y **Pagos** (emitidos y recibidos sin impuestos).'}\n• La persona deberá aceptar la invitación antes de poder visualizar información de **${empresa.rfc}**.`,
        table: {
          exportName: `Usuarios_${empresa.rfc}`,
          headers: ['Colaborador', 'Correo', 'Rol', 'Estatus'],
          rows: users.map((u) => [u.nombre, u.correo, u.rol, u.aceptado_en ? 'Activo' : 'Pendiente']),
        },
        actions: [{ label: 'Ir a Usuarios y roles', route: 'usuarios' }],
      });
    }

    case 'empresas_rfc': {
      return makeReply({
        vistaConsultada: 'Directorio de empresas (RFC)',
        text: `Para cambiar de contribuyente o registrar un nuevo RFC debe ingresar al **Selector de empresas (RFC)** (\`#fiscal/empresas\` · Menú lateral → Configuración → Empresas, o bien mediante el menú desplegable en la esquina superior izquierda).\n\nActualmente tiene **${state.empresas.length} empresa(s)** configuradas y el botón **Nueva empresa** está habilitado exclusivamente para el rol **Propietario**.`,
        table: {
          exportName: 'Empresas_Portal_Tecnocontrol',
          headers: ['Razón Social', 'RFC', 'Régimen', 'Favorita'],
          rows: state.empresas.map((e) => [e.razon_social, e.rfc, e.regimen, e.favorita ? 'Sí' : 'No']),
        },
        actions: [{ label: 'Ir a Empresas (RFC)', route: 'empresas' }],
      });
    }

    case 'aspel_sae': {
      const cfg = state.aspel_configs.find((a) => a.empresa_id === empresa.id);
      const pendientes = companyCfdis.filter((c) => c.fecha_fiscal >= `${year}-10-01` && c.estatus_contable !== 'con_poliza');
      return makeReply({
        vistaConsultada: 'Integración Aspel SAE · #fiscal/vinculaciones y #fiscal/contable',
        text: `El vínculo con **Aspel SAE** se administra en dos pantallas del menú **Control y cumplimiento**: **Vinculaciones SAE** (\`#fiscal/vinculaciones\`, estado contable y póliza por UUID) y **ADD y Bitácora** (\`#fiscal/contable\`, historial de sincronizaciones por GUID).\n\n• **Estado actual para ${empresa.razon_social}:** conexión **${cfg?.conectado ? `en línea** (\`${cfg.base_datos}\`)` : 'desconectada** (use el botón Reintentar conexión)'}, con **${pendientes.length} CFDI(s)** recientes pendientes de vincular a póliza.`,
        table:
          pendientes.length > 0
            ? {
                exportName: `Pendientes_Aspel_${empresa.rfc}`,
                headers: ['Folio', 'Dir.', 'Fecha', 'Contraparte', 'Total MXN', 'Estatus'],
                rows: pendientes.slice(0, 8).map((c) => [`${c.serie}-${c.folio}`, c.direccion === 'E' ? 'Emitido' : 'Recibido', c.fecha_fiscal, c.direccion === 'E' ? c.nombre_receptor : c.nombre_emisor, formatMoney(c.total_mxn, ocultarMontos), c.estatus_contable === 'pendiente' ? 'Pendiente' : 'Sin registro']),
              }
            : undefined,
        actions: [
          { label: 'Ir a Vinculaciones SAE', route: 'vinculaciones' },
          { label: 'Ir a ADD y Bitácora', route: 'contable' },
        ],
      });
    }

    case 'iva': {
      if (intent.goals.has('explain_rule') && !intent.goals.has('analyze_data') && !explicitMonth && (qNorm.includes('pue') || qNorm.includes('ppd') || qNorm.includes('flujo'))) {
        return makeReply({
          vistaConsultada: 'Criterio fiscal · IVA en flujo (#fiscal/iva)',
          text: `Con gusto le explico cómo opera el **IVA en flujo** en este portal${saludoNombre}:\n\n• **Facturas PUE:** su IVA se acumula en el **mes de emisión**.\n• **Facturas PPD:** su IVA entra en el **mes de la fecha de pago** asentada en el Complemento de Pago (REP 2.0), en proporción exacta al porcentaje liquidado.\n• **Fórmula:** \`IVA a cargo / a favor = IVA Trasladado − IVA Acreditable − IVA Retenido\`.${routeLocationSentence('iva')}`,
          actions: [{ label: 'Ir a Impuestos IVA', route: 'iva', preset: { periodo } }],
        });
      }

      const iva = getIvaFlujoPeriodo(state, empresa.id, periodo);
      const activeTras = iva.trasladadoRows.filter((r) => r.activo);
      const activeAcred = iva.acreditableRows.filter((r) => r.activo);
      const ppdTras = activeTras.filter((r) => r.cfdi.metodo_pago === 'PPD');
      const topEmitido = [...activeTras].sort((a, b) => b.iva - a.iva)[0];
      const topRecibido = [...activeAcred].sort((a, b) => b.iva - a.iva)[0];

      const detalles: string[] = [];
      if (topEmitido) detalles.push(`El mayor impacto en **IVA trasladado** proviene de la factura **${topEmitido.cfdi.serie}-${topEmitido.cfdi.folio}** a **${topEmitido.cfdi.nombre_receptor}** (**${formatMoney(topEmitido.iva, ocultarMontos)}**).`);
      if (ppdTras.length > 0) detalles.push(`Se integraron **${ppdTras.length} cobro(s) proporcionales de PPD vía REP** por **${formatMoney(ppdTras.reduce((s, r) => s + r.iva, 0), ocultarMontos)}**.`);
      if (topRecibido) detalles.push(`En **IVA acreditable**, el proveedor de mayor peso fue **${topRecibido.cfdi.nombre_emisor}** (folio **${topRecibido.cfdi.serie}-${topRecibido.cfdi.folio}**, IVA de **${formatMoney(topRecibido.iva, ocultarMontos)}**).`);
      if (iva.ivaRetenido > 0) detalles.push(`Además se descuentan **${formatMoney(iva.ivaRetenido, ocultarMontos)}** de IVA retenido.`);

      return makeReply(
        {
          vistaConsultada: `Impuestos IVA en flujo (${periodo})`,
          text: `Con gusto${saludoNombre}. Para **${periodoLabel}**, el cálculo de **IVA en flujo** de **${empresa.razon_social}** arroja un saldo estimado **${iva.ivaACargo >= 0 ? 'a cargo' : 'a favor'} de ${formatMoney(Math.abs(iva.ivaACargo), ocultarMontos)}**.\n\n${detalles.map((d) => `• ${d}`).join('\n')}${wantsLocation ? routeLocationSentence('iva') : ''}`,
          table: {
            exportName: `IVA_${empresa.rfc}_${periodo}`,
            headers: ['Concepto', 'CFDI activos', 'Importe MXN'],
            rows: [
              ['IVA Trasladado (Emitidos PUE + REP)', String(activeTras.length), formatMoney(iva.ivaTrasladado, ocultarMontos)],
              ['IVA Acreditable (Recibidos PUE + REP)', String(activeAcred.length), formatMoney(iva.ivaAcreditable, ocultarMontos)],
              ['IVA Retenido', '—', formatMoney(iva.ivaRetenido, ocultarMontos)],
              [iva.ivaACargo >= 0 ? 'IVA Estimado a Cargo' : 'IVA Estimado a Favor', '—', formatMoney(Math.abs(iva.ivaACargo), ocultarMontos)],
            ],
          },
          chart: {
            title: `Composición IVA · ${periodoLabel}`,
            series1Label: 'MXN',
            data: [
              { label: 'Trasladado', valor: iva.ivaTrasladado },
              { label: 'Acreditable', valor: iva.ivaAcreditable },
              { label: iva.ivaACargo >= 0 ? 'A cargo' : 'A favor', valor: Math.abs(iva.ivaACargo) },
            ],
          },
          actions: [{ label: `Abrir Impuestos IVA (${periodoLabel})`, route: 'iva', preset: { periodo } }],
          followUps: [`¿Y cómo quedó el ISR de ${periodoLabel.split(' ')[0]}?`, '¿Qué gastos de octubre no son deducibles?'],
        },
        { lastPeriodo: periodo, lastYear: year, lastTopic: 'iva' },
      );
    }

    case 'isr': {
      const isr = getIsrPeriodo(state, empresa.id, periodo);
      const excluidos = isr.deduccionesRows.filter((r) => !r.activo);
      return makeReply(
        {
          vistaConsultada: `Impuestos ISR (${periodo})`,
          text: `En **${periodoLabel}**, **${empresa.razon_social}** registra ingresos efectivamente cobrados por **${formatMoney(isr.totalIngresos, ocultarMontos)}** y deducciones autorizadas por **${formatMoney(isr.totalDeducciones, ocultarMontos)}** (base preliminar de **${formatMoney(isr.baseEstimada, ocultarMontos)}**).${excluidos.length > 0 ? `\n\n• **Exclusiones aplicadas (${excluidos.length}):** ${excluidos.map((e) => `**${e.cfdi.serie}-${e.cfdi.folio}** (${e.cfdi.nombre_emisor}: ${e.motivo_exclusion || 'excluido'})`).join('; ')}.` : ''}\n\nPuede revisar el detalle por factura o activar/desactivar deducciones con motivo contable en **Impuestos ISR** (\`#fiscal/isr\` · Menú lateral → Impuestos → ISR cobrado).`,
          table: {
            exportName: `ISR_${empresa.rfc}_${periodo}`,
            headers: ['Concepto ISR', 'Comprobantes activos', 'Importe MXN'],
            rows: [
              ['Ingresos efectivamente cobrados', String(isr.ingresosRows.filter((r) => r.activo).length), formatMoney(isr.totalIngresos, ocultarMontos)],
              ['Deducciones autorizadas', String(isr.deduccionesRows.filter((r) => r.activo).length), formatMoney(isr.totalDeducciones, ocultarMontos)],
              ['Base / Utilidad preliminar', '—', formatMoney(isr.baseEstimada, ocultarMontos)],
            ],
          },
          actions: [{ label: `Abrir Impuestos ISR (${periodoLabel})`, route: 'isr', preset: { periodo } }],
          followUps: [`Explícame el IVA de ${periodoLabel.split(' ')[0]}`, '¿Qué gastos no son deducibles?'],
        },
        { lastPeriodo: periodo, lastYear: year, lastTopic: 'isr' },
      );
    }

    case 'impuestos_conjuntos': {
      const iva = getIvaFlujoPeriodo(state, empresa.id, periodo);
      const isr = getIsrPeriodo(state, empresa.id, periodo);
      return makeReply(
        {
          vistaConsultada: `Pre-determinación integral IVA + ISR (${periodo})`,
          text: `Con base en el flujo de efectivo de **${periodoLabel}** para **${empresa.razon_social}** (Régimen ${empresa.regimen}), le comparto el panorama estimado:\n\n• **IVA en flujo:** **${iva.ivaACargo >= 0 ? 'IVA a cargo' : 'IVA a favor'} estimado de ${formatMoney(Math.abs(iva.ivaACargo), ocultarMontos)}**.\n• **ISR:** ingresos efectivamente cobrados por **${formatMoney(isr.totalIngresos, ocultarMontos)}** y deducciones autorizadas por **${formatMoney(isr.totalDeducciones, ocultarMontos)}** (como persona moral Régimen 601, el pago provisional se determina aplicando el coeficiente de utilidad vigente).\n\n*Estas cifras son de apoyo y su validación definitiva corresponde a Contabilidad.*`,
          table: {
            exportName: `Impuestos_${empresa.rfc}_${periodo}`,
            headers: ['Rubro', 'Importe estimado MXN'],
            rows: [
              ['IVA Trasladado / Acreditable / Retenido', `${formatMoney(iva.ivaTrasladado, ocultarMontos)} / ${formatMoney(iva.ivaAcreditable, ocultarMontos)} / ${formatMoney(iva.ivaRetenido, ocultarMontos)}`],
              [iva.ivaACargo >= 0 ? 'IVA a Cargo estimado' : 'IVA a Favor estimado', formatMoney(Math.abs(iva.ivaACargo), ocultarMontos)],
              ['ISR — Ingresos cobrados', formatMoney(isr.totalIngresos, ocultarMontos)],
              ['ISR — Deducciones autorizadas', formatMoney(isr.totalDeducciones, ocultarMontos)],
            ],
          },
          actions: [
            { label: `Abrir IVA (${periodoLabel})`, route: 'iva', preset: { periodo } },
            { label: `Abrir ISR (${periodoLabel})`, route: 'isr', preset: { periodo } },
          ],
        },
        { lastPeriodo: periodo, lastYear: year, lastTopic: 'impuestos' },
      );
    }

    case 'ppd_pendientes': {
      const pendientes = getPpdPendientesCobro(state, empresa.id);
      const totalSaldo = pendientes.reduce((s, item) => s + item.pendiente, 0);
      if (pendientes.length === 0) {
        return makeReply({
          vistaConsultada: 'Comprobantes PPD y Complementos de Pago',
          text: `Me complace confirmarle${saludoNombre} que **${empresa.razon_social}** no tiene facturas PPD emitidas pendientes de cobro al corte actual.`,
          actions: [{ label: 'Ver CFDIs emitidos', route: 'emitidos' }],
        });
      }
      return makeReply({
        vistaConsultada: 'Cartera PPD pendiente de cobro',
        text: `Al corte actual, **${empresa.razon_social}** mantiene **${pendientes.length} factura(s) PPD con saldo insoluto por cobrar** por un total de **${formatMoney(totalSaldo, ocultarMontos)}**:\n\n${pendientes.map((p) => `• **${p.cfdi.nombre_receptor}** — folio **${p.cfdi.serie}-${p.cfdi.folio}** (${formatShortDate(p.cfdi.fecha_fiscal)}): saldo pendiente de **${formatMoney(p.pendiente, ocultarMontos, p.cfdi.moneda)}**.`).join('\n')}${wantsLocation ? routeLocationSentence('ppd_pendientes') : ''}`,
        table: {
          exportName: `PPD_Pendientes_${empresa.rfc}`,
          headers: ['Folio', 'Cliente', 'Emisión', 'Total', 'Cobrado', 'Saldo insoluto'],
          rows: pendientes.map((p) => [`${p.cfdi.serie}-${p.cfdi.folio}`, p.cfdi.nombre_receptor, p.cfdi.fecha_fiscal, formatMoney(p.cfdi.total, ocultarMontos, p.cfdi.moneda), formatMoney(p.pagado, ocultarMontos, p.cfdi.moneda), formatMoney(p.pendiente, ocultarMontos, p.cfdi.moneda)]),
        },
        actions: [
          { label: `Abrir ${pendientes[0].cfdi.serie}-${pendientes[0].cfdi.folio}`, cfdiUuid: pendientes[0].cfdi.uuid },
          { label: 'Ir a CFDIs emitidos', route: 'emitidos' },
        ],
      });
    }

    case 'cancelaciones': {
      const enProc = companyCfdis.filter((c) => c.estatus_sat === 'en_cancelacion');
      const canc = companyCfdis.filter((c) => c.estatus_sat === 'cancelado');
      const list = qNorm.includes('proceso') ? enProc : [...enProc, ...canc];
      const asksGuidance =
        intent.goals.has('how_to') ||
        intent.goals.has('locate') ||
        qNorm.includes('correo') ||
        qNorm.includes('que hago');
      const guidanceBlock = asksGuidance
        ? `\n\n**Procedimiento recomendado:**\n• **Plazo SAT:** una solicitud de cancelación con aceptación tiene **3 días hábiles (72 horas)** para aceptarse o rechazarse en el **Buzón Tributario del SAT**; de no responder, se considera aceptada por afirmativa ficta.\n• **Revisión en este portal:** valide el comprobante en **CFDIs emitidos** (\`#fiscal/emitidos\`) o **CFDIs recibidos** (\`#fiscal/recibidos\`) filtrando por estatus **En cancelación** (este portal es de consulta y análisis; la aceptación/rechazo oficial se firma en el SAT).`
        : '';
      return makeReply({
        vistaConsultada: 'Estatus de cancelación en Emitidos y Recibidos',
        text: `Con gusto le informo la situación de cancelaciones de **${empresa.razon_social}**${saludoNombre}: actualmente existen **${enProc.length} comprobante(s) en proceso de cancelación** y **${canc.length} confirmado(s) como cancelado**:\n\n${enProc.map((c) => `• **${c.serie}-${c.folio}** (${c.direccion === 'E' ? `emitido a ${c.nombre_receptor}` : `recibido de ${c.nombre_emisor}`}) por **${formatMoney(c.total_mxn, ocultarMontos)}**.`).join('\n') || '• Sin solicitudes en proceso.'}${guidanceBlock}`,
        table: {
          exportName: `Cancelaciones_${empresa.rfc}`,
          headers: ['Folio', 'Dir.', 'Fecha', 'Contraparte', 'Total MXN', 'Estatus'],
          rows: list.map((c) => [`${c.serie}-${c.folio}`, c.direccion === 'E' ? 'Emitido' : 'Recibido', c.fecha_fiscal, c.direccion === 'E' ? c.nombre_receptor : c.nombre_emisor, formatMoney(c.total_mxn, ocultarMontos), c.estatus_sat === 'en_cancelacion' ? 'En cancelación' : 'Cancelado']),
        },
        actions: [
          { label: 'Emitidos en cancelación', route: 'emitidos', preset: { estatus: 'en_cancelacion' } },
          { label: 'Recibidos en cancelación', route: 'recibidos', preset: { estatus: 'en_cancelacion' } },
        ],
      });
    }

    case 'indicadores': {
      const results = evaluateIndicadores(state, empresa, periodo).filter((r) => r.conteo_ejercicio > 0);
      return makeReply({
        vistaConsultada: `Indicadores de riesgo fiscal (${year})`,
        text: `Se detectaron **${results.length} indicador(es) con incidencias** en **${year}** para **${empresa.razon_social}**.${wantsLocation ? routeLocationSentence('indicadores') : ''}`,
        table: {
          exportName: `Indicadores_${empresa.rfc}`,
          headers: ['Indicador', 'Grupo', `Periodo (${periodo})`, `Ejercicio ${year}`],
          rows: results.map((r) => [r.indicador.nombre, r.indicador.grupo, String(r.conteo_periodo), String(r.conteo_ejercicio)]),
        },
        actions: [{ label: 'Abrir Indicadores', route: 'indicadores' }],
      });
    }

    case 'top_clientes': {
      const map = new Map<string, { nombre: string; rfc: string; count: number; total: number }>();
      companyCfdis
        .filter((c) => c.direccion === 'E' && c.tipo === 'I' && c.estatus_sat === 'vigente' && c.fecha_fiscal.startsWith(year))
        .forEach((c) => {
          const cur = map.get(c.rfc_receptor) || { nombre: c.nombre_receptor, rfc: c.rfc_receptor, count: 0, total: 0 };
          cur.count += 1;
          cur.total += c.total_mxn;
          map.set(c.rfc_receptor, cur);
        });
      const ranked = Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 6);
      const leader = ranked[0];
      return makeReply({
        vistaConsultada: `Ranking clientes ${year}`,
        text: leader
          ? `Durante **${year}**, el cliente principal de **${empresa.razon_social}** es **${leader.nombre}** (\`${leader.rfc}\`) con **${leader.count} factura(s)** por **${formatMoney(leader.total, ocultarMontos)}**.`
          : `Sin facturas vigentes emitidas en ${year}.`,
        table: { exportName: `Top_Clientes_${year}`, headers: ['Cliente', 'RFC', '# CFDIs', 'Total MXN'], rows: ranked.map((r) => [r.nombre, r.rfc, String(r.count), formatMoney(r.total, ocultarMontos)]) },
        chart: { title: `Facturación por cliente · ${year} (MXN)`, series1Label: 'Total MXN', data: ranked.map((r) => ({ label: r.rfc.slice(0, 6), valor: Number(r.total.toFixed(2)) })) },
        actions: [{ label: 'Ir a CFDIs emitidos', route: 'emitidos' }],
      });
    }

    case 'top_proveedores': {
      const map = new Map<string, { nombre: string; rfc: string; count: number; total: number }>();
      companyCfdis
        .filter((c) => c.direccion === 'R' && c.tipo === 'I' && c.estatus_sat === 'vigente' && c.fecha_fiscal.startsWith(year))
        .forEach((c) => {
          const cur = map.get(c.rfc_emisor) || { nombre: c.nombre_emisor, rfc: c.rfc_emisor, count: 0, total: 0 };
          cur.count += 1;
          cur.total += c.total_mxn;
          map.set(c.rfc_emisor, cur);
        });
      const ranked = Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 6);
      const leader = ranked[0];
      return makeReply({
        vistaConsultada: `Ranking proveedores ${year}`,
        text: leader
          ? `El principal proveedor de **${empresa.razon_social}** en **${year}** es **${leader.nombre}** (\`${leader.rfc}\`) con **${leader.count} comprobante(s)** por **${formatMoney(leader.total, ocultarMontos)}**.`
          : `Sin comprobantes recibidos vigentes en ${year}.`,
        table: { exportName: `Top_Proveedores_${year}`, headers: ['Proveedor', 'RFC', '# CFDIs', 'Total MXN'], rows: ranked.map((r) => [r.nombre, r.rfc, String(r.count), formatMoney(r.total, ocultarMontos)]) },
        chart: { title: `Gasto por proveedor · ${year} (MXN)`, series1Label: 'Total MXN', data: ranked.map((r) => ({ label: r.rfc.slice(0, 6), valor: Number(r.total.toFixed(2)) })) },
        actions: [{ label: 'Ir a CFDIs recibidos', route: 'recibidos' }],
      });
    }

    case 'factura_mayor': {
      const sorted = companyCfdis.filter((c) => c.tipo === 'I' && c.estatus_sat === 'vigente').sort((a, b) => b.total_mxn - a.total_mxn).slice(0, 5);
      const top = sorted[0];
      return makeReply({
        vistaConsultada: 'Comprobantes CFDI · Mayores importes',
        text: top
          ? `La factura vigente de mayor monto es **${top.serie}-${top.folio}** (${top.direccion === 'E' ? `emitida a **${top.nombre_receptor}**` : `recibida de **${top.nombre_emisor}**`}) por **${formatMoney(top.total_mxn, ocultarMontos)}**.`
          : 'No se localizaron facturas vigentes.',
        table: { exportName: `Mayores_Montos_${empresa.rfc}`, headers: ['Folio', 'Dir.', 'Fecha', 'Contraparte', 'Total MXN'], rows: sorted.map((c) => [`${c.serie}-${c.folio}`, c.direccion === 'E' ? 'Emitido' : 'Recibido', c.fecha_fiscal, c.direccion === 'E' ? c.nombre_receptor : c.nombre_emisor, formatMoney(c.total_mxn, ocultarMontos)]) },
        actions: top ? [{ label: `Abrir ${top.serie}-${top.folio}`, cfdiUuid: top.uuid }] : undefined,
      });
    }

    case 'usd_moneda': {
      const usdList = companyCfdis.filter((c) => c.moneda === 'USD');
      return makeReply({
        vistaConsultada: 'Comprobantes CFDI en dólares (USD)',
        text: `Se tienen registrados **${usdList.length} comprobante(s) en dólares (USD)** con equivalente acumulado de **${formatMoney(usdList.reduce((s, c) => s + c.total_mxn, 0), ocultarMontos)}**.`,
        table: { exportName: `USD_${empresa.rfc}`, headers: ['Folio', 'Dir.', 'Fecha', 'Contraparte', 'USD', 'T.C.', 'MXN'], rows: usdList.map((c) => [`${c.serie}-${c.folio}`, c.direccion === 'E' ? 'Emitido' : 'Recibido', c.fecha_fiscal, c.direccion === 'E' ? c.nombre_receptor : c.nombre_emisor, formatMoney(c.total, ocultarMontos, 'USD'), String(c.tipo_cambio), formatMoney(c.total_mxn, ocultarMontos)]) },
        actions: usdList[0] ? [{ label: `Abrir ${usdList[0].serie}-${usdList[0].folio}`, cfdiUuid: usdList[0].uuid }] : undefined,
      });
    }

    case 'efectivo_bancarizado': {
      const cashList = companyCfdis.filter((c) => c.direccion === 'R' && c.forma_pago === '01' && c.total_mxn > 2000);
      return makeReply({
        vistaConsultada: 'Art. 27 LISR · Efectivo > $2,000',
        text: `Identifiqué **${cashList.length} gasto(s) liquidados en efectivo (01) mayores a $2,000.00 MXN** (no deducibles conforme al Art. 27 fracc. III de la LISR):`,
        table: { exportName: `No_Bancarizados_${empresa.rfc}`, headers: ['Folio', 'Fecha', 'Proveedor', 'Forma', 'Total MXN'], rows: cashList.map((c) => [`${c.serie}-${c.folio}`, c.fecha_fiscal, c.nombre_emisor, CATALOGO_FORMA_PAGO[c.forma_pago] || c.forma_pago, formatMoney(c.total_mxn, ocultarMontos)]) },
        actions: [{ label: 'Revisar en Indicadores', route: 'indicadores' }],
      });
    }

    case 'nomina': {
      const nominas = companyCfdis.filter((c) => c.tipo === 'N' && c.estatus_sat === 'vigente');
      return makeReply({
        vistaConsultada: 'Recibos de Nómina 1.2',
        text: `Se registran **${nominas.length} recibo(s) de nómina vigentes** por un monto bruto de **${formatMoney(nominas.reduce((s, c) => s + c.subtotal, 0), ocultarMontos)}** e ISR retenido por **${formatMoney(nominas.reduce((s, c) => s + c.isr_retenido, 0), ocultarMontos)}**.${wantsLocation ? routeLocationSentence('nomina') : ''}`,
        table: { exportName: `Nominas_${empresa.rfc}`, headers: ['Folio', 'Fecha', 'Receptor', 'Bruto', 'ISR Retenido', 'Neto'], rows: nominas.slice(-8).map((c) => [`${c.serie}-${c.folio}`, c.fecha_fiscal, c.nombre_receptor, formatMoney(c.subtotal, ocultarMontos), formatMoney(c.isr_retenido, ocultarMontos), formatMoney(c.total, ocultarMontos)]) },
        actions: [{ label: 'Ver Nóminas en Emitidos', route: 'emitidos', preset: { tipo: 'N' } }],
      });
    }

    case 'notificaciones': {
      const notifs = state.notificaciones.filter((n) => n.empresa_id === empresa.id);
      const unread = notifs.filter((n) => !n.leida).length;
      return makeReply({
        vistaConsultada: 'Centro de notificaciones (Campana superior)',
        text: `El **Centro de notificaciones** está disponible en el ícono de **campana en la barra superior derecha**. Desde ahí puede filtrar entre *Todas*, *No leídas* y *Leídas*, configurar qué eventos desea recibir y abrir el CFDI vinculado en un clic.\n\nActualmente **${empresa.razon_social}** tiene **${unread} notificación(es) sin leer** de un total de **${notifs.length}**.`,
      });
    }

    case 'consumo': {
      const con = state.consumos.find((c) => c.empresa_id === empresa.id);
      return makeReply({
        vistaConsultada: 'Usos y consumos · #fiscal/consumo',
        text: `Consumo actual de **${empresa.razon_social}**: **${con?.cfdi_historicos ?? 0}** CFDIs históricos, **${con?.consultas_ia_mes ?? 0}/${con?.consultas_ia_limite ?? 500}** consultas mensuales a Asistente Tecno y **${con?.almacenamiento_mb ?? 0}/${con?.almacenamiento_limite_mb ?? 2048} MB** en almacenamiento.${wantsLocation ? routeLocationSentence('consumo') : ''}`,
        actions: [{ label: 'Ir a Usos y consumos', route: 'consumo' }],
      });
    }

    case 'resumen_ejecutivo':
    case 'dashboard': {
      if (wantsLocation && intent.primaryTopic === 'dashboard') {
        const d = findDirectoryForTopic('dashboard')!;
        return makeReply({
          vistaConsultada: `Guía de rutas · ${d.rutaHash}`,
          text: `Con gusto${saludoNombre}. El **${d.nombre}** se ubica en \`${d.rutaHash}\` (${d.menuUbicacion}). ${d.queEncuentra}`,
          actions: [{ label: 'Ir al Dashboard', route: 'dashboard' }],
        });
      }
      const iva = getIvaFlujoPeriodo(state, empresa.id, periodo);
      const isr = getIsrPeriodo(state, empresa.id, periodo);
      const inds = evaluateIndicadores(state, empresa, periodo).filter((r) => r.conteo_ejercicio > 0);
      const ppd = getPpdPendientesCobro(state, empresa.id);
      const ef = state.efirmas.find((e) => e.empresa_id === empresa.id);
      const opSat = state.documentos.find((d) => d.empresa_id === empresa.id && d.tipo === 'opinion_sat');
      const aspel = state.aspel_configs.find((a) => a.empresa_id === empresa.id);
      const enCanc = companyCfdis.filter((c) => c.estatus_sat === 'en_cancelacion').length;

      return makeReply({
        vistaConsultada: `Informe ejecutivo en vivo (${periodo})`,
        text: `Con gusto le presento el **informe ejecutivo** de **${empresa.razon_social}** al corte de **${periodoLabel}**${saludoNombre}:\n\n• **Impuestos del periodo:** ingresos cobrados por **${formatMoney(isr.totalIngresos, ocultarMontos)}**, deducciones autorizadas por **${formatMoney(isr.totalDeducciones, ocultarMontos)}** y **${iva.ivaACargo >= 0 ? 'IVA a cargo' : 'IVA a favor'} estimado de ${formatMoney(Math.abs(iva.ivaACargo), ocultarMontos)}**.\n• **Cumplimiento:** Opinión SAT **${opSat?.sentido?.toUpperCase() || 'SIN CARGAR'}**, e.firma vigente hasta **${ef ? formatShortDate(ef.vigencia_hasta) : 'sin cargar'}**, Aspel SAE **${aspel?.conectado ? 'en línea' : 'desconectado'}**.\n• **Pendientes:** **${ppd.length} factura(s) PPD por cobrar**, **${enCanc} CFDI(s) en cancelación** y **${inds.length} indicador(es) con incidencias**.`,
        table: {
          exportName: `Informe_Ejecutivo_${empresa.rfc}_${periodo}`,
          headers: ['Rubro', 'Situación actual'],
          rows: [
            ['Ingresos cobrados ISR', formatMoney(isr.totalIngresos, ocultarMontos)],
            ['Deducciones autorizadas ISR', formatMoney(isr.totalDeducciones, ocultarMontos)],
            [iva.ivaACargo >= 0 ? 'IVA Estimado a Cargo' : 'IVA Estimado a Favor', formatMoney(Math.abs(iva.ivaACargo), ocultarMontos)],
            ['PPD pendientes de cobro', `${ppd.length} (${formatMoney(ppd.reduce((s, p) => s + p.pendiente, 0), ocultarMontos)})`],
            ['En proceso de cancelación', `${enCanc} CFDI(s)`],
            ['Indicadores con incidencias', `${inds.length} regla(s)`],
            ['Opinión SAT 32-D', opSat?.sentido.toUpperCase() || 'Sin cargar'],
            ['Aspel SAE', aspel?.conectado ? 'Conectado' : 'Sin conexión'],
          ],
        },
        actions: [{ label: 'Abrir Dashboard', route: 'dashboard', preset: { periodo } }],
      });
    }

    case 'emitidos':
    case 'recibidos': {
      if (wantsLocation) {
        const d = findDirectoryForTopic(intent.primaryTopic)!;
        return makeReply({
          vistaConsultada: `Guía de rutas · ${d.rutaHash}`,
          text: `Con gusto${saludoNombre}. Puede consultar **${d.nombre}** en la ruta \`${d.rutaHash}\` (${d.menuUbicacion}). ${d.queEncuentra}`,
          actions: [{ label: `Ir a ${d.nombre}`, route: d.route }],
        });
      }
      break;
    }
  }

  // =========================================================================
  // 5. BÚSQUEDA DIFUSA INTELIGENTE POR RFC, CONTRAPARTE O CONCEPTO FACTURADO
  // =========================================================================
  const explicitRfcMatch = prompt.match(/\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/i);
  if (explicitRfcMatch && explicitRfcMatch[1].toUpperCase() !== empresa.rfc.toUpperCase()) {
    const targetRfc = explicitRfcMatch[1].toUpperCase();
    const hits = companyCfdis.filter(
      (c) => c.rfc_emisor.toUpperCase() === targetRfc || c.rfc_receptor.toUpperCase() === targetRfc,
    );
    if (hits.length > 0) {
      const totalSum = hits.filter((h) => h.estatus_sat === 'vigente').reduce((s, h) => s + h.total_mxn, 0);
      const cpName = hits[0].rfc_emisor === targetRfc ? hits[0].nombre_emisor : hits[0].nombre_receptor;
      return makeReply({
        vistaConsultada: `Comprobantes CFDI · RFC ${targetRfc}`,
        text: `Localicé **${hits.length} comprobante(s)** vinculados con **${cpName}** (\`${targetRfc}\`), por un monto vigente de **${formatMoney(totalSum, ocultarMontos)}**:`,
        table: { exportName: `CFDIs_${targetRfc}`, headers: ['Folio', 'Dir.', 'Fecha', 'Método', 'Total MXN', 'Estatus'], rows: hits.slice(0, 10).map((c) => [`${c.serie}-${c.folio}`, c.direccion === 'E' ? 'Emitido' : 'Recibido', c.fecha_fiscal, c.metodo_pago || '—', formatMoney(c.total_mxn, ocultarMontos), c.estatus_sat]) },
        actions: [{ label: `Abrir ${hits[0].serie}-${hits[0].folio}`, cfdiUuid: hits[0].uuid }],
      });
    }
  }

  // Búsqueda difusa en clientes, proveedores y conceptos (tolera "monterey", "pasifico", "inmoviliaria", "scada", "plc")
  const stopWords = new Set([
    'cuanto', 'cuantos', 'cuantas', 'cual', 'cuales', 'quien', 'quienes', 'como', 'donde', 'cuando',
    'factura', 'facturas', 'comprobante', 'comprobantes', 'ingreso', 'ingresos', 'gasto', 'gastos',
    'venta', 'ventas', 'vendimos', 'compra', 'compras', 'compramos', 'pagamos', 'cliente', 'clientes',
    'proveedor', 'proveedores', 'empresa', 'meses', 'todos', 'todas', 'dame', 'muestra', 'busca',
    'tiene', 'tengo', 'tenemos', 'este', 'esta', 'para', 'sobre', 'contra', 'entre', 'desde', 'hasta',
    'pasado', 'actual', 'ultimo', 'anos', 'ano', 'mes', 'del', 'los', 'las', 'que', 'por', 'con',
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ]);
  const entityTerms = intent.tokens.filter(
    (w) => w.length >= 3 && !stopWords.has(w) && !basicNormalize(empresa.razon_social).includes(w),
  );

  if (entityTerms.length > 0 && !qNorm.includes('por mes') && !qNorm.includes('del ano')) {
    const conceptosByUuid = new Map<string, string>();
    for (const con of state.conceptos) {
      conceptosByUuid.set(con.uuid, `${conceptosByUuid.get(con.uuid) || ''} ${con.descripcion}`);
    }

    const scopedCfdis = explicitMonth
      ? companyCfdis.filter((c) => c.fecha_fiscal.startsWith(periodo))
      : companyCfdis;

    const fuzzyHits = scopedCfdis.filter((c) => {
      const candidateWords = basicNormalize(
        `${c.nombre_emisor} ${c.nombre_receptor} ${c.rfc_emisor} ${c.rfc_receptor} ${conceptosByUuid.get(c.uuid) || ''}`,
      ).split(' ');
      return entityTerms.some((term) => candidateWords.some((cw) => cw.length >= 3 && fuzzyWordMatch(term, cw)));
    });

    if (fuzzyHits.length > 0) {
      const sumVig = fuzzyHits.filter((c) => c.estatus_sat === 'vigente').reduce((s, c) => s + c.total_mxn, 0);
      const topLines = fuzzyHits
        .slice(0, 3)
        .map((c) => {
          const cp = c.direccion === 'E' ? c.nombre_receptor : c.nombre_emisor;
          return `• **${c.serie}-${c.folio}** (${c.direccion === 'E' ? 'emitido a' : 'recibido de'} **${cp}**, ${formatShortDate(c.fecha_fiscal)}): **${formatMoney(c.total_mxn, ocultarMontos)}** [${c.estatus_sat.toUpperCase()}].`;
        })
        .join('\n');
      const primaryCp =
        fuzzyHits[0].direccion === 'E' ? fuzzyHits[0].nombre_receptor : fuzzyHits[0].nombre_emisor;
      return makeReply({
        vistaConsultada: `Búsqueda inteligente en CFDI y conceptos${explicitMonth ? ` (${periodo})` : ''}`,
        interpretationNote: intent.wasTypoCorrected
          ? `Interpreté su búsqueda de comprobantes vinculados con **${primaryCp}**${explicitMonth ? ` en **${periodoLabel}**` : ''}`
          : undefined,
        text: `Con gusto${saludoNombre}. Localicé **${fuzzyHits.length} comprobante(s)** relacionados con su búsqueda${explicitMonth ? ` en **${periodoLabel}**` : ''} por un total vigente de **${formatMoney(sumVig, ocultarMontos)}**:\n\n${topLines}`,
        table: {
          exportName: `Busqueda_${empresa.rfc}`,
          headers: ['Folio', 'Dir.', 'Fecha', 'Contraparte', 'Total MXN', 'Estatus'],
          rows: fuzzyHits.slice(0, 10).map((c) => [`${c.serie}-${c.folio}`, c.direccion === 'E' ? 'Emitido' : 'Recibido', c.fecha_fiscal, c.direccion === 'E' ? c.nombre_receptor : c.nombre_emisor, formatMoney(c.total_mxn, ocultarMontos), c.estatus_sat]),
        },
        actions: [{ label: `Abrir ${fuzzyHits[0].serie}-${fuzzyHits[0].folio}`, cfdiUuid: fuzzyHits[0].uuid }],
      });
    }
  }

  // =========================================================================
  // 6. INGRESOS / GASTOS DEL MES O DEL EJERCICIO
  // =========================================================================
  if (intent.primaryTopic === 'ingresos_gastos' || intent.primaryTopic === 'emitidos' || intent.primaryTopic === 'recibidos') {
    const resumen = getResumenMensual(state, empresa.id, year).filter((r) => r.ingresos > 0 || r.gastos > 0);
    if (explicitMonth && !qNorm.includes('por mes') && !qNorm.includes('ano')) {
      const mRow = getResumenMensual(state, empresa.id, year).find((r) => r.periodo === periodo);
      const mesCfdis = companyCfdis.filter((c) => c.fecha_fiscal.startsWith(periodo));
      if (mRow) {
        return makeReply({
          vistaConsultada: `Resumen mensual (${periodo})`,
          text: `Durante **${periodoLabel}**, **${empresa.razon_social}** registró **${mesCfdis.filter((c) => c.direccion === 'E').length} CFDIs emitidos** y **${mesCfdis.filter((c) => c.direccion === 'R').length} recibidos**, con ingresos netos devengados de **${formatMoney(mRow.ingresosNetos, ocultarMontos)}** y gastos por **${formatMoney(mRow.gastos, ocultarMontos)}** (margen bruto: **${formatMoney(mRow.ingresosNetos - mRow.gastos, ocultarMontos)}**).`,
          table: {
            exportName: `Resumen_${empresa.rfc}_${periodo}`,
            headers: ['Concepto', 'Importe MXN'],
            rows: [
              ['Ingresos brutos', formatMoney(mRow.ingresos, ocultarMontos)],
              ['Descuentos y notas de crédito', formatMoney(-mRow.descuentos, ocultarMontos)],
              ['Ingresos nominales netos', formatMoney(mRow.ingresosNetos, ocultarMontos)],
              ['Gastos', formatMoney(mRow.gastos, ocultarMontos)],
              ['Margen operativo bruto', formatMoney(mRow.ingresosNetos - mRow.gastos, ocultarMontos)],
            ],
          },
          actions: [{ label: `Ver ${periodoLabel} en Dashboard`, route: 'dashboard', preset: { periodo } }],
        });
      }
    }

    const totalIng = resumen.reduce((s, r) => s + r.ingresosNetos, 0);
    const totalGto = resumen.reduce((s, r) => s + r.gastos, 0);
    const mejorMes = [...resumen].sort((a, b) => b.ingresosNetos - a.ingresosNetos)[0];

    return makeReply(
      {
        vistaConsultada: `Resumen anual (${year})`,
        text: `En el ejercicio **${year}**, **${empresa.razon_social}** acumula ingresos netos devengados por **${formatMoney(totalIng, ocultarMontos)}** y gastos por **${formatMoney(totalGto, ocultarMontos)}** (margen bruto de **${formatMoney(totalIng - totalGto, ocultarMontos)}**).${mejorMes ? ` El mes de mayor facturación ha sido **${mejorMes.mesCorto} ${year}** con **${formatMoney(mejorMes.ingresosNetos, ocultarMontos)}**.` : ''}`,
        chart: {
          title: `Ingresos netos vs Gastos · ${year} (MXN)`,
          series1Label: 'Ingresos netos',
          series2Label: 'Gastos',
          data: resumen.map((r) => ({ label: r.mesCorto, valor: r.ingresosNetos, valor2: r.gastos })),
        },
        table: {
          exportName: `Ingresos_vs_Gastos_${empresa.rfc}_${year}`,
          headers: ['Mes', 'Ingresos netos', 'Gastos', 'Margen'],
          rows: resumen.map((r) => [r.mesCorto, formatMoney(r.ingresosNetos, ocultarMontos), formatMoney(r.gastos, ocultarMontos), formatMoney(r.ingresosNetos - r.gastos, ocultarMontos)]),
        },
        actions: [{ label: 'Abrir Dashboard', route: 'dashboard' }],
      },
      { lastYear: year, lastTopic: 'ingresos' },
    );
  }

  // =========================================================================
  // 7. CLARIFICACIÓN FORMAL SI QUEDA AMBIGUO
  // =========================================================================
  return makeReply({
    vistaConsultada: 'Asistente Tecno · Clarificación',
    text: `Disculpe${saludoNombre}, no logré determinar con certeza qué información específica de **${empresa.razon_social}** requiere consultar. Con todo gusto le apoyo si me indica si busca:\n\n• Una **cifra o análisis en vivo** (IVA, ISR, cartera PPD, clientes o proveedores).\n• La **ruta o guía paso a paso** para realizar una tarea dentro de los 17 apartados del portal.\n• La revisión de una **factura específica** por folio (ej. \`FAC-1202\`), UUID o RFC.`,
    followUps: [
      'Guía paso a paso para usar el portal',
      '¿Qué asuntos fiscales requieren atención urgente?',
      'Muéstrame todas las rutas del portal',
    ],
  });
}
