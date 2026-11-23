import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Download, Eye, FileSpreadsheet, Info, Search, X } from 'lucide-react';
import { useFiscal } from '../context/FiscalContext';
import {
  getCedulaIvaPeriodo,
  getIvaFlujoPeriodo,
  type IvaDetalleRow,
} from '../services/fiscalCalculations';
import {
  formatShortDate,
  getAvailableYears,
  getMesesForYear,
  shortUuid,
} from '../utils/format';
import { exportToExcel } from '../utils/exportExcel';
import { Money } from '../components/shared/Money';
import { RoleGuard } from '../components/shared/RoleGuard';
import { ColumnConfigMenu, type ColumnOption } from '../components/shared/ColumnConfigMenu';
import { StatusBadge } from '../components/shared/StatusBadge';

const IVA_COLUMNS: ColumnOption[] = [
  { key: 'incluir', label: 'Incluir', locked: true },
  { key: 'uuid', label: 'UUID', locked: true },
  { key: 'fecha_fiscal', label: 'Fecha fiscal' },
  { key: 'fecha_emision', label: 'Fecha emisión' },
  { key: 'serie_folio', label: 'Serie / Folio' },
  { key: 'rfc', label: 'RFC' },
  { key: 'metodo', label: 'Método / Flujo' },
  { key: 'base', label: 'Base MXN' },
  { key: 'iva', label: 'IVA MXN' },
];

const DEFAULT_IVA_COLS = IVA_COLUMNS.map((c) => c.key);

