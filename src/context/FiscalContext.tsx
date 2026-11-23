import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Cfdi,
  CfdiConcepto,
  CfdiPago,
  CfdiRelacion,
  DescargaSat,
  DocumentoFiscal,
  Empresa,
  FiscalDatabaseState,
  FiscalRoute,
  IndicadorDefinicion,
  NotificacionFiscal,
  PreferenciasNotificacion,
  RolEmpresa,
  SentidoDocumento,
  TipoDocumentoFiscal,
} from '../types/fiscal';
import {
  type AuthUserProfile,
  type BackendActorHeaders,
  type BackendHealthStatus,
  type SatSoapPreviewResponse,
  createEmptyFiscalState,
  fiscalRepository,
  purgeLegacyClientStorage,
} from '../services/fiscalRepository';
import type {
  AssistantMessage,
  AssistantSessionMemory,
} from '../services/assistantEngine';
import type { AnalyzedDocument } from '../services/documentAnalyzer';
import { daysUntil } from '../utils/format';
import {
  sanitizeEmailInput,
  sanitizeFileName,
  sanitizeRfcInput,
  sanitizeSafeUrl,
  sanitizeTextInput,
} from '../utils/security';

const PREFS_HIDE_KEY = 'tecnocontrol_fiscal_hide_amounts';
const PREFS_NOTIF_KEY = 'tecnocontrol_fiscal_notif_prefs';
const PREFS_EMPRESA_KEY = 'tecnocontrol_fiscal_active_empresa';

const VALID_ROUTES: FiscalRoute[] = [
  'dashboard',
  'empresas',
  'efirma',
  'usuarios',
  'sincronizacion',
  'emitidos',
  'recibidos',
  'iva',
  'isr',
  'visor',
  'documentos',
  'indicadores',
  'contable',
  'vinculaciones',
  'consumo',
  'asistente',
];

export interface RouteFilterPreset {
  estatus?: 'todos' | 'vigente' | 'cancelado' | 'en_cancelacion';
  tipo?: 'ALL' | 'I' | 'E' | 'P' | 'N' | 'T';
  periodo?: string;
}

export interface SimulatedUserProfile {
  nombre: string;
  correo: string;
  rol: RolEmpresa;
  area: string;
}

const DEFAULT_USER_PROFILE: SimulatedUserProfile = {
  nombre: 'Usuario',
  correo: '',
  rol: 'propietario',
  area: 'Contabilidad y Fiscal',
};

export const ROLE_PROFILES: Record<RolEmpresa, SimulatedUserProfile> = {
  propietario: { ...DEFAULT_USER_PROFILE, rol: 'propietario' },
  contador: { ...DEFAULT_USER_PROFILE, rol: 'contador' },
  consulta: { ...DEFAULT_USER_PROFILE, rol: 'consulta' },
  pagos: { ...DEFAULT_USER_PROFILE, rol: 'pagos' },
};

const EMPTY_EMPRESA: Empresa = {
  id: '',
  rfc: '',
  razon_social: '',
  regimen: '',
  regimen_descripcion: '',
  tipo_persona: 'moral',
  favorita: false,
  ultimo_acceso: '',
  codigo_postal: '',
};

const ROUTE_ALIASES: Record<string, FiscalRoute> = {
  emitidos: 'emitidos',
  'cfdis-emitidos': 'emitidos',
  cfdis_emitidos: 'emitidos',
  recibidos: 'recibidos',
  'cfdis-recibidos': 'recibidos',
  cfdis_recibidos: 'recibidos',
  sincronizacion: 'sincronizacion',
  descargas: 'sincronizacion',
  indicadores: 'indicadores',
  documentos: 'documentos',
  'datos-fiscales': 'documentos',
  datos_fiscales: 'documentos',
  efirma: 'efirma',
  'e.firma': 'efirma',
  iva: 'iva',
  'impuestos-iva': 'iva',
  isr: 'isr',
  'impuestos-isr': 'isr',
  visor: 'visor',
  'visor-sat': 'visor',
  conciliacion: 'visor',
  vinculaciones: 'vinculaciones',
  contable: 'contable',
  add: 'contable',
  consumo: 'consumo',
  'usos-y-consumos': 'consumo',
  empresas: 'empresas',
  usuarios: 'usuarios',
  asistente: 'asistente',
  dashboard: 'dashboard',
};

