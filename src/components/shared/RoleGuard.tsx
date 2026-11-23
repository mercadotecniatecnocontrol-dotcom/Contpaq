import React from 'react';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import type { RolEmpresa } from '../../types/fiscal';
import { useFiscal } from '../../context/FiscalContext';
import { CATALOGO_ROLES } from '../../utils/format';

interface RoleGuardProps {
  allowedRoles: RolEmpresa[];
  sectionName: string;
  children: React.ReactNode;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({
  allowedRoles,
  sectionName,
  children,
}) => {
  const { currentUser, navigate } = useFiscal();

  if (allowedRoles.includes(currentUser.rol)) {
    return <>{children}</>;
  }

  return (
    <div className="animate-modal-pop mx-auto max-w-lg py-16 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 shadow-sm">
        <ShieldAlert className="h-7 w-7" />
      </div>
      <h2 className="text-lg font-semibold text-slate-900">Acceso restringido por rol</h2>
      <p className="mt-2 text-sm text-slate-600">
        Tu perfil actual (<strong>{CATALOGO_ROLES[currentUser.rol].label}</strong>) no cuenta con
        permisos para acceder a <strong>{sectionName}</strong>.
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Esta restricción forma parte del control de accesos por rol asignado en la empresa.
      </p>
      <button
        type="button"
        onClick={() => navigate(currentUser.rol === 'pagos' ? 'emitidos' : 'dashboard')}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a mi vista principal
      </button>
    </div>
  );
};