export const IvaPage: React.FC = () => {
  const {
    db,
    activeEmpresa,
    currentUser,
    routePreset,
    clearRoutePreset,
    setImpuestoAjuste,
    openCfdiDetail,
  } = useFiscal();

  const [selectedYear, setSelectedYear] = useState('2026');
  const [periodo, setPeriodo] = useState('2026-10');
  const availableYears = useMemo(
    () =>
      getAvailableYears(
        db.cfdis.filter((c) => c.empresa_id === activeEmpresa.id && !c.solo_en_sat),
      ),
    [db.cfdis, activeEmpresa.id],
  );
  const mesesAnio = useMemo(() => getMesesForYear(selectedYear), [selectedYear]);
  const [tab, setTab] = useState<'trasladado' | 'acreditable'>('trasladado');
  const [estadoFiltro, setEstadoFiltro] = useState<'todos' | 'activos' | 'inactivos'>('todos');
  const [search, setSearch] = useState('');
  const [visibleCols, setVisibleCols] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('tecnocontrol_cols_iva');
      return saved ? JSON.parse(saved) : DEFAULT_IVA_COLS;
    } catch {
      return DEFAULT_IVA_COLS;
    }
  });

  // Modal de motivo al excluir un CFDI
  const [pendingToggleRow, setPendingToggleRow] = useState<IvaDetalleRow | null>(null);
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    if (routePreset?.periodo) {
      setSelectedYear(routePreset.periodo.slice(0, 4));
      setPeriodo(routePreset.periodo);
      clearRoutePreset();
    }
  }, [routePreset, clearRoutePreset]);

  useEffect(() => {
    if (!availableYears.includes(selectedYear)) {
      const y = availableYears[0];
      setSelectedYear(y);
      setPeriodo(`${y}-${periodo.slice(5, 7)}`);
    }
  }, [availableYears, selectedYear, periodo]);

  const isReadOnly = currentUser.rol === 'consulta';

  const ivaData = useMemo(
    () => getIvaFlujoPeriodo(db, activeEmpresa.id, periodo),
    [db, activeEmpresa.id, periodo],
  );

  const cedulaIva = useMemo(
    () => getCedulaIvaPeriodo(db, activeEmpresa.id, periodo),
    [db, activeEmpresa.id, periodo],
  );

  const [openAcc, setOpenAcc] = useState<Record<string, boolean>>({
    trasladado: true,
    acreditable: true,
    definitivo: true,
    retenido: true,
  });

  const toggleAcc = (key: string) =>
    setOpenAcc((prev) => ({ ...prev, [key]: !prev[key] }));

  const sourceRows = tab === 'trasladado' ? ivaData.trasladadoRows : ivaData.acreditableRows;

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sourceRows.filter((row) => {
      if (estadoFiltro === 'activos' && !row.activo) return false;
      if (estadoFiltro === 'inactivos' && row.activo) return false;
      if (!q) return true;
      const rfc = tab === 'trasladado' ? row.cfdi.rfc_receptor : row.cfdi.rfc_emisor;
      const nombre = tab === 'trasladado' ? row.cfdi.nombre_receptor : row.cfdi.nombre_emisor;
      return (
        row.uuid.toLowerCase().includes(q) ||
        rfc.toLowerCase().includes(q) ||
        nombre.toLowerCase().includes(q) ||
        `${row.cfdi.serie}-${row.cfdi.folio}`.toLowerCase().includes(q)
      );
    });
  }, [sourceRows, estadoFiltro, search, tab]);

  const handleToggleSwitch = (row: IvaDetalleRow) => {
    if (isReadOnly) return;
    if (row.activo) {
      setPendingToggleRow(row);
      setMotivo('');
    } else {
      setImpuestoAjuste({
        uuid: row.uuid,
        impuesto: 'iva',
        periodo,
        incluido: true,
        motivo: 'Reincorporado al cálculo de IVA',
      });
    }
  };

  const confirmExclude = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingToggleRow || motivo.trim().length < 4) return;
    setImpuestoAjuste({
      uuid: pendingToggleRow.uuid,
      impuesto: 'iva',
      periodo,
      incluido: false,
      motivo: motivo.trim(),
    });
    setPendingToggleRow(null);
    setMotivo('');
  };

  const handleExportCedula = () => {
    exportToExcel(
      [
        {
          Sección: '1. Determinación de IVA trasladado',
          Concepto: 'Valor de los actos o actividades gravados a la tasa del 16%',
          Importe_MXN: cedulaIva.trasladado.actos16,
        },
        {
          Sección: '1. Determinación de IVA trasladado',
          Concepto: 'Valor de los actos o actividades gravados a la tasa del 8%',
          Importe_MXN: cedulaIva.trasladado.actos8,
        },
        {
          Sección: '1. Determinación de IVA trasladado',
          Concepto: 'Valor de los actos o actividades gravados a la tasa del 0%',
          Importe_MXN: cedulaIva.trasladado.actos0,
        },
        {
          Sección: '1. Determinación de IVA trasladado',
          Concepto: 'Valor de los actos o actividades exentos',
          Importe_MXN: cedulaIva.trasladado.actosExentos,
        },
        {
          Sección: '1. Determinación de IVA trasladado',
          Concepto: 'Valor de los actos o actividades no objeto (informativo)',
          Importe_MXN: cedulaIva.trasladado.actosNoObjeto,
        },
        {
          Sección: '1. Determinación de IVA trasladado',
          Concepto: 'IVA cobrado (16% y 8%)',
          Importe_MXN: cedulaIva.trasladado.ivaCobradoTotal,
        },
        {
          Sección: '1. Determinación de IVA trasladado',
          Concepto: '(-) IVA por devoluciones, descuentos o bonificaciones',
          Importe_MXN: cedulaIva.trasladado.ivaDevoluciones,
        },
        {
          Sección: '1. Determinación de IVA trasladado',
          Concepto: '(-) Retenciones de IVA que te realizaron',
          Importe_MXN: cedulaIva.trasladado.retencionesIvaRealizadas,
        },
        {
          Sección: '1. Determinación de IVA trasladado',
          Concepto: '(=) Total de IVA trasladado',
          Importe_MXN: cedulaIva.trasladado.totalIvaTrasladado,
        },
        {
          Sección: '2. Determinación de IVA acreditable',
          Concepto: 'Total de actos o actividades pagados a la tasa del 16%',
          Importe_MXN: cedulaIva.acreditable.actosPagados16,
        },
        {
          Sección: '2. Determinación de IVA acreditable',
          Concepto: 'Total de actos o actividades pagados a la tasa del 8%',
          Importe_MXN: cedulaIva.acreditable.actosPagados8,
        },
        {
          Sección: '2. Determinación de IVA acreditable',
          Concepto: 'Total de actos o actividades pagados a la tasa del 0%',
          Importe_MXN: cedulaIva.acreditable.actosPagados0,
        },
        {
          Sección: '2. Determinación de IVA acreditable',
          Concepto: 'IVA pagado',
          Importe_MXN: cedulaIva.acreditable.ivaPagadoTotal,
        },
        {
          Sección: '2. Determinación de IVA acreditable',
          Concepto: '(-) IVA de devoluciones, descuentos y bonificaciones',
          Importe_MXN: cedulaIva.acreditable.ivaDevolucionesCompras,
        },
        {
          Sección: '2. Determinación de IVA acreditable',
          Concepto: '(=) Total de IVA acreditable',
          Importe_MXN: cedulaIva.acreditable.totalIvaAcreditable,
        },
        {
          Sección: '3. Determinación del pago definitivo de IVA',
          Concepto: '(=) IVA a cargo o a favor',
          Importe_MXN: cedulaIva.pagoDefinitivo.ivaACargoOFavor,
        },
        {
          Sección: '4. Determinación de IVA retenido',
          Concepto: '(=) IVA retenido por pagar',
          Importe_MXN: cedulaIva.ivaRetenidoPorPagar,
        },
      ],
      `Cedula_IVA_${periodo}_${activeEmpresa.rfc}`,
      'Cedula_IVA',
    );
  };

  const handleExport = () => {
    exportToExcel(
      filteredRows.map((r) => ({
        Incluido: r.activo ? 'Activo' : 'Inactivo',
        UUID: r.uuid,
        'Fecha fiscal': r.fecha_fiscal,
        'Fecha emisión': r.fecha_emision.slice(0, 10),
        Serie: r.cfdi.serie,
        Folio: r.cfdi.folio,
        RFC: tab === 'trasladado' ? r.cfdi.rfc_receptor : r.cfdi.rfc_emisor,
        Contraparte: tab === 'trasladado' ? r.cfdi.nombre_receptor : r.cfdi.nombre_emisor,
        Método: r.cfdi.metodo_pago,
        Proporción: `${Math.round(r.proporcion * 100)}%`,
        Base: r.base,
        IVA: r.iva,
        Motivo: r.motivo_exclusion || '',
      })),
      `IVA_${tab}_${periodo}_${activeEmpresa.rfc}`,
      `IVA_${tab}`,
    );
  };

  const isCol = (k: string) => visibleCols.includes(k);

  return (
    <RoleGuard allowedRoles={['propietario', 'contador', 'consulta']} sectionName="Impuestos IVA">
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Impuestos — IVA</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Pre-determinación mensual con base en flujo de efectivo (PUE por emisión + PPD
              proporcional por REP).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              name="iva-ejercicio"
              aria-label="Ejercicio"
              value={selectedYear}
              onChange={(e) => {
                const y = e.target.value;
                setSelectedYear(y);
                setPeriodo(`${y}-${periodo.slice(5, 7)}`);
              }}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-800"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <select
              name="iva-periodo"
              aria-label="Periodo mensual"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
            >
              {mesesAnio.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.largo}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleExportCedula}
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100 cursor-pointer"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Cédula de impuestos
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar CFDIs
            </button>
          </div>
        </div>

        {/* 3 Tarjetas de IVA */}
        <div className="stagger-grid grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="card-interactive rounded-2xl border border-slate-200 bg-white p-5">
            <span className="text-xs font-semibold text-slate-500">IVA Trasladado (cobrado)</span>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              <Money value={ivaData.ivaTrasladado} animate />
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {ivaData.trasladadoRows.filter((r) => r.activo).length} comprobante(s) activos
            </p>
          </div>

          <div className="card-interactive rounded-2xl border border-slate-200 bg-white p-5">
            <span className="text-xs font-semibold text-slate-500">IVA Acreditable (pagado)</span>
            <p className="mt-2 text-2xl font-bold text-emerald-700">
              <Money value={ivaData.ivaAcreditable} animate />
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {ivaData.acreditableRows.filter((r) => r.activo).length} comprobante(s) activos ·
              Retenido: <Money value={ivaData.ivaRetenido} animate />
            </p>
          </div>

          <div
            className={`card-interactive rounded-2xl border p-5 ${
              ivaData.ivaACargo >= 0
                ? 'border-blue-200 bg-blue-50/60'
                : 'border-emerald-200 bg-emerald-50/60'
            }`}
          >
            <span className="text-xs font-semibold text-slate-700">
              {ivaData.ivaACargo >= 0 ? 'IVA a cargo estimado' : 'IVA a favor estimado'}
            </span>
            <p
              className={`mt-2 text-2xl font-bold ${
                ivaData.ivaACargo >= 0 ? 'text-blue-900' : 'text-emerald-800'
              }`}
            >
              <Money value={Math.abs(ivaData.ivaACargo)} animate />
            </p>
            <p className="mt-1 text-[11px] text-slate-600">
              Trasladado − Acreditable − Retenido (estimación de apoyo)
            </p>
          </div>
        </div>

        {/* Cédula Desplegable de Determinación de IVA (4 Acordeones Oficiales) */}
        <div className="space-y-3">
          {/* Acordeón 1: Determinación de IVA trasladado */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => toggleAcc('trasladado')}
              className="flex w-full items-center justify-between bg-slate-50/80 px-5 py-3.5 text-left hover:bg-slate-100/70 cursor-pointer"
            >
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Determinación de IVA trasladado
                </h2>
                <p className="text-[11px] text-slate-500">
                  Desglose de actos o actividades gravados por tasa (16%, 8%, 0%, exentos y no objeto)
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-slate-900">
                  <Money value={cedulaIva.trasladado.totalIvaTrasladado} />
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-slate-500 transition-transform ${
                    openAcc.trasladado ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </button>
            {openAcc.trasladado && (
              <div className="divide-y divide-slate-100 px-5 py-3 text-xs">
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-600">
                    Valor de los actos o actividades gravados a la tasa del 16%
                  </span>
                  <span className="font-semibold text-slate-900">
                    <Money value={cedulaIva.trasladado.actos16} />
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-600">
                    Valor de los actos o actividades gravados a la tasa del 8%
                  </span>
                  <span className="font-semibold text-slate-900">
                    <Money value={cedulaIva.trasladado.actos8} />
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-600">
                    Valor de los actos o actividades gravados a la tasa del 0%
                  </span>
                  <span className="font-semibold text-slate-900">
                    <Money value={cedulaIva.trasladado.actos0} />
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-600">
                    Valor de los actos o actividades exentos
                  </span>
                  <span className="font-semibold text-slate-900">
                    <Money value={cedulaIva.trasladado.actosExentos} />
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-600">
                    Valor de los actos o actividades no objeto (informativo)
                  </span>
                  <span className="font-semibold text-slate-900">
                    <Money value={cedulaIva.trasladado.actosNoObjeto} />
                  </span>
                </div>
                <div className="flex items-center justify-between bg-slate-50/70 px-3 py-2 font-semibold text-slate-800">
                  <span>
                    IVA cobrado (16%: <Money value={cedulaIva.trasladado.ivaCobrado16} /> · 8%:{' '}
                    <Money value={cedulaIva.trasladado.ivaCobrado8} />)
                  </span>
                  <span>
                    <Money value={cedulaIva.trasladado.ivaCobradoTotal} />
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 text-amber-800">
                  <span>(-) IVA por devoluciones, descuentos o bonificaciones</span>
                  <span className="font-semibold">
                    <Money value={cedulaIva.trasladado.ivaDevoluciones} />
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 text-slate-600">
                  <span>(-) Retenciones de IVA que te realizaron</span>
                  <span className="font-semibold">
                    <Money value={cedulaIva.trasladado.retencionesIvaRealizadas} />
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-blue-50/70 px-3 py-2.5 font-bold text-blue-950">
                  <span>(=) Total de IVA trasladado</span>
                  <span className="text-sm">
                    <Money value={cedulaIva.trasladado.totalIvaTrasladado} />
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Acordeón 2: Determinación de IVA acreditable */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => toggleAcc('acreditable')}
              className="flex w-full items-center justify-between bg-slate-50/80 px-5 py-3.5 text-left hover:bg-slate-100/70 cursor-pointer"
            >
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Determinación de IVA acreditable
                </h2>
                <p className="text-[11px] text-slate-500">
                  Total de actos o actividades pagados en el periodo y acreditamiento efectivo
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-emerald-700">
                  <Money value={cedulaIva.acreditable.totalIvaAcreditable} />
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-slate-500 transition-transform ${
                    openAcc.acreditable ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </button>
            {openAcc.acreditable && (
              <div className="divide-y divide-slate-100 px-5 py-3 text-xs">
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-600">
                    Total de actos o actividades pagados a la tasa del 16%
                  </span>
                  <span className="font-semibold text-slate-900">
                    <Money value={cedulaIva.acreditable.actosPagados16} />
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-600">
                    Total de actos o actividades pagados a la tasa del 8%
                  </span>
                  <span className="font-semibold text-slate-900">
                    <Money value={cedulaIva.acreditable.actosPagados8} />
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-600">
                    Total de actos o actividades pagados a la tasa del 0% / Exentos / No objeto
                  </span>
                  <span className="font-semibold text-slate-900">
                    <Money value={cedulaIva.acreditable.actosPagados0} />
                  </span>
                </div>
                <div className="flex items-center justify-between bg-slate-50/70 px-3 py-2 font-semibold text-slate-800">
                  <span>
                    IVA pagado (16%: <Money value={cedulaIva.acreditable.ivaPagado16} /> · 8%:{' '}
                    <Money value={cedulaIva.acreditable.ivaPagado8} />)
                  </span>
                  <span>
                    <Money value={cedulaIva.acreditable.ivaPagadoTotal} />
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 text-amber-800">
                  <span>(-) IVA de devoluciones, descuentos y bonificaciones</span>
                  <span className="font-semibold">
                    <Money value={cedulaIva.acreditable.ivaDevolucionesCompras} />
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-emerald-50/70 px-3 py-2.5 font-bold text-emerald-950">
                  <span>(=) Total de IVA acreditable</span>
                  <span className="text-sm">
                    <Money value={cedulaIva.acreditable.totalIvaAcreditable} />
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Acordeón 3 y 4 en grid de 2 columnas */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {/* Acordeón 3: Determinación del pago definitivo de IVA */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => toggleAcc('definitivo')}
                className="flex w-full items-center justify-between bg-slate-50/80 px-5 py-3.5 text-left hover:bg-slate-100/70 cursor-pointer"
              >
                <h2 className="text-sm font-bold text-slate-900">
                  Determinación del pago definitivo de IVA
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-blue-900">
                    <Money value={Math.abs(cedulaIva.pagoDefinitivo.ivaACargoOFavor)} />
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-slate-500 transition-transform ${
                      openAcc.definitivo ? 'rotate-180' : ''
                    }`}
                  />
                </div>
              </button>
              {openAcc.definitivo && (
                <div className="divide-y divide-slate-100 px-5 py-3 text-xs">
                  <div className="flex items-center justify-between py-2">
                    <span className="text-slate-600">Total de IVA trasladado</span>
                    <span className="font-semibold text-slate-900">
                      <Money value={cedulaIva.pagoDefinitivo.totalIvaTrasladado} />
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-slate-600">(-) Total de IVA acreditable</span>
                    <span className="font-semibold text-emerald-700">
                      <Money value={cedulaIva.pagoDefinitivo.totalIvaAcreditable} />
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-slate-600">(-) IVA retenido acreditado</span>
                    <span className="font-semibold text-slate-700">
                      <Money value={cedulaIva.pagoDefinitivo.ivaRetenidoAcreditable} />
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-blue-50/70 px-3 py-2.5 font-bold text-blue-950">
                    <span>
                      (=) {cedulaIva.pagoDefinitivo.esACargo ? 'IVA a cargo' : 'IVA a favor'}
                    </span>
                    <span className="text-sm">
                      <Money value={Math.abs(cedulaIva.pagoDefinitivo.ivaACargoOFavor)} />
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Acordeón 4: Determinación de IVA retenido */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => toggleAcc('retenido')}
                className="flex w-full items-center justify-between bg-slate-50/80 px-5 py-3.5 text-left hover:bg-slate-100/70 cursor-pointer"
              >
                <h2 className="text-sm font-bold text-slate-900">
                  Determinación de IVA retenido
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900">
                    <Money value={cedulaIva.ivaRetenidoPorPagar} />
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-slate-500 transition-transform ${
                      openAcc.retenido ? 'rotate-180' : ''
                    }`}
                  />
                </div>
              </button>
              {openAcc.retenido && (
                <div className="divide-y divide-slate-100 px-5 py-3 text-xs">
                  <div className="flex items-center justify-between py-2">
                    <span className="text-slate-600">
                      Retenciones de IVA efectuadas a proveedores en el periodo
                    </span>
                    <span className="font-semibold text-slate-900">
                      <Money value={cedulaIva.ivaRetenidoPorPagar} />
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2.5 font-bold text-slate-900">
                    <span>(=) IVA retenido por pagar</span>
                    <span className="text-sm">
                      <Money value={cedulaIva.ivaRetenidoPorPagar} />
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Nota explicativa flujo */}
        <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <span>
            Apaga el interruptor de cualquier CFDI para excluirlo del cálculo del mes; el motivo se
            guarda en <code className="font-mono-code">impuesto_ajustes</code> y en la bitácora.
          </span>
        </div>

        {/* Tabla detalle */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-3.5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setTab('trasladado')}
                  className={`rounded-lg px-3 py-1.5 cursor-pointer ${
                    tab === 'trasladado' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  IVA Trasladado ({ivaData.trasladadoRows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTab('acreditable')}
                  className={`rounded-lg px-3 py-1.5 cursor-pointer ${
                    tab === 'acreditable' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  IVA Acreditable ({ivaData.acreditableRows.length})
                </button>
              </div>

              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium">
                {(['todos', 'activos', 'inactivos'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setEstadoFiltro(f)}
                    className={`rounded-lg px-2.5 py-1 capitalize cursor-pointer ${
                      estadoFiltro === f ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-56">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  name="iva-busqueda"
                  aria-label="Buscar en IVA por UUID, RFC o nombre"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="UUID, RFC o nombre..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-8 text-xs focus:border-blue-500 focus:bg-white focus:outline-none"
                />
              </div>
              <ColumnConfigMenu
                columns={IVA_COLUMNS}
                visibleKeys={visibleCols}
                onChange={(next) => {
                  setVisibleCols(next);
                  localStorage.setItem('tecnocontrol_cols_iva', JSON.stringify(next));
                }}
                onReset={() => {
                  setVisibleCols(DEFAULT_IVA_COLS);
                  localStorage.setItem('tecnocontrol_cols_iva', JSON.stringify(DEFAULT_IVA_COLS));
                }}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  {isCol('incluir') && <th className="px-3.5 py-3 font-semibold">Incluir</th>}
                  {isCol('uuid') && <th className="px-3.5 py-3 font-semibold">UUID</th>}
                  {isCol('fecha_fiscal') && <th className="px-3.5 py-3 font-semibold">Fecha fiscal</th>}
                  {isCol('fecha_emision') && <th className="px-3.5 py-3 font-semibold">Emisión</th>}
                  {isCol('serie_folio') && <th className="px-3.5 py-3 font-semibold">Serie / Folio</th>}
                  {isCol('rfc') && <th className="px-3.5 py-3 font-semibold">RFC</th>}
                  {isCol('metodo') && <th className="px-3.5 py-3 font-semibold">Flujo</th>}
                  {isCol('base') && <th className="px-3.5 py-3 text-right font-semibold">Base</th>}
                  {isCol('iva') && <th className="px-3.5 py-3 text-right font-semibold">IVA</th>}
                  <th className="px-3.5 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="stagger-rows divide-y divide-slate-100">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-slate-500">
                      Sin comprobantes con IVA en este periodo y filtro.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const rfc = tab === 'trasladado' ? row.cfdi.rfc_receptor : row.cfdi.rfc_emisor;
                    return (
                      <tr
                        key={row.rowId}
                        className={row.activo ? 'hover:bg-slate-50/70' : 'bg-slate-50/80 opacity-65'}
                      >
                        {isCol('incluir') && (
                          <td className="px-3.5 py-2.5">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={row.activo}
                              disabled={isReadOnly}
                              onClick={() => handleToggleSwitch(row)}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                row.activo ? 'bg-blue-600' : 'bg-slate-300'
                              } ${isReadOnly ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                            >
                              <span
                                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                  row.activo ? 'translate-x-4.5' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </td>
                        )}
                        {isCol('uuid') && (
                          <td className="px-3.5 py-2.5">
                            <p className="font-mono-code text-[11px] font-medium text-blue-700">
                              {shortUuid(row.uuid)}
                            </p>
                            {row.motivo_exclusion && (
                              <p className="mt-0.5 text-[10px] text-rose-600">
                                Excluido: {row.motivo_exclusion}
                              </p>
                            )}
                          </td>
                        )}
                        {isCol('fecha_fiscal') && (
                          <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-700">
                            {formatShortDate(row.fecha_fiscal)}
                          </td>
                        )}
                        {isCol('fecha_emision') && (
                          <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-500">
                            {formatShortDate(row.fecha_emision)}
                          </td>
                        )}
                        {isCol('serie_folio') && (
                          <td className="px-3.5 py-2.5 whitespace-nowrap font-medium text-slate-800">
                            {row.cfdi.serie}-{row.cfdi.folio}
                          </td>
                        )}
                        {isCol('rfc') && (
                          <td className="px-3.5 py-2.5 whitespace-nowrap font-mono-code text-slate-700">
                            {rfc}
                          </td>
                        )}
                        {isCol('metodo') && (
                          <td className="px-3.5 py-2.5 whitespace-nowrap">
                            <StatusBadge variant={row.cfdi.metodo_pago === 'PPD' ? 'info' : 'neutral'}>
                              {row.cfdi.metodo_pago}{' '}
                              {row.proporcion < 1 ? `(${Math.round(row.proporcion * 100)}%)` : ''}
                            </StatusBadge>
                          </td>
                        )}
                        {isCol('base') && (
                          <td className="px-3.5 py-2.5 whitespace-nowrap text-right text-slate-700">
                            <Money value={row.base} />
                          </td>
                        )}
                        {isCol('iva') && (
                          <td className="px-3.5 py-2.5 whitespace-nowrap text-right font-semibold text-slate-900">
                            <Money value={row.iva} />
                          </td>
                        )}
                        <td className="px-3.5 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => openCfdiDetail(row.uuid)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-700 cursor-pointer"
                            title="Ver detalle del CFDI"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal motivo de exclusión */}
        {pendingToggleRow && (
          <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]">
            <div className="animate-modal-pop w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-base font-bold text-slate-900">Excluir CFDI del cálculo IVA</h2>
                <button
                  type="button"
                  onClick={() => setPendingToggleRow(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <form onSubmit={confirmExclude} className="mt-4 space-y-3 text-xs">
                <p className="text-slate-600">
                  Indica el motivo contable para excluir el comprobante{' '}
                  <strong className="font-mono-code">{shortUuid(pendingToggleRow.uuid)}</strong> del
                  periodo <strong>{periodo}</strong>.
                </p>
                <textarea
                  required
                  rows={3}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej. Gasto no estrictamente indispensable / pendiente de nota de crédito..."
                  className="w-full rounded-xl border border-slate-200 p-3 focus:border-blue-500 focus:outline-none"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingToggleRow(null)}
                    className="rounded-xl border border-slate-200 px-4 py-2 font-medium text-slate-700 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={motivo.trim().length < 4}
                    className="rounded-xl bg-rose-600 px-4 py-2 font-semibold text-white hover:bg-rose-700 disabled:opacity-40 cursor-pointer"
                  >
                    Guardar exclusión
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
