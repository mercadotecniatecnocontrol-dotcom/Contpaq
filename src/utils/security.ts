// Capa centralizada de seguridad del Portal Fiscal SAT Tecnocontrol
// Defensa en profundidad contra: SQL Injection, XSS, XXE, XML Bombs,
// ZIP Bombs / Zip Slip, Excel Formula Injection (CSV/DDE), Prototype Pollution y BiDi Spoofing.

export interface SecurityThreatReport {
  blocked: boolean;
  category?: 'sql_injection' | 'xss_script' | 'path_traversal' | 'xxe_entity';
  detail?: string;
}

export const MAX_UPLOAD_FILE_BYTES = 25 * 1024 * 1024; // 25 MB por archivo
export const MAX_XML_BYTES = 5 * 1024 * 1024; // 5 MB por XML
export const MAX_ZIP_ENTRIES = 500; // Máximo de entradas por ZIP (anti ZIP-bomb)
export const MAX_ZIP_UNCOMPRESSED_BYTES = 50 * 1024 * 1024; // 50 MB descomprimidos

const BLOCKED_EXECUTABLE_EXTS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.msi', '.ps1', '.psm1', '.sh', '.bash',
  '.vbs', '.vbe', '.js', '.mjs', '.cjs', '.jse', '.wsf', '.scr', '.pif',
  '.dll', '.sys', '.jar', '.app', '.dmg', '.apk', '.php', '.asp', '.aspx',
  '.jsp', '.svg', '.hta',
]);

const ALLOWED_DOC_EXTS = new Set([
  '.pdf', '.docx', '.pptx', '.xlsx', '.xls', '.ods', '.csv', '.tsv',
  '.xml', '.zip', '.txt', '.json', '.md', '.html', '.htm', '.cer', '.key',
]);

// Patrones de Inyección SQL (clásica, booleana, UNION, stacked queries, time-based, introspección)
const SQL_INJECTION_PATTERNS: RegExp[] = [
  /(?:\bunion\b\s+(?:all\s+)?\bselect\b)/i,
  /(?:;\s*(?:drop|delete|truncate|alter|create|insert|update|grant|revoke|exec|execute)\s+)/i,
  /(?:'\s*(?:or|and)\s+['"]?\d+['"]?\s*=\s*['"]?\d+|'\s*or\s+'[^']*'\s*=\s*'[^']*')/i,
  /(?:\b(?:or|and)\s+1\s*=\s*1\b\s*(?:--|#|\/\*|$))/i,
  /(?:\bselect\b[\s\S]{1,40}\bfrom\b\s+(?:information_schema|pg_catalog|pg_tables|pg_shadow|mysql|sys\.|fiscal\.))/i,
  /(?:\bwaitfor\s+delay\s+['"]|\b(?:pg_sleep|benchmark|sleep)\s*\()/i,
  /(?:\bxp_cmdshell\b|\bload_file\s*\(|\binto\s+(?:outfile|dumpfile)\b)/i,
  /(?:\/\*[\s\S]*?\*\/\s*(?:select|union|drop|delete|or\s+1=1))/i,
];

// Patrones de XSS / Inyección de scripts
const XSS_PATTERNS: RegExp[] = [
  /<\s*script\b/i,
  /<\s*\/\s*script\s*>/i,
  /<\s*(?:iframe|object|embed|applet|meta|link|base)\b/i,
  /\bon(?:error|load|click|mouseover|focus|blur|submit|input|change)\s*=/i,
  /\b(?:javascript|vbscript)\s*:/i,
  /\bdata\s*:\s*text\/html/i,
  /\bdocument\.(?:cookie|domain|write)\b/i,
  /\bwindow\.(?:location|eval)\b/i,
];

// Patrones de Path Traversal
const PATH_TRAVERSAL_PATTERNS: RegExp[] = [
  /(?:\.\.[/\\]){2,}/,
  /(?:%2e%2e%2f|%2e%2e\/|\.\.%2f|%2e%2e%5c)/i,
  /(?:\/etc\/passwd|\\windows\\system32)/i,
];

export function detectSecurityThreat(input: string): SecurityThreatReport {
  if (!input || input.length < 3) return { blocked: false };

  for (const rx of SQL_INJECTION_PATTERNS) {
    if (rx.test(input)) {
      return {
        blocked: true,
        category: 'sql_injection',
        detail: 'Se detectó un patrón compatible con inyección SQL.',
      };
    }
  }
  for (const rx of XSS_PATTERNS) {
    if (rx.test(input)) {
      return {
        blocked: true,
        category: 'xss_script',
        detail: 'Se detectó código de script o HTML potencialmente malicioso (XSS).',
      };
    }
  }
  for (const rx of PATH_TRAVERSAL_PATTERNS) {
    if (rx.test(input)) {
      return {
        blocked: true,
        category: 'path_traversal',
        detail: 'Se detectó un intento de navegación de rutas no permitida (Path Traversal).',
      };
    }
  }
  return { blocked: false };
}

// Sanitización general de texto de entrada (elimina bytes nulos, caracteres BiDi y etiquetas HTML)
export function sanitizeTextInput(raw: string, maxLength = 500): string {
  if (!raw) return '';
  return raw
    .replace(/\0/g, '')
    // Eliminar caracteres Unicode de control bidireccional (prevención Trojan Source)
    .replace(/[\u202A-\u202E\u2066-\u2069]/g, '')
    // Eliminar caracteres de control ASCII excepto salto de línea y tabulador
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Neutralizar etiquetas HTML crudas
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function sanitizeRfcInput(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-ZÑ&0-9]/g, '')
    .slice(0, 13);
}

export function sanitizeEmailInput(raw: string): string {
  return sanitizeTextInput(raw, 160).toLowerCase().replace(/\s+/g, '');
}

export function sanitizeFileName(raw: string): string {
  const base = raw.split(/[/\\]/).pop() || 'archivo';
  return base
    .replace(/\0/g, '')
    .replace(/[^a-zA-Z0-9._\-\s()]/g, '_')
    .replace(/\.{2,}/g, '.')
    .trim()
    .slice(0, 140) || 'archivo';
}

export function sanitizeSafeUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://127.0.0.1') ||
    trimmed.startsWith('http://localhost') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('/')
  ) {
    return trimmed;
  }
  return undefined;
}

// Protección contra Excel / CSV Formula Injection (DDE / =HYPERLINK / =CMD / + / - / @)
export function sanitizeExcelCell(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const cleaned = value.replace(/\0/g, '');
  if (!cleaned) return '';

  // Permitir montos negativos legítimos como "-$1,250.00" o "-450.50"
  if (/^-\$?\s*\d[\d,]*(?:\.\d+)?%?$/.test(cleaned.trim())) {
    return cleaned;
  }

  // Neutralizar cualquier fórmula o comando ejecutable al inicio de celda
  if (/^[=+\-@\t\r]/.test(cleaned)) {
    return `'${cleaned}`;
  }
  return cleaned;
}

// Protección contra XXE (XML External Entity) y XML Bombs (Billion Laughs)
export function assertSafeXml(xmlText: string): { ok: boolean; error?: string } {
  if (!xmlText || !xmlText.trim()) {
    return { ok: false, error: 'El archivo XML está vacío.' };
  }
  if (xmlText.length > MAX_XML_BYTES) {
    return {
      ok: false,
      error: `El archivo XML excede el límite seguro de ${Math.round(MAX_XML_BYTES / (1024 * 1024))} MB.`,
    };
  }
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xmlText)) {
    return {
      ok: false,
      error: 'XML rechazado por política de seguridad: contiene declaraciones DOCTYPE/ENTITY no permitidas (protección XXE).',
    };
  }
  return { ok: true };
}

