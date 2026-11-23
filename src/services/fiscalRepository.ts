import type {
  Cfdi,
  CfdiConcepto,
  CfdiPago,
  CfdiRelacion,
  FiscalDatabaseState,
  RolEmpresa,
} from '../types/fiscal';
import { createInitialSeed } from '../data/mockSeed';
import { safeJsonParse, stripSensitiveSecrets } from '../utils/security';

const STORAGE_KEY = 'tecnocontrol_fiscal_db_v1';
const API_BASE = '/api';

const LEGACY_DEMO_USER_EMAILS = new Set([
  'direccion@tecnocontrol.com.mx',
  'pagos@tecnocontrol.com.mx',
  'gerencia.admin@tecnocontrol.com.mx',
  'aux.contable@tecnocontrol.com.mx',
]);

function normalizeSingleNayraProfile(state: FiscalDatabaseState): FiscalDatabaseState {
  if (!Array.isArray(state.usuarios)) return state;
  const cleanedUsers = state.usuarios
    .filter((u) => !LEGACY_DEMO_USER_EMAILS.has(u.correo.toLowerCase()))
    .map((u) =>
      u.correo.toLowerCase() === 'contabilidad@tecnocontrol.com.mx'
        ? { ...u, nombre: 'C.P. Nayra Mendoza', rol: 'propietario' as const }
        : u,
    );
  return {
    ...state,
    usuarios: cleanedUsers,
  };
}

export interface BackendActorHeaders {
  rol: RolEmpresa;
  usuario: string;
  empresaId: string;
}

export interface BackendHealthStatus {
  ok: boolean;
  service: string;
  version: string;
  status: string;
  timestamp: string;
  storage: {
    driver: string;
    dbPath: string;
    fileSizeBytes: number;
    lastModified: string;
    totalCfdis: number;
    totalEmpresas: number;
  };
  vault: {
    configuredInVault: boolean;
    algoritmo: string;
    kdf: string;
    rfc?: string;
    numeroSerie?: string;
    cerSha256?: string;
    keySha256?: string;
    updatedAt?: string;
    updatedBy?: string;
  };
}

export interface AuthUserProfile {
  id: string;
  nombre: string;
  correo: string;
  rol: RolEmpresa;
  area: string;
  ultimoAcceso?: string;
}

export interface SatSoapPreviewResponse {
  endpoint: string;
  soapAction: string;
  timestampCreated: string;
  timestampExpires: string;
  digestSha1Base64: string;
  signedWithVault: boolean;
  rfcSolicitante: string;
  numeroSerieFiel: string;
  soapXml: string;
}

function buildHeaders(actor?: BackendActorHeaders): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-fiscal-role': actor?.rol || 'propietario',
    'x-fiscal-user': encodeURIComponent(actor?.usuario || 'C.P. Nayra Mendoza'),
    'x-fiscal-empresa': actor?.empresaId || 'emp-hedma',
  };
}

