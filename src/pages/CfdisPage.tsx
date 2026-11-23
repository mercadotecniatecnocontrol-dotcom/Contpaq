import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownUp,
  CheckCircle2,
  Download,
  Eye,
  FileArchive,
  FileText,
  Filter,
  Link2,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import type { Cfdi, DireccionCfdi, TipoCfdi } from '../types/fiscal';
import { useFiscal } from '../context/FiscalContext';
import { getCfdiRowTaxAndAlerts } from '../services/fiscalCalculations';
import {
  CATALOGO_FORMA_PAGO,
  CATALOGO_TIPO_CFDI,
  CATALOGO_USO_CFDI,
  formatShortDate,
  getAvailableYears,
  getLastDayOfMonth,
  shortUuid,
} from '../utils/format';
import {
  downloadMultipleCfdisBundle,
  downloadSingleCfdiXml,
  exportToExcel,
} from '../utils/exportExcel';
import { Money } from '../components/shared/Money';
import { estatusSatBadge } from '../components/shared/StatusBadge';
import { ColumnConfigMenu, type ColumnOption } from '../components/shared/ColumnConfigMenu';

interface CfdisPageProps {
  direccion: DireccionCfdi;
}

const ALL_COLUMNS: ColumnOption[] = [
  { key: 'uuid', label: 'UUID / Folio', locked: true },
  { key: 'contraparte_nombre', label: 'Emisor / Receptor' },
  { key: 'contraparte_rfc', label: 'RFC contraparte' },
  { key: 'efecto_impuestos', label: 'Efecto en impuestos' },
  { key: 'validaciones', label: 'Validaciones' },
  { key: 'fecha_emision', label: 'Fecha de expedición' },
  { key: 'metodo_pago', label: 'Método de pago' },
  { key: 'forma_pago', label: 'Forma de pago' },
  { key: 'subtotal', label: 'Subtotal' },
  { key: 'iva_trasladado', label: 'IVA trasladado' },
  { key: 'total', label: 'Total' },
  { key: 'asociados', label: 'Asociados' },
  { key: 'uso_cfdi', label: 'Uso de CFDI' },
  { key: 'tipo_relacion', label: 'Tipo de relación' },
  { key: 'uuid_relacionado', label: 'UUID relacionado' },
  { key: 'estatus_sat', label: 'Estatus SAT' },
  { key: 'fecha_cancelacion', label: 'Fecha cancelación' },
];

const DEFAULT_VISIBLE = [
  'uuid',
  'contraparte_nombre',
  'efecto_impuestos',
  'validaciones',
  'fecha_emision',
  'metodo_pago',
  'forma_pago',
  'subtotal',
  'iva_trasladado',
  'total',
  'asociados',
  'estatus_sat',
];

const TIPO_CARDS: Array<{ tipo: TipoCfdi; label: string; accent: string }> = [
  { tipo: 'I', label: 'Ingresos', accent: 'border-l-blue-600' },
  { tipo: 'E', label: 'Egresos', accent: 'border-l-amber-500' },
  { tipo: 'P', label: 'Pagos', accent: 'border-l-emerald-600' },
  { tipo: 'N', label: 'Nóminas', accent: 'border-l-indigo-600' },
  { tipo: 'T', label: 'Traslados', accent: 'border-l-slate-500' },
];

