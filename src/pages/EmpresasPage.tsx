import React, { useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Download,
  LayoutGrid,
  List,
  Plus,
  Search,
  Star,
  X,
} from 'lucide-react';
import type { TipoPersona } from '../types/fiscal';
import { useFiscal } from '../context/FiscalContext';
import {
  CATALOGO_REGIMEN,
  daysUntil,
  formatDateTime,
  formatShortDate,
} from '../utils/format';
import { exportToExcel } from '../utils/exportExcel';
import { StatusBadge } from '../components/shared/StatusBadge';

type SortOption = 'acceso_desc' | 'nombre_asc' | 'nombre_desc' | 'rfc_asc' | 'rfc_desc';

export const EmpresasPage: React.FC = () => {
  const { db, activeEmpresa, selectEmpresa, toggleFavorita, addEmpresa, currentUser, navigate } =
    useFiscal();

  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('acceso_desc');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // Formulario nueva empresa
  const [rfc, setRfc] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [regimen, setRegimen] = useState('601');
  const [tipoPersona, setTipoPersona] = useState<TipoPersona>('moral');
  const [cp, setCp] = useState('');
  const [formError, setFormError] = useState('');

  const isPropietario = currentUser.rol === 'propietario';

  const empresasFiltradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = db.empresas.filter((e) => {
      if (onlyFavorites && !e.favorita) return false;
      if (!q) return true;
      return e.razon_social.toLowerCase().includes(q) || e.rfc.toLowerCase().includes(q);
    });

    return [...list].sort((a, b) => {
      // Favoritas primero si estamos en acceso reciente
      if (sortBy === 'acceso_desc') {
        if (a.favorita !== b.favorita) return a.favorita ? -1 : 1;
        return b.ultimo_acceso.localeCompare(a.ultimo_acceso);
      }
      if (sortBy === 'nombre_asc') return a.razon_social.localeCompare(b.razon_social);
      if (sortBy === 'nombre_desc') return b.razon_social.localeCompare(a.razon_social);
      if (sortBy === 'rfc_asc') return a.rfc.localeCompare(b.rfc);
      return b.rfc.localeCompare(a.rfc);
    });
  }, [db.empresas, search, sortBy, onlyFavorites]);

  const getEfirmaBadge = (empresaId: string) => {
    const ef = db.efirmas.find((e) => e.empresa_id === empresaId);
    if (!ef) return <StatusBadge variant="neutral">Sin e.firma</StatusBadge>;
    const days = daysUntil(ef.vigencia_hasta);
    if (days < 0) return <StatusBadge variant="danger" dot>e.firma vencida</StatusBadge>;
    if (days <= 30) {
      return (
        <StatusBadge variant="warning" dot>
          e.firma vence en {days} d
        </StatusBadge>
      );
    }
    return <StatusBadge variant="success" dot>e.firma activa</StatusBadge>;
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanRfc = rfc.trim().toUpperCase();
    const rfcRegex = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
    if (!rfcRegex.test(cleanRfc)) {
      setFormError('RFC inválido. Debe tener 12 caracteres (Persona Moral) o 13 (Persona Física).');
      return;
    }
    if (db.empresas.some((emp) => emp.rfc.toUpperCase() === cleanRfc)) {
      setFormError('Este RFC ya está registrado en el portal.');
      return;
    }
    if (razonSocial.trim().length < 4) {
      setFormError('Ingresa la razón social completa.');
      return;
    }

    addEmpresa({
      rfc: cleanRfc,
      razon_social: razonSocial.trim(),
      regimen,
      regimen_descripcion: (CATALOGO_REGIMEN[regimen] || regimen).replace(/^\d+\s*-\s*/, ''),
      tipo_persona: tipoPersona,
      codigo_postal: cp.trim(),
    });

    setRfc('');
    setRazonSocial('');
    setCp('');
    setFormError('');
    setModalOpen(false);
  };

  const handleExport = () => {
    exportToExcel(
      empresasFiltradas.map((e) => {
        const ef = db.efirmas.find((f) => f.empresa_id === e.id);
        return {
          RFC: e.rfc,
          'Razón Social': e.razon_social,
          'Tipo Persona': e.tipo_persona === 'moral' ? 'Moral' : 'Física',
          'Régimen Fiscal': `${e.regimen} - ${e.regimen_descripcion}`,
          Favorita: e.favorita ? 'Sí' : 'No',
          'Vigencia e.firma': ef ? formatShortDate(ef.vigencia_hasta) : 'Sin cargar',
          'Último acceso': formatDateTime(e.ultimo_acceso),
        };
      }),
      'Tecnocontrol_Empresas_RFC',
      'Empresas',
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Selector de empresas (RFC)
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Administra los contribuyentes conectados al Módulo Fiscal SAT de Tecnocontrol.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar Excel
          </button>
          {isPropietario && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Nueva empresa
            </button>
          )}
        </div>
      </div>

      {/* Barra de búsqueda, filtros y vista */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            name="empresa-busqueda"
            aria-label="Buscar por razón social o RFC"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por razón social o RFC..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pr-3 pl-9 text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOnlyFavorites((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium cursor-pointer ${
              onlyFavorites
                ? 'border-amber-300 bg-amber-50 text-amber-800'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Star className={`h-3.5 w-3.5 ${onlyFavorites ? 'fill-amber-400 text-amber-500' : ''}`} />
            Favoritas
          </button>

          <select
            name="empresa-orden"
            aria-label="Ordenar empresas"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none"
          >
            <option value="acceso_desc">Último acceso</option>
            <option value="nombre_asc">Nombre A → Z</option>
            <option value="nombre_desc">Nombre Z → A</option>
            <option value="rfc_asc">RFC A → Z</option>
            <option value="rfc_desc">RFC Z → A</option>
          </select>

          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              aria-label="Vista tarjetas"
              className={`rounded-lg p-1.5 cursor-pointer ${
                viewMode === 'cards' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-label="Vista lista"
              className={`rounded-lg p-1.5 cursor-pointer ${
                viewMode === 'list' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
              }`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Vista Tarjetas */}
      {empresasFiltradas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
            <Building2 className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-sm font-bold text-slate-900">
            {db.empresas.length === 0
              ? 'Aún no hay empresas registradas'
              : 'Sin coincidencias con los filtros actuales'}
          </h3>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
            {db.empresas.length === 0
              ? 'El portal se encuentra limpio y listo para recibir los RFC reales de la empresa, sus CFDIs del SAT y la vinculación con Aspel SAE.'
              : 'Ajusta el texto de búsqueda o desactiva el filtro de favoritas.'}
          </p>
          {db.empresas.length === 0 && isPropietario && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Registrar empresa (RFC)
            </button>
          )}
        </div>
      ) : viewMode === 'cards' ? (
        <div className="stagger-grid grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {empresasFiltradas.map((emp) => {
            const isActive = emp.id === activeEmpresa.id;
            const cfdiCount = db.cfdis.filter((c) => c.empresa_id === emp.id && !c.solo_en_sat).length;
            return (
              <div
                key={emp.id}
                className={`card-interactive flex flex-col justify-between rounded-2xl border bg-white p-5 ${
                  isActive
                    ? 'border-blue-500 ring-2 ring-blue-500/15 shadow-sm'
                    : 'border-slate-200 hover:border-blue-300'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                          isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div>
                        <span className="font-mono-code text-xs font-semibold text-slate-700">
                          {emp.rfc}
                        </span>
                        <p className="text-[11px] capitalize text-slate-500">
                          Persona {emp.tipo_persona}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleFavorita(emp.id)}
                      aria-label="Marcar favorita"
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer"
                    >
                      <Star
                        className={`h-4 w-4 ${
                          emp.favorita ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                        }`}
                      />
                    </button>
                  </div>

                  <h3 className="mt-3 text-sm font-bold text-slate-900">{emp.razon_social}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Régimen {emp.regimen} · {emp.regimen_descripcion}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {getEfirmaBadge(emp.id)}
                    <StatusBadge variant="neutral">{cfdiCount} CFDIs cargados</StatusBadge>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3.5">
                  <span className="text-[11px] text-slate-400">
                    Acceso: {formatShortDate(emp.ultimo_acceso)}
                  </span>
                  {isActive ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
                      <CheckCircle2 className="h-4 w-4" /> Activa
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        selectEmpresa(emp.id);
                        navigate(currentUser.rol === 'pagos' ? 'emitidos' : 'dashboard');
                      }}
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 cursor-pointer"
                    >
                      Seleccionar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Vista Lista */
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Fav</th>
                  <th className="px-4 py-3 font-semibold">Razón Social</th>
                  <th className="px-4 py-3 font-semibold">RFC</th>
                  <th className="px-4 py-3 font-semibold">Régimen</th>
                  <th className="px-4 py-3 font-semibold">e.firma</th>
                  <th className="px-4 py-3 font-semibold">Último acceso</th>
                  <th className="px-4 py-3 text-right font-semibold">Acción</th>
                </tr>
              </thead>
              <tbody className="stagger-rows divide-y divide-slate-100">
                {empresasFiltradas.map((emp) => {
                  const isActive = emp.id === activeEmpresa.id;
                  return (
                    <tr key={emp.id} className={isActive ? 'bg-blue-50/40' : 'hover:bg-slate-50'}>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleFavorita(emp.id)}
                          className="cursor-pointer"
                        >
                          <Star
                            className={`h-4 w-4 ${
                              emp.favorita ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                            }`}
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{emp.razon_social}</td>
                      <td className="px-4 py-3 font-mono-code text-slate-700">{emp.rfc}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {emp.regimen} · {emp.regimen_descripcion}
                      </td>
                      <td className="px-4 py-3">{getEfirmaBadge(emp.id)}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {formatDateTime(emp.ultimo_acceso)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isActive ? (
                          <StatusBadge variant="info">Activa</StatusBadge>
                        ) : (
                          <button
                            type="button"
                            onClick={() => selectEmpresa(emp.id)}
                            className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 cursor-pointer"
                          >
                            Activar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Nueva Empresa (Solo Propietario) */}
      {modalOpen && (
        <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]">
          <div className="animate-modal-pop w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900">Registrar nueva empresa (RFC)</h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="mb-1 block font-semibold text-slate-700">RFC *</label>
                <input
                  type="text"
                  required
                  maxLength={13}
                  value={rfc}
                  onChange={(e) => setRfc(e.target.value.toUpperCase())}
                  placeholder="Ej. ABC190101XY9"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono-code uppercase focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block font-semibold text-slate-700">Razón Social *</label>
                <input
                  type="text"
                  required
                  value={razonSocial}
                  onChange={(e) => setRazonSocial(e.target.value)}
                  placeholder="Nombre o denominación fiscal"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Tipo de persona</label>
                  <select
                    value={tipoPersona}
                    onChange={(e) => setTipoPersona(e.target.value as TipoPersona)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="moral">Persona Moral</option>
                    <option value="fisica">Persona Física</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Código postal</label>
                  <input
                    type="text"
                    maxLength={5}
                    value={cp}
                    onChange={(e) => setCp(e.target.value)}
                    placeholder="5 dígitos"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block font-semibold text-slate-700">Régimen fiscal</label>
                <select
                  value={regimen}
                  onChange={(e) => setRegimen(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-blue-500 focus:outline-none"
                >
                  {Object.entries(CATALOGO_REGIMEN).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              {formError && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                  {formError}
                </p>
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
                  Guardar empresa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
