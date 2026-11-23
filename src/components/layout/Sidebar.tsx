import React from 'react';
import {
  LayoutDashboard,
  Building2,
  KeyRound,
  Users,
  RefreshCw,
  ArrowUpRight,
  ArrowDownLeft,
  Percent,
  Calculator,
  Scale,
  FileCheck2,
  ShieldAlert,
  BookOpenCheck,
  Link2,
  Gauge,
  Sparkles,
  X,
} from 'lucide-react';
import type { FiscalRoute } from '../../types/fiscal';
import { canAccessRoute, useFiscal } from '../../context/FiscalContext';

interface NavGroup {
  label: string;
  items: Array<{
    route: FiscalRoute;
    label: string;
    icon: React.FC<{ className?: string }>;
  }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Panorama',
    items: [
      { route: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { route: 'asistente', label: 'Asistente Tecno', icon: Sparkles },
    ],
  },
  {
    label: 'Comprobantes SAT',
    items: [
      { route: 'sincronizacion', label: 'Sincronización', icon: RefreshCw },
      { route: 'emitidos', label: 'CFDIs emitidos', icon: ArrowUpRight },
      { route: 'recibidos', label: 'CFDIs recibidos', icon: ArrowDownLeft },
    ],
  },
  {
    label: 'Impuestos',
    items: [
      { route: 'iva', label: 'Impuestos IVA', icon: Percent },
      { route: 'isr', label: 'Impuestos ISR', icon: Calculator },
    ],
  },
  {
    label: 'Control y cumplimiento',
    items: [
      { route: 'visor', label: 'Conciliación SAT', icon: Scale },
      { route: 'indicadores', label: 'Indicadores', icon: ShieldAlert },
      { route: 'documentos', label: 'Datos fiscales', icon: FileCheck2 },
      { route: 'vinculaciones', label: 'Vinculaciones SAE', icon: Link2 },
      { route: 'contable', label: 'ADD y Bitácora', icon: BookOpenCheck },
      { route: 'consumo', label: 'Usos y consumos', icon: Gauge },
    ],
  },
  {
    label: 'Configuración',
    items: [
      { route: 'empresas', label: 'Empresas (RFC)', icon: Building2 },
      { route: 'efirma', label: 'e.firma (FIEL)', icon: KeyRound },
      { route: 'usuarios', label: 'Usuarios y roles', icon: Users },
    ],
  },
];

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, onCloseMobile }) => {
  const { activeRoute, navigate, currentUser, db, activeEmpresa } = useFiscal();

  const enCancelacionCount = db.cfdis.filter(
    (c) => c.empresa_id === activeEmpresa.id && c.estatus_sat === 'en_cancelacion',
  ).length;

  const content = (
    <div className="flex h-full flex-col border-r border-slate-200/90 bg-white text-slate-700">
      {/* Identidad oficial Tecnocontrol con logotecno.png sobre fondo limpio */}
      <div className="relative border-b border-slate-200/80 bg-gradient-to-b from-white to-slate-50/60 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              navigate(currentUser.rol === 'pagos' ? 'emitidos' : 'dashboard');
              onCloseMobile();
            }}
            className="group flex flex-col items-start text-left cursor-pointer"
          >
            <img
              src="./logotecno.png"
              alt="Tecnocontrol"
              className="h-9 w-auto max-w-[185px] object-contain transition-transform duration-300 group-hover:scale-[1.02]"
            />
            <div className="mt-2 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
              <span className="text-[11px] font-semibold tracking-wide text-blue-700">
                Módulo Fiscal SAT
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 lg:hidden cursor-pointer"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Navegación por secciones */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => {
          const allowedItems = group.items.filter((it) => canAccessRoute(currentUser.rol, it.route));
          if (allowedItems.length === 0) return null;

          return (
            <div key={group.label}>
              <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {allowedItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeRoute === item.route;
                  const showAlertDot =
                    enCancelacionCount > 0 &&
                    (item.route === 'emitidos' || item.route === 'recibidos');

                  return (
                    <button
                      key={item.route}
                      type="button"
                      onClick={() => {
                        navigate(item.route);
                        onCloseMobile();
                      }}
                      className={`group relative flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-xs font-medium transition-all duration-200 cursor-pointer ${
                        active
                          ? 'bg-blue-50 font-semibold text-blue-700 ring-1 ring-inset ring-blue-200/80 shadow-[0_1px_2px_rgba(14,75,133,0.06)]'
                          : 'text-slate-600 hover:translate-x-1 hover:bg-slate-100/80 hover:text-blue-700'
                      }`}
                    >
                      {active && (
                        <span className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-blue-600" />
                      )}
                      <span className="flex items-center gap-2.5 truncate">
                        <Icon
                          className={`h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                            active ? 'text-blue-600' : 'text-slate-400 group-hover:text-blue-600'
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {showAlertDot && (
                        <span
                          className="relative flex h-2 w-2"
                          title="CFDI en proceso de cancelación"
                        >
                          <span className="absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75 animate-radar-ping" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-600" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Pie informativo suave */}
      <div className="border-t border-slate-200/80 bg-slate-50/70 p-3">
        <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-[11px] text-slate-500 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-700">Portal Tecnocontrol</span>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-radar-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
            </span>
          </div>
          <p className="mt-1 leading-relaxed text-slate-500">
            Módulo Fiscal SAT · Consulta, conciliación y análisis en tiempo real.
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Sidebar fijo desktop */}
      <aside className="no-print hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:block lg:w-64">
        {content}
      </aside>

      {/* Drawer móvil */}
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-50 flex lg:hidden">
          <div
            className="animate-modal-backdrop fixed inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            onClick={onCloseMobile}
          />
          <div className="animate-drawer-left relative z-10 w-64 max-w-[82vw] shadow-2xl">
            {content}
          </div>
        </div>
      )}
    </>
  );
};