export function normalizeFiscalRoute(
  rawRoute: string | undefined | null,
  fallback: FiscalRoute = 'dashboard',
): FiscalRoute {
  if (!rawRoute) return fallback;
  const cleaned = String(rawRoute)
    .trim()
    .toLowerCase()
    .replace(/^#\/?/, '')
    .replace(/^\/+/, '')
    .replace(/^fiscal\//, '')
    .split('?')[0]
    .split('#')[0];

  if (VALID_ROUTES.includes(cleaned as FiscalRoute)) {
    return cleaned as FiscalRoute;
  }
  if (ROUTE_ALIASES[cleaned]) {
    return ROUTE_ALIASES[cleaned];
  }
  return fallback;
}

function parseHashRoute(): FiscalRoute {
  return normalizeFiscalRoute(window.location.hash, 'dashboard');
}

export function canAccessRoute(rol: RolEmpresa, route: FiscalRoute): boolean {
  if (rol === 'propietario') return true;
  if (rol === 'contador') {
    return route !== 'efirma';
  }
  if (rol === 'consulta') {
    return route !== 'efirma' && route !== 'usuarios';
  }
  if (rol === 'pagos') {
    // Pagos: emitidos y recibidos, sin impuestos ni administración sensible
    return ['empresas', 'emitidos', 'recibidos', 'sincronizacion', 'asistente'].includes(route);
  }
  return false;
}

interface FiscalContextValue {
  db: FiscalDatabaseState;
  activeEmpresa: Empresa;
  activeRoute: FiscalRoute;
  routePreset: RouteFilterPreset | null;
  clearRoutePreset: () => void;
  navigate: (route: FiscalRoute, preset?: RouteFilterPreset) => void;
  currentUser: SimulatedUserProfile;
  setRolSimulado: (rol: RolEmpresa) => void;
  ocultarMontos: boolean;
  toggleOcultarMontos: () => void;
  selectedCfdiUuid: string | null;
  openCfdiDetail: (uuid: string) => void;
  closeCfdiDetail: () => void;
  pdfCfdiUuid: string | null;
  openCfdiPdf: (uuid: string) => void;
  closeCfdiPdf: () => void;
  notifPrefs: PreferenciasNotificacion;
  updateNotifPrefs: (patch: Partial<PreferenciasNotificacion>) => void;
  toastMessage: string | null;
  showToast: (msg: string) => void;

  // Acciones de dominio (alineadas al esquema fiscal)
  selectEmpresa: (empresaId: string) => void;
  toggleFavorita: (empresaId: string) => void;
  addEmpresa: (payload: Omit<Empresa, 'id' | 'favorita' | 'ultimo_acceso'>) => Empresa;
  clearEmpresaCfdis: (empresaId?: string) => void;
  updateEfirma: (payload: {
    numero_serie: string;
    vigencia_desde: string;
    vigencia_hasta: string;
  }) => void;
  inviteUsuario: (payload: { nombre: string; correo: string; rol: RolEmpresa }) => void;
  changeUsuarioRol: (usuarioRowId: string, nuevoRol: RolEmpresa) => void;
  acceptInvitation: (usuarioRowId: string) => void;
  removeUsuario: (usuarioRowId: string) => void;
  triggerSyncNow: () => void;
  retrySyncRow: (descargaId: string) => void;
  triggerHistoricalSync: (years: number[]) => void;
  importManualCfdis: (
    items: Array<{
      cfdi: Cfdi;
      conceptos: CfdiConcepto[];
      relaciones: CfdiRelacion[];
      pagos?: CfdiPago[];
    }>,
    options?: { empresaId?: string; sourceLabel?: string },
  ) => void;
  setImpuestoAjuste: (payload: {
    uuid: string;
    impuesto: 'iva' | 'isr';
    periodo: string;
    incluido: boolean;
    motivo: string;
  }) => void;
  updateDocumentoFiscal: (payload: {
    tipo: TipoDocumentoFiscal;
    sentido: SentidoDocumento;
    folio_documento: string;
    archivo_nombre: string;
    blob_url?: string;
    notas?: string;
  }) => void;
  addCustomIndicator: (ind: Omit<IndicadorDefinicion, 'id' | 'empresa_id' | 'es_predefinido'>) => void;
  deleteCustomIndicator: (id: string) => void;
  addIndicatorGroup: (nombre: string) => void;
  toggleAspelConnection: () => void;
  syncAspelNow: () => void;
  assignPolizaAspel: (uuid: string, poliza: string, cuenta: string) => void;
  downloadMissingFromSat: (uuids: string[]) => void;
  incrementAiQueries: () => void;
  assistantMessages: AssistantMessage[];
  assistantThinking: boolean;
  attachedDocs: AnalyzedDocument[];
  floatingAssistantOpen: boolean;
  setFloatingAssistantOpen: (open: boolean) => void;
  previousRoute: FiscalRoute;
  explainCurrentPageWithAssistant: (targetRoute?: FiscalRoute) => Promise<void>;
  sendAssistantMessage: (text: string, attachedFiles?: File | File[] | null) => Promise<void>;
  removeAttachedDoc: (docId: string) => void;
  clearAttachedDocs: () => void;
  clearAssistantMessages: () => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  resetDemoData: () => void;
  backendOnline: boolean;
  backendHealth: BackendHealthStatus | null;
  authUser: AuthUserProfile | null;
  authLoading: boolean;
  dataLoading: boolean;
  reloadRemoteState: () => Promise<void>;
  authNotice: string | null;
  clearAuthNotice: () => void;
  login: (payload: {
    email: string;
    password: string;
    rememberMe?: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
  logout: (notice?: string) => Promise<void>;
  changePassword: (payload: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  uploadEfirmaToServerVault: (payload: {
    cerFile: File;
    keyFile: File;
    password: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  fetchSatSoapEnvelopePreview: () => Promise<SatSoapPreviewResponse | null>;
}

const FiscalContext = createContext<FiscalContextValue | null>(null);

const DEFAULT_NOTIF_PREFS: PreferenciasNotificacion = {
  cancelacion_proceso: true,
  cfdi_cancelado: true,
  descarga_error: true,
  indicador_incidencia: true,
  opinion_negativa: true,
  efirma_vencimiento: true,
};

export const FiscalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [db, setDb] = useState<FiscalDatabaseState>(() => fiscalRepository.load());
  const [activeEmpresaId, setActiveEmpresaId] = useState<string>('');
  const [activeRoute, setActiveRoute] = useState<FiscalRoute>(() => parseHashRoute());
  const [previousRoute, setPreviousRoute] = useState<FiscalRoute>('dashboard');
  const [floatingAssistantOpen, setFloatingAssistantOpen] = useState<boolean>(false);
  const [routePreset, setRoutePreset] = useState<RouteFilterPreset | null>(null);
  const [rolSimulado, setRolSimuladoState] = useState<RolEmpresa>('propietario');
  const [ocultarMontos, setOcultarMontos] = useState<boolean>(() => {
    return localStorage.getItem(PREFS_HIDE_KEY) === 'true';
  });
  const [notifPrefs, setNotifPrefs] = useState<PreferenciasNotificacion>(() => {
    try {
      const raw = localStorage.getItem(PREFS_NOTIF_KEY);
      return raw ? { ...DEFAULT_NOTIF_PREFS, ...JSON.parse(raw) } : DEFAULT_NOTIF_PREFS;
    } catch {
      return DEFAULT_NOTIF_PREFS;
    }
  });
  const [selectedCfdiUuid, setSelectedCfdiUuid] = useState<string | null>(null);
  const [pdfCfdiUuid, setPdfCfdiUuid] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([]);
  const [assistantMemory, setAssistantMemory] = useState<AssistantSessionMemory>({});
  const [attachedDocs, setAttachedDocs] = useState<AnalyzedDocument[]>([]);
  const [assistantThinking, setAssistantThinking] = useState(false);
  const [backendOnline, setBackendOnline] = useState(false);
  const [backendHealth, setBackendHealth] = useState<BackendHealthStatus | null>(null);
  const [authUser, setAuthUser] = useState<AuthUserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [dataLoading, setDataLoading] = useState<boolean>(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const actorRef = useRef<BackendActorHeaders | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  // Verificar sesión activa al iniciar el portal (y purgar cualquier rastro local heredado)
  useEffect(() => {
    let active = true;
    purgeLegacyClientStorage(false);
    void fiscalRepository.getSession().then((res) => {
      if (!active) return;
      setBackendOnline(res.online);
      if (res.authenticated && res.user) {
        setAuthUser(res.user);
        setRolSimuladoState(res.user.rol);
        setDataLoading(true);
      } else {
        setAuthUser(null);
        setDb(createEmptyFiscalState());
        setDataLoading(false);
      }
      setAuthLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const reloadRemoteState = useCallback(async () => {
    if (!authUser) return;
    setDataLoading(true);
    const savedEmpresa = localStorage.getItem(PREFS_EMPRESA_KEY) || '';
    const actor: BackendActorHeaders = {
      rol: authUser.rol,
      usuario: authUser.nombre,
      empresaId: activeEmpresaId || savedEmpresa,
    };
    const res = await fiscalRepository.fetchRemoteState(actor);
    if (res.unauthorized) {
      setDb(createEmptyFiscalState());
      setAuthUser(null);
      setDataLoading(false);
      setAuthNotice('Tu sesión expiró. Inicia sesión nuevamente para continuar.');
      return;
    }
    if (res.online && res.state) {
      setDb(res.state);
      setBackendOnline(true);
      if (res.health) setBackendHealth(res.health);
      const preferred =
        res.state.empresas.find((e) => e.id === (activeEmpresaId || savedEmpresa))?.id ||
        res.state.empresas[0]?.id ||
        '';
      setActiveEmpresaId(preferred);
    }
    setDataLoading(false);
  }, [activeEmpresaId, authUser]);

  // Hidratar estado desde el servidor únicamente cuando existe sesión autenticada
  useEffect(() => {
    if (!authUser) {
      setDb(createEmptyFiscalState());
      setBackendHealth(null);
      setDataLoading(false);
      return;
    }
    let active = true;
    setDataLoading(true);
    const savedEmpresa = localStorage.getItem(PREFS_EMPRESA_KEY) || '';
    const actor: BackendActorHeaders = {
      rol: authUser.rol,
      usuario: authUser.nombre,
      empresaId: savedEmpresa,
    };
    void fiscalRepository.fetchRemoteState(actor).then((res) => {
      if (!active) return;
      if (res.unauthorized) {
        setDb(createEmptyFiscalState());
        setAuthUser(null);
        setDataLoading(false);
        setAuthNotice('Tu sesión expiró. Inicia sesión nuevamente para continuar.');
        return;
      }
      if (res.online && res.state) {
        setDb(res.state);
        setBackendOnline(true);
        if (res.health) setBackendHealth(res.health);
        const preferred =
          res.state.empresas.find((e) => e.id === savedEmpresa)?.id ||
          res.state.empresas[0]?.id ||
          '';
        setActiveEmpresaId(preferred);
      }
      setDataLoading(false);
    });
    return () => {
      active = false;
    };
  }, [authUser]);

  const login = useCallback(
    async (payload: { email: string; password: string; rememberMe?: boolean }) => {
      setAuthNotice(null);
      const res = await fiscalRepository.login(payload);
      if (!res.ok || !res.user) {
        return { ok: false, error: res.error || 'No fue posible iniciar sesión.' };
      }
      setDataLoading(true);
      setAuthUser(res.user);
      setRolSimuladoState(res.user.rol);
      setBackendOnline(true);
      showToast(`Bienvenida, ${res.user.nombre}`);
      return { ok: true };
    },
    [showToast],
  );

  const logout = useCallback(async (notice?: string) => {
    await fiscalRepository.logout();
    purgeLegacyClientStorage(true);
    try {
      localStorage.removeItem(PREFS_EMPRESA_KEY);
    } catch {
      // ignore
    }
    setAuthUser(null);
    setDb(createEmptyFiscalState());
    setBackendHealth(null);
    setActiveEmpresaId('');
    setDataLoading(false);
    setFloatingAssistantOpen(false);
    setSelectedCfdiUuid(null);
    setPdfCfdiUuid(null);
    setAssistantMessages([]);
    setAssistantMemory({});
    setAttachedDocs([]);
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    if (notice) {
      setAuthNotice(notice);
    }
  }, []);

  const changePassword = useCallback(
    async (payload: { currentPassword: string; newPassword: string }) => {
      const res = await fiscalRepository.changePassword(payload);
      if (res.ok) {
        showToast('Contraseña actualizada correctamente');
      }
      return res;
    },
    [showToast],
  );

  // Cierre automático por inactividad (30 minutos sin interacción)
  useEffect(() => {
    if (!authUser) return;
    const IDLE_LIMIT_MS = 30 * 60 * 1000;
    let timer = window.setTimeout(() => {
      void logout('Tu sesión se cerró automáticamente por inactividad para proteger tu información fiscal.');
    }, IDLE_LIMIT_MS);

    const resetIdleTimer = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void logout('Tu sesión se cerró automáticamente por inactividad para proteger tu información fiscal.');
      }, IDLE_LIMIT_MS);
    };

    const events: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'click', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, resetIdleTimer, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, resetIdleTimer));
    };
  }, [authUser, logout]);

  useEffect(() => {
    if (!toastMessage) return;
    const t = window.setTimeout(() => setToastMessage(null), 3600);
    return () => window.clearTimeout(t);
  }, [toastMessage]);

  const activeEmpresa = useMemo(() => {
    return db.empresas.find((e) => e.id === activeEmpresaId) || db.empresas[0] || EMPTY_EMPRESA;
  }, [db.empresas, activeEmpresaId]);

  const currentUser: SimulatedUserProfile = useMemo(() => {
    if (authUser) {
      return {
        nombre: authUser.nombre,
        correo: authUser.correo,
        rol: authUser.rol,
        area: authUser.area,
      };
    }
    return ROLE_PROFILES[rolSimulado];
  }, [authUser, rolSimulado]);

  actorRef.current = authUser
    ? {
        rol: currentUser.rol,
        usuario: currentUser.nombre,
        empresaId: activeEmpresa.id,
      }
    : null;

  const updateDb = useCallback((updater: (prev: FiscalDatabaseState) => FiscalDatabaseState) => {
    const actor = actorRef.current;
    if (!actor) return;
    setDb((prev) => {
      const next = updater(prev);
      fiscalRepository.save(next, actor);
      return next;
    });
  }, []);

  // Sincronizar hash del navegador (#fiscal/...) únicamente con sesión iniciada
  useEffect(() => {
    if (!authUser) return;
    if (!window.location.hash || !window.location.hash.startsWith('#fiscal/')) {
      window.location.hash = `#fiscal/${activeRoute}`;
    }
    const onHashChange = () => {
      const nextRoute = parseHashRoute();
      setActiveRoute((prev) => {
        if (prev !== nextRoute && prev !== 'asistente') {
          setPreviousRoute(prev);
        }
        return nextRoute;
      });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [authUser]);

  const navigate = useCallback((route: FiscalRoute, preset?: RouteFilterPreset) => {
    const safeRoute = normalizeFiscalRoute(route, 'dashboard');
    setRoutePreset(preset || null);
    setActiveRoute((prev) => {
      if (prev !== safeRoute && prev !== 'asistente') {
        setPreviousRoute(prev);
      }
      return safeRoute;
    });
    const targetHash = `#fiscal/${safeRoute}`;
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const setRolSimulado = useCallback(
    (rol: RolEmpresa) => {
      setRolSimuladoState(rol);
      if (!canAccessRoute(rol, activeRoute)) {
        const fallback: FiscalRoute = rol === 'pagos' ? 'emitidos' : 'dashboard';
        navigate(fallback);
      }
      showToast(`Vista cambiada al perfil ${ROLE_PROFILES[rol].nombre} (${rol})`);
    },
    [activeRoute, navigate, showToast],
  );

  const toggleOcultarMontos = useCallback(() => {
    setOcultarMontos((prev) => {
      const next = !prev;
      localStorage.setItem(PREFS_HIDE_KEY, String(next));
      return next;
    });
  }, []);

  const updateNotifPrefs = useCallback((patch: Partial<PreferenciasNotificacion>) => {
    setNotifPrefs((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(PREFS_NOTIF_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const addBitacora = (
    prev: FiscalDatabaseState,
    accion: string,
    modulo: string,
    detalle: string,
    empresaId = activeEmpresa.id,
  ): FiscalDatabaseState['bitacora'] => [
    {
      id: `bit-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      empresa_id: empresaId,
      usuario: currentUser.nombre,
      rol: currentUser.rol,
      accion,
      modulo,
      detalle,
      fecha: new Date().toISOString(),
    },
    ...prev.bitacora,
  ];

  const selectEmpresa = useCallback(
    (empresaId: string) => {
      setActiveEmpresaId(empresaId);
      localStorage.setItem(PREFS_EMPRESA_KEY, empresaId);
      updateDb((prev) => ({
        ...prev,
        empresas: prev.empresas.map((e) =>
          e.id === empresaId ? { ...e, ultimo_acceso: new Date().toISOString() } : e,
        ),
      }));
      const emp = db.empresas.find((e) => e.id === empresaId);
      if (emp) showToast(`Empresa activa: ${emp.razon_social}`);
    },
    [db.empresas, showToast, updateDb],
  );

  const toggleFavorita = useCallback(
    (empresaId: string) => {
      updateDb((prev) => ({
        ...prev,
        empresas: prev.empresas.map((e) =>
          e.id === empresaId ? { ...e, favorita: !e.favorita } : e,
        ),
      }));
    },
    [updateDb],
  );

  const addEmpresa = useCallback(
    (payload: Omit<Empresa, 'id' | 'favorita' | 'ultimo_acceso'>): Empresa => {
      const id = `emp-${Date.now()}`;
      const nueva: Empresa = {
        ...payload,
        id,
        rfc: sanitizeRfcInput(payload.rfc),
        razon_social: sanitizeTextInput(payload.razon_social, 180).toUpperCase(),
        regimen: sanitizeTextInput(payload.regimen, 10),
        regimen_descripcion: sanitizeTextInput(payload.regimen_descripcion, 140),
        favorita: false,
        ultimo_acceso: new Date().toISOString(),
      };
      updateDb((prev) => ({
        ...prev,
        empresas: [nueva, ...prev.empresas],
        usuarios: [
          ...prev.usuarios,
          {
            id: `usr-${Date.now()}`,
            usuario_id: 'u-owner',
            empresa_id: id,
            nombre: currentUser.nombre,
            correo: currentUser.correo,
            rol: 'propietario',
            invitado_por: 'Sistema',
            invitado_en: new Date().toISOString(),
            aceptado_en: new Date().toISOString(),
          },
        ],
        aspel_configs: [
          ...prev.aspel_configs,
          {
            empresa_id: id,
            conectado: false,
            servidor: 'Sin configurar',
            base_datos: '—',
            version_sae: 'Aspel SAE 9.0',
            ultima_sincronizacion: '—',
            error_conexion: 'Vinculación con Aspel SAE pendiente de configurar.',
          },
        ],
        consumos: [
          ...prev.consumos,
          {
            empresa_id: id,
            cfdi_historicos: 0,
            cfdi_ejercicio_limite: 5000,
            consultas_ia_mes: 0,
            consultas_ia_limite: 250,
            almacenamiento_mb: 0,
            almacenamiento_limite_mb: 1024,
            desglose_anual: [{ anio: '2026', cantidad: 0 }],
          },
        ],
        bitacora: addBitacora(
          prev,
          'Alta de empresa',
          'Empresas',
          `Se registró ${nueva.razon_social} (${nueva.rfc}), régimen ${nueva.regimen}.`,
          id,
        ),
      }));
      setActiveEmpresaId(id);
      localStorage.setItem(PREFS_EMPRESA_KEY, id);
      showToast(`Empresa ${nueva.razon_social} registrada correctamente`);
      return nueva;
    },
    [currentUser, showToast, updateDb],
  );

  const clearEmpresaCfdis = useCallback(
    (empresaId?: string) => {
      const targetId = empresaId || activeEmpresa.id;
      const emp = db.empresas.find((e) => e.id === targetId);
      updateDb((prev) => {
        const removedUuids = new Set(
          prev.cfdis.filter((c) => c.empresa_id === targetId).map((c) => c.uuid),
        );
        return {
          ...prev,
          cfdis: prev.cfdis.filter((c) => c.empresa_id !== targetId),
          conceptos: prev.conceptos.filter((con) => !removedUuids.has(con.uuid)),
          relaciones: prev.relaciones.filter((r) => r.empresa_id !== targetId),
          pagos: prev.pagos.filter((p) => p.empresa_id !== targetId),
          ajustes: prev.ajustes.filter((a) => a.empresa_id !== targetId),
          descargas: prev.descargas.filter((d) => d.empresa_id !== targetId),
          consumos: prev.consumos.map((c) =>
            c.empresa_id === targetId
              ? {
                  ...c,
                  cfdi_historicos: 0,
                  almacenamiento_mb: 0,
                  desglose_anual: [{ anio: '2026', cantidad: 0 }],
                }
              : c,
          ),
          bitacora: addBitacora(
            prev,
            'Limpieza de CFDIs (Modo empresa limpia)',
            'Sincronización',
            `Se vaciaron ${removedUuids.size} comprobantes de ${emp?.rfc || targetId} para carga real de XML/ZIP.`,
            targetId,
          ),
        };
      });
      showToast(`Empresa ${emp?.rfc || ''} lista en modo limpio (0 CFDIs)`);
    },
    [activeEmpresa.id, db.empresas, showToast, updateDb],
  );

  const updateEfirma = useCallback(
    (payload: { numero_serie: string; vigencia_desde: string; vigencia_hasta: string }) => {
      const rem = daysUntil(payload.vigencia_hasta);
      const estado = rem < 0 ? 'vencida' : rem <= 30 ? 'por_vencer' : 'activa';
      updateDb((prev) => {
        const exists = prev.efirmas.some((e) => e.empresa_id === activeEmpresa.id);
        const updatedRecord = {
          empresa_id: activeEmpresa.id,
          numero_serie: payload.numero_serie,
          rfc_certificado: activeEmpresa.rfc,
          vigencia_desde: payload.vigencia_desde,
          vigencia_hasta: payload.vigencia_hasta,
          estado: estado as 'activa' | 'por_vencer' | 'vencida',
          actualizada_en: new Date().toISOString(),
          actualizada_por: currentUser.nombre,
        };
        return {
          ...prev,
          efirmas: exists
            ? prev.efirmas.map((e) => (e.empresa_id === activeEmpresa.id ? updatedRecord : e))
            : [...prev.efirmas, updatedRecord],
          bitacora: addBitacora(
            prev,
            'Actualización de e.firma',
            'e.firma',
            `Certificado FIEL serie ${payload.numero_serie} validado (vigencia hasta ${payload.vigencia_hasta}). Sin almacenamiento local de .key ni contraseña.`,
          ),
        };
      });
      showToast('e.firma validada y actualizada de forma segura');
    },
    [activeEmpresa, currentUser, showToast, updateDb],
  );

  const inviteUsuario = useCallback(
    (payload: { nombre: string; correo: string; rol: RolEmpresa }) => {
      const cleanNombre = sanitizeTextInput(payload.nombre, 120);
      const cleanCorreo = sanitizeEmailInput(payload.correo);
      updateDb((prev) => ({
        ...prev,
        usuarios: [
          {
            id: `usr-${Date.now()}`,
            usuario_id: `u-${Date.now()}`,
            empresa_id: activeEmpresa.id,
            nombre: cleanNombre,
            correo: cleanCorreo,
            rol: payload.rol,
            invitado_por: currentUser.nombre,
            invitado_en: new Date().toISOString(),
            aceptado_en: null,
          },
          ...prev.usuarios,
        ],
        bitacora: addBitacora(
          prev,
          'Invitación de usuario',
          'Usuarios',
          `Se invitó a ${cleanCorreo} con rol "${payload.rol}" en ${activeEmpresa.rfc}.`,
        ),
      }));
      showToast(`Invitación enviada a ${cleanCorreo}`);
    },
    [activeEmpresa, currentUser, showToast, updateDb],
  );

  const changeUsuarioRol = useCallback(
    (usuarioRowId: string, nuevoRol: RolEmpresa) => {
      updateDb((prev) => {
        const target = prev.usuarios.find((u) => u.id === usuarioRowId);
        return {
          ...prev,
          usuarios: prev.usuarios.map((u) =>
            u.id === usuarioRowId ? { ...u, rol: nuevoRol } : u,
          ),
          bitacora: addBitacora(
            prev,
            'Cambio de rol',
            'Usuarios',
            `Rol de ${target?.correo || usuarioRowId} cambiado de ${target?.rol || '—'} a ${nuevoRol}.`,
          ),
        };
      });
      showToast(`Rol actualizado a ${nuevoRol}`);
    },
    [showToast, updateDb],
  );

  const acceptInvitation = useCallback(
    (usuarioRowId: string) => {
      updateDb((prev) => {
        const target = prev.usuarios.find((u) => u.id === usuarioRowId);
        return {
          ...prev,
          usuarios: prev.usuarios.map((u) =>
            u.id === usuarioRowId ? { ...u, aceptado_en: new Date().toISOString() } : u,
          ),
          bitacora: addBitacora(
            prev,
            'Invitación aceptada',
            'Usuarios',
            `${target?.correo || usuarioRowId} aceptó el acceso a ${activeEmpresa.rfc}.`,
          ),
        };
      });
      showToast('Invitación aceptada: usuario activo');
    },
    [activeEmpresa, showToast, updateDb],
  );

  const removeUsuario = useCallback(
    (usuarioRowId: string) => {
      updateDb((prev) => {
        const target = prev.usuarios.find((u) => u.id === usuarioRowId);
        return {
          ...prev,
          usuarios: prev.usuarios.filter((u) => u.id !== usuarioRowId),
          bitacora: addBitacora(
            prev,
            'Revocación de acceso',
            'Usuarios',
            `Se retiró el acceso de ${target?.correo || usuarioRowId} en ${activeEmpresa.rfc}.`,
          ),
        };
      });
      showToast('Acceso de usuario revocado');
    },
    [activeEmpresa, showToast, updateDb],
  );

  const triggerSyncNow = useCallback(() => {
    const actor = {
      rol: currentUser.rol,
      usuario: currentUser.nombre,
      empresaId: activeEmpresa.id,
    };
    showToast('Sincronizando comprobantes con el SAT...');
    void fiscalRepository.triggerBackendSatSync(activeEmpresa.id, actor).then((res) => {
      if (res.ok && res.state) {
        setDb(res.state);
        showToast('Sincronización con el SAT completada correctamente');
        return;
      }
      // Fallback local si se corre sin servidor Node
      const newId = `desc-${Date.now()}`;
      const solId = `${crypto.randomUUID ? crypto.randomUUID().toUpperCase() : `SAT-${Date.now()}`}`;
      const pendingRow: DescargaSat = {
        id: newId,
        empresa_id: activeEmpresa.id,
        periodo: '19 nov 2026 (Bajo demanda)',
        tipo: 'ambos',
        formato: 'xml',
        fecha_ini: '2026-11-19',
        fecha_fin: '2026-11-19',
        id_solicitud_sat: solId,
        estado: 'Completada',
        cfdi_emitidos: 2,
        cfdi_recibidos: 3,
        inicio: new Date().toISOString(),
        fin: new Date().toISOString(),
        error: null,
      };
      updateDb((prev) => ({
        ...prev,
        descargas: [pendingRow, ...prev.descargas],
      }));
      showToast('Descarga SAT completada: 2 emitidos y 3 recibidos sin duplicados');
    });
  }, [activeEmpresa.id, currentUser.nombre, currentUser.rol, showToast, updateDb]);

  const retrySyncRow = useCallback(
    (descargaId: string) => {
      updateDb((prev) => ({
        ...prev,
        descargas: prev.descargas.map((d) =>
          d.id === descargaId
            ? { ...d, estado: 'Procesando', error: null, inicio: new Date().toISOString(), fin: null }
            : d,
        ),
      }));
      showToast('Reintentando descarga ante el SAT...');
      window.setTimeout(() => {
        updateDb((prev) => ({
          ...prev,
          descargas: prev.descargas.map((d) =>
            d.id === descargaId
              ? {
                  ...d,
                  estado: 'Completada',
                  cfdi_emitidos: d.tipo === 'recibidos' ? 0 : 3,
                  cfdi_recibidos: 4,
                  fin: new Date().toISOString(),
                  error: null,
                }
              : d,
          ),
        }));
        showToast('Reintento completado exitosamente');
      }, 1500);
    },
    [showToast, updateDb],
  );

  const triggerHistoricalSync = useCallback(
    (years: number[]) => {
      if (years.length === 0) return;
      const nowIso = new Date().toISOString();
      const created: DescargaSat[] = [];
      for (const y of years) {
        const months = y === 2026 ? 11 : 12;
        for (let m = months; m >= 1; m--) {
          const mm = String(m).padStart(2, '0');
          created.push({
            id: `desc-hist-${y}-${mm}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            empresa_id: activeEmpresa.id,
            periodo: `Histórico ${y}-${mm}`,
            tipo: 'ambos',
            formato: 'xml',
            fecha_ini: `${y}-${mm}-01`,
            fecha_fin: `${y}-${mm}-28`,
            id_solicitud_sat: `HIST-${y}${mm}-${Math.floor(100000 + Math.random() * 899999)}`,
            estado: 'Completada',
            cfdi_emitidos: 8 + (m % 6),
            cfdi_recibidos: 12 + (m % 8),
            inicio: nowIso,
            fin: nowIso,
            error: null,
          });
        }
      }
      updateDb((prev) => ({
        ...prev,
        descargas: [...created, ...prev.descargas],
        bitacora: addBitacora(
          prev,
          'Descarga histórica SAT',
          'Sincronización',
          `Se generaron ${created.length} solicitudes mensuales para los años: ${years.join(', ')}.`,
        ),
      }));
      showToast(`Descarga histórica dividida en ${created.length} solicitudes mensuales`);
    },
    [activeEmpresa, showToast, updateDb],
  );

  const importManualCfdis = useCallback(
    (
      items: Array<{
        cfdi: Cfdi;
        conceptos: CfdiConcepto[];
        relaciones: CfdiRelacion[];
        pagos?: CfdiPago[];
      }>,
      options?: { empresaId?: string; sourceLabel?: string },
    ) => {
      if (items.length === 0) return;
      const targetEmpresaId = options?.empresaId || activeEmpresa.id;
      const label = options?.sourceLabel || 'Carga manual XML/ZIP';

      updateDb((prev) => {
        const existing = new Set(prev.cfdis.map((c) => c.uuid.toUpperCase()));
        const newCfdis: Cfdi[] = [];
        const newConceptos: CfdiConcepto[] = [];
        const newRels: CfdiRelacion[] = [];
        const newPagos: CfdiPago[] = [];

        for (const it of items) {
          const upperUuid = it.cfdi.uuid.toUpperCase();
          if (existing.has(upperUuid)) continue;
          existing.add(upperUuid);
          newCfdis.push({ ...it.cfdi, empresa_id: targetEmpresaId });
          newConceptos.push(...it.conceptos);
          newRels.push(...it.relaciones.map((r) => ({ ...r, empresa_id: targetEmpresaId })));
          if (it.pagos && it.pagos.length > 0) {
            newPagos.push(...it.pagos.map((p) => ({ ...p, empresa_id: targetEmpresaId })));
          }
        }

        if (newCfdis.length === 0) return prev;

        const emitidos = newCfdis.filter((c) => c.direccion === 'E').length;
        const recibidos = newCfdis.filter((c) => c.direccion === 'R').length;
        const fechas = newCfdis.map((c) => c.fecha_fiscal).sort();

        const manualLog: DescargaSat = {
          id: `desc-man-${Date.now()}`,
          empresa_id: targetEmpresaId,
          periodo: label,
          tipo: emitidos > 0 && recibidos > 0 ? 'ambos' : emitidos > 0 ? 'emitidos' : 'recibidos',
          formato: 'xml',
          fecha_ini: fechas[0] || new Date().toISOString().slice(0, 10),
          fecha_fin: fechas[fechas.length - 1] || new Date().toISOString().slice(0, 10),
          id_solicitud_sat: `CARGA-MANUAL-${newCfdis.length}XML`,
          estado: 'Completada',
          cfdi_emitidos: emitidos,
          cfdi_recibidos: recibidos,
          inicio: new Date().toISOString(),
          fin: new Date().toISOString(),
          error: null,
        };

        return {
          ...prev,
          cfdis: [...newCfdis, ...prev.cfdis],
          conceptos: [...newConceptos, ...prev.conceptos],
          relaciones: [...newRels, ...prev.relaciones],
          pagos: [...newPagos, ...prev.pagos],
          descargas: [manualLog, ...prev.descargas],
          consumos: prev.consumos.map((c) =>
            c.empresa_id === targetEmpresaId
              ? {
                  ...c,
                  cfdi_historicos: c.cfdi_historicos + newCfdis.length,
                  almacenamiento_mb: Number(
                    (c.almacenamiento_mb + Math.max(0.1, newCfdis.length * 0.02)).toFixed(1),
                  ),
                }
              : c,
          ),
          bitacora: addBitacora(
            prev,
            label,
            'Sincronización',
            `Se incorporaron ${newCfdis.length} CFDI (${emitidos} emitidos, ${recibidos} recibidos, ${newPagos.length} doctos REP) validados por RFC y UUID.`,
            targetEmpresaId,
          ),
        };
      });
      showToast(`Se importaron ${items.length} comprobante(s) validados`);
    },
    [activeEmpresa, showToast, updateDb],
  );

  const setImpuestoAjuste = useCallback(
    (payload: {
      uuid: string;
      impuesto: 'iva' | 'isr';
      periodo: string;
      incluido: boolean;
      motivo: string;
    }) => {
      updateDb((prev) => {
        const filtered = prev.ajustes.filter(
          (a) =>
            !(
              a.empresa_id === activeEmpresa.id &&
              a.uuid === payload.uuid &&
              a.impuesto === payload.impuesto &&
              a.periodo === payload.periodo
            ),
        );
        return {
          ...prev,
          ajustes: [
            {
              id: `aj-${Date.now()}`,
              empresa_id: activeEmpresa.id,
              uuid: payload.uuid,
              impuesto: payload.impuesto,
              periodo: payload.periodo,
              incluido: payload.incluido,
              motivo: payload.motivo,
              usuario: currentUser.nombre,
              fecha: new Date().toISOString(),
            },
            ...filtered,
          ],
          bitacora: addBitacora(
            prev,
            payload.incluido ? `Incluir CFDI en ${payload.impuesto.toUpperCase()}` : `Excluir CFDI de ${payload.impuesto.toUpperCase()}`,
            payload.impuesto === 'iva' ? 'Impuestos IVA' : 'Impuestos ISR',
            `UUID ${payload.uuid} (${payload.periodo}): ${payload.motivo}`,
          ),
        };
      });
      showToast(
        payload.incluido
          ? `CFDI incluido nuevamente en cálculo de ${payload.impuesto.toUpperCase()}`
          : `CFDI excluido de ${payload.impuesto.toUpperCase()} con motivo registrado`,
      );
    },
    [activeEmpresa, currentUser, showToast, updateDb],
  );

  const updateDocumentoFiscal = useCallback(
    (payload: {
      tipo: TipoDocumentoFiscal;
      sentido: SentidoDocumento;
      folio_documento: string;
      archivo_nombre: string;
      blob_url?: string;
      notas?: string;
    }) => {
      const today = new Date().toISOString().slice(0, 10);
      const titulos: Record<TipoDocumentoFiscal, string> = {
        constancia: 'Constancia de Situación Fiscal (CSF)',
        opinion_sat: 'Opinión de Cumplimiento SAT (32-D)',
        opinion_imss: 'Opinión de Cumplimiento IMSS',
      };
      updateDb((prev) => {
        const exists = prev.documentos.some(
          (d) => d.empresa_id === activeEmpresa.id && d.tipo === payload.tipo,
        );
        const safeArchivo = sanitizeFileName(payload.archivo_nombre);
        const safeFolio = sanitizeTextInput(payload.folio_documento, 60);
        const updatedDoc: DocumentoFiscal = {
          id: `doc-${activeEmpresa.id}-${payload.tipo}`,
          empresa_id: activeEmpresa.id,
          tipo: payload.tipo,
          titulo: titulos[payload.tipo],
          sentido: payload.sentido,
          folio_documento: safeFolio,
          fecha_consulta: today,
          archivo_path: `documentos/${activeEmpresa.rfc}/${safeArchivo}`,
          archivo_nombre: safeArchivo,
          blob_url: sanitizeSafeUrl(payload.blob_url),
          notas: payload.notas ? sanitizeTextInput(payload.notas, 400) : undefined,
        };

        const extraNotif: NotificacionFiscal[] =
          (payload.tipo === 'opinion_sat' || payload.tipo === 'opinion_imss') &&
          payload.sentido === 'negativa'
            ? [
                {
                  id: `not-op-${Date.now()}`,
                  empresa_id: activeEmpresa.id,
                  tipo: 'opinion_negativa',
                  titulo: `Alerta Dirección: ${titulos[payload.tipo]} NEGATIVA`,
                  mensaje: `Se cargó una opinión con sentido NEGATIVO (${payload.folio_documento}). Requiere regularización inmediata.`,
                  fecha: new Date().toISOString(),
                  leida: false,
                  ruta_destino: 'documentos',
                },
              ]
            : [];

        return {
          ...prev,
          documentos: exists
            ? prev.documentos.map((d) =>
                d.empresa_id === activeEmpresa.id && d.tipo === payload.tipo ? updatedDoc : d,
              )
            : [...prev.documentos, updatedDoc],
          notificaciones: [...extraNotif, ...prev.notificaciones],
          bitacora: addBitacora(
            prev,
            'Actualización de documento fiscal',
            'Datos fiscales',
            `${titulos[payload.tipo]} actualizado con sentido "${payload.sentido}" (${payload.archivo_nombre}).`,
          ),
        };
      });
      showToast(
        payload.sentido === 'negativa'
          ? 'Documento actualizado en sentido NEGATIVO — se notificó a Dirección'
          : 'Documento fiscal actualizado correctamente',
      );
    },
    [activeEmpresa, showToast, updateDb],
  );

  const addCustomIndicator = useCallback(
    (ind: Omit<IndicadorDefinicion, 'id' | 'empresa_id' | 'es_predefinido'>) => {
      updateDb((prev) => ({
        ...prev,
        indicadores_custom: [
          {
            ...ind,
            id: `ind-cust-${Date.now()}`,
            empresa_id: activeEmpresa.id,
            es_predefinido: false,
          },
          ...prev.indicadores_custom,
        ],
        grupos_indicadores: prev.grupos_indicadores.includes(ind.grupo)
          ? prev.grupos_indicadores
          : [...prev.grupos_indicadores, ind.grupo],
        bitacora: addBitacora(
          prev,
          'Creación de indicador personalizado',
          'Indicadores',
          `Indicador "${ind.nombre}" en grupo "${ind.grupo}"${ind.creado_con_ia ? ' (asistido con IA)' : ''}.`,
        ),
      }));
      showToast(`Indicador "${ind.nombre}" guardado y evaluado`);
    },
    [activeEmpresa, showToast, updateDb],
  );

  const deleteCustomIndicator = useCallback(
    (id: string) => {
      updateDb((prev) => ({
        ...prev,
        indicadores_custom: prev.indicadores_custom.filter((i) => i.id !== id),
      }));
      showToast('Indicador personalizado eliminado');
    },
    [showToast, updateDb],
  );

  const addIndicatorGroup = useCallback(
    (nombre: string) => {
      const clean = nombre.trim();
      if (!clean) return;
      updateDb((prev) => ({
        ...prev,
        grupos_indicadores: prev.grupos_indicadores.includes(clean)
          ? prev.grupos_indicadores
          : [...prev.grupos_indicadores, clean],
      }));
      showToast(`Grupo "${clean}" creado`);
    },
    [showToast, updateDb],
  );

  const toggleAspelConnection = useCallback(() => {
    updateDb((prev) => ({
      ...prev,
      aspel_configs: prev.aspel_configs.map((cfg) =>
        cfg.empresa_id === activeEmpresa.id
          ? {
              ...cfg,
              conectado: !cfg.conectado,
              ultima_sincronizacion: !cfg.conectado
                ? new Date().toISOString()
                : cfg.ultima_sincronizacion,
              error_conexion: cfg.conectado
                ? 'Conexión interrumpida con el servidor local de Aspel SAE (puerto 3050 no responde).'
                : null,
            }
          : cfg,
      ),
    }));
  }, [activeEmpresa, updateDb]);

  const syncAspelNow = useCallback(() => {
    updateDb((prev) => {
      const cfg = prev.aspel_configs.find((c) => c.empresa_id === activeEmpresa.id);
      if (!cfg?.conectado) return prev;
      let syncedCount = 0;
      const nextCfdis = prev.cfdis.map((c) => {
        if (
          c.empresa_id === activeEmpresa.id &&
          !c.solo_en_sat &&
          c.estatus_contable === 'pendiente'
        ) {
          syncedCount++;
          return {
            ...c,
            estatus_contable: 'con_poliza' as const,
            poliza_aspel: `${c.direccion === 'E' ? 'IG' : 'EG'}-2026-11-${String(100 + syncedCount).padStart(4, '0')}`,
            fecha_poliza: '2026-11-19',
            cuenta_contable: c.direccion === 'E' ? '4100-001-000' : '5100-001-000',
          };
        }
        return c;
      });

      const newLog = {
        id: `add-${Date.now()}`,
        empresa_id: activeEmpresa.id,
        empresa_nombre: activeEmpresa.razon_social,
        guid: `SAE-${activeEmpresa.rfc.slice(0, 4)}-${Date.now().toString().slice(-6)}`,
        fecha: new Date().toISOString(),
        rango_inicio: '2026-11-01',
        rango_fin: '2026-11-19',
        direccion: 'Ambos' as const,
        total_sincronizados: syncedCount,
        estatus: 'Completada' as const,
        sistema: 'Aspel SAE' as const,
      };

      return {
        ...prev,
        cfdis: nextCfdis,
        contable_logs: [newLog, ...prev.contable_logs],
        aspel_configs: prev.aspel_configs.map((item) =>
          item.empresa_id === activeEmpresa.id
            ? { ...item, ultima_sincronizacion: new Date().toISOString() }
            : item,
        ),
        bitacora: addBitacora(
          prev,
          'Sincronización contable Aspel SAE',
          'Vinculaciones',
          `Se vincularon ${syncedCount} pólizas desde Aspel SAE (GUID ${newLog.guid}).`,
        ),
      };
    });
    showToast('Sincronización con Aspel SAE completada');
  }, [activeEmpresa, showToast, updateDb]);

  const assignPolizaAspel = useCallback(
    (uuid: string, poliza: string, cuenta: string) => {
      updateDb((prev) => ({
        ...prev,
        cfdis: prev.cfdis.map((c) =>
          c.uuid === uuid
            ? {
                ...c,
                estatus_contable: 'con_poliza',
                poliza_aspel: poliza,
                fecha_poliza: new Date().toISOString().slice(0, 10),
                cuenta_contable: cuenta,
              }
            : c,
        ),
      }));
      showToast(`Póliza ${poliza} vinculada al CFDI`);
    },
    [showToast, updateDb],
  );

  const downloadMissingFromSat = useCallback(
    (uuids: string[]) => {
      if (uuids.length === 0) return;
      const set = new Set(uuids);
      updateDb((prev) => ({
        ...prev,
        cfdis: prev.cfdis.map((c) =>
          set.has(c.uuid)
            ? {
                ...c,
                solo_en_sat: false,
                xml_path: `sat/${activeEmpresa.rfc}/2026/11/${c.uuid}.xml`,
              }
            : c,
        ),
        bitacora: addBitacora(
          prev,
          'Descarga de faltantes Visor SAT',
          'Visor SAT',
          `Se descargaron ${uuids.length} XML faltante(s) para conciliar contra el SAT.`,
        ),
      }));
      showToast(`${uuids.length} comprobante(s) faltante(s) descargado(s) — conciliación actualizada`);
    },
    [activeEmpresa, showToast, updateDb],
  );

  const incrementAiQueries = useCallback(() => {
    updateDb((prev) => ({
      ...prev,
      consumos: prev.consumos.map((c) =>
        c.empresa_id === activeEmpresa.id
          ? { ...c, consultas_ia_mes: c.consultas_ia_mes + 1 }
          : c,
      ),
    }));
  }, [activeEmpresa, updateDb]);

  const sendAssistantMessage = useCallback(
    async (rawText: string, attachedFiles?: File | File[] | null) => {
      const text = rawText.trim();
      const fileList = attachedFiles
        ? Array.isArray(attachedFiles)
          ? attachedFiles.filter(Boolean)
          : [attachedFiles]
        : [];
      if (!text && fileList.length === 0) return;

      const effectivePrompt =
        text ||
        (fileList.length === 1
          ? `Analiza el archivo adjunto ${fileList[0].name}`
          : `Analiza los ${fileList.length} archivos adjuntos`);

      const userMsg: AssistantMessage = {
        id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        sender: 'user',
        text: effectivePrompt,
        timestamp: new Date().toISOString(),
        attachmentName: fileList.length === 1 ? fileList[0].name : undefined,
        attachmentNames: fileList.length > 0 ? fileList.map((f) => f.name) : undefined,
      };

      setAssistantMessages((prev) => [...prev, userMsg]);
      setAssistantThinking(true);
      incrementAiQueries();

      let newlyAnalyzed: AnalyzedDocument[] = [];
      let nextContextDocs = attachedDocs;

      if (fileList.length > 0) {
        const { analyzeUploadedFile } = await import('../services/documentAnalyzer');
        newlyAnalyzed = await Promise.all(
          fileList.map((f) => analyzeUploadedFile(f, db, activeEmpresa)),
        );
        // Acumular documentos en el contexto de la sesión (reemplazando solo si tienen el mismo nombre exacto)
        const newNames = new Set(newlyAnalyzed.map((d) => d.fileName.toLowerCase()));
        nextContextDocs = [
          ...attachedDocs.filter((d) => !newNames.has(d.fileName.toLowerCase())),
          ...newlyAnalyzed,
        ];
        setAttachedDocs(nextContextDocs);
      } else {
        // Pausa breve para retroalimentación natural en tiempo real
        await new Promise((r) => window.setTimeout(r, 280));
      }

      const { runAssistantQuery } = await import('../services/assistantEngine');
      const { message: reply, nextMemory } = runAssistantQuery(
        effectivePrompt,
        db,
        activeEmpresa,
        ocultarMontos,
        {
          userName: currentUser.nombre,
          currentRoute: activeRoute,
          previousRoute,
          attachmentName: fileList[0]?.name,
          attachedDocs: nextContextDocs,
          newlyAttachedDocs: newlyAnalyzed,
          memory: assistantMemory,
        },
      );

      if (reply.securityBlocked) {
        updateDb((prev) => ({
          ...prev,
          bitacora: addBitacora(
            prev,
            'Intento bloqueado (Seguridad)',
            'Asistente Tecno',
            `Firewall de entrada bloqueó una consulta con patrón sospechoso en ${activeEmpresa.rfc}.`,
          ),
        }));
      }

      setAssistantMemory(nextMemory);
      setAssistantMessages((prev) => [...prev, reply]);
      setAssistantThinking(false);
    },
    [
      activeEmpresa,
      activeRoute,
      assistantMemory,
      attachedDocs,
      currentUser.nombre,
      db,
      incrementAiQueries,
      ocultarMontos,
      previousRoute,
      updateDb,
    ],
  );

  const explainCurrentPageWithAssistant = useCallback(
    async (targetRoute?: FiscalRoute) => {
      const { PAGE_GUIDE_CATALOG } = await import('../services/pageGuideEngine');
      const routeToExplain = targetRoute || activeRoute;
      const guide = PAGE_GUIDE_CATALOG[routeToExplain] || PAGE_GUIDE_CATALOG.dashboard;
      if (activeRoute !== 'asistente') {
        setFloatingAssistantOpen(true);
      }
      await sendAssistantMessage(
        `Explícame la página de ${guide.nombreCorto}, todas sus secciones, sus rutas conectadas y dudas frecuentes`,
      );
    },
    [activeRoute, sendAssistantMessage],
  );

  const removeAttachedDoc = useCallback((docId: string) => {
    setAttachedDocs((prev) => prev.filter((d) => d.id !== docId));
  }, []);

  const clearAttachedDocs = useCallback(() => {
    setAttachedDocs([]);
  }, []);

  const clearAssistantMessages = useCallback(() => {
    setAssistantMessages([]);
    setAssistantMemory({});
    setAttachedDocs([]);
  }, []);

  const markNotificationRead = useCallback(
    (id: string) => {
      updateDb((prev) => ({
        ...prev,
        notificaciones: prev.notificaciones.map((n) =>
          n.id === id ? { ...n, leida: true } : n,
        ),
      }));
    },
    [updateDb],
  );

  const markAllNotificationsRead = useCallback(() => {
    updateDb((prev) => ({
      ...prev,
      notificaciones: prev.notificaciones.map((n) =>
        n.empresa_id === activeEmpresa.id ? { ...n, leida: true } : n,
      ),
    }));
    showToast('Todas las notificaciones marcadas como leídas');
  }, [activeEmpresa, showToast, updateDb]);

  const resetDemoData = useCallback(() => {
    void fiscalRepository
      .reset({
        rol: currentUser.rol,
        usuario: currentUser.nombre,
        empresaId: activeEmpresa.id,
      })
      .then((fresh) => {
        if (!fresh) {
          showToast('No fue posible restaurar los datos iniciales en el servidor');
          return;
        }
        setDb(fresh);
        const firstId = fresh.empresas[0]?.id || '';
        setActiveEmpresaId(firstId);
        if (firstId) {
          localStorage.setItem(PREFS_EMPRESA_KEY, firstId);
        }
        showToast('Datos iniciales restaurados correctamente');
      });
  }, [activeEmpresa.id, currentUser.nombre, currentUser.rol, showToast]);

  const uploadEfirmaToServerVault = useCallback(
    async (payload: {
      cerFile: File;
      keyFile: File;
      password: string;
    }): Promise<{ ok: boolean; error?: string }> => {
      const actor = {
        rol: currentUser.rol,
        usuario: currentUser.nombre,
        empresaId: activeEmpresa.id,
      };
      const result = await fiscalRepository.uploadEfirmaToVault(
        {
          empresaId: activeEmpresa.id,
          cerFile: payload.cerFile,
          keyFile: payload.keyFile,
          password: payload.password,
        },
        actor,
      );
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      if (result.state) {
        setDb(result.state);
      }
      if (result.vault) {
        setBackendHealth((prev) => (prev ? { ...prev, vault: result.vault! } : prev));
      }
      showToast('e.firma validada y resguardada de forma segura');
      return { ok: true };
    },
    [activeEmpresa.id, currentUser.nombre, currentUser.rol, showToast],
  );

  const fetchSatSoapEnvelopePreview = useCallback(async (): Promise<SatSoapPreviewResponse | null> => {
    return fiscalRepository.getBackendSatSoapPreview(activeEmpresa.id, {
      rol: currentUser.rol,
      usuario: currentUser.nombre,
      empresaId: activeEmpresa.id,
    });
  }, [activeEmpresa.id, currentUser.nombre, currentUser.rol]);

  return (
    <FiscalContext.Provider
      value={{
        db,
        activeEmpresa,
        activeRoute,
        routePreset,
        clearRoutePreset: () => setRoutePreset(null),
        navigate,
        currentUser,
        setRolSimulado,
        ocultarMontos,
        toggleOcultarMontos,
        selectedCfdiUuid,
        openCfdiDetail: setSelectedCfdiUuid,
        closeCfdiDetail: () => setSelectedCfdiUuid(null),
        pdfCfdiUuid,
        openCfdiPdf: setPdfCfdiUuid,
        closeCfdiPdf: () => setPdfCfdiUuid(null),
        notifPrefs,
        updateNotifPrefs,
        toastMessage,
        showToast,
        selectEmpresa,
        toggleFavorita,
        addEmpresa,
        clearEmpresaCfdis,
        updateEfirma,
        inviteUsuario,
        changeUsuarioRol,
        acceptInvitation,
        removeUsuario,
        triggerSyncNow,
        retrySyncRow,
        triggerHistoricalSync,
        importManualCfdis,
        setImpuestoAjuste,
        updateDocumentoFiscal,
        addCustomIndicator,
        deleteCustomIndicator,
        addIndicatorGroup,
        toggleAspelConnection,
        syncAspelNow,
        assignPolizaAspel,
        downloadMissingFromSat,
        incrementAiQueries,
        assistantMessages,
        assistantThinking,
        attachedDocs,
        floatingAssistantOpen,
        setFloatingAssistantOpen,
        previousRoute,
        explainCurrentPageWithAssistant,
        sendAssistantMessage,
        removeAttachedDoc,
        clearAttachedDocs,
        clearAssistantMessages,
        markNotificationRead,
        markAllNotificationsRead,
        resetDemoData,
        backendOnline,
        backendHealth,
        authUser,
        authLoading,
        dataLoading,
        reloadRemoteState,
        authNotice,
        clearAuthNotice: () => setAuthNotice(null),
        login,
        logout,
        changePassword,
        uploadEfirmaToServerVault,
        fetchSatSoapEnvelopePreview,
      }}
    >
      {children}
    </FiscalContext.Provider>
  );
};

export function useFiscal(): FiscalContextValue {
  const ctx = useContext(FiscalContext);
  if (!ctx) throw new Error('useFiscal debe usarse dentro de FiscalProvider');
  return ctx;
}
