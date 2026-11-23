import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FiscalDatabaseState } from '../src/types/fiscal';
import { daysUntil } from '../src/utils/format';
import { safeJsonParse } from '../src/utils/security';
import {
  evaluateIndicadores,
  getCedulaIsrPeriodo,
  getCedulaIvaPeriodo,
  getIndicadoresFinancieros,
  getResumenMensual,
  getVisorSatAuditoria,
} from '../src/services/fiscalCalculations';
import { backendStorage } from './storage/fileDatabase';
import { getPublicVaultStatus, inspectAndValidateEfirma } from './crypto/efirmaVault';
import {
  buildSatAuthSoapEnvelope,
  executeHistoricalSatJobOnServer,
  executeSatSyncJobOnServer,
  importCfdiBatchOnServer,
} from './sat/satWebService';
import { syncAspelPendingOnServer } from './contable/aspelSaeConnector';
import {
  authenticateCredentials,
  changeUserPassword,
  clearSessionCookie,
  extractSessionToken,
  getAuthenticatedSession,
  revokeSessionFromRequest,
  setSessionCookie,
} from './auth/authService';
import {
  applyBackendSecurityHeaders,
  checkRateLimit,
  inspectPayloadForThreats,
} from './security/apiFirewall';
import {
  filterStateForUser,
  getAuthorizedEmpresaRoles,
  mergeScopedStateUpdate,
  resolveAuthorizedTargetEmpresa,
} from './security/tenantAccess';

