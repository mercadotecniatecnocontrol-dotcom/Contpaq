// Motor NLU (Comprensión de Lenguaje Natural) y Razonamiento Lógico en Español
// Tolerante a errores de ortografía, abreviaturas de chat mexicano y distintas formas de plantear preguntas.

export type LogicalGoal =
  | 'locate'       // Quiere saber en qué ruta/apartado está algo
  | 'how_to'       // Quiere instrucciones paso a paso para usar el portal o resolver un trámite
  | 'analyze_data' // Quiere cifras, totales, tablas o búsqueda puntual
  | 'explain_rule' // Quiere entender una regla del SAT o el motivo de un cálculo
  | 'diagnose';    // Quiere detectar errores, riesgos, pendientes o diferencias

export type SemanticTopic =
  | 'onboarding_guide'
  | 'portal_scope'
  | 'portal_all_routes'
  | 'create_indicator'
  | 'compare_months'
  | 'urgent_priorities'
  | 'non_deductible'
  | 'iva'
  | 'isr'
  | 'impuestos_conjuntos'
  | 'resumen_ejecutivo'
  | 'ppd_pendientes'
  | 'ppd_rep_workflow'
  | 'cancelaciones'
  | 'visor_sat'
  | 'aspel_sae'
  | 'efirma'
  | 'documentos_fiscales'
  | 'efos_69b'
  | 'indicadores'
  | 'usuarios_roles'
  | 'empresas_rfc'
  | 'sincronizacion_zip'
  | 'descarga_historica'
  | 'sincronizacion_error'
  | 'ocultar_montos'
  | 'notificaciones'
  | 'consumo'
  | 'top_clientes'
  | 'top_proveedores'
  | 'factura_mayor'
  | 'usd_moneda'
  | 'efectivo_bancarizado'
  | 'nomina'
  | 'ingresos_gastos'
  | 'emitidos'
  | 'recibidos'
  | 'dashboard'
  | 'unknown';

export interface AnalyzedIntent {
  raw: string;
  normalized: string;
  correctedWords: string[];
  tokens: string[];
  goals: Set<LogicalGoal>;
  primaryTopic: SemanticTopic;
  secondaryTopic?: SemanticTopic;
  topicScore: number;
  months: Array<{ mm: string; label: string }>;
  year?: string;
  isOffTopic: boolean;
  wasTypoCorrected: boolean;
  interpretationNote?: string;
}

