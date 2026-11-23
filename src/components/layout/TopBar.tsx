import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Building2,
  CheckCheck,
  ChevronDown,
  Eye,
  EyeOff,
  HelpCircle,
  KeyRound,
  LogOut,
  Menu,
  RotateCcw,
  Settings,
  Shield,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import type { FiscalRoute, PreferenciasNotificacion } from '../../types/fiscal';
import {
  normalizeFiscalRoute,
  type RouteFilterPreset,
  useFiscal,
} from '../../context/FiscalContext';
import { PAGE_GUIDE_CATALOG } from '../../services/pageGuideEngine';
import { CATALOGO_ROLES, formatDateTime, shortUuid } from '../../utils/format';

interface TopBarProps {
  onOpenMobileMenu: () => void;
}

const NOTIF_PREF_LABELS: Array<{ key: keyof PreferenciasNotificacion; label: string }> = [
  { key: 'cancelacion_proceso', label: 'CFDI en proceso de cancelación' },
  { key: 'cfdi_cancelado', label: 'CFDI confirmado como cancelado' },
  { key: 'descarga_error', label: 'Descarga SAT con error' },
  { key: 'indicador_incidencia', label: 'Nueva incidencia en indicadores' },
  { key: 'opinion_negativa', label: 'Opinión de cumplimiento negativa' },
  { key: 'efirma_vencimiento', label: 'e.firma próxima a vencer' },
];