const MAX_BODY_BYTES = 18 * 1024 * 1024; // 18 MB para lotes grandes de XMLs
const SAFE_EMPRESA_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const SAFE_PERIODO_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  applyBackendSecurityHeaders(res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error('El tamaño de la solicitud excede el límite permitido (18 MB).'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function readRequestedEmpresaId(
  req: IncomingMessage,
  explicit?: string | null,
): { ok: true; empresaId: string } | { ok: false; error: string } {
  const rawHeader = typeof req.headers['x-fiscal-empresa'] === 'string' ? req.headers['x-fiscal-empresa'] : '';
  const candidate = String(explicit ?? rawHeader ?? '').trim();
  if (!candidate) {
    return { ok: true, empresaId: '' };
  }
  if (!SAFE_EMPRESA_ID_RE.test(candidate)) {
    return { ok: false, error: 'Identificador de empresa con formato inválido.' };
  }
  return { ok: true, empresaId: candidate };
}

export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const rawUrl = req.url || '';
  if (!rawUrl.startsWith('/api/')) {
    return false;
  }

  const parsedUrl = new URL(rawUrl, 'http://127.0.0.1:3000');
  const pathname = parsedUrl.pathname;
  const method = (req.method || 'GET').toUpperCase();

  // CORS dinámico para orígenes locales / LAN privada (sin fijar 127.0.0.1 para otros orígenes)
  const reqOrigin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  const isLocalOrLanOrigin =
    /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/i.test(
      reqOrigin,
    );
  res.setHeader('Vary', 'Origin');
  if (isLocalOrLanOrigin) {
    res.setHeader('Access-Control-Allow-Origin', reqOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, x-fiscal-role, x-fiscal-user, x-fiscal-empresa',
    );
  }

  if (method === 'OPTIONS') {
    applyBackendSecurityHeaders(res);
    res.statusCode = isLocalOrLanOrigin || !reqOrigin ? 204 : 403;
    res.end();
    return true;
  }

  // Protección anti-CSRF por Origin en peticiones con escritura
  if (reqOrigin && !isLocalOrLanOrigin && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    sendJson(res, 403, { ok: false, error: 'Origen no autorizado.' });
    return true;
  }

  // Rate limiting
  const clientIp = String(req.socket?.remoteAddress || '127.0.0.1');
  const rate = checkRateLimit(clientIp);
  if (!rate.allowed) {
    sendJson(res, 429, {
      ok: false,
      error: `Límite de peticiones excedido. Reintente en ${rate.retryAfterSec} segundos.`,
    });
    return true;
  }

  try {
    // 1. GET /api/health — Diagnóstico mínimo público; detalles filtrados solo con sesión válida
    if (method === 'GET' && pathname === '/api/health') {
      const healthSession = getAuthenticatedSession(req);
      if (!healthSession.authenticated || !healthSession.user) {
        sendJson(res, 200, {
          ok: true,
          status: 'online',
        });
        return true;
      }

      const fullState = backendStorage.loadState();
      const empInput = readRequestedEmpresaId(req);
      if (!empInput.ok) {
        sendJson(res, 400, { ok: false, error: empInput.error });
        return true;
      }

      // Portal limpio sin empresas registradas aún (propietario autorizado)
      if (fullState.empresas.length === 0 && healthSession.user.rol === 'propietario') {
        const rawStats = backendStorage.getStorageStats();
        sendJson(res, 200, {
          ok: true,
          service: 'Portal Operativo Tecnocontrol',
          version: '2.2.0',
          status: 'online',
          timestamp: new Date().toISOString(),
          storage: {
            driver: rawStats.driver,
            dbPath: 'almacenamiento-servidor',
            fileSizeBytes: rawStats.fileSizeBytes,
            lastModified: rawStats.lastModified,
            totalCfdis: 0,
            totalEmpresas: 0,
          },
          vault: {
            configuredInVault: false,
            algoritmo: 'AES-256-GCM',
            kdf: 'PBKDF2-SHA512-100000',
          },
        });
        return true;
      }

      const access = resolveAuthorizedTargetEmpresa(
        fullState,
        healthSession.user,
        empInput.empresaId,
      );
      if (!access.ok) {
        sendJson(res, access.statusCode, { ok: false, error: access.error });
        return true;
      }

      const filtered = filterStateForUser(fullState, healthSession.user);
      const rawStats = backendStorage.getStorageStats();
      const vault =
        access.rol === 'propietario'
          ? getPublicVaultStatus(access.empresaId)
          : {
              configuredInVault: false,
              algoritmo: 'AES-256-GCM',
              kdf: 'PBKDF2-SHA512-100000',
            };

      sendJson(res, 200, {
        ok: true,
        service: 'Portal Operativo Tecnocontrol',
        version: '2.2.0',
        status: 'online',
        timestamp: new Date().toISOString(),
        storage: {
          driver: rawStats.driver,
          dbPath: 'almacenamiento-servidor',
          fileSizeBytes: rawStats.fileSizeBytes,
          lastModified: rawStats.lastModified,
          totalCfdis: filtered.cfdis.length,
          totalEmpresas: filtered.empresas.length,
        },
        vault,
      });
      return true;
    }

    // 1.1 GET /api/auth/me — Validar sesión activa
    if (method === 'GET' && pathname === '/api/auth/me') {
      const session = getAuthenticatedSession(req);
      sendJson(res, 200, {
        ok: true,
        authenticated: session.authenticated,
        user: session.user || null,
        expiresAt: session.expiresAt || null,
      });
      return true;
    }

    // 1.2 POST /api/auth/login — Iniciar sesión con correo y contraseña
    if (method === 'POST' && pathname === '/api/auth/login') {
      const raw = await readRequestBody(req);
      const body = safeJsonParse<{
        email?: string;
        password?: string;
        rememberMe?: boolean;
      }>(raw);

      const waf = inspectPayloadForThreats([String(body?.email || '')]);
      if (!waf.safe) {
        sendJson(res, 403, { ok: false, error: waf.reason });
        return true;
      }

      const authRes = authenticateCredentials({
        email: body?.email || '',
        password: body?.password || '',
        rememberMe: Boolean(body?.rememberMe),
        clientIp,
      });

      if (!authRes.ok || !authRes.token || !authRes.user) {
        sendJson(res, authRes.statusCode, {
          ok: false,
          error: authRes.error || 'Credenciales inválidas.',
        });
        return true;
      }

      setSessionCookie(res, authRes.token, authRes.maxAgeSeconds || 28800);

      // Registrar inicio de sesión únicamente en una empresa perteneciente al usuario autenticado
      try {
        const state = backendStorage.loadState();
        const roleMap = getAuthorizedEmpresaRoles(state, authRes.user.correo);
        const targetEmpId = Array.from(roleMap.keys())[0];
        if (targetEmpId) {
          backendStorage.saveState({
            ...state,
            bitacora: [
              {
                id: `bit-login-${Date.now()}`,
                empresa_id: targetEmpId,
                usuario: authRes.user.nombre,
                rol: roleMap.get(targetEmpId) || authRes.user.rol,
                modulo: 'Acceso y Seguridad',
                accion: 'Inicio de sesión',
                detalle: `Acceso autorizado para ${authRes.user.correo}.`,
                fecha: new Date().toISOString(),
              },
              ...state.bitacora,
            ],
          });
        }
      } catch {
        // no bloquear login si falla escritura de bitácora
      }

      sendJson(res, 200, {
        ok: true,
        user: authRes.user,
        expiresAt: authRes.expiresAt,
      });
      return true;
    }

    // 1.3 POST /api/auth/logout — Cerrar sesión activa
    if (method === 'POST' && pathname === '/api/auth/logout') {
      const prevSession = getAuthenticatedSession(req);
      revokeSessionFromRequest(req);
      clearSessionCookie(res);

      if (prevSession.authenticated && prevSession.user) {
        try {
          const state = backendStorage.loadState();
          const roleMap = getAuthorizedEmpresaRoles(state, prevSession.user.correo);
          const targetEmpId = Array.from(roleMap.keys())[0];
          if (targetEmpId) {
            backendStorage.saveState({
              ...state,
              bitacora: [
                {
                  id: `bit-logout-${Date.now()}`,
                  empresa_id: targetEmpId,
                  usuario: prevSession.user.nombre,
                  rol: roleMap.get(targetEmpId) || prevSession.user.rol,
                  modulo: 'Acceso y Seguridad',
                  accion: 'Cierre de sesión',
                  detalle: `${prevSession.user.nombre} cerró sesión en el portal.`,
                  fecha: new Date().toISOString(),
                },
                ...state.bitacora,
              ],
            });
          }
        } catch {
          // ignore
        }
      }

      sendJson(res, 200, { ok: true });
      return true;
    }

    // =========================================================================
    // BARRERA DE AUTENTICACIÓN: todos los demás endpoints requieren sesión activa
    // =========================================================================
    const session = getAuthenticatedSession(req);
    if (!session.authenticated || !session.user) {
      sendJson(res, 401, {
        ok: false,
        error: 'Sesión no iniciada o expirada. Inicia sesión para continuar.',
      });
      return true;
    }

    const sessionUser = session.user;

    // 1.4 POST /api/auth/change-password — Cambiar contraseña de la cuenta activa
    if (method === 'POST' && pathname === '/api/auth/change-password') {
      const raw = await readRequestBody(req);
      const body = safeJsonParse<{
        currentPassword?: string;
        newPassword?: string;
      }>(raw);

      const result = changeUserPassword({
        userId: sessionUser.id,
        currentPassword: body?.currentPassword || '',
        newPassword: body?.newPassword || '',
        currentToken: extractSessionToken(req),
      });

      if (!result.ok) {
        sendJson(res, result.statusCode, { ok: false, error: result.error });
        return true;
      }

      try {
        const state = backendStorage.loadState();
        const roleMap = getAuthorizedEmpresaRoles(state, sessionUser.correo);
        const targetEmpId = Array.from(roleMap.keys())[0];
        if (targetEmpId) {
          backendStorage.saveState({
            ...state,
            bitacora: [
              {
                id: `bit-pwd-${Date.now()}`,
                empresa_id: targetEmpId,
                usuario: sessionUser.nombre,
                rol: roleMap.get(targetEmpId) || sessionUser.rol,
                modulo: 'Acceso y Seguridad',
                accion: 'Cambio de contraseña',
                detalle: `Contraseña actualizada correctamente para ${sessionUser.correo}.`,
                fecha: new Date().toISOString(),
              },
              ...state.bitacora,
            ],
          });
        }
      } catch {
        // ignore
      }

      sendJson(res, 200, { ok: true });
      return true;
    }

    // 2. GET /api/state — Estado fiscal estrictamente filtrado por empresas y rol del usuario
    if (method === 'GET' && pathname === '/api/state') {
      const fullState = backendStorage.loadState();
      const scopedState = filterStateForUser(fullState, sessionUser);
      const rawStats = backendStorage.getStorageStats();
      sendJson(res, 200, {
        ok: true,
        state: scopedState,
        storage: {
          driver: rawStats.driver,
          dbPath: 'almacenamiento-servidor',
          fileSizeBytes: rawStats.fileSizeBytes,
          lastModified: rawStats.lastModified,
          totalCfdis: scopedState.cfdis.length,
          totalEmpresas: scopedState.empresas.length,
        },
      });
      return true;
    }

    // 3. PUT /api/state — Fusión aislada por empresa + RBAC estricto + bitácora append-only
    if (method === 'PUT' && pathname === '/api/state') {
      const raw = await readRequestBody(req);
      const body = safeJsonParse<{ state?: FiscalDatabaseState }>(raw);
      if (!body?.state || !Array.isArray(body.state.empresas)) {
        sendJson(res, 400, { ok: false, error: 'Estructura de estado fiscal inválida.' });
        return true;
      }

      const currentState = backendStorage.loadState();
      const merged = mergeScopedStateUpdate(currentState, body.state, sessionUser);
      if (!merged.ok) {
        sendJson(res, merged.statusCode, { ok: false, error: merged.error });
        return true;
      }

      const saved = backendStorage.saveState(merged.nextState);
      sendJson(res, 200, { ok: true, state: filterStateForUser(saved, sessionUser) });
      return true;
    }

    // 4. POST /api/reset — Limpiar base fiscal (únicamente propietario global)
    if (method === 'POST' && pathname === '/api/reset') {
      const currentState = backendStorage.loadState();
      const roleMap = getAuthorizedEmpresaRoles(currentState, sessionUser.correo);
      const isGlobalOwner =
        sessionUser.rol === 'propietario' &&
        (currentState.empresas.length === 0 ||
          currentState.empresas.every((e) => roleMap.get(e.id) === 'propietario'));

      if (!isGlobalOwner) {
        sendJson(res, 403, {
          ok: false,
          error:
            'Acceso denegado: solo el propietario general de todas las empresas puede restaurar la base fiscal.',
        });
        return true;
      }

      const resetFull = backendStorage.resetState();
      sendJson(res, 200, { ok: true, state: filterStateForUser(resetFull, sessionUser) });
      return true;
    }

    // 5. GET /api/efirma/status — Estado de bóveda AES-256-GCM (aislado por empresa, solo propietario)
    if (method === 'GET' && pathname === '/api/efirma/status') {
      const empInput = readRequestedEmpresaId(req, parsedUrl.searchParams.get('empresaId'));
      if (!empInput.ok) {
        sendJson(res, 400, { ok: false, error: empInput.error });
        return true;
      }

      const state = backendStorage.loadState();
      const access = resolveAuthorizedTargetEmpresa(state, sessionUser, empInput.empresaId, [
        'propietario',
      ]);
      if (!access.ok) {
        sendJson(res, access.statusCode, { ok: false, error: access.error });
        return true;
      }

      const efirmaMeta = state.efirmas.find((e) => e.empresa_id === access.empresaId) || null;
      const vaultStatus = getPublicVaultStatus(access.empresaId);
      sendJson(res, 200, {
        ok: true,
        efirma: efirmaMeta,
        vault: vaultStatus,
      });
      return true;
    }

    // 6. POST /api/efirma/upload — Validación criptográfica real X.509 + PKCS#8 (.cer/.key)
    if (method === 'POST' && pathname === '/api/efirma/upload') {
      const raw = await readRequestBody(req);
      const body = safeJsonParse<{
        empresaId?: string;
        cerFileName: string;
        cerBase64: string;
        keyFileName: string;
        keyBase64: string;
        password: string;
      }>(raw);

      if (!body || !body.cerFileName || !body.keyFileName || !body.password) {
        sendJson(res, 400, {
          ok: false,
          error: 'Se requieren los archivos .cer, .key y la contraseña de la clave privada.',
        });
        return true;
      }

      const empInput = readRequestedEmpresaId(req, body.empresaId);
      if (!empInput.ok) {
        sendJson(res, 400, { ok: false, error: empInput.error });
        return true;
      }

      const state = backendStorage.loadState();
      const access = resolveAuthorizedTargetEmpresa(state, sessionUser, empInput.empresaId, [
        'propietario',
      ]);
      if (!access.ok) {
        sendJson(res, access.statusCode, { ok: false, error: access.error });
        return true;
      }

      const emp = access.empresa;
      const validation = inspectAndValidateEfirma({
        empresaId: emp.id,
        expectedRfc: emp.rfc,
        cerFileName: body.cerFileName,
        cerBase64: body.cerBase64 || '',
        keyFileName: body.keyFileName,
        keyBase64: body.keyBase64 || '',
        password: body.password,
        usuario: sessionUser.nombre,
      });

      if (!validation.ok) {
        sendJson(res, 422, { ok: false, error: validation.error });
        return true;
      }

      const nowIso = new Date().toISOString();
      const remDays = daysUntil(validation.vigenciaHasta!);
      const estadoEfirma = remDays < 0 ? 'vencida' : remDays <= 30 ? 'por_vencer' : 'activa';
      const existingEfirma = state.efirmas.find((e) => e.empresa_id === emp.id);
      const updatedEfirmas = existingEfirma
        ? state.efirmas.map((e) =>
            e.empresa_id === emp.id
              ? {
                  ...e,
                  numero_serie: validation.numeroSerie!,
                  rfc_certificado: validation.rfcCertificado!,
                  vigencia_desde: validation.vigenciaDesde!,
                  vigencia_hasta: validation.vigenciaHasta!,
                  estado: estadoEfirma as 'activa' | 'por_vencer' | 'vencida',
                  actualizada_en: nowIso,
                  actualizada_por: sessionUser.nombre,
                }
              : e,
          )
        : [
            ...state.efirmas,
            {
              empresa_id: emp.id,
              numero_serie: validation.numeroSerie!,
              rfc_certificado: validation.rfcCertificado!,
              vigencia_desde: validation.vigenciaDesde!,
              vigencia_hasta: validation.vigenciaHasta!,
              estado: estadoEfirma as 'activa' | 'por_vencer' | 'vencida',
              actualizada_en: nowIso,
              actualizada_por: sessionUser.nombre,
            },
          ];

      const nextState: FiscalDatabaseState = {
        ...state,
        efirmas: updatedEfirmas,
        bitacora: [
          {
            id: `bit-ef-srv-${Date.now()}`,
            empresa_id: emp.id,
            usuario: sessionUser.nombre,
            rol: 'propietario',
            modulo: 'e.firma',
            accion: 'Actualización y validación de e.firma (.cer/.key)',
            detalle: `Serie ${validation.numeroSerie} verificada criptográficamente (par .cer/.key válido) con vigencia hasta ${validation.vigenciaHasta}.`,
            fecha: nowIso,
          },
          ...state.bitacora,
        ],
      };

      const saved = backendStorage.saveState(nextState);
      sendJson(res, 200, {
        ok: true,
        validation,
        vault: getPublicVaultStatus(emp.id),
        state: filterStateForUser(saved, sessionUser),
      });
      return true;
    }

    // 7. POST /api/sat/sync — Sincronización SAT aislada por empresa (propietario/contador)
    if (method === 'POST' && pathname === '/api/sat/sync') {
      const raw = await readRequestBody(req);
      const body = safeJsonParse<{ empresaId?: string }>(raw);
      const empInput = readRequestedEmpresaId(req, body?.empresaId);
      if (!empInput.ok) {
        sendJson(res, 400, { ok: false, error: empInput.error });
        return true;
      }

      const state = backendStorage.loadState();
      const access = resolveAuthorizedTargetEmpresa(state, sessionUser, empInput.empresaId, [
        'propietario',
        'contador',
      ]);
      if (!access.ok) {
        sendJson(res, access.statusCode, { ok: false, error: access.error });
        return true;
      }

      const { nextState, newLog, soapPreview } = executeSatSyncJobOnServer(
        state,
        access.empresaId,
        sessionUser.nombre,
      );
      const saved = backendStorage.saveState(nextState);

      sendJson(res, 200, {
        ok: true,
        log: newLog,
        soapPreview,
        state: filterStateForUser(saved, sessionUser),
      });
      return true;
    }

    // 8. GET /api/sat/soap-preview — Sobre SOAP aislado por empresa (propietario/contador)
    if (method === 'GET' && pathname === '/api/sat/soap-preview') {
      const empInput = readRequestedEmpresaId(req, parsedUrl.searchParams.get('empresaId'));
      if (!empInput.ok) {
        sendJson(res, 400, { ok: false, error: empInput.error });
        return true;
      }

      const state = backendStorage.loadState();
      const access = resolveAuthorizedTargetEmpresa(state, sessionUser, empInput.empresaId, [
        'propietario',
        'contador',
      ]);
      if (!access.ok) {
        sendJson(res, access.statusCode, { ok: false, error: access.error });
        return true;
      }

      const soapPreview = buildSatAuthSoapEnvelope(access.empresa.id, access.empresa.rfc);
      sendJson(res, 200, { ok: true, soapPreview });
      return true;
    }

    // 9. POST /api/sat/historical — Descarga histórica aislada por empresa (propietario/contador)
    if (method === 'POST' && pathname === '/api/sat/historical') {
      const raw = await readRequestBody(req);
      const body = safeJsonParse<{ empresaId?: string; years?: number[] }>(raw);
      const empInput = readRequestedEmpresaId(req, body?.empresaId);
      if (!empInput.ok) {
        sendJson(res, 400, { ok: false, error: empInput.error });
        return true;
      }

      const state = backendStorage.loadState();
      const access = resolveAuthorizedTargetEmpresa(state, sessionUser, empInput.empresaId, [
        'propietario',
        'contador',
      ]);
      if (!access.ok) {
        sendJson(res, access.statusCode, { ok: false, error: access.error });
        return true;
      }

      const validYears = Array.isArray(body?.years)
        ? body.years.filter((y) => Number.isInteger(y) && y >= 2015 && y <= 2030)
        : [];
      const years = validYears.length > 0 ? validYears : [2025];

      const { nextState, requestsCreated } = executeHistoricalSatJobOnServer(
        state,
        access.empresaId,
        years,
        sessionUser.nombre,
      );
      const saved = backendStorage.saveState(nextState);
      sendJson(res, 200, {
        ok: true,
        requestsCreated,
        state: filterStateForUser(saved, sessionUser),
      });
      return true;
    }

    // 10. POST /api/sat/import-batch — Importación masiva aislada por empresa
    if (method === 'POST' && pathname === '/api/sat/import-batch') {
      const raw = await readRequestBody(req);
      const body = safeJsonParse<{
        empresaId?: string;
        sourceLabel?: string;
        items?: Parameters<typeof importCfdiBatchOnServer>[2];
      }>(raw);

      if (!body?.items || !Array.isArray(body.items)) {
        sendJson(res, 400, { ok: false, error: 'Lista de comprobantes inválida.' });
        return true;
      }

      const empInput = readRequestedEmpresaId(req, body.empresaId);
      if (!empInput.ok) {
        sendJson(res, 400, { ok: false, error: empInput.error });
        return true;
      }

      const state = backendStorage.loadState();
      const access = resolveAuthorizedTargetEmpresa(state, sessionUser, empInput.empresaId, [
        'propietario',
        'contador',
        'pagos',
      ]);
      if (!access.ok) {
        sendJson(res, access.statusCode, { ok: false, error: access.error });
        return true;
      }

      const result = importCfdiBatchOnServer(
        state,
        access.empresaId,
        body.items,
        body.sourceLabel || 'Carga masiva XML/ZIP',
        sessionUser.nombre,
      );
      const saved = backendStorage.saveState(result.nextState);
      sendJson(res, 200, {
        ok: true,
        importedCount: result.importedCount,
        emitidosCount: result.emitidosCount,
        recibidosCount: result.recibidosCount,
        state: filterStateForUser(saved, sessionUser),
      });
      return true;
    }

    // 11. GET /api/calculos/fiscal — Cálculos fiscales aislados por empresa (propietario/contador/consulta)
    if (method === 'GET' && pathname === '/api/calculos/fiscal') {
      const empInput = readRequestedEmpresaId(req, parsedUrl.searchParams.get('empresaId'));
      if (!empInput.ok) {
        sendJson(res, 400, { ok: false, error: empInput.error });
        return true;
      }

      const periodo = (parsedUrl.searchParams.get('periodo') || '2026-10').trim();
      if (!SAFE_PERIODO_RE.test(periodo)) {
        sendJson(res, 400, { ok: false, error: 'Formato de periodo inválido (esperado YYYY-MM).' });
        return true;
      }

      const state = backendStorage.loadState();
      const access = resolveAuthorizedTargetEmpresa(state, sessionUser, empInput.empresaId, [
        'propietario',
        'contador',
        'consulta',
      ]);
      if (!access.ok) {
        sendJson(res, access.statusCode, { ok: false, error: access.error });
        return true;
      }

      const emp = access.empresa;
      const year = periodo.slice(0, 4);

      sendJson(res, 200, {
        ok: true,
        empresa: emp,
        periodo,
        resumenMensual: getResumenMensual(state, emp.id, year),
        cedulaIva: getCedulaIvaPeriodo(state, emp.id, periodo),
        cedulaIsr: getCedulaIsrPeriodo(state, emp.id, periodo),
        visorSat: getVisorSatAuditoria(state, emp, periodo),
        indicadoresFinancieros: getIndicadoresFinancieros(state, emp.id, periodo, 'flujo'),
        indicadoresRiesgo: evaluateIndicadores(state, emp, periodo),
      });
      return true;
    }

    // 12. POST /api/aspel/sync — Sincronización contable Aspel SAE aislada por empresa
    if (method === 'POST' && pathname === '/api/aspel/sync') {
      const raw = await readRequestBody(req);
      const body = safeJsonParse<{ empresaId?: string }>(raw);
      const empInput = readRequestedEmpresaId(req, body?.empresaId);
      if (!empInput.ok) {
        sendJson(res, 400, { ok: false, error: empInput.error });
        return true;
      }

      const state = backendStorage.loadState();
      const access = resolveAuthorizedTargetEmpresa(state, sessionUser, empInput.empresaId, [
        'propietario',
        'contador',
      ]);
      if (!access.ok) {
        sendJson(res, access.statusCode, { ok: false, error: access.error });
        return true;
      }

      const { nextState, linkedCount } = syncAspelPendingOnServer(
        state,
        access.empresaId,
        sessionUser.nombre,
      );
      const saved = backendStorage.saveState(nextState);
      sendJson(res, 200, {
        ok: true,
        linkedCount,
        state: filterStateForUser(saved, sessionUser),
      });
      return true;
    }

    sendJson(res, 404, { ok: false, error: 'Recurso no encontrado.' });
    return true;
  } catch (err) {
    const safeMsg =
      err instanceof Error && err.message.includes('excede el límite')
        ? err.message
        : 'Error interno al procesar la solicitud.';
    sendJson(res, 500, {
      ok: false,
      error: safeMsg,
    });
    return true;
  }
}
