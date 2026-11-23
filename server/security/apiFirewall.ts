import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RolEmpresa } from '../../src/types/fiscal';
import { detectSecurityThreat } from '../../src/utils/security';

interface RateBucket {
  count: number;
  windowStart: number;
}

const rateBuckets = new Map<string, RateBucket>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_MIN = 180;

export function applyBackendSecurityHeaders(res: ServerResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
}

export function checkRateLimit(clientKey: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(clientKey);
  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    rateBuckets.set(clientKey, { count: 1, windowStart: now });
    return { allowed: true };
  }
  bucket.count += 1;
  if (bucket.count > MAX_REQUESTS_PER_MIN) {
    const retryAfterSec = Math.ceil((WINDOW_MS - (now - bucket.windowStart)) / 1000);
    return { allowed: false, retryAfterSec };
  }
  return { allowed: true };
}

export function extractActorFromHeaders(req: IncomingMessage): {
  rol: RolEmpresa;
  usuario: string;
  empresaId: string;
} {
  const rawRole = String(req.headers['x-fiscal-role'] || 'propietario').toLowerCase();
  const validRoles: RolEmpresa[] = ['propietario', 'contador', 'consulta', 'pagos'];
  const rol: RolEmpresa = validRoles.includes(rawRole as RolEmpresa)
    ? (rawRole as RolEmpresa)
    : 'propietario';

  const usuario = decodeURIComponent(
    String(req.headers['x-fiscal-user'] || 'C.P. Nayra Mendoza'),
  ).slice(0, 80);
  const empresaId = String(req.headers['x-fiscal-empresa'] || 'emp-hedma').slice(0, 60);

  return { rol, usuario, empresaId };
}

export function assertRoleAccess(
  rol: RolEmpresa,
  allowedRoles: RolEmpresa[],
): { ok: boolean; error?: string } {
  if (!allowedRoles.includes(rol)) {
    return {
      ok: false,
      error: `Acceso denegado por política RBAC del servidor: el rol '${rol}' no tiene privilegios para esta operación (requiere: ${allowedRoles.join(', ')}).`,
    };
  }
  return { ok: true };
}

/**
 * Inspecciona cadenas de consulta o campos críticos del payload contra SQLi, XSS y Path Traversal
 */
export function inspectPayloadForThreats(values: string[]): {
  safe: boolean;
  threatType?: string;
  reason?: string;
} {
  for (const val of values) {
    if (!val || typeof val !== 'string') continue;
    const check = detectSecurityThreat(val);
    if (check.blocked) {
      return {
        safe: false,
        threatType: check.category,
        reason: check.detail,
      };
    }
  }
  return { safe: true };
}