// Abreviaturas y modismos frecuentes en español de México
const CHAT_SHORTHAND: Record<string, string> = {
  q: 'que',
  k: 'que',
  ke: 'que',
  xq: 'porque',
  pq: 'porque',
  xk: 'porque',
  porq: 'porque',
  porqe: 'porque',
  porke: 'porque',
  pa: 'para',
  pal: 'para',
  d: 'de',
  del: 'del',
  onde: 'donde',
  adonde: 'donde',
  komo: 'como',
  kmo: 'como',
  cmo: 'como',
  kiero: 'quiero',
  qiero: 'quiero',
  ocupo: 'necesito',
  nesecito: 'necesito',
  nesesito: 'necesito',
  necesito: 'necesito',
  checar: 'revisar',
  chekar: 'revisar',
  checo: 'reviso',
  beo: 'veo',
  ber: 'ver',
  bajar: 'descargar',
  vajar: 'descargar',
  subir: 'cargar',
  suvir: 'cargar',
  suvo: 'cargar',
  subo: 'cargar',
  suvi: 'subi',
  archibo: 'archivo',
  archibos: 'archivos',
  dokumento: 'documento',
  dokumentos: 'documentos',
  exel: 'excel',
  ekcel: 'excel',
  resumeme: 'resume',
  dise: 'dice',
  kompara: 'compara',
  buska: 'busca',
  korreo: 'correo',
  korreos: 'correos',
  cancelasion: 'cancelacion',
  kanselasion: 'cancelacion',
  kanselar: 'cancelar',
  meter: 'agregar',
  anadir: 'agregar',
  tmb: 'tambien',
  tb: 'tambien',
  ps: 'pues',
  ola: 'hola',
  wenas: 'buenas',
  buen: 'buen',
  bn: 'bien',
  info: 'informacion',
  fatura: 'factura',
  faturas: 'facturas',
  factra: 'factura',
  factras: 'facturas',
  fact: 'factura',
  facts: 'facturas',
  cfdis: 'cfdi',
  iba: 'iva',
  sip: 'zip',
  el: 'el',
  anios: 'anos',
  anio: 'ano',
  ase: 'hace',
  ago: 'hago',
  aser: 'hacer',
  ay: 'hay',
  ai: 'hay',
  ahi: 'ahi',
  toka: 'toca',
  deven: 'deben',
  deve: 'debe',
  debe: 'debe',
  devo: 'debo',
  plata: 'dinero',
  lana: 'dinero',
  feria: 'dinero',
  kosta: 'cuesta',
  kuanto: 'cuanto',
  kual: 'cual',
  kien: 'quien',
  kienes: 'quienes',
  kliente: 'cliente',
  klientes: 'clientes',
  probedor: 'proveedor',
  probedores: 'proveedores',
  provedor: 'proveedor',
  provedores: 'proveedores',
  probedora: 'proveedor',
  todabia: 'todavia',
  balen: 'valen',
  bale: 'vale',
  sirve: 'sirve',
  sirbe: 'sirve',
  escondo: 'oculto',
  esconder: 'ocultar',
  eskoner: 'ocultar',
  tapar: 'ocultar',
  boi: 'voy',
  boy: 'voy',
  eror: 'error',
  fallo: 'error',
  trono: 'error',
  cuadra: 'cuadra',
  kuadra: 'cuadra',
  cuadran: 'cuadran',
  kuadran: 'cuadran',
  renobar: 'renovar',
  renobarla: 'renovar',
  elektronika: 'electronica',
  electronika: 'electronica',
  firma: 'efirma',
  polisa: 'poliza',
  polisas: 'polizas',
  dolares: 'dolar',
  dolarez: 'dolar',
  efectibo: 'efectivo',
  efektivo: 'efectivo',
  nomina: 'nomina',
  nominas: 'nomina',
  reseta: 'receta',
  takos: 'tacos',
  futvol: 'futbol',
  klima: 'clima',
  chistes: 'chiste',
  peli: 'pelicula',
  pelis: 'pelicula',
};

export function basicNormalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿?¡!,;:()"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Clave fonética española: unifica confusiones típicas (b/v, s/c/z, k/q/c, h muda, ll/y, g/j)
export function spanishPhoneticKey(word: string): string {
  return basicNormalize(word)
    .replace(/^h+/, '')
    .replace(/([a-z])h/g, '$1')
    .replace(/v/g, 'b')
    .replace(/z/g, 's')
    .replace(/c(?=[ei])/g, 's')
    .replace(/qu(?=[ei])/g, 'k')
    .replace(/c(?=[aou])/g, 'k')
    .replace(/q/g, 'k')
    .replace(/ll/g, 'y')
    .replace(/g(?=[ei])/g, 'j')
    .replace(/([a-z])\1+/g, '$1');
}

// Distancia Damerau-Levenshtein (captura transposiciones como "fcatura" y faltas de letra como "otubre")
export function damerauLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 3) return 99;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[m][n];
}

export function fuzzyWordMatch(token: string, target: string): boolean {
  if (!token || !target) return false;
  if (token === target) return true;
  if (
    token.length >= 4 &&
    target.length >= 4 &&
    Math.abs(token.length - target.length) <= 2 &&
    (token.endsWith('s') || target.endsWith('s')) &&
    (token.startsWith(target) || target.startsWith(token))
  ) {
    return true;
  }

  const pkToken = spanishPhoneticKey(token);
  const pkTarget = spanishPhoneticKey(target);
  if (pkToken === pkTarget && pkToken.length >= 3) return true;

  const minLen = Math.min(pkToken.length, pkTarget.length);
  if (minLen < 4) return false;
  const maxDist = minLen >= 7 ? 2 : 1;
  return damerauLevenshtein(pkToken, pkTarget) <= maxDist;
}

