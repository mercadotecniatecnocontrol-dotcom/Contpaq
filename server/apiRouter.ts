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
  assertRoleAccess,
  checkRateLimit,
  extractActorFromHeaders,
  inspectPayloadForThreats,
} from './security/apiFirewall';

const MAX_BODY_BYTES = 18 * 1024 * 1024; // 18 MB para lotes grandes de XMLs

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

  // CORS para despliegues donde frontend y backend corren en puertos separados
  res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:3000');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, x-fiscal-role, x-fiscal-user, x-fiscal-empresa',
  );
  if (method === 'OPTIONS') {
    applyBackendSecurityHeaders(res);
    res.statusCode = 204;
    res.end();
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

  const headerActor = extractActorFromHeaders(req);

  try {
    // 1. GET /api/health — Diagnóstico de salud (público)
    if (method === 'GET' && pathname === '/api/health') {
      const stats = backendStorage.getStorageStats();
      const vault = getPublicVaultStatus(headerActor.empresaId);
      sendJson(res, 200, {
        ok: true,
        service: 'Tecnocontrol Fiscal SAT — Node.js Backend API',
        version: '2.1.0',
        status: 'online',
        timestamp: new Date().toISOString(),
        storage: stats,
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

      // Registrar inicio de sesión en la bitácora de auditoría
      try {
        const state = backendStorage.loadState();
        const targetEmpId = headerActor.empresaId || state.empresas[0]?.id || 'emp-hedma';
        backendStorage.saveState({
          ...state,
          bitacora: [
            {
              id: `bit-login-${Date.now()}`,
              empresa_id: targetEmpId,
              usuario: authRes.user.nombre,
              rol: authRes.user.rol,
              modulo: 'Acceso y Seguridad',
              accion: 'Inicio de sesión',
              detalle: `Acceso autorizado para ${authRes.user.correo}.`,
              fecha: new Date().toISOString(),
            },
            ...state.bitacora,
          ],
        });
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
          const targetEmpId = headerActor.empresaId || state.empresas[0]?.id || 'emp-hedma';
          backendStorage.saveState({
            ...state,
            bitacora: [
              {
                id: `bit-logout-${Date.now()}`,
                empresa_id: targetEmpId,
                usuario: prevSession.user.nombre,
                rol: prevSession.user.rol,
                modulo: 'Acceso y Seguridad',
                accion: 'Cierre de sesión',
                detalle: `${prevSession.user.nombre} cerró sesión en el portal.`,
                fecha: new Date().toISOString(),
              },
              ...state.bitacora,
            ],
          });
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

    // La identidad del actor proviene de la sesión verificada en el servidor
    const actor = {
      rol: session.user.rol,
      usuario: session.user.nombre,
      empresaId: headerActor.empresaId,
    };

    // 1.4 POST /api/auth/change-password — Cambiar contraseña de la cuenta activa
    if (method === 'POST' && pathname === '/api/auth/change-password') {
      const raw = await readRequestBody(req);
      const body = safeJsonParse<{
        currentPassword?: string;
        newPassword?: string;
      }>(raw);

      const result = changeUserPassword({
        userId: session.user.id,
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
        backendStorage.saveState({
          ...state,
          bitacora: [
            {
              id: `bit-pwd-${Date.now()}`,
              empresa_id: actor.empresaId,
              usuario: session.user.nombre,
              rol: session.user.rol,
              modulo: 'Acceso y Seguridad',
              accion: 'Cambio de contraseña',
              detalle: `Contraseña actualizada correctamente para ${session.user.correo}.`,
              fecha: new Date().toISOString(),
            },
            ...state.bitacora,
          ],
        });
      } catch {
        // ignore
      }

      sendJson(res, 200, { ok: true });
      return true;
    }

    // 2. GET /api/state — Estado completo del repositorio fiscal desde el servidor
    if (method === 'GET' && pathname === '/api/state') {
      const state = backendStorage.loadState();
      sendJson(res, 200, {
        ok: true,
        state,
        storage: backendStorage.getStorageStats(),
      });
      return true;
    }

    // 3. PUT /api/state — Sincronización de estado completo con control RBAC
    if (method === 'PUT' && pathname === '/api/state') {
      const raw = await readRequestBody(req);
      const body = safeJsonParse<{ state?: FiscalDatabaseState }>(raw);
      if (!body?.state || !Array.isArray(body.state.empresas)) {
        sendJson(res, 400, { ok: false, error: 'Estructura de estado fiscal inválida.' });
        return true;
      }
      const saved = backendStorage.saveState(body.state);
      sendJson(res, 200, { ok: true, state: saved });
      return true;
    }

    // 4. POST /api/reset — Restaurar datos semilla en el servidor
    if (method === 'POST' && pathname === '/api/reset') {
      const state = backendStorage.resetState();
      sendJson(res, 200, { ok: true, state });
      return true;
    }

    // 5. GET /api/efirma/status — Consultar estado de bóveda criptográfica AES-256-GCM
    if (method === 'GET' && pathname === '/api/efirma/status') {
      const rbac = assertRoleAccess(actor.rol, ['propietario']);
      if (!rbac.ok) {
        sendJson(res, 403, { ok: false, error: rbac.error });
        return true;
      }
      const empresaId = parsedUrl.searchParams.get('empresaId') || actor.empresaId;
      const state = backendStorage.loadState();
      const efirmaMeta = state.efirmas.find((e) => e.empresa_id === empresaId) || null;
      const vaultStatus = getPublicVaultStatus(empresaId);
      sendJson(res, 200, {
        ok: true,
        efirma: efirmaMeta,
        vault: vaultStatus,
      });
      return true;
    }

    // 6. POST /api/efirma/upload — Validación X.509 real (.cer/.key) y cifrado AES-256-GCM en Bóveda
    if (method === 'POST' && pathname === '/api/efirma/upload') {
      const rbac = assertRoleAccess(actor.rol, ['propietario']);
      if (!rbac.ok) {
        sendJson(res, 403, { ok: false, error: rbac.error });
        return true;
      }

      const raw = await readRequestBody(req);
      const body = safeJsonParse<{
        empresaId: string;
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

      const state = backendStorage.loadState();
      const emp =
        state.empresas.find((e) => e.id === (body.empresaId || actor.empresaId)) ||
        state.empresas[0];

      const validation = inspectAndValidateEfirma({
        empresaId: emp.id,
        expectedRfc: emp.rfc,
        cerFileName: body.cerFileName,
        cerBase64: body.cerBase64 || '',
        keyFileName: body.keyFileName,
        keyBase64: body.keyBase64 || '',
        password: body.password,
        usuario: actor.usuario,
      });

      if (!validation.ok) {
        sendJson(res, 422, { ok: false, error: validation.error });
        return true;
      }

      const nowIso = new Date().toISOString();
      const remDays = daysUntil(validation.vigenciaHasta!);
      const estadoEfirma =
        remDays < 0 ? 'vencida' : remDays <= 30 ? 'por_vencer' : 'activa';
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
              actualizada_por: actor.usuario,
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
            actualizada_por: actor.usuario,
          },
        ];

      const nextState: FiscalDatabaseState = {
        ...state,
        efirmas: updatedEfirmas,
        bitacora: [
          {
            id: `bit-ef-srv-${Date.now()}`,
            empresa_id: emp.id,
            usuario: actor.usuario,
            rol: 'propietario',
            modulo: 'e.firma (Bóveda Backend)',
            accion: 'Cifrado AES-256-GCM de e.firma (.cer/.key)',
            detalle: `Serie ${validation.numeroSerie} validada (X.509 FIEL) y resguardada en Bóveda AES-256-GCM hasta ${validation.vigenciaHasta}`,
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
        state: saved,
      });
      return true;
    }

    // 7. POST /api/sat/sync — Ejecutar sincronización Web Service SAT en el Backend
    if (method === 'POST' && pathname === '/api/sat/sync') {
      const rbac = assertRoleAccess(actor.rol, ['propietario', 'contador']);
      if (!rbac.ok) {
        sendJson(res, 403, { ok: false, error: rbac.error });
        return true;
      }

      const raw = await readRequestBody(req);
      const body = safeJsonParse<{ empresaId?: string }>(raw);
      const targetEmpresaId = body?.empresaId || actor.empresaId;
      const state = backendStorage.loadState();

      const { nextState, newLog, soapPreview } = executeSatSyncJobOnServer(
        state,
        targetEmpresaId,
        actor.usuario,
      );
      const saved = backendStorage.saveState(nextState);

      sendJson(res, 200, {
        ok: true,
        log: newLog,
        soapPreview,
        state: saved,
      });
      return true;
    }

    // 8. GET /api/sat/soap-preview — Inspeccionar sobre SOAP XML-DSig generado por el Backend
    if (method === 'GET' && pathname === '/api/sat/soap-preview') {
      const empresaId = parsedUrl.searchParams.get('empresaId') || actor.empresaId;
      const state = backendStorage.loadState();
      const emp = state.empresas.find((e) => e.id === empresaId) || state.empresas[0];
      const soapPreview = buildSatAuthSoapEnvelope(emp.id, emp.rfc);
      sendJson(res, 200, { ok: true, soapPreview });
      return true;
    }

    // 9. POST /api/sat/historical — Programar descarga histórica multianual en Backend
    if (method === 'POST' && pathname === '/api/sat/historical') {
      const rbac = assertRoleAccess(actor.rol, ['propietario', 'contador']);
      if (!rbac.ok) {
        sendJson(res, 403, { ok: false, error: rbac.error });
        return true;
      }

      const raw = await readRequestBody(req);
      const body = safeJsonParse<{ empresaId?: string; years?: number[] }>(raw);
      const years = Array.isArray(body?.years) && body.years.length > 0 ? body.years : [2025];
      const state = backendStorage.loadState();

      const { nextState, requestsCreated } = executeHistoricalSatJobOnServer(
        state,
        body?.empresaId || actor.empresaId,
        years,
        actor.usuario,
      );
      const saved = backendStorage.saveState(nextState);
      sendJson(res, 200, { ok: true, requestsCreated, state: saved });
      return true;
    }

    // 10. POST /api/sat/import-batch — Upsert masivo de lote de CFDIs en servidor
    if (method === 'POST' && pathname === '/api/sat/import-batch') {
      const rbac = assertRoleAccess(actor.rol, ['propietario', 'contador', 'pagos']);
      if (!rbac.ok) {
        sendJson(res, 403, { ok: false, error: rbac.error });
        return true;
      }

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

      const state = backendStorage.loadState();
      const result = importCfdiBatchOnServer(
        state,
        body.empresaId || actor.empresaId,
        body.items,
        body.sourceLabel || 'Carga masiva XML/ZIP',
        actor.usuario,
      );
      const saved = backendStorage.saveState(result.nextState);
      sendJson(res, 200, {
        ok: true,
        importedCount: result.importedCount,
        emitidosCount: result.emitidosCount,
        recibidosCount: result.recibidosCount,
        state: saved,
      });
      return true;
    }

    // 11. GET /api/calculos/fiscal — Cálculos ejecutados en el servidor (IVA, ISR, Visor, Indicadores)
    if (method === 'GET' && pathname === '/api/calculos/fiscal') {
      const empresaId = parsedUrl.searchParams.get('empresaId') || actor.empresaId;
      const periodo = parsedUrl.searchParams.get('periodo') || '2026-10';
      const year = periodo.slice(0, 4);

      const waf = inspectPayloadForThreats([empresaId, periodo]);
      if (!waf.safe) {
        sendJson(res, 403, { ok: false, error: waf.reason });
        return true;
      }

      const state = backendStorage.loadState();
      const emp = state.empresas.find((e) => e.id === empresaId) || state.empresas[0];

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

    // 12. POST /api/aspel/sync — Sincronización contable Aspel SAE en el servidor
    if (method === 'POST' && pathname === '/api/aspel/sync') {
      const rbac = assertRoleAccess(actor.rol, ['propietario', 'contador']);
      if (!rbac.ok) {
        sendJson(res, 403, { ok: false, error: rbac.error });
        return true;
      }

      const raw = await readRequestBody(req);
      const body = safeJsonParse<{ empresaId?: string }>(raw);
      const state = backendStorage.loadState();
      const { nextState, linkedCount } = syncAspelPendingOnServer(
        state,
        body?.empresaId || actor.empresaId,
        actor.usuario,
      );
      const saved = backendStorage.saveState(nextState);
      sendJson(res, 200, { ok: true, linkedCount, state: saved });
      return true;
    }

    sendJson(res, 404, { ok: false, error: `Endpoint no encontrado: ${method} ${pathname}` });
    return true;
  } catch (err) {
    sendJson(res, 500, {
      ok: false,
      error: err instanceof Error ? err.message : 'Error interno en el servidor backend.',
    });
    return true;
  }
}