export interface FiscalDataRepository {
  getSession(): Promise<{
    authenticated: boolean;
    user: AuthUserProfile | null;
    expiresAt?: string | null;
    online: boolean;
  }>;
  login(payload: {
    email: string;
    password: string;
    rememberMe?: boolean;
  }): Promise<{
    ok: boolean;
    user?: AuthUserProfile;
    expiresAt?: string;
    error?: string;
  }>;
  logout(): Promise<void>;
  changePassword(payload: {
    currentPassword: string;
    newPassword: string;
  }): Promise<{ ok: boolean; error?: string }>;
  load(): FiscalDatabaseState;
  save(state: FiscalDatabaseState, actor?: BackendActorHeaders): void;
  reset(actor?: BackendActorHeaders): FiscalDatabaseState;
  fetchRemoteState(actor?: BackendActorHeaders): Promise<{
    state: FiscalDatabaseState | null;
    online: boolean;
    unauthorized?: boolean;
    health?: BackendHealthStatus;
  }>;
  uploadEfirmaToVault(
    payload: {
      empresaId: string;
      cerFile: File;
      keyFile: File;
      password: string;
    },
    actor?: BackendActorHeaders,
  ): Promise<{
    ok: boolean;
    error?: string;
    state?: FiscalDatabaseState;
    vault?: BackendHealthStatus['vault'];
  }>;
  getEfirmaVaultStatus(
    empresaId: string,
    actor?: BackendActorHeaders,
  ): Promise<BackendHealthStatus['vault'] | null>;
  triggerBackendSatSync(
    empresaId: string,
    actor?: BackendActorHeaders,
  ): Promise<{
    ok: boolean;
    state?: FiscalDatabaseState;
    soapPreview?: SatSoapPreviewResponse;
  }>;
  getBackendSatSoapPreview(
    empresaId: string,
    actor?: BackendActorHeaders,
  ): Promise<SatSoapPreviewResponse | null>;
  triggerBackendHistoricalSat(
    empresaId: string,
    years: number[],
    actor?: BackendActorHeaders,
  ): Promise<{ ok: boolean; requestsCreated?: number; state?: FiscalDatabaseState }>;
  importBatchOnBackend(
    empresaId: string,
    items: Array<{
      cfdi: Cfdi;
      conceptos: CfdiConcepto[];
      relaciones: CfdiRelacion[];
      pagos?: CfdiPago[];
    }>,
    sourceLabel: string,
    actor?: BackendActorHeaders,
  ): Promise<{ ok: boolean; importedCount?: number; state?: FiscalDatabaseState }>;
  syncAspelOnBackend(
    empresaId: string,
    actor?: BackendActorHeaders,
  ): Promise<{ ok: boolean; linkedCount?: number; state?: FiscalDatabaseState }>;
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

class HybridBackendFiscalRepository implements FiscalDataRepository {
  async getSession() {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        method: 'GET',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        return { authenticated: false, user: null, online: false };
      }
      const data = (await res.json()) as {
        ok: boolean;
        authenticated?: boolean;
        user?: AuthUserProfile | null;
        expiresAt?: string | null;
      };
      return {
        authenticated: Boolean(data.ok && data.authenticated && data.user),
        user: data.user || null,
        expiresAt: data.expiresAt || null,
        online: true,
      };
    } catch {
      return { authenticated: false, user: null, online: false };
    }
  }

  async login(payload: { email: string; password: string; rememberMe?: boolean }) {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        ok: boolean;
        user?: AuthUserProfile;
        expiresAt?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.user) {
        return {
          ok: false,
          error: data.error || 'No fue posible iniciar sesión. Verifica tus credenciales.',
        };
      }
      return { ok: true, user: data.user, expiresAt: data.expiresAt };
    } catch {
      return {
        ok: false,
        error: 'No se pudo conectar con el servidor de acceso. Intenta nuevamente.',
      };
    }
  }

  async logout() {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      // ignore network error on logout
    }
  }

  async changePassword(payload: { currentPassword: string; newPassword: string }) {
    try {
      const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || 'No se pudo actualizar la contraseña.' };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: 'Error de conexión al actualizar la contraseña.' };
    }
  }

  load(): FiscalDatabaseState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const seed = createInitialSeed();
        this.saveLocalOnly(seed);
        return seed;
      }
      const parsed = safeJsonParse<FiscalDatabaseState>(raw);
      if (!parsed || !Array.isArray(parsed.empresas) || parsed.empresas.length === 0) {
        const seed = createInitialSeed();
        this.saveLocalOnly(seed);
        return seed;
      }
      const normalized = normalizeSingleNayraProfile(parsed);
      this.saveLocalOnly(normalized);
      return normalized;
    } catch {
      return createInitialSeed();
    }
  }

  private saveLocalOnly(state: FiscalDatabaseState): void {
    try {
      const sanitized = stripSensitiveSecrets(normalizeSingleNayraProfile(state));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    } catch {
      // ignore quota errors
    }
  }

  save(state: FiscalDatabaseState, actor?: BackendActorHeaders): void {
    const normalized = normalizeSingleNayraProfile(state);
    this.saveLocalOnly(normalized);
    // Sincronizar de forma asíncrona con el servidor (/api/state)
    void fetch(`${API_BASE}/state`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: buildHeaders(actor),
      body: JSON.stringify({ state: stripSensitiveSecrets(normalized) }),
    }).catch(() => {
      // Respaldo transparente si se ejecuta desconectado
    });
  }

  reset(actor?: BackendActorHeaders): FiscalDatabaseState {
    const seed = createInitialSeed();
    this.saveLocalOnly(seed);
    void fetch(`${API_BASE}/reset`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: buildHeaders(actor),
    }).catch(() => {});
    return seed;
  }

  async fetchRemoteState(actor?: BackendActorHeaders) {
    try {
      const [stateRes, healthRes] = await Promise.all([
        fetch(`${API_BASE}/state`, { credentials: 'same-origin', headers: buildHeaders(actor) }),
        fetch(`${API_BASE}/health`, { credentials: 'same-origin', headers: buildHeaders(actor) }),
      ]);
      if (stateRes.status === 401) {
        return { state: null, online: true, unauthorized: true };
      }
      if (!stateRes.ok) {
        return { state: null, online: false };
      }
      const stateJson = (await stateRes.json()) as {
        ok: boolean;
        state?: FiscalDatabaseState;
      };
      const healthJson = healthRes.ok
        ? ((await healthRes.json()) as BackendHealthStatus)
        : undefined;

      if (stateJson.ok && stateJson.state) {
        const normalized = normalizeSingleNayraProfile(stateJson.state);
        this.saveLocalOnly(normalized);
        return { state: normalized, online: true, health: healthJson };
      }
      return { state: null, online: false };
    } catch {
      return { state: null, online: false };
    }
  }

  async uploadEfirmaToVault(
    payload: {
      empresaId: string;
      cerFile: File;
      keyFile: File;
      password: string;
    },
    actor?: BackendActorHeaders,
  ) {
    try {
      const [cerBase64, keyBase64] = await Promise.all([
        fileToBase64(payload.cerFile),
        fileToBase64(payload.keyFile),
      ]);

      const res = await fetch(`${API_BASE}/efirma/upload`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: buildHeaders(actor),
        body: JSON.stringify({
          empresaId: payload.empresaId,
          cerFileName: payload.cerFile.name,
          cerBase64,
          keyFileName: payload.keyFile.name,
          keyBase64,
          password: payload.password,
        }),
      });

      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        state?: FiscalDatabaseState;
        vault?: BackendHealthStatus['vault'];
      };

      if (!res.ok || !data.ok) {
        return {
          ok: false,
          error: data.error || 'No fue posible validar ni cifrar la e.firma en el servidor.',
        };
      }

      if (data.state) {
        this.saveLocalOnly(data.state);
      }
      return {
        ok: true,
        state: data.state,
        vault: data.vault,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Error de red al conectar con el backend.',
      };
    }
  }

  async getEfirmaVaultStatus(empresaId: string, actor?: BackendActorHeaders) {
    try {
      const res = await fetch(
        `${API_BASE}/efirma/status?empresaId=${encodeURIComponent(empresaId)}`,
        { credentials: 'same-origin', headers: buildHeaders(actor) },
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        ok: boolean;
        vault?: BackendHealthStatus['vault'];
      };
      return data.vault || null;
    } catch {
      return null;
    }
  }

  async triggerBackendSatSync(empresaId: string, actor?: BackendActorHeaders) {
    try {
      const res = await fetch(`${API_BASE}/sat/sync`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: buildHeaders(actor),
        body: JSON.stringify({ empresaId }),
      });
      if (!res.ok) return { ok: false };
      const data = (await res.json()) as {
        ok: boolean;
        state?: FiscalDatabaseState;
        soapPreview?: SatSoapPreviewResponse;
      };
      if (data.state) this.saveLocalOnly(data.state);
      return data;
    } catch {
      return { ok: false };
    }
  }

  async getBackendSatSoapPreview(empresaId: string, actor?: BackendActorHeaders) {
    try {
      const res = await fetch(
        `${API_BASE}/sat/soap-preview?empresaId=${encodeURIComponent(empresaId)}`,
        { credentials: 'same-origin', headers: buildHeaders(actor) },
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        ok: boolean;
        soapPreview?: SatSoapPreviewResponse;
      };
      return data.soapPreview || null;
    } catch {
      return null;
    }
  }

  async triggerBackendHistoricalSat(
    empresaId: string,
    years: number[],
    actor?: BackendActorHeaders,
  ) {
    try {
      const res = await fetch(`${API_BASE}/sat/historical`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: buildHeaders(actor),
        body: JSON.stringify({ empresaId, years }),
      });
      if (!res.ok) return { ok: false };
      const data = (await res.json()) as {
        ok: boolean;
        requestsCreated?: number;
        state?: FiscalDatabaseState;
      };
      if (data.state) this.saveLocalOnly(data.state);
      return data;
    } catch {
      return { ok: false };
    }
  }

  async importBatchOnBackend(
    empresaId: string,
    items: Array<{
      cfdi: Cfdi;
      conceptos: CfdiConcepto[];
      relaciones: CfdiRelacion[];
      pagos?: CfdiPago[];
    }>,
    sourceLabel: string,
    actor?: BackendActorHeaders,
  ) {
    try {
      const res = await fetch(`${API_BASE}/sat/import-batch`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: buildHeaders(actor),
        body: JSON.stringify({ empresaId, items, sourceLabel }),
      });
      if (!res.ok) return { ok: false };
      const data = (await res.json()) as {
        ok: boolean;
        importedCount?: number;
        state?: FiscalDatabaseState;
      };
      if (data.state) this.saveLocalOnly(data.state);
      return data;
    } catch {
      return { ok: false };
    }
  }

  async syncAspelOnBackend(empresaId: string, actor?: BackendActorHeaders) {
    try {
      const res = await fetch(`${API_BASE}/aspel/sync`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: buildHeaders(actor),
        body: JSON.stringify({ empresaId }),
      });
      if (!res.ok) return { ok: false };
      const data = (await res.json()) as {
        ok: boolean;
        linkedCount?: number;
        state?: FiscalDatabaseState;
      };
      if (data.state) this.saveLocalOnly(data.state);
      return data;
    } catch {
      return { ok: false };
    }
  }
}

export const fiscalRepository: FiscalDataRepository = new HybridBackendFiscalRepository();