// Validación segura de archivos subidos (extensión, ejecutables prohibidos, tamaño)
export function validateFileUpload(
  fileName: string,
  sizeBytes: number,
  allowedExtensions: Set<string> = ALLOWED_DOC_EXTS,
): { ok: boolean; error?: string } {
  const lower = fileName.toLowerCase().trim();
  const dotIdx = lower.lastIndexOf('.');
  const ext = dotIdx >= 0 ? lower.slice(dotIdx) : '';

  if (!ext || BLOCKED_EXECUTABLE_EXTS.has(ext)) {
    return {
      ok: false,
      error: `Tipo de archivo bloqueado por política de seguridad (${ext || 'sin extensión'}).`,
    };
  }
  if (!allowedExtensions.has(ext)) {
    return {
      ok: false,
      error: `Extensión no admitida (${ext}). Use formatos documentales o fiscales válidos.`,
    };
  }
  if (sizeBytes > MAX_UPLOAD_FILE_BYTES) {
    return {
      ok: false,
      error: `El archivo excede el tamaño máximo permitido (${Math.round(MAX_UPLOAD_FILE_BYTES / (1024 * 1024))} MB).`,
    };
  }
  return { ok: true };
}

// Verifica si una ruta dentro de un ZIP intenta Zip Slip (path traversal)
export function isSafeZipEntryPath(entryPath: string): boolean {
  if (!entryPath) return false;
  if (entryPath.startsWith('/') || entryPath.startsWith('\\')) return false;
  if (/^[a-zA-Z]:/.test(entryPath)) return false;
  if (entryPath.includes('\0')) return false;
  const parts = entryPath.split(/[/\\]/);
  return !parts.some((p) => p === '..');
}

// JSON.parse seguro contra Prototype Pollution (__proto__, constructor, prototype)
const FORBIDDEN_JSON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw, (key, value) => {
      if (FORBIDDEN_JSON_KEYS.has(key)) return undefined;
      return value;
    }) as T;
  } catch {
    return null;
  }
}

// Elimina cualquier campo sensible que nunca debe almacenarse en localStorage del navegador
const SENSITIVE_STORAGE_KEYS = new Set([
  'password',
  'contrasena',
  'password_efirma',
  'key_bytes',
  'cer_bytes',
  'private_key',
  'clave_privada',
  'token_secreto',
]);

export function stripSensitiveSecrets<T>(data: T): T {
  const seen = new WeakSet<object>();
  const clean = (val: unknown): unknown => {
    if (val === null || typeof val !== 'object') return val;
    if (seen.has(val as object)) return undefined;
    seen.add(val as object);

    if (Array.isArray(val)) {
      return val.map((item) => clean(item));
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (FORBIDDEN_JSON_KEYS.has(k) || SENSITIVE_STORAGE_KEYS.has(k.toLowerCase())) {
        continue;
      }
      out[k] = clean(v);
    }
    return out;
  };
  return clean(data) as T;
}