export const TopBar: React.FC<TopBarProps> = ({ onOpenMobileMenu }) => {
  const {
    db,
    activeEmpresa,
    activeRoute,
    selectEmpresa,
    navigate,
    ocultarMontos,
    toggleOcultarMontos,
    currentUser,
    notifPrefs,
    updateNotifPrefs,
    markNotificationRead,
    markAllNotificationsRead,
    openCfdiDetail,
    resetDemoData,
    assistantThinking,
    explainCurrentPageWithAssistant,
    logout,
    changePassword,
  } = useFiscal();
  const activeGuide = PAGE_GUIDE_CATALOG[activeRoute] || PAGE_GUIDE_CATALOG.dashboard;

  const [companyOpen, setCompanyOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifTab, setNotifTab] = useState<'todas' | 'no_leidas' | 'leidas'>('todas');
  const [showNotifConfig, setShowNotifConfig] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    if (newPwd.length < 8) {
      setPwdError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (!/[A-Za-z]/.test(newPwd) || !/\d/.test(newPwd)) {
      setPwdError('La nueva contraseña debe combinar letras y al menos un número.');
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdError('La confirmación no coincide con la nueva contraseña.');
      return;
    }
    setPwdSaving(true);
    try {
      const res = await changePassword({ currentPassword: currentPwd, newPassword: newPwd });
      if (!res.ok) {
        setPwdError(res.error || 'No se pudo actualizar la contraseña.');
        return;
      }
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
      setPwdModalOpen(false);
    } finally {
      setPwdSaving(false);
    }
  };

  const companyRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const roleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (companyRef.current && !companyRef.current.contains(target)) setCompanyOpen(false);
      if (notifRef.current && !notifRef.current.contains(target)) setNotifOpen(false);
      if (roleRef.current && !roleRef.current.contains(target)) setRoleOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const companyNotifs = db.notificaciones.filter(
    (n) => n.empresa_id === activeEmpresa.id && notifPrefs[n.tipo],
  );
  const unreadCount = companyNotifs.filter((n) => !n.leida).length;

  const filteredNotifs = companyNotifs.filter((n) => {
    if (notifTab === 'no_leidas') return !n.leida;
    if (notifTab === 'leidas') return n.leida;
    return true;
  });

  return (
    <>
      <header className="no-print sticky top-0 z-20 flex h-16 items-center justify-between gap-2 border-b border-slate-200/90 bg-white/90 px-3 backdrop-blur-md sm:px-6">
      {/* Izquierda: menú móvil + mini logo móvil + selector rápido de empresa */}
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden cursor-pointer"
          aria-label="Abrir navegación"
        >
          <Menu className="h-5 w-5" />
        </button>

        <img
          src="./logotecno.png"
          alt="Tecnocontrol"
          className="hidden h-6 w-auto object-contain sm:block lg:hidden"
        />

        <div className="relative min-w-0" ref={companyRef}>
          <button
            type="button"
            onClick={() => setCompanyOpen((o) => !o)}
            className="flex max-w-[205px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 text-left hover:bg-slate-100 transition-colors sm:max-w-xs cursor-pointer"
          >
            <div className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600/10 text-blue-700 sm:flex">
              <Building2 className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-900">
                {activeEmpresa.razon_social}
              </p>
              <p className="truncate font-mono-code text-[10px] text-slate-500">
                {activeEmpresa.rfc} · Rég. {activeEmpresa.regimen}
              </p>
            </div>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                companyOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {companyOpen && (
            <div className="animate-popover-left absolute left-0 z-40 mt-1.5 w-80 max-w-[90vw] rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
              <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Empresas disponibles
              </div>
              <div className="max-h-60 space-y-1 overflow-y-auto">
                {db.empresas.map((emp) => {
                  const isCurrent = emp.id === activeEmpresa.id;
                  return (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => {
                        selectEmpresa(emp.id);
                        setCompanyOpen(false);
                      }}
                      className={`flex w-full items-start justify-between gap-2 rounded-xl px-2.5 py-2 text-left transition-colors cursor-pointer ${
                        isCurrent ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold">{emp.razon_social}</p>
                        <p className="font-mono-code text-[11px] text-slate-500">
                          {emp.rfc} · Régimen {emp.regimen}
                        </p>
                      </div>
                      {emp.favorita && (
                        <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 border-t border-slate-100 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setCompanyOpen(false);
                    navigate('empresas');
                  }}
                  className="w-full rounded-lg bg-slate-900 px-3 py-1.5 text-center text-xs font-medium text-white hover:bg-slate-800 cursor-pointer"
                >
                  Administrar empresas (RFC)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Derecha: Explicar página, Ocultar montos (Apartado 10), Campana Notificaciones (Apartado 17), Perfil */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Botón Explicar esta página con Asistente Tecno */}
        <button
          type="button"
          disabled={assistantThinking}
          onClick={() => void explainCurrentPageWithAssistant(activeRoute)}
          title={`Que Asistente Tecno explique la página "${activeGuide.nombreCorto}" y sus rutas`}
          aria-label={`Explicar página actual: ${activeGuide.nombreCorto}`}
          className="btn-tactile inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/80 px-2.5 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-50 cursor-pointer"
        >
          <HelpCircle className="h-4 w-4 text-blue-700" />
          <Sparkles className="hidden h-3 w-3 text-blue-600 sm:inline" />
          <span className="hidden lg:inline">Explicar esta página</span>
        </button>

        {/* Botón Ocultar montos */}
        <button
          type="button"
          onClick={toggleOcultarMontos}
          title={ocultarMontos ? 'Mostrar cifras en pantalla' : 'Ocultar montos en pantalla'}
          className={`btn-tactile inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-medium cursor-pointer ${
            ocultarMontos
              ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-xs'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          {ocultarMontos ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          <span className="hidden md:inline">
            {ocultarMontos ? 'Montos ocultos' : 'Ocultar montos'}
          </span>
        </button>

        {/* Campana Centro de notificaciones */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setNotifOpen((o) => !o)}
            aria-label="Centro de notificaciones"
            className="btn-tactile relative rounded-xl border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center">
                <span className="absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75 animate-radar-ping" />
                <span className="relative flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="animate-popover absolute right-0 z-40 mt-2 w-80 sm:w-96 max-w-[92vw] rounded-2xl border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Centro de notificaciones</h3>
                  <p className="text-[11px] text-slate-500">{activeEmpresa.rfc}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={markAllNotificationsRead}
                    title="Marcar todas como leídas"
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
                  >
                    <CheckCheck className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNotifConfig((s) => !s)}
                    title="Configuración por tipo"
                    className={`rounded-lg p-1.5 cursor-pointer ${
                      showNotifConfig
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                    }`}
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {showNotifConfig ? (
                <div className="space-y-2 p-4">
                  <p className="text-xs font-semibold text-slate-700">
                    Eventos activos en notificaciones
                  </p>
                  {NOTIF_PREF_LABELS.map((item) => (
                    <label
                      key={item.key}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs text-slate-700 cursor-pointer hover:bg-slate-50"
                    >
                      <span>{item.label}</span>
                      <input
                        type="checkbox"
                        checked={notifPrefs[item.key]}
                        onChange={(e) => updateNotifPrefs({ [item.key]: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowNotifConfig(false)}
                    className="mt-2 w-full rounded-lg bg-slate-900 py-1.5 text-xs font-medium text-white hover:bg-slate-800 cursor-pointer"
                  >
                    Volver a notificaciones
                  </button>
                </div>
              ) : (
                <>
                  {/* Pestañas Todas / No leídas / Leídas */}
                  <div className="flex border-b border-slate-100 px-3 pt-2 text-xs font-medium">
                    {(
                      [
                        ['todas', `Todas (${companyNotifs.length})`],
                        ['no_leidas', `No leídas (${unreadCount})`],
                        ['leidas', `Leídas (${companyNotifs.length - unreadCount})`],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setNotifTab(key)}
                        className={`border-b-2 px-2.5 py-2 transition-colors cursor-pointer ${
                          notifTab === key
                            ? 'border-blue-600 text-blue-700'
                            : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
                    {filteredNotifs.length === 0 ? (
                      <p className="px-4 py-8 text-center text-xs text-slate-500">
                        Sin avisos en esta pestaña.
                      </p>
                    ) : (
                      filteredNotifs.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            markNotificationRead(n.id);
                            setNotifOpen(false);

                            // Determinar la ruta destino real según la notificación y su tipo
                            const fallbackByType: Record<string, FiscalRoute> = {
                              cancelacion_proceso: n.titulo.toLowerCase().includes('recibido')
                                ? 'recibidos'
                                : 'emitidos',
                              cfdi_cancelado: n.titulo.toLowerCase().includes('recibido')
                                ? 'recibidos'
                                : 'emitidos',
                              descarga_error: 'sincronizacion',
                              indicador_incidencia: 'indicadores',
                              opinion_negativa: 'documentos',
                              efirma_vencimiento: 'efirma',
                            };
                            const targetRoute = normalizeFiscalRoute(
                              n.ruta_destino,
                              fallbackByType[n.tipo] || 'sincronizacion',
                            );

                            const preset: RouteFilterPreset | undefined =
                              n.tipo === 'cancelacion_proceso'
                                ? { estatus: 'en_cancelacion' }
                                : n.tipo === 'cfdi_cancelado'
                                  ? { estatus: 'cancelado' }
                                  : undefined;

                            // Navegar siempre a la sección destino de la notificación
                            navigate(targetRoute, preset);

                            // Si la notificación está vinculada a un UUID existente, abrir también su detalle
                            if (n.uuid && db.cfdis.some((c) => c.uuid === n.uuid)) {
                              openCfdiDetail(n.uuid);
                            }
                          }}
                          className={`block w-full px-4 py-3 text-left transition-colors hover:bg-slate-50 cursor-pointer ${
                            !n.leida ? 'bg-blue-50/40' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold text-slate-900">{n.titulo}</p>
                            {!n.leida && (
                              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-slate-600">{n.mensaje}</p>
                          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[10px] text-slate-400">
                            <span>{formatDateTime(n.fecha)}</span>
                            {n.uuid && (
                              <span className="font-mono-code text-blue-600">
                                UUID {shortUuid(n.uuid)}
                              </span>
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Perfil único: C.P. Nayra Mendoza */}
        <div className="relative" ref={roleRef}>
          <button
            type="button"
            onClick={() => setRoleOpen((o) => !o)}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-left hover:bg-slate-50 cursor-pointer"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white shadow-xs">
              NM
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-xs font-semibold leading-tight text-slate-900">
                {currentUser.nombre}
              </p>
              <p className="text-[10px] font-medium text-blue-700">
                {currentUser.area}
              </p>
            </div>
            <ChevronDown
              className={`hidden h-3.5 w-3.5 text-slate-400 transition-transform duration-200 sm:block ${
                roleOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {roleOpen && (
            <div className="animate-popover absolute right-0 z-40 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  NM
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-900">
                    {currentUser.nombre}
                  </p>
                  <p className="truncate text-[11px] text-slate-500">
                    {currentUser.correo}
                  </p>
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                    <Shield className="h-3 w-3" />
                    {CATALOGO_ROLES[currentUser.rol].label} · {currentUser.area}
                  </span>
                </div>
              </div>
              <div className="mt-2.5 space-y-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setRoleOpen(false);
                    setPwdError('');
                    setPwdModalOpen(true);
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <KeyRound className="h-3.5 w-3.5 text-blue-700" />
                  Cambiar contraseña
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetDemoData();
                    setRoleOpen(false);
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restaurar datos iniciales
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRoleOpen(false);
                    void logout();
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Cerrar sesión
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      </header>

      {/* Modal de cambio de contraseña */}
      {pwdModalOpen && (
        <div className="animate-modal-backdrop fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]">
          <div className="animate-modal-pop w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-blue-700" />
                <h2 className="text-base font-bold text-slate-900">Cambiar contraseña</h2>
              </div>
              <button
                type="button"
                onClick={() => setPwdModalOpen(false)}
                aria-label="Cerrar"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handlePasswordSubmit} className="mt-4 space-y-3.5 text-xs">
              <p className="text-slate-500">
                Cuenta activa: <strong className="text-slate-800">{currentUser.correo}</strong>
              </p>

              <div>
                <label className="mb-1 block font-semibold text-slate-700">
                  Contraseña actual *
                </label>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={currentPwd}
                  onChange={(e) => setCurrentPwd(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block font-semibold text-slate-700">
                  Nueva contraseña *
                </label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="Mínimo 8 caracteres (letras y números)"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block font-semibold text-slate-700">
                  Confirmar nueva contraseña *
                </label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-blue-600 focus:outline-none"
                />
              </div>

              {pwdError && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 font-medium text-rose-700">
                  {pwdError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPwdModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={pwdSaving}
                  className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                >
                  {pwdSaving ? 'Actualizando...' : 'Guardar nueva contraseña'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