// Vocabulario canónico para corregir palabras mal escritas antes del análisis
const CANONICAL_VOCAB = [
  'factura', 'facturas', 'comprobante', 'comprobantes', 'emitidos', 'recibidos',
  'ingresos', 'gastos', 'egresos', 'deducciones', 'deducible', 'deducibles', 'impuestos',
  'cliente', 'clientes', 'proveedor', 'proveedores', 'empresa', 'empresas',
  'conciliacion', 'visor', 'diferencia', 'diferencias', 'sincronizacion', 'sincronizar',
  'descarga', 'descargar', 'historico', 'historica', 'constancia', 'opinion', 'cumplimiento',
  'indicador', 'indicadores', 'incidencia', 'incidencias', 'sustitucion', 'cancelado',
  'cancelacion', 'pendiente', 'pendientes', 'parcialidad', 'efectivo', 'bancarizado',
  'efirma', 'certificado', 'vigencia', 'vencimiento', 'renovar', 'usuarios', 'invitar',
  'permisos', 'vinculaciones', 'poliza', 'polizas', 'contabilidad', 'bitacora',
  'consumo', 'almacenamiento', 'notificaciones', 'campana', 'asistente', 'dashboard',
  'tablero', 'ocultar', 'montos', 'pantalla', 'compartir', 'timbrar', 'nomina', 'traslado',
  'dolar', 'dolares', 'moneda', 'comparar', 'contra', 'urgente', 'prioridad', 'resumen',
  'donde', 'encuentro', 'apartado', 'seccion', 'ruta', 'rutas', 'portal', 'pagina', 'guia',
  'archivo', 'archivos', 'documento', 'documentos', 'adjunto', 'adjuntos', 'excel', 'columna', 'columnas',
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function correctTokens(rawNorm: string): { tokens: string[]; wasCorrected: boolean } {
  const rawTokens = rawNorm.split(' ').filter(Boolean);
  let wasCorrected = false;

  const corrected = rawTokens.map((tok) => {
    // No tocar números, UUIDs, RFCs ni códigos cortos como s01, 69-b, 32-d
    if (/^\d+$/.test(tok) || /^[a-z]{3,4}\d{6}[a-z0-9]{3}$/i.test(tok) || /^(s01|69-?b|32-?d|pue|ppd|rep|sat|iva|isr|rfc|xml|zip|pdf|usd|mxn|add|sae|csf|csd|fiel|imss)$/.test(tok)) {
      return tok;
    }

    if (CHAT_SHORTHAND[tok]) {
      const mapped = CHAT_SHORTHAND[tok];
      if (mapped !== tok) wasCorrected = true;
      return mapped;
    }

    if (tok.length >= 4) {
      // Buscar coincidencia fonética exacta o Levenshtein cercana en vocabulario fiscal
      let best: string | null = null;
      let bestDist = 99;
      const pkTok = spanishPhoneticKey(tok);

      for (const vocab of CANONICAL_VOCAB) {
        if (tok === vocab) {
          best = vocab;
          bestDist = 0;
          break;
        }
        const pkVoc = spanishPhoneticKey(vocab);
        if (pkTok === pkVoc && pkTok.length >= 4) {
          best = vocab;
          bestDist = 0;
          break;
        }
        const d = damerauLevenshtein(pkTok, pkVoc);
        const limit = Math.min(pkTok.length, pkVoc.length) >= 7 ? 2 : 1;
        if (d <= limit && d < bestDist) {
          bestDist = d;
          best = vocab;
        }
      }

      if (best && best !== tok) {
        wasCorrected = true;
        return best;
      }
    }

    return tok;
  });

  return { tokens: corrected, wasCorrected };
}

const MONTH_CANONICAL: Array<{ aliases: string[]; mm: string; label: string }> = [
  { aliases: ['enero', 'ene'], mm: '01', label: 'enero' },
  { aliases: ['febrero', 'feb'], mm: '02', label: 'febrero' },
  { aliases: ['marzo', 'mar'], mm: '03', label: 'marzo' },
  { aliases: ['abril', 'abr'], mm: '04', label: 'abril' },
  { aliases: ['mayo', 'may'], mm: '05', label: 'mayo' },
  { aliases: ['junio', 'jun'], mm: '06', label: 'junio' },
  { aliases: ['julio', 'jul'], mm: '07', label: 'julio' },
  { aliases: ['agosto', 'ago'], mm: '08', label: 'agosto' },
  { aliases: ['septiembre', 'setiembre', 'sep'], mm: '09', label: 'septiembre' },
  { aliases: ['octubre', 'oct'], mm: '10', label: 'octubre' },
  { aliases: ['noviembre', 'nov'], mm: '11', label: 'noviembre' },
  { aliases: ['diciembre', 'dic'], mm: '12', label: 'diciembre' },
];

interface TopicRule {
  topic: SemanticTopic;
  label: string;
  phrases: string[]; // Coincidencias conceptuales fuertes (+5)
  words: string[];   // Palabras clave tolerantes a ortografía (+2)
}

const TOPIC_RULES: TopicRule[] = [
  {
    topic: 'onboarding_guide',
    label: 'guía paso a paso del portal',
    phrases: ['como uso esta pagina', 'como se usa', 'soy nuevo', 'guia para usar', 'como empezar', 'tutorial', 'como funciona el portal', 'paso a paso del portal', 'enseñame a usar', 'ensenar a usar'],
    words: ['tutorial', 'manual', 'empezar', 'arrancar', 'principiante'],
  },
  {
    topic: 'portal_scope',
    label: 'alcance del módulo (emisión / timbrado)',
    phrases: ['puedo timbrar', 'puedo facturar', 'puedo hacer facturas', 'puedo emitir facturas', 'hacer una factura', 'generar facturas', 'timbrar cfdi', 'llevar contabilidad electronica', 'facturar aqui', 'crear factura'],
    words: ['timbrar', 'timbrado'],
  },
  {
    topic: 'portal_all_routes',
    label: 'directorio completo de rutas',
    phrases: ['todas las rutas', 'mapa del portal', 'lista de rutas', 'que secciones tiene', 'que apartados tiene', 'menu del portal', 'todas las pantallas'],
    words: [],
  },
  {
    topic: 'create_indicator',
    label: 'creación de indicador personalizado con IA',
    phrases: ['crear indicador', 'nuevo indicador', 'haz un indicador', 'regla para detectar'],
    words: [],
  },
  {
    topic: 'ocultar_montos',
    label: 'privacidad y ocultamiento de montos',
    phrases: ['compartir pantalla', 'ocultar montos', 'ocultar numeros', 'ocultar cifras', 'ocultar cantidades', 'no se vean los numeros', 'no se vean los montos', 'tapar numeros', 'icono de ojo', 'boton de ojo'],
    words: ['ocultar', 'privacidad', 'ojo', 'asteriscos'],
  },
  {
    topic: 'descarga_historica',
    label: 'descarga histórica de ejercicios anteriores',
    phrases: ['descarga historica', 'anos anteriores', 'hace 2 anos', 'hace 3 anos', 'hace 4 anos', 'hace 5 anos', 'ejercicios pasados', 'xml viejos', 'facturas de otros anos', 'bajar de otros anos'],
    words: ['historico', 'historica'],
  },
  {
    topic: 'sincronizacion_error',
    label: 'solución a errores en descargas SAT',
    phrases: ['error en la descarga', 'fallo la descarga', 'no descargo', 'problema con la descarga', 'codigo 5004', 'reintentar descarga'],
    words: ['reintentar'],
  },
  {
    topic: 'sincronizacion_zip',
    label: 'carga manual de XML / ZIP y sincronización',
    phrases: ['cargar xml', 'subir xml', 'cargar zip', 'subir zip', 'paquete zip', 'empresa limpia', 'borrar demo', 'vaciar demo', 'quitar datos de prueba', 'sincronizar con el sat'],
    words: ['sincronizacion', 'sincronizar', 'zip', 'descarga', 'descargar'],
  },
  {
    topic: 'ppd_rep_workflow',
    label: 'procedimiento de cobro PPD y complemento REP 2.0',
    phrases: ['ya nos transfiere', 'ya nos pago', 'fue ppd que hago', 'es ppd que tengo que hacer', 'cuando se hace el rep', 'complemento de pago que hago', 'como se maneja ppd'],
    words: [],
  },
  {
    topic: 'non_deductible',
    label: 'auditoría de gastos no deducibles',
    phrases: ['no son deducibles', 'no deducible', 'no deducibles', 'no me valen para isr', 'no valen para isr', 'gastos rechazados', 'que no puedo deducir', 'que gastos se excluyen', 'por que se excluye'],
    words: [],
  },
  {
    topic: 'urgent_priorities',
    label: 'prioridades y alertas fiscales urgentes',
    phrases: ['atender primero', 'requieren atencion', 'mas urgente', 'que urge', 'estamos bien', 'hay algun problema', 'problemas fiscales', 'que me recomiendas revisar', 'alertas criticas'],
    words: ['urgente', 'prioridad', 'critico', 'criticos'],
  },
  {
    topic: 'efos_69b',
    label: 'proveedores en lista 69-B (EFOS)',
    phrases: ['lista negra', 'operaciones simuladas', 'facturas falsas', '69-b', '69b', 'articulo 69', 'no desvirtuados'],
    words: ['efos', '69-b', '69b'],
  },
  {
    topic: 'visor_sat',
    label: 'conciliación contra el SAT (Visor SAT)',
    phrases: ['no me cuadra', 'no cuadran', 'cuadrar contra el sat', 'comparar contra el sat', 'visor sat', 'conciliacion sat', 'fecha de corte', 'faltan xml', 'diferencia contra el sat'],
    words: ['visor', 'conciliacion', 'conciliar', 'cuadra', 'cuadran', 'diferencia', 'diferencias'],
  },
  {
    topic: 'documentos_fiscales',
    label: 'constancia fiscal y opinión de cumplimiento (SAT / IMSS)',
    phrases: ['estamos bien con el sat', 'al corriente con el sat', 'documento que dice si estamos bien', 'opinion de cumplimiento', 'constancia de situacion', 'situacion fiscal', 'datos fiscales', 'opinion positiva', 'opinion negativa', '32-d', 'opinion imss'],
    words: ['constancia', 'csf', 'opinion', 'cumplimiento', 'imss', '32-d'],
  },
  {
    topic: 'efirma',
    label: 'administración y vigencia de la e.firma (FIEL)',
    phrases: ['firma electronica', 'e firma', 'e.firma', 'renovar la firma', 'cuando vence la firma', 'archivo cer', 'archivo key', 'diferencia entre fiel y csd', 'sello digital'],
    words: ['efirma', 'fiel', 'csd', 'certificado', 'renovar', 'vigencia', 'vencimiento'],
  },
  {
    topic: 'usuarios_roles',
    label: 'usuarios, invitaciones y roles de acceso',
    phrases: ['meter a otra persona', 'agregar a alguien', 'dar acceso a', 'que solo vea', 'solo lectura', 'invitar usuario', 'cambiar rol', 'que puede hacer cada rol', 'quien tiene acceso'],
    words: ['usuarios', 'usuario', 'invitar', 'invitacion', 'roles', 'rol', 'permisos', 'permiso'],
  },
  {
    topic: 'empresas_rfc',
    label: 'selector y alta de empresas (RFC)',
    phrases: ['otra empresa', 'nueva empresa', 'agregar rfc', 'cambiar de empresa', 'varias empresas', 'dar de alta empresa', 'lista de empresas'],
    words: ['empresas', 'rfc'],
  },
  {
    topic: 'aspel_sae',
    label: 'integración contable con Aspel SAE y pólizas',
    phrases: ['aspel sae', 'faltan de poliza', 'sin poliza', 'estado contable', 'conexion con aspel', 'add y bitacora', 'sistema contable'],
    words: ['aspel', 'sae', 'poliza', 'polizas', 'vinculaciones', 'vinculacion', 'add', 'contabilidad'],
  },
  {
    topic: 'iva',
    label: 'pre-determinación de IVA en flujo',
    phrases: ['iva a cargo', 'iva a favor', 'iva trasladado', 'iva acreditable', 'iva en flujo', 'excluir del iva', 'cuanto de iva', 'lo del iva'],
    words: ['iva'],
  },
  {
    topic: 'isr',
    label: 'pre-determinación de ISR cobrado y deducciones',
    phrases: ['impuesto isr', 'deducciones isr', 'ingresos cobrados', 'base de isr', 'excluir de isr', 'cuanto de isr'],
    words: ['isr', 'deducciones', 'deduccion', 'deducible', 'deducibles'],
  },
  {
    topic: 'impuestos_conjuntos',
    label: 'estimación general de impuestos (IVA + ISR)',
    phrases: ['cuanto debo pagar de impuestos', 'cuanto toca pagar', 'cuanto voy a pagar', 'pago de impuestos', 'impuestos del mes'],
    words: ['impuestos', 'impuesto'],
  },
  {
    topic: 'ppd_pendientes',
    label: 'facturas PPD pendientes de cobro',
    phrases: ['quien nos debe', 'quien me debe', 'nos deben', 'falta por cobrar', 'pendientes de cobro', 'no han pagado', 'no ha pagado', 'saldo insoluto', 'cuentas por cobrar'],
    words: ['ppd', 'cobro', 'cobrar', 'deben', 'debe', 'cartera', 'insoluto'],
  },
  {
    topic: 'cancelaciones',
    label: 'CFDIs cancelados y en proceso de cancelación',
    phrases: ['en proceso de cancelacion', 'por cancelar', 'facturas canceladas', 'solicitud de cancelacion', 'correo de cancelacion', 'cancelacion de factura', 'cancelar factura', 'aceptar cancelacion', 'rechazar cancelacion', '72 horas', '3 dias habiles'],
    words: ['cancelado', 'cancelados', 'canceladas', 'cancelacion', 'cancelar'],
  },
  {
    topic: 'indicadores',
    label: 'indicadores de consistencia y riesgo fiscal',
    phrases: ['indicadores de riesgo', 'reglas del sat', 'sustitucion ambos vigentes', 'pagos fuera de periodo', 'parcialidad repetida', 'forma 99', 'uso s01'],
    words: ['indicador', 'indicadores', 'riesgo', 'riesgos', 'incidencia', 'incidencias', 's01', 'sustitucion'],
  },
  {
    topic: 'top_clientes',
    label: 'ranking de principales clientes',
    phrases: ['mejores clientes', 'mejor cliente', 'principales clientes', 'top clientes', 'a quien le vendemos mas', 'a quien le facturamos mas'],
    words: [],
  },
  {
    topic: 'top_proveedores',
    label: 'ranking de principales proveedores',
    phrases: ['principales proveedores', 'top proveedores', 'a quien le compramos mas', 'a quien le gastamos mas', 'mayor proveedor'],
    words: [],
  },
  {
    topic: 'factura_mayor',
    label: 'comprobantes de mayor monto',
    phrases: ['factura mas alta', 'factura mas grande', 'mayor monto', 'mas cara', 'mas elevada'],
    words: [],
  },
  {
    topic: 'usd_moneda',
    label: 'operaciones en dólares (USD)',
    phrases: ['moneda extranjera', 'en dolares', 'en usd', 'tipo de cambio'],
    words: ['dolar', 'dolares', 'usd'],
  },
  {
    topic: 'efectivo_bancarizado',
    label: 'gastos en efectivo no bancarizados (> $2,000)',
    phrases: ['pagados en efectivo', 'en efectivo', 'no bancarizado', 'mas de 2000', 'mayores a 2000'],
    words: ['efectivo', 'bancarizado'],
  },
  {
    topic: 'nomina',
    label: 'recibos de nómina timbrados',
    phrases: ['pago de nomina', 'recibos de nomina', 'cuanto de nomina', 'sueldos y salarios'],
    words: ['nomina', 'nominas'],
  },
  {
    topic: 'consumo',
    label: 'usos, consumos y límites del módulo',
    phrases: ['usos y consumos', 'cuantas consultas', 'limite de cfdi', 'espacio usado', 'cuanto almacenamiento'],
    words: ['consumo', 'consumos', 'almacenamiento', 'storage', 'limite', 'cuota'],
  },
  {
    topic: 'notificaciones',
    label: 'centro de notificaciones y alertas',
    phrases: ['centro de notificaciones', 'campana de alertas', 'avisos sin leer', 'configurar notificaciones'],
    words: ['notificaciones', 'notificacion', 'campana', 'avisos'],
  },
  {
    topic: 'resumen_ejecutivo',
    label: 'resumen ejecutivo integral de la empresa',
    phrases: ['resumen ejecutivo', 'resumen general', 'como vamos', 'estado de la empresa', 'panorama general', 'reporte completo', 'diagnostico general'],
    words: ['panorama'],
  },
  {
    topic: 'emitidos',
    label: 'CFDIs emitidos a clientes',
    phrases: ['cfdi emitidos', 'facturas emitidas', 'facturas que emitimos', 'facturas de clientes'],
    words: ['emitidos'],
  },
  {
    topic: 'recibidos',
    label: 'CFDIs recibidos de proveedores',
    phrases: ['cfdi recibidos', 'facturas recibidas', 'facturas de proveedores'],
    words: ['recibidos'],
  },
  {
    topic: 'dashboard',
    label: 'Dashboard Fiscal y gráfica anual',
    phrases: ['grafica mensual', 'ingresos nominales', 'tablero fiscal', 'pantalla principal'],
    words: ['dashboard', 'tablero'],
  },
  {
    topic: 'ingresos_gastos',
    label: 'ingresos, gastos y facturación',
    phrases: ['ingresos del ano', 'ingresos por mes', 'gastos por mes', 'cuanto vendimos', 'cuanto facturamos', 'cuanto gastamos'],
    words: ['ingresos', 'gastos', 'ventas', 'facturas', 'factura', 'egresos'],
  },
];

const PHRASE_STOPWORDS = new Set([
  'una', 'uno', 'unos', 'unas', 'los', 'las', 'del', 'que', 'con', 'por', 'para',
  'como', 'este', 'esta', 'aqui', 'mas', 'nos', 'mis', 'sus', 'hay', 'son', 'fue',
  'eso', 'esa', 'ese', 'pero', 'muy', 'bien', 'mal', 'todo', 'toda', 'todos',
]);

const CANONICAL_SET = new Set(CANONICAL_VOCAB);

const OFF_TOPIC_PHONETIC = [
  'receta', 'cocina', 'tacos', 'futbol', 'mundial', 'chiste', 'poema', 'cancion',
  'pelicula', 'serie', 'netflix', 'clima', 'temperatura', 'horoscopo', 'politica', 'presidente',
  'traduce', 'ingles', 'python', 'javascript', 'minecraft', 'videojuego', 'vacaciones',
  'dieta', 'gimnasio', 'novia', 'amor', 'chisme', 'musica',
];

function isOffTopicWordMatch(token: string, offWord: string): boolean {
  if (CANONICAL_SET.has(token)) return false;
  if (token === offWord) return true;
  const pkToken = spanishPhoneticKey(token);
  const pkOff = spanishPhoneticKey(offWord);
  if (pkToken === pkOff && pkToken.length >= 4) return true;
  if (Math.min(pkToken.length, pkOff.length) >= 5 && damerauLevenshtein(pkToken, pkOff) <= 1) {
    return true;
  }
  return false;
}

export function analyzeUserIntent(rawPrompt: string, hasAttachment = false): AnalyzedIntent {
  const rawNorm = basicNormalize(rawPrompt);
  const { tokens, wasCorrected } = correctTokens(rawNorm);
  const normalized = tokens.join(' ');

  // 1. Detectar meses (tolerante a ortografía ya corregida) y año
  const months: Array<{ mm: string; label: string }> = [];
  for (const tok of tokens) {
    for (const m of MONTH_CANONICAL) {
      if (m.aliases.includes(tok) && !months.some((x) => x.mm === m.mm)) {
        months.push({ mm: m.mm, label: m.label });
      }
    }
  }
  const yearMatch = normalized.match(/\b(202[0-9])\b/);
  const year = yearMatch ? yearMatch[1] : undefined;

  // 2. Detectar metas lógicas (Goals)
  const goals = new Set<LogicalGoal>();
  if (
    /\b(donde|ruta|rutas|apartado|seccion|pantalla|menu|ubicacion|no encuentro|como llego|como entro|como accedo)\b/.test(normalized)
  ) {
    goals.add('locate');
  }
  if (
    /\b(como|que hago|que tengo que hacer|necesito|paso a paso|guia|tutorial|puedo|quiero agregar|quiero subir|quiero cargar|quiero renovar|quiero ocultar)\b/.test(normalized)
  ) {
    goals.add('how_to');
  }
  if (
    /\b(cuanto|cuantos|cuantas|quien|quienes|cuales|dame|muestra|muestrame|resumen|compara|comparar|contra|vs|top|mejor|mejores|mayor|lista|total)\b/.test(normalized)
  ) {
    goals.add('analyze_data');
  }
  if (
    /\b(por que|porque|que es|que significa|que pasa si|diferencia|explica|explicame|fundamento|vale|valen|sirve)\b/.test(normalized)
  ) {
    goals.add('explain_rule');
  }
  if (
    /\b(error|urgente|prioridad|problema|problemas|riesgo|riesgos|no cuadra|no cuadran|diferencias|alerta|alertas|revisar|auditar)\b/.test(normalized)
  ) {
    goals.add('diagnose');
  }

  // 3. Evaluar puntajes de temas semánticos
  const scored: Array<{ topic: SemanticTopic; label: string; score: number }> = [];

  // Comparativo de 2 meses tiene prioridad lógica directa
  if (months.length >= 2 && /\b(compara|comparar|contra|vs|diferencia|entre)\b/.test(normalized)) {
    scored.push({ topic: 'compare_months', label: 'comparativo entre meses', score: 14 });
  }

  for (const rule of TOPIC_RULES) {
    let score = 0;
    for (const ph of rule.phrases) {
      const phNorm = basicNormalize(ph);
      if (normalized.includes(phNorm) || rawNorm.includes(phNorm)) {
        const specificityBonus = Math.min(3, Math.max(0, phNorm.split(' ').length - 2));
        score += 6 + specificityBonus;
      } else {
        // Coincidencia lógica por conjunto de palabras de contenido (sin conectores vacíos)
        const phWords = phNorm.split(' ').filter((w) => w.length >= 3 && !PHRASE_STOPWORDS.has(w));
        if (phWords.length >= 2) {
          const hits = phWords.filter((pw) => tokens.some((t) => fuzzyWordMatch(t, pw))).length;
          if (hits === phWords.length) score += 5;
          else if (hits >= 2 && phWords.length >= 3 && hits >= phWords.length - 1) score += 2.5;
        }
      }
    }

    for (const w of rule.words) {
      if (tokens.some((t) => fuzzyWordMatch(t, w))) {
        score += 2.5;
      }
    }

    if (score > 0) {
      scored.push({ topic: rule.topic, label: rule.label, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  const second = scored[1] && scored[1].score >= 2.5 ? scored[1] : undefined;

  // 4. Detección inteligente de fuera de dominio (aun con mala ortografía, sin falsos positivos de dominio)
  const hasOffTopicWord = tokens.some((t) => OFF_TOPIC_PHONETIC.some((o) => isOffTopicWordMatch(t, o)));
  const hasRfcOrUuid =
    /[a-z]{3,4}\d{6}[a-z0-9]{3}/i.test(rawPrompt) ||
    /[a-f0-9]{8}-[a-f0-9]{4}/i.test(rawPrompt) ||
    /\b[a-z]{1,4}[- ]?\d{2,6}\b/i.test(rawPrompt);
  const isGreeting = /^(hola|buenos|buenas|buen dia|saludos|hey|que tal)\b/.test(normalized);
  const hasStrongDomainMatch = Boolean(top && top.score >= 4.5);

  const isOffTopic =
    !hasAttachment &&
    !isGreeting &&
    !hasRfcOrUuid &&
    !hasStrongDomainMatch &&
    (hasOffTopicWord || ((!top || top.score < 2.5) && goals.size === 0 && tokens.length >= 4));

  const primaryTopic: SemanticTopic = top ? top.topic : 'unknown';
  const interpretationNote =
    wasCorrected && top
      ? `Interpreté su consulta sobre **${top.label}**`
      : undefined;

  return {
    raw: rawPrompt,
    normalized,
    correctedWords: tokens,
    tokens,
    goals,
    primaryTopic,
    secondaryTopic: second?.topic,
    topicScore: top?.score || 0,
    months,
    year,
    isOffTopic,
    wasTypoCorrected: wasCorrected,
    interpretationNote,
  };
}