export const CfdisPage: React.FC<CfdisPageProps> = ({ direccion }) => {
  const {
    db,
    activeEmpresa,
    routePreset,
    clearRoutePreset,
    openCfdiDetail,
    openCfdiPdf,
    navigate,
  } = useFiscal();

  const colStorageKey = `tecnocontrol_cols_cfdi_v2_${direccion}`;

  const [fechaIni, setFechaIni] = useState('2026-10-01');
  const [fechaFin, setFechaFin] = useState('2026-11-30');
  const [estatusTab, setEstatusTab] = useState<'todos' | 'vigente' | 'cancelado' | 'en_cancelacion'>(
    'todos',
  );
  const [metodoFilter, setMetodoFilter] = useState<'ALL' | 'PUE' | 'PPD'>('ALL');
  const [tipoFilter, setTipoFilter] = useState<'ALL' | TipoCfdi>('ALL');
  const [search, setSearch] = useState('');
  const [showAdvFilters, setShowAdvFilters] = useState(false);

  // Filtros avanzados
  const [rfcFilter, setRfcFilter] = useState('');
  const [formaFilter, setFormaFilter] = useState('ALL');
  const [usoFilter, setUsoFilter] = useState('ALL');
  const [monedaFilter, setMonedaFilter] = useState('ALL');
  const [montoMin, setMontoMin] = useState('');
  const [montoMax, setMontoMax] = useState('');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [selectedUuids, setSelectedUuids] = useState<Set<string>>(new Set());
  const [taxEffectCfdi, setTaxEffectCfdi] = useState<Cfdi | null>(null);

  const [visibleCols, setVisibleCols] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(colStorageKey);
      return saved ? JSON.parse(saved) : DEFAULT_VISIBLE;
    } catch {
      return DEFAULT_VISIBLE;
    }
  });

  // Aplicar presets cuando se navega desde Dashboard (ej. CFDI en proceso de cancelación)
  useEffect(() => {
    if (routePreset) {
      if (routePreset.estatus) setEstatusTab(routePreset.estatus);
      if (routePreset.tipo) setTipoFilter(routePreset.tipo);
      if (routePreset.periodo) {
        setFechaIni(`${routePreset.periodo}-01`);
        setFechaFin(getLastDayOfMonth(routePreset.periodo));
      }
      clearRoutePreset();
    }
  }, [routePreset, clearRoutePreset]);

  const handleColsChange = (next: string[]) => {
    setVisibleCols(next);
    localStorage.setItem(colStorageKey, JSON.stringify(next));
  };

  // Todos los CFDIs de la empresa y dirección (excluyendo los que solo están en SAT sin descargar)
  const baseCfdis = useMemo(
    () =>
      db.cfdis.filter(
        (c) => c.empresa_id === activeEmpresa.id && c.direccion === direccion && !c.solo_en_sat,
      ),
    [db.cfdis, activeEmpresa.id, direccion],
  );

  // Mapa rápido de relaciones para columnas Tipo de relación y UUID relacionado
  const relMap = useMemo(() => {
    const map = new Map<string, { tipo: string; uuidRel: string }>();
    for (const r of db.relaciones) {
      if (r.empresa_id === activeEmpresa.id) {
        map.set(r.uuid, { tipo: r.tipo_relacion, uuidRel: r.uuid_relacionado });
      }
    }
    return map;
  }, [db.relaciones, activeEmpresa.id]);

  // Tarjetas por tipo: periodo seleccionado vs acumulado 2026
  const cardStats = useMemo(() => {
    const yearPrefix = fechaFin.slice(0, 4) || '2026';
    return TIPO_CARDS.map((card) => {
      const customLabel =
        card.tipo === 'I' && direccion === 'R' ? 'Gastos' : card.label;
      const ofTypeYear = baseCfdis.filter(
        (c) =>
          c.tipo === card.tipo &&
          c.estatus_sat !== 'cancelado' &&
          c.fecha_fiscal.startsWith(yearPrefix),
      );
      const ofTypePeriod = ofTypeYear.filter(
        (c) => c.fecha_fiscal >= fechaIni && c.fecha_fiscal <= fechaFin,
      );

      // Para tipo P sumamos pagos aplicados en `cfdi_pagos`
      const sumAmount = (arr: typeof baseCfdis) => {
        if (card.tipo === 'P') {
          const uuids = new Set(arr.map((a) => a.uuid));
          return db.pagos
            .filter((p) => p.empresa_id === activeEmpresa.id && uuids.has(p.uuid_pago))
            .reduce((s, p) => s + p.importe_pagado, 0);
        }
        return arr.reduce((s, c) => s + c.total_mxn, 0);
      };

      return {
        ...card,
        label: customLabel,
        periodCount: ofTypePeriod.length,
        periodAmount: sumAmount(ofTypePeriod),
        yearCount: ofTypeYear.length,
        yearAmount: sumAmount(ofTypeYear),
      };
    });
  }, [baseCfdis, db.pagos, activeEmpresa.id, fechaIni, fechaFin, direccion]);

  // Pre-filtro por fecha y búsqueda para conteos de pestañas de estatus
  const dateScoped = useMemo(
    () =>
      baseCfdis.filter((c) => {
        if (fechaIni && c.fecha_fiscal < fechaIni) return false;
        if (fechaFin && c.fecha_fiscal > fechaFin) return false;
        if (tipoFilter !== 'ALL' && c.tipo !== tipoFilter) return false;
        return true;
      }),
    [baseCfdis, fechaIni, fechaFin, tipoFilter],
  );

  const tabCounts = useMemo(
    () => ({
      todos: dateScoped.length,
      vigente: dateScoped.filter((c) => c.estatus_sat === 'vigente').length,
      cancelado: dateScoped.filter((c) => c.estatus_sat === 'cancelado').length,
      en_cancelacion: dateScoped.filter((c) => c.estatus_sat === 'en_cancelacion').length,
    }),
    [dateScoped],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const minVal = montoMin ? parseFloat(montoMin) : null;
    const maxVal = montoMax ? parseFloat(montoMax) : null;

    return dateScoped
      .filter((c) => {
        if (estatusTab !== 'todos' && c.estatus_sat !== estatusTab) return false;
        if (metodoFilter !== 'ALL' && c.metodo_pago !== metodoFilter) return false;
        const cpName = direccion === 'E' ? c.nombre_receptor : c.nombre_emisor;
        const cpRfc = direccion === 'E' ? c.rfc_receptor : c.rfc_emisor;

        if (q) {
          const hit =
            c.uuid.toLowerCase().includes(q) ||
            cpName.toLowerCase().includes(q) ||
            cpRfc.toLowerCase().includes(q) ||
            `${c.serie}-${c.folio}`.toLowerCase().includes(q);
          if (!hit) return false;
        }
        if (rfcFilter && !cpRfc.toLowerCase().includes(rfcFilter.trim().toLowerCase())) return false;
        if (formaFilter !== 'ALL' && c.forma_pago !== formaFilter) return false;
        if (usoFilter !== 'ALL' && c.uso_cfdi !== usoFilter) return false;
        if (monedaFilter !== 'ALL' && c.moneda !== monedaFilter) return false;
        if (minVal !== null && c.total_mxn < minVal) return false;
        if (maxVal !== null && c.total_mxn > maxVal) return false;
        return true;
      })
      .sort((a, b) =>
        sortDir === 'desc'
          ? b.fecha_emision.localeCompare(a.fecha_emision)
          : a.fecha_emision.localeCompare(b.fecha_emision),
      );
  }, [
    dateScoped,
    estatusTab,
    metodoFilter,
    search,
    direccion,
    rfcFilter,
    formaFilter,
    usoFilter,
    monedaFilter,
    montoMin,
    montoMax,
    sortDir,
  ]);

  const targetExportList = useMemo(
    () =>
      selectedUuids.size > 0
        ? filtered.filter((c) => selectedUuids.has(c.uuid))
        : filtered,
    [filtered, selectedUuids],
  );

  const handleResetAllFilters = () => {
    setFechaIni('2026-10-01');
    setFechaFin('2026-11-30');
    setEstatusTab('todos');
    setMetodoFilter('ALL');
    setTipoFilter('ALL');
    setSearch('');
    setRfcFilter('');
    setFormaFilter('ALL');
    setUsoFilter('ALL');
    setMonedaFilter('ALL');
    setMontoMin('');
    setMontoMax('');
    setSelectedUuids(new Set());
  };

  const handleExportExcel = () => {
    exportToExcel(
      targetExportList.map((c) => {
        const rel = relMap.get(c.uuid);
        const meta = getCfdiRowTaxAndAlerts(db, activeEmpresa, c);
        return {
          UUID: c.uuid,
          Serie: c.serie,
          Folio: c.folio,
          Tipo: CATALOGO_TIPO_CFDI[c.tipo] || c.tipo,
          'Efecto en impuestos': meta.efectoLabel,
          Validaciones: meta.validaciones.map((v) => v.label).join(', ') || 'Sin alertas',
          Asociados: meta.asociadosCount,
          'Fecha expedición': c.fecha_emision,
          'Forma de pago': c.forma_pago,
          'Método de pago': c.metodo_pago,
          'Nombre contraparte': direccion === 'E' ? c.nombre_receptor : c.nombre_emisor,
          'RFC contraparte': direccion === 'E' ? c.rfc_receptor : c.rfc_emisor,
          Moneda: c.moneda,
          Subtotal: c.subtotal,
          'IVA Trasladado': c.iva_trasladado,
          Total: c.total,
          'Total MXN': c.total_mxn,
          'Uso CFDI': c.uso_cfdi,
          'Tipo relación': rel?.tipo || '',
          'UUID relacionado': rel?.uuidRel || '',
          'Estatus SAT': c.estatus_sat,
          'Fecha cancelación': c.fecha_cancelacion || '',
        };
      }),
      `CFDIs_${direccion === 'E' ? 'Emitidos' : 'Recibidos'}_${activeEmpresa.rfc}`,
      direccion === 'E' ? 'Emitidos' : 'Recibidos',
    );
  };

  const availableYears = useMemo(() => getAvailableYears(baseCfdis), [baseCfdis]);
  const selectedYearFilter =
    fechaIni.slice(0, 4) === fechaFin.slice(0, 4) && availableYears.includes(fechaIni.slice(0, 4))
      ? fechaIni.slice(0, 4)
      : 'ALL';
  const activePresetYear = selectedYearFilter === 'ALL' ? availableYears[0] || '2026' : selectedYearFilter;

  const applyPresetRange = (preset: 'nov' | 'oct' | 'year' | 'all') => {
    if (preset === 'nov') {
      setFechaIni(`${activePresetYear}-11-01`);
      setFechaFin(getLastDayOfMonth(`${activePresetYear}-11`));
    } else if (preset === 'oct') {
      setFechaIni(`${activePresetYear}-10-01`);
      setFechaFin(getLastDayOfMonth(`${activePresetYear}-10`));
    } else if (preset === 'year') {
      setFechaIni(`${activePresetYear}-01-01`);
      setFechaFin(`${activePresetYear}-12-31`);
    } else {
      setFechaIni('2020-01-01');
      setFechaFin('2027-12-31');
    }
  };

  const isColVisible = (key: string) => visibleCols.includes(key);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            {direccion === 'E' ? 'CFDIs emitidos' : 'CFDIs recibidos'}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {direccion === 'E'
              ? 'Comprobantes fiscales expedidos a clientes y nómina timbrada.'
              : 'Comprobantes fiscales recibidos de proveedores y prestadores de servicios.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedUuids.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedUuids(new Set())}
              className="inline-flex items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 cursor-pointer"
            >
              {selectedUuids.size} seleccionado(s) · Limpiar
            </button>
          )}
          <button
            type="button"
            onClick={handleResetAllFilters}
            className="btn-tactile inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reiniciar filtros
          </button>
          <button
            type="button"
            onClick={() =>
              void downloadMultipleCfdisBundle(
                targetExportList,
                db.conceptos,
                `XML_${direccion === 'E' ? 'Emitidos' : 'Recibidos'}_${activeEmpresa.rfc}`,
              )
            }
            disabled={targetExportList.length === 0}
            className="btn-tactile inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
          >
            <FileArchive className="h-3.5 w-3.5" />
            Descargar ZIP ({targetExportList.length})
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CFDIs
          </button>
        </div>
      </div>

      {/* Rango de fechas y accesos rápidos */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-slate-500">Ejercicio</span>
            <select
              name="cfdi-ejercicio"
              aria-label="Ejercicio fiscal"
              value={selectedYearFilter}
              onChange={(e) => {
                const y = e.target.value;
                if (y === 'ALL') {
                  setFechaIni('2020-01-01');
                  setFechaFin('2027-12-31');
                } else {
                  setFechaIni(`${y}-01-01`);
                  setFechaFin(`${y}-12-31`);
                }
              }}
              className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
              <option value="ALL">Todos los años</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-slate-500">Desde</span>
            <input
              type="date"
              name="cfdi-fecha-desde"
              aria-label="Fecha desde"
              value={fechaIni}
              onChange={(e) => setFechaIni(e.target.value)}
              className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-800"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-slate-500">Hasta</span>
            <input
              type="date"
              name="cfdi-fecha-hasta"
              aria-label="Fecha hasta"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-800"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ['nov', `Nov ${activePresetYear}`],
                ['oct', `Oct ${activePresetYear}`],
                ['year', `Todo ${activePresetYear}`],
                ['all', 'Histórico'],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => applyPresetRange(k)}
                className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAdvFilters((v) => !v)}
          className={`inline-flex items-center gap-1.5 self-start rounded-xl border px-3 py-2 text-xs font-medium cursor-pointer lg:self-auto ${
            showAdvFilters
              ? 'border-blue-300 bg-blue-50 text-blue-700'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Filter className="h-3.5 w-3.5" />
          Filtrar avanzado
        </button>
      </div>

      {/* Panel filtros avanzados */}
      {showAdvFilters && (
        <div className="animate-fade-up grid grid-cols-1 gap-3 rounded-2xl border border-blue-200 bg-blue-50/30 p-4 text-xs sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <label className="mb-1 block font-semibold text-slate-700">RFC contraparte</label>
            <input
              type="text"
              name="cfdi-rfc-contraparte"
              aria-label="RFC contraparte"
              value={rfcFilter}
              onChange={(e) => setRfcFilter(e.target.value)}
              placeholder="Ej. GIM980412..."
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
            />
          </div>
          <div>
            <label className="mb-1 block font-semibold text-slate-700">Forma de pago</label>
            <select
              name="cfdi-forma-pago"
              aria-label="Forma de pago"
              value={formaFilter}
              onChange={(e) => setFormaFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
            >
              <option value="ALL">Todas</option>
              {Object.entries(CATALOGO_FORMA_PAGO)
                .filter(([k]) => k !== '')
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block font-semibold text-slate-700">Uso CFDI</label>
            <select
              name="cfdi-uso"
              aria-label="Uso CFDI"
              value={usoFilter}
              onChange={(e) => setUsoFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
            >
              <option value="ALL">Todos</option>
              {Object.entries(CATALOGO_USO_CFDI).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block font-semibold text-slate-700">Moneda</label>
            <select
              name="cfdi-moneda"
              aria-label="Moneda"
              value={monedaFilter}
              onChange={(e) => setMonedaFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
            >
              <option value="ALL">Todas</option>
              <option value="MXN">MXN</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block font-semibold text-slate-700">Monto mín. (MXN)</label>
            <input
              type="number"
              name="cfdi-monto-min"
              aria-label="Monto mínimo en MXN"
              value={montoMin}
              onChange={(e) => setMontoMin(e.target.value)}
              placeholder="0"
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
            />
          </div>
          <div>
            <label className="mb-1 block font-semibold text-slate-700">Monto máx. (MXN)</label>
            <div className="flex gap-1.5">
              <input
                type="number"
                name="cfdi-monto-max"
                aria-label="Monto máximo en MXN"
                value={montoMax}
                onChange={(e) => setMontoMax(e.target.value)}
                placeholder="Sin límite"
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
              />
              <button
                type="button"
                title="Limpiar filtros avanzados"
                aria-label="Limpiar filtros avanzados"
                onClick={() => {
                  setRfcFilter('');
                  setFormaFilter('ALL');
                  setUsoFilter('ALL');
                  setMonedaFilter('ALL');
                  setMontoMin('');
                  setMontoMax('');
                }}
                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5 Tarjetas por tipo (clic filtra la tabla) */}
      <div className="stagger-grid grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cardStats.map((card) => {
          const selected = tipoFilter === card.tipo;
          return (
            <button
              key={card.tipo}
              type="button"
              onClick={() => setTipoFilter(selected ? 'ALL' : card.tipo)}
              className={`card-interactive rounded-2xl border border-l-4 bg-white p-4 text-left cursor-pointer ${
                card.accent
              } ${
                selected
                  ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-sm'
                  : 'border-slate-200 hover:border-blue-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">{card.label}</span>
                <span
                  title="Comprobantes no cancelados en el periodo"
                  className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600"
                >
                  {card.periodCount} activos
                </span>
              </div>
              <p className="mt-2 text-base font-bold text-slate-900">
                <Money value={card.periodAmount} animate />
              </p>
              <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-1.5 text-[11px] text-slate-500">
                <span>Acum. ejercicio</span>
                <span className="font-semibold text-slate-700">
                  <Money value={card.yearAmount} /> ({card.yearCount})
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Pestañas de categoría (Todos | Ingresos/Gastos | Egresos | Pagos | Nómina | Traslados) + estatus + subfiltro PUE/PPD */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {/* Sub-pestañas de tipo de comprobante */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-3.5 py-2.5">
          <div className="flex flex-wrap gap-1">
            {(
              [
                ['ALL', 'Todos'],
                ['I', direccion === 'R' ? 'Gastos' : 'Ingresos'],
                ['E', 'Egresos'],
                ['P', 'Pagos'],
                ['N', 'Nómina'],
                ['T', 'Traslados'],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTipoFilter(k)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  tipoFilter === k
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
          <span className="text-[11px] font-medium text-slate-500">
            Sincronizado con el SAT · Mostrando <strong>{filtered.length}</strong> comprobante(s)
          </span>
        </div>

        <div className="flex flex-col gap-3 border-b border-slate-200 p-3.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['todos', `Todos (${tabCounts.todos})`],
                ['vigente', `Vigentes (${tabCounts.vigente})`],
                ['cancelado', `Cancelados (${tabCounts.cancelado})`],
                ['en_cancelacion', `En proceso (${tabCounts.en_cancelacion})`],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setEstatusTab(k)}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  estatusTab === k
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Subfiltro Todos / PUE / PPD */}
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium">
              {(['ALL', 'PUE', 'PPD'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMetodoFilter(m)}
                  className={`rounded-lg px-2.5 py-1 cursor-pointer ${
                    metodoFilter === m ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  {m === 'ALL' ? 'Todos' : m}
                </button>
              ))}
            </div>

            <div className="relative flex-1 sm:w-56 sm:flex-none">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                name="cfdi-busqueda"
                aria-label="Buscar CFDI por UUID, RFC o nombre"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="UUID, RFC o nombre..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-8 text-xs focus:border-blue-500 focus:bg-white focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
              title="Ordenar por fecha"
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <ArrowDownUp className="h-3.5 w-3.5" />
              {sortDir === 'desc' ? 'Recientes' : 'Antiguos'}
            </button>

            <ColumnConfigMenu
              columns={ALL_COLUMNS}
              visibleKeys={visibleCols}
              onChange={handleColsChange}
              onReset={() => handleColsChange(DEFAULT_VISIBLE)}
            />
          </div>
        </div>

        {/* Tabla principal */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="w-8 px-2.5 py-3">
                  <input
                    type="checkbox"
                    name="cfdi-select-all"
                    aria-label="Seleccionar todos los CFDIs visibles"
                    checked={
                      filtered.length > 0 &&
                      filtered.every((c) => selectedUuids.has(c.uuid))
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedUuids(new Set(filtered.map((c) => c.uuid)));
                      } else {
                        setSelectedUuids(new Set());
                      }
                    }}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 cursor-pointer"
                  />
                </th>
                {isColVisible('uuid') && <th className="px-2.5 py-3 font-semibold">UUID / Folio</th>}
                {isColVisible('contraparte_nombre') && (
                  <th className="px-2.5 py-3 font-semibold">
                    {direccion === 'E' ? 'Receptor (Cliente)' : 'Emisor (Proveedor)'}
                  </th>
                )}
                {isColVisible('contraparte_rfc') && (
                  <th className="px-2.5 py-3 font-semibold">RFC</th>
                )}
                {isColVisible('efecto_impuestos') && (
                  <th className="px-2.5 py-3 font-semibold">Efecto en impuestos</th>
                )}
                {isColVisible('validaciones') && (
                  <th className="px-2.5 py-3 font-semibold">Validaciones</th>
                )}
                {isColVisible('fecha_emision') && (
                  <th className="px-2.5 py-3 font-semibold">Expedición</th>
                )}
                {isColVisible('forma_pago') && <th className="px-2.5 py-3 font-semibold">Forma</th>}
                {isColVisible('metodo_pago') && (
                  <th className="px-2.5 py-3 font-semibold">Método</th>
                )}
                {isColVisible('subtotal') && (
                  <th className="px-2.5 py-3 text-right font-semibold">Subtotal</th>
                )}
                {isColVisible('tipo_relacion') && (
                  <th className="px-2.5 py-3 font-semibold">Tipo rel.</th>
                )}
                {isColVisible('iva_trasladado') && (
                  <th className="px-2.5 py-3 text-right font-semibold">IVA 16%</th>
                )}
                {isColVisible('total') && (
                  <th className="px-2.5 py-3 text-right font-semibold">Total</th>
                )}
                {isColVisible('asociados') && (
                  <th className="px-2.5 py-3 text-center font-semibold">Asociados</th>
                )}
                {isColVisible('uso_cfdi') && (
                  <th className="px-2.5 py-3 font-semibold">Uso CFDI</th>
                )}
                {isColVisible('uuid_relacionado') && (
                  <th className="px-2.5 py-3 font-semibold">UUID relacionado</th>
                )}
                {isColVisible('estatus_sat') && (
                  <th className="px-2.5 py-3 font-semibold">Estatus</th>
                )}
                {isColVisible('fecha_cancelacion') && (
                  <th className="px-2.5 py-3 font-semibold">Fecha canc.</th>
                )}
                <th className="sticky right-0 bg-slate-50 px-2.5 py-3 text-right font-semibold shadow-[-4px_0_8px_-4px_rgba(15,23,42,0.08)]">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="stagger-rows divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={19} className="px-4 py-10 text-center text-slate-500">
                    Sin CFDIs encontrados con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => {
                  const cpName = direccion === 'E' ? c.nombre_receptor : c.nombre_emisor;
                  const cpRfc = direccion === 'E' ? c.rfc_receptor : c.rfc_emisor;
                  const rel = relMap.get(c.uuid);
                  const conceptos = db.conceptos.filter((item) => item.uuid === c.uuid);
                  const rowMeta = getCfdiRowTaxAndAlerts(db, activeEmpresa, c);
                  const isChecked = selectedUuids.has(c.uuid);

                  return (
                    <tr
                      key={c.uuid}
                      className={`group ${
                        isChecked ? 'bg-blue-50/40' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="px-2.5 py-2.5">
                        <input
                          type="checkbox"
                          name={`cfdi-select-${c.uuid}`}
                          aria-label={`Seleccionar CFDI ${c.serie}-${c.folio}`}
                          checked={isChecked}
                          onChange={(e) => {
                            setSelectedUuids((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(c.uuid);
                              else next.delete(c.uuid);
                              return next;
                            });
                          }}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 cursor-pointer"
                        />
                      </td>
                      {isColVisible('uuid') && (
                        <td className="px-2.5 py-2.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openCfdiDetail(c.uuid)}
                            className="text-left hover:text-blue-700 cursor-pointer"
                          >
                            <p className="font-semibold text-slate-900">
                              {c.serie}-{c.folio}{' '}
                              <span className="rounded bg-slate-100 px-1 text-[10px] font-medium text-slate-600">
                                {CATALOGO_TIPO_CFDI[c.tipo] || c.tipo}
                              </span>
                            </p>
                            <p className="font-mono-code text-[11px] text-blue-600">
                              {shortUuid(c.uuid)}
                            </p>
                          </button>
                        </td>
                      )}
                      {isColVisible('contraparte_nombre') && (
                        <td className="max-w-[175px] truncate px-2.5 py-2.5 font-medium text-slate-800">
                          <p className="truncate">{cpName}</p>
                          <p className="font-mono-code text-[10px] text-slate-500">{cpRfc}</p>
                        </td>
                      )}
                      {isColVisible('contraparte_rfc') && (
                        <td className="px-2.5 py-2.5 whitespace-nowrap font-mono-code text-slate-600">
                          {cpRfc}
                        </td>
                      )}
                      {isColVisible('efecto_impuestos') && (
                        <td className="px-2.5 py-2.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setTaxEffectCfdi(c)}
                            title={rowMeta.efectoDetalle}
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold cursor-pointer ${
                              rowMeta.efectoEstado === 'con_efecto'
                                ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                                : rowMeta.efectoEstado === 'con_alertas'
                                  ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                                  : 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            <Sparkles className="h-3 w-3" />
                            {rowMeta.efectoLabel}
                          </button>
                        </td>
                      )}
                      {isColVisible('validaciones') && (
                        <td className="px-2.5 py-2.5 whitespace-nowrap">
                          {rowMeta.validaciones.length === 0 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" /> OK
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {rowMeta.validaciones.map((v, idx) => (
                                <span
                                  key={idx}
                                  className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                                    v.variant === 'danger'
                                      ? 'bg-rose-100 text-rose-800'
                                      : v.variant === 'warning'
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-blue-50 text-blue-800'
                                  }`}
                                >
                                  <AlertTriangle className="h-2.5 w-2.5" />
                                  {v.label}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      )}
                      {isColVisible('fecha_emision') && (
                        <td className="px-2.5 py-2.5 whitespace-nowrap text-slate-600">
                          {formatShortDate(c.fecha_fiscal)}
                        </td>
                      )}
                      {isColVisible('forma_pago') && (
                        <td className="px-2.5 py-2.5 whitespace-nowrap text-slate-600">
                          {c.forma_pago || '—'}
                        </td>
                      )}
                      {isColVisible('metodo_pago') && (
                        <td className="px-2.5 py-2.5 whitespace-nowrap">
                          {c.metodo_pago ? (
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                              {c.metodo_pago}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      )}
                      {isColVisible('subtotal') && (
                        <td className="px-2.5 py-2.5 whitespace-nowrap text-right text-slate-700">
                          <Money value={c.subtotal} moneda={c.moneda} />
                        </td>
                      )}
                      {isColVisible('tipo_relacion') && (
                        <td className="px-2.5 py-2.5 whitespace-nowrap text-slate-600">
                          {rel?.tipo || '—'}
                        </td>
                      )}
                      {isColVisible('iva_trasladado') && (
                        <td className="px-2.5 py-2.5 whitespace-nowrap text-right text-slate-700">
                          <Money value={c.iva_trasladado} moneda={c.moneda} />
                        </td>
                      )}
                      {isColVisible('total') && (
                        <td className="px-2.5 py-2.5 whitespace-nowrap text-right font-semibold text-slate-900">
                          <Money value={c.total} moneda={c.moneda} />
                        </td>
                      )}
                      {isColVisible('asociados') && (
                        <td className="px-2.5 py-2.5 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openCfdiDetail(c.uuid)}
                            title="Ver documentos y complementos asociados"
                            className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold cursor-pointer ${
                              rowMeta.asociadosCount > 0
                                ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                                : 'text-slate-400 hover:bg-slate-100'
                            }`}
                          >
                            <Link2 className="h-3 w-3" />
                            {rowMeta.asociadosCount}
                          </button>
                        </td>
                      )}
                      {isColVisible('uso_cfdi') && (
                        <td className="px-2.5 py-2.5 whitespace-nowrap font-mono-code text-slate-600">
                          {c.uso_cfdi}
                        </td>
                      )}
                      {isColVisible('uuid_relacionado') && (
                        <td className="px-2.5 py-2.5 whitespace-nowrap font-mono-code text-[11px] text-slate-500">
                          {rel ? shortUuid(rel.uuidRel) : '—'}
                        </td>
                      )}
                      {isColVisible('estatus_sat') && (
                        <td className="px-2.5 py-2.5 whitespace-nowrap">
                          {estatusSatBadge(c.estatus_sat)}
                        </td>
                      )}
                      {isColVisible('fecha_cancelacion') && (
                        <td className="px-2.5 py-2.5 whitespace-nowrap text-slate-500">
                          {formatShortDate(c.fecha_cancelacion)}
                        </td>
                      )}
                      <td className="sticky right-0 bg-white group-hover:bg-slate-50 px-2.5 py-2.5 whitespace-nowrap text-right shadow-[-4px_0_8px_-4px_rgba(15,23,42,0.08)]">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openCfdiDetail(c.uuid)}
                            title="Ver detalle completo"
                            aria-label="Ver detalle completo"
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-700 cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadSingleCfdiXml(c, conceptos)}
                            title="Descargar XML"
                            aria-label="Descargar XML"
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openCfdiPdf(c.uuid)}
                            title="Vista PDF (Representación impresa)"
                            aria-label="Vista PDF (Representación impresa)"
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Explorador de Efecto en Impuestos por CFDI */}
      {taxEffectCfdi && (
        <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]">
          <div className="animate-modal-pop w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Efecto en impuestos · {taxEffectCfdi.serie}-{taxEffectCfdi.folio}
                </h3>
                <p className="font-mono-code text-[11px] text-slate-500">
                  {taxEffectCfdi.uuid}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTaxEffectCfdi(null)}
                aria-label="Cerrar"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {(() => {
              const meta = getCfdiRowTaxAndAlerts(db, activeEmpresa, taxEffectCfdi);
              return (
                <div className="mt-4 space-y-3 text-xs">
                  <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-blue-950">
                    <p className="font-bold">{meta.efectoLabel}</p>
                    <p className="mt-1 leading-relaxed text-blue-900">{meta.efectoDetalle}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 rounded-xl bg-slate-50 p-3">
                    <div>
                      <span className="text-[11px] text-slate-500">Base MXN</span>
                      <p className="font-bold text-slate-900">
                        <Money
                          value={
                            (taxEffectCfdi.subtotal - taxEffectCfdi.descuento) *
                            (taxEffectCfdi.moneda === 'MXN' ? 1 : taxEffectCfdi.tipo_cambio)
                          }
                        />
                      </p>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500">IVA Trasladado</span>
                      <p className="font-bold text-slate-900">
                        <Money value={taxEffectCfdi.iva_trasladado} moneda={taxEffectCfdi.moneda} />
                      </p>
                    </div>
                  </div>

                  {meta.validaciones.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                      <p className="font-bold text-amber-900">Validaciones detectadas:</p>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-amber-800">
                        {meta.validaciones.map((v, i) => (
                          <li key={i}>{v.label}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        const p = taxEffectCfdi.fecha_fiscal.slice(0, 7);
                        setTaxEffectCfdi(null);
                        navigate('iva', { periodo: p });
                      }}
                      className="rounded-xl border border-slate-200 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      Ver en Cédula IVA
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const p = taxEffectCfdi.fecha_fiscal.slice(0, 7);
                        setTaxEffectCfdi(null);
                        navigate('isr', { periodo: p });
                      }}
                      className="rounded-xl bg-blue-600 px-3.5 py-2 font-semibold text-white hover:bg-blue-700 cursor-pointer"
                    >
                      Ver en Cédula ISR
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
