import React, { useState } from 'react';
import { CheckCircle2, Download, Mail, Trash2, UserPlus, X } from 'lucide-react';
import type { RolEmpresa } from '../types/fiscal';
import { useFiscal } from '../context/FiscalContext';
import { RoleGuard } from '../components/shared/RoleGuard';
import { StatusBadge } from '../components/shared/StatusBadge';
import { CATALOGO_ROLES, formatDateTime } from '../utils/format';
import { exportToExcel } from '../utils/exportExcel';

export const UsuariosPage: React.FC = () => {
  const {
    db,
    activeEmpresa,
    currentUser,
    inviteUsuario,
    changeUsuarioRol,
    acceptInvitation,
    removeUsuario,
  } = useFiscal();

  const [modalOpen, setModalOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [rol, setRol] = useState<RolEmpresa>('contador');
  const [error, setError] = useState('');

  const usuariosEmpresa = db.usuarios.filter((u) => u.empresa_id === activeEmpresa.id);
  const bitacoraEmpresa = db.bitacora
    .filter((b) => b.empresa_id === activeEmpresa.id)
    .slice(0, 12);

  const canManage = currentUser.rol === 'propietario' || currentUser.rol === 'contador';

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!correo.includes('@')) {
      setError('Ingresa un correo corporativo válido del portal.');
      return;
    }
    if (usuariosEmpresa.some((u) => u.correo.toLowerCase() === correo.trim().toLowerCase())) {
      setError('Ese usuario ya tiene acceso o una invitación pendiente en esta empresa.');
      return;
    }
    inviteUsuario({ nombre: nombre.trim() || correo.split('@')[0], correo, rol });
    setNombre('');
    setCorreo('');
    setRol('contador');
    setError('');
    setModalOpen(false);
  };

  const handleExport = () => {
    exportToExcel(
      usuariosEmpresa.map((u) => ({
        Nombre: u.nombre,
        Correo: u.correo,
        Rol: CATALOGO_ROLES[u.rol].label,
        Estado: u.aceptado_en ? 'Activo' : 'Invitación pendiente',
        'Invitado por': u.invitado_por,
        'Aceptado en': u.aceptado_en ? formatDateTime(u.aceptado_en) : 'Pendiente',
      })),
      `Usuarios_${activeEmpresa.rfc}`,
      'Usuarios',
    );
  };

  return (
    <RoleGuard allowedRoles={['propietario', 'contador']} sectionName="Usuarios e Invitaciones">
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Usuarios e invitaciones
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Control de acceso y roles por empresa para{' '}
              <strong className="text-slate-700">{activeEmpresa.razon_social}</strong>.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar Excel
            </button>
            {canManage && (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm cursor-pointer"
              >
                <UserPlus className="h-4 w-4" />
                Invitar usuario
              </button>
            )}
          </div>
        </div>

        {/* Tabla de usuarios */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Colaborador</th>
                  <th className="px-4 py-3 font-semibold">Rol en empresa</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Invitado por</th>
                  <th className="px-4 py-3 font-semibold">Aceptación</th>
                  <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="stagger-rows divide-y divide-slate-100">
                {usuariosEmpresa.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{u.nombre}</p>
                      <p className="text-[11px] text-slate-500">{u.correo}</p>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        name={`rol-usuario-${u.id}`}
                        aria-label={`Rol de ${u.nombre}`}
                        value={u.rol}
                        disabled={u.rol === 'propietario' && currentUser.rol !== 'propietario'}
                        onChange={(e) => changeUsuarioRol(u.id, e.target.value as RolEmpresa)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none"
                      >
                        {currentUser.rol === 'propietario' && (
                          <option value="propietario">Propietario</option>
                        )}
                        <option value="contador">Contador</option>
                        <option value="consulta">Consulta</option>
                        <option value="pagos">Pagos</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {u.aceptado_en ? (
                        <StatusBadge variant="success" dot>
                          Activo
                        </StatusBadge>
                      ) : (
                        <StatusBadge variant="warning" dot>
                          Invitación pendiente
                        </StatusBadge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{u.invitado_por}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {u.aceptado_en ? formatDateTime(u.aceptado_en) : 'Aún sin aceptar'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        {!u.aceptado_en && (
                          <button
                            type="button"
                            onClick={() => acceptInvitation(u.id)}
                            title="Activar acceso del usuario"
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Activar acceso
                          </button>
                        )}
                        {u.rol !== 'propietario' && (
                          <button
                            type="button"
                            onClick={() => removeUsuario(u.id)}
                            title="Revocar acceso"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Matriz de permisos por rol */}
        <div className="stagger-grid grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(['propietario', 'contador', 'consulta', 'pagos'] as RolEmpresa[]).map((r) => (
            <div key={r} className="card-interactive rounded-2xl border border-slate-200 bg-white p-4">
              <span
                className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${CATALOGO_ROLES[r].color}`}
              >
                {CATALOGO_ROLES[r].label}
              </span>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                {CATALOGO_ROLES[r].descripcion}
              </p>
            </div>
          ))}
        </div>

        {/* Bitácora reciente de seguridad y auditoría */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-bold text-slate-900">
            Bitácora de auditoría del módulo (quién, qué, cuándo)
          </h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">Fecha</th>
                  <th className="py-2 pr-3 font-medium">Usuario</th>
                  <th className="py-2 pr-3 font-medium">Módulo</th>
                  <th className="py-2 pr-3 font-medium">Acción</th>
                  <th className="py-2 font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody className="stagger-rows divide-y divide-slate-100">
                {bitacoraEmpresa.map((b) => (
                  <tr key={b.id}>
                    <td className="py-2.5 pr-3 whitespace-nowrap text-slate-500">
                      {formatDateTime(b.fecha)}
                    </td>
                    <td className="py-2.5 pr-3 font-medium text-slate-800">{b.usuario}</td>
                    <td className="py-2.5 pr-3">
                      <StatusBadge variant="neutral">{b.modulo}</StatusBadge>
                    </td>
                    <td className="py-2.5 pr-3 font-semibold text-slate-900">{b.accion}</td>
                    <td className="py-2.5 text-slate-600">{b.detalle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Invitar usuario */}
        {modalOpen && (
          <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]">
            <div className="animate-modal-pop w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-base font-bold text-slate-900">Invitar colaborador</h2>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <form onSubmit={handleInvite} className="mt-4 space-y-3.5 text-xs">
                <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-slate-600">
                  <Mail className="h-4 w-4 text-blue-600" />
                  <span>
                    La persona deberá aceptar la invitación antes de ver datos de{' '}
                    <strong>{activeEmpresa.rfc}</strong>.
                  </span>
                </div>

                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Nombre completo *</label>
                  <input
                    type="text"
                    required
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej. C.P. Luis Hernández"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block font-semibold text-slate-700">
                    Correo del portal *
                  </label>
                  <input
                    type="email"
                    required
                    value={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                    placeholder="colaborador@tecnocontrol.com.mx"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Rol asignado</label>
                  <select
                    value={rol}
                    onChange={(e) => setRol(e.target.value as RolEmpresa)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-blue-500 focus:outline-none"
                  >
                    {currentUser.rol === 'propietario' && (
                      <option value="propietario">Propietario</option>
                    )}
                    <option value="contador">Contador</option>
                    <option value="consulta">Consulta (solo lectura)</option>
                    <option value="pagos">Pagos (emitidos y recibidos)</option>
                  </select>
                </div>

                {error && (
                  <p className="rounded-lg bg-rose-50 px-3 py-2 font-medium text-rose-700">{error}</p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 cursor-pointer"
                  >
                    Enviar invitación
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
};
