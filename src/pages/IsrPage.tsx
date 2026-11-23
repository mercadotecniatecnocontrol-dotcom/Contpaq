import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Download, Eye, FileSpreadsheet, Search, ShieldAlert, X } from 'lucide-react';
import { useFiscal } from '../context/FiscalContext';
import {
  getCedulaIsrPeriodo,
  getIsrPeriodo,
  getResumenMensual,
  type IsrDetalleRow,
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
import { StatusBadge } from '../components/shared/StatusBadge';
import { ColumnConfigMenu, type ColumnOption } from '../components/shared/ColumnConfigMenu';

const ISR_COLUMNS: ColumnOption[] = [
  { key: 'incluir', label: 'Incluir', locked: true },
  { key: 'uuid', label: 'UUID', locked: true },
  { key: 'fecha_fiscal', label: 'Fecha fiscal' },
  { key: 'serie_folio', label: 'Serie / Folio' },
  { key: 'contraparte', label: 'Contraparte / RFC' },
  { key: 'uso_cfdi', label: 'Uso CFDI' },
  { key: 'metodo', label: 'Método' },
  { key: 'monto', label: 'Monto base MXN' },
];

const DEFAULT_ISR_COLS = ISR_COLUMNS.map((c) => c.key);

export const IsrPage: React.FC = () => {
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
  const [tab, setTab] = useState<'ingresos' | 'deducciones'>('ingresos');
  const [estadoFiltro, setEstadoFiltro] = useState<'todos' | 'activos' | 'inactivos'>('todos');
  const [search, setSearch] = useState('');
  const [visibleCols, setVisibleCols] = useState<string[]>(DEFAULT_ISR_COLS);
  const [pendingRow, setPendingRow] = useState<IsrDetalleRow | null>(null);
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

  const isrPeriodo = useMemo(
    () => getIsrPeriodo(db, activeEmpresa.id, periodo),
    [db, activeEmpresa.id, periodo],
  );

  const cedulaIsr = useMemo(
    () => getCedulaIsrPeriodo(db, activeEmpresa.id, periodo),
    [db, activeEmpresa.id, periodo],
  );

  const [openAcc, setOpenAcc] = useState<Record<string, boolean>>({
    ingresos: true,
    deducciones: true,
    retenciones: true,
  });

  const toggleAcc = (key: string) =>
    setOpenAcc((prev) => ({ ...prev, [key]: !prev[key] }));

  const acumulado = useMemo(() => {
    const mensual = getResumenMensual(db, activeEmpresa.id, selectedYear);
    const idx = mesesAnio.findIndex((m) => m.key === periodo);
    const slice = mensual.slice(0, idx >= 0 ? idx + 1 : 12);
    return {
      ingresos: slice.reduce((s, r) => s + r.isrIngresosCobrados, 0),
      deducciones: slice.reduce((s, r) => s + r.isrDeducciones, 0),
    };
  }, [db, activeEmpresa.id, selectedYear, mesesAnio, periodo]);

  const rows = tab === 'ingresos' ? isrPeriodo.ingresosRows : isrPeriodo.deduccionesRows;

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (estadoFiltro === 'activos' && !r.activo) return false;
      if (estadoFiltro === 'inactivos' && r.activo) return false;
      if (!q) return true;
      const cp = tab === 'ingresos' ? r.cfdi.nombre_receptor : r.cfdi.nombre_emisor;
      const rfc = tab === 'ingresos' ? r.cfdi.rfc_receptor : r.cfdi.rfc_emisor;
      return (
        r.uuid.toLowerCase().includes(q) ||
        cp.toLowerCase().includes(q) ||
        rfc.toLowerCase().includes(q)
      );
    });
  }, [rows, estadoFiltro, search, tab]);

  const handleToggle = (row: IsrDetalleRow) => {
    if (isReadOnly) return;
    if (row.activo) {
      setPendingRow(row);
      setMotivo('');
    } else {
      setImpuestoAjuste({
        uuid: row.uuid,
        impuesto: 'isr',
        periodo,
        incluido: true,
        motivo: 'Incluido manualmente por Contabilidad en cálculo ISR',
      });
    }
  };

  const confirmExclude = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingRow || motivo.trim().length < 4) return;
    setImpuestoAjuste({
      uuid: pendingRow.uuid,
      impuesto: 'isr',
      periodo,
      incluido: false,
      motivo: motivo.trim(),
    });
    setPendingRow(null);
    setMotivo('');
  };

  const handleExportCedula = () => {
    exportToExcel(
      [
        {
          Sección: '1. Determinación de ingresos nominales',
          Concepto: 'Total de ingresos del periodo',
          Meses_Anteriores: cedulaIsr.ingresosNominales.ingresosBrutos.anterior,
          Periodo: cedulaIsr.ingresosNominales.ingresosBrutos.periodo,
          Acumulado: cedulaIsr.ingresosNominales.ingresosBrutos.acumulado,
        },
        {
          Sección: '1. Determinación de ingresos nominales',
          Concepto: '(-) Disminución de ingresos del periodo',
          Meses_Anteriores: cedulaIsr.ingresosNominales.disminucionIngresos.anterior,
          Periodo: cedulaIsr.ingresosNominales.disminucionIngresos.periodo,
          Acumulado: cedulaIsr.ingresosNominales.disminucionIngresos.acumulado,
        },
        {
          Sección: '1. Determinación de ingresos nominales',
          Concepto: '(=) Ingresos nominales del periodo',
          Meses_Anteriores: cedulaIsr.ingresosNominales.ingresosNetos.anterior,
          Periodo: cedulaIsr.ingresosNominales.ingresosNetos.periodo,
          Acumulado: cedulaIsr.ingresosNominales.ingresosNetos.acumulado,
        },
        {
          Sección: '2. Determinación de deducciones autorizadas',
          Concepto: 'Gastos',
          Meses_Anteriores: cedulaIsr.deduccionesAutorizadas.gastos.anterior,
          Periodo: cedulaIsr.deduccionesAutorizadas.gastos.periodo,
          Acumulado: cedulaIsr.deduccionesAutorizadas.gastos.acumulado,
        },
        {
          Sección: '2. Determinación de deducciones autorizadas',
          Concepto: '(-) Devoluciones, descuentos o bonificaciones',
          Meses_Anteriores: cedulaIsr.deduccionesAutorizadas.devolucionesDescuentos.anterior,
          Periodo: cedulaIsr.deduccionesAutorizadas.devolucionesDescuentos.periodo,
          Acumulado: cedulaIsr.deduccionesAutorizadas.devolucionesDescuentos.acumulado,
        },
        {
          Sección: '2. Determinación de deducciones autorizadas',
          Concepto: '(+) Deducción por sueldos y salarios (Nómina)',
          Meses_Anteriores: cedulaIsr.deduccionesAutorizadas.sueldosSalarios.anterior,
          Periodo: cedulaIsr.deduccionesAutorizadas.sueldosSalarios.periodo,
          Acumulado: cedulaIsr.deduccionesAutorizadas.sueldosSalarios.acumulado,
        },
        {
          Sección: '2. Determinación de deducciones autorizadas',
          Concepto: '(=) Total de deducciones autorizadas del periodo',
          Meses_Anteriores: cedulaIsr.deduccionesAutorizadas.totalDeducciones.anterior,
          Periodo: cedulaIsr.deduccionesAutorizadas.totalDeducciones.periodo,
          Acumulado: cedulaIsr.deduccionesAutorizadas.totalDeducciones.acumulado,
        },
        {
          Sección: '3. Retenciones de ISR por enterar',
          Concepto: 'Retenciones por sueldos y salarios',
          Meses_Anteriores: 0,
          Periodo: cedulaIsr.retencionesPorEnterar.sueldosSalarios,
          Acumulado: cedulaIsr.retencionesPorEnterar.sueldosSalarios,
        },
        {
          Sección: '3. Retenciones de ISR por enterar',
          Concepto: '(+) Retenciones por servicios profesionales',
          Meses_Anteriores: 0,
          Periodo: cedulaIsr.retencionesPorEnterar.serviciosProfesionales,
          Acumulado: cedulaIsr.retencionesPorEnterar.serviciosProfesionales,
        },
        {
          Sección: '3. Retenciones de ISR por enterar',
          Concepto: '(+) Retenciones por RESICO',
          Meses_Anteriores: 0,
          Periodo: cedulaIsr.retencionesPorEnterar.resico,
          Acumulado: cedulaIsr.retencionesPorEnterar.resico,
        },
        {
          Sección: '3. Retenciones de ISR por enterar',
          Concepto: '(=) Total de retenciones de ISR por enterar',
          Meses_Anteriores: 0,
          Periodo: cedulaIsr.retencionesPorEnterar.totalRetenciones,
          Acumulado: cedulaIsr.retencionesPorEnterar.totalRetenciones,
        },
      ],
      `Cedula_ISR_${periodo}_${activeEmpresa.rfc}`,
      'Cedula_ISR',
    );
  };

  const handleExport = () => {
    exportToExcel(
      filteredRows.map((r) => ({
        Estado: r.activo ? 'Activo' : 'Excluido',
        UUID: r.uuid,
        'Fecha fiscal': r.fecha_fiscal,
        Folio: `${r.cfdi.serie}-${r.cfdi.folio}`,
        RFC: tab === 'ingresos' ? r.cfdi.rfc_receptor : r.cfdi.rfc_emisor,
        Contraparte: tab === 'ingresos' ? r.cfdi.nombre_receptor : r.cfdi.nombre_emisor,
        'Uso CFDI': r.cfdi.uso_cfdi,
        Método: r.cfdi.metodo_pago,
        'Monto MXN': r.monto,
        Observación: r.motivo_exclusion || '',
      })),
      `ISR_${tab}_${periodo}_${activeEmpresa.rfc}`,
      `ISR_${tab}`,
    );
  };

  const isCol = (k: string) => visibleCols.includes(k);

  return (
    <RoleGuard allowedRoles={['propietario', 'contador', 'consulta']} sectionName="Impuestos ISR">
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Impuestos — ISR</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Ingresos efectivamente cobrados (PUE + REP) y deducciones autorizadas del periodo y
              acumulado.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              name="isr-ejercicio"
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
              name="isr-periodo"
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

        {/* 4 Tarjetas Ingresos Nominales, Ingresos Cobrados, Deducciones y Retenciones */}
        <div className="stagger-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="card-interactive rounded-2xl border border-slate-200 bg-white p-5">
            <span className="text-xs font-semibold text-slate-500">
              Ingresos nominales (periodo)
            </span>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              <Money value={cedulaIsr.ingresosNominales.ingresosNetos.periodo} animate />
            </p>
            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500">
              <span>Acumulado {selectedYear}</span>
              <span className="font-semibold text-slate-800">
                <Money value={cedulaIsr.ingresosNominales.ingresosNetos.acumulado} animate />
              </span>
            </div>
          </div>

          <div className="card-interactive rounded-2xl border border-slate-200 bg-white p-5">
            <span className="text-xs font-semibold text-slate-500">
              Ingresos cobrados en flujo
            </span>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              <Money value={isrPeriodo.totalIngresos} animate />
            </p>
            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500">
              <span>Acumulado {selectedYear}</span>
              <span className="font-semibold text-slate-800">
                <Money value={acumulado.ingresos} animate />
              </span>
            </div>
          </div>

          <div className="card-interactive rounded-2xl border border-slate-200 bg-white p-5">
            <span className="text-xs font-semibold text-slate-500">
              Deducciones autorizadas (con nómina)
            </span>
            <p className="mt-2 text-2xl font-bold text-emerald-700">
              <Money value={cedulaIsr.deduccionesAutorizadas.totalDeducciones.periodo} animate />
            </p>
            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500">
              <span>Acumuladas {selectedYear}</span>
              <span className="font-semibold text-slate-800">
                <Money value={cedulaIsr.deduccionesAutorizadas.totalDeducciones.acumulado} animate />
              </span>
            </div>
          </div>

          <div className="card-interactive rounded-2xl border border-blue-200 bg-blue-50/60 p-5">
            <span className="text-xs font-semibold text-blue-800">
              Retenciones de ISR por enterar
            </span>
            <p className="mt-2 text-2xl font-bold text-blue-950">
              <Money value={cedulaIsr.retencionesPorEnterar.totalRetenciones} animate />
            </p>
            <div className="mt-2 flex items-center justify-between border-t border-blue-100 pt-2 text-xs text-blue-700">
              <span>Base utilidad est.</span>
              <span className="font-bold">
                <Money value={isrPeriodo.baseEstimada} animate />
              </span>
            </div>
          </div>
        </div>

        {/* Cédula Desplegable de Determinación de ISR (3 Acordeones Oficiales) */}
        <div className="space-y-3">
          {/* Acordeón 1: Determinación de ingresos nominales */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => toggleAcc('ingresos')}
              className="flex w-full items-center justify-between bg-slate-50/80 px-5 py-3.5 text-left hover:bg-slate-100/70 cursor-pointer"
            >
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Determinación de ingresos nominales
                </h2>
                <p className="text-[11px] text-slate-500">
                  Acumulación mensual de ingresos facturados menos disminuciones y notas de crédito
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-slate-900">
                  <Money value={cedulaIsr.ingresosNominales.ingresosNetos.periodo} />
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-slate-500 transition-transform ${
                    openAcc.ingresos ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </button>
            {openAcc.ingresos && (
              <div className="overflow-x-auto px-5 py-3">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 font-semibold">Concepto</th>
                      <th className="py-2 text-right font-semibold">Meses anteriores</th>
                      <th className="py-2 text-right font-semibold">Periodo ({periodo})</th>
                      <th className="py-2 text-right font-semibold">Acumulado {selectedYear}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="py-2.5 text-slate-700">Total de ingresos del periodo</td>
                      <td className="py-2.5 text-right font-medium text-slate-700">
                        <Money value={cedulaIsr.ingresosNominales.ingresosBrutos.anterior} />
                      </td>
                      <td className="py-2.5 text-right font-semibold text-slate-900">
                        <Money value={cedulaIsr.ingresosNominales.ingresosBrutos.periodo} />
                      </td>
                      <td className="py-2.5 text-right font-semibold text-slate-900">
                        <Money value={cedulaIsr.ingresosNominales.ingresosBrutos.acumulado} />
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 text-amber-800">
                        (-) Disminución de ingresos del periodo
                      </td>
                      <td className="py-2.5 text-right font-medium text-amber-800">
                        <Money value={cedulaIsr.ingresosNominales.disminucionIngresos.anterior} />
                      </td>
                      <td className="py-2.5 text-right font-semibold text-amber-800">
                        <Money value={cedulaIsr.ingresosNominales.disminucionIngresos.periodo} />
                      </td>
                      <td className="py-2.5 text-right font-semibold text-amber-800">
                        <Money value={cedulaIsr.ingresosNominales.disminucionIngresos.acumulado} />
                      </td>
                    </tr>
                    <tr className="bg-blue-50/70 font-bold text-blue-950">
                      <td className="rounded-l-lg px-2 py-2.5">
                        (=) Ingresos nominales del periodo
                      </td>
                      <td className="py-2.5 text-right">
                        <Money value={cedulaIsr.ingresosNominales.ingresosNetos.anterior} />
                      </td>
                      <td className="py-2.5 text-right">
                        <Money value={cedulaIsr.ingresosNominales.ingresosNetos.periodo} />
                      </td>
                      <td className="rounded-r-lg px-2 py-2.5 text-right">
                        <Money value={cedulaIsr.ingresosNominales.ingresosNetos.acumulado} />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Acordeón 2: Determinación de deducciones autorizadas */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => toggleAcc('deducciones')}
              className="flex w-full items-center justify-between bg-slate-50/80 px-5 py-3.5 text-left hover:bg-slate-100/70 cursor-pointer"
            >
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Determinación de deducciones autorizadas
                </h2>
                <p className="text-[11px] text-slate-500">
                  Gastos efectivamente pagados menos devoluciones más deducción por sueldos y salarios
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-emerald-700">
                  <Money value={cedulaIsr.deduccionesAutorizadas.totalDeducciones.periodo} />
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-slate-500 transition-transform ${
                    openAcc.deducciones ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </button>
            {openAcc.deducciones && (
              <div className="overflow-x-auto px-5 py-3">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 font-semibold">Concepto</th>
                      <th className="py-2 text-right font-semibold">Meses anteriores</th>
                      <th className="py-2 text-right font-semibold">Periodo ({periodo})</th>
                      <th className="py-2 text-right font-semibold">Acumulado {selectedYear}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="py-2.5 text-slate-700">Gastos</td>
                      <td className="py-2.5 text-right font-medium text-slate-700">
                        <Money value={cedulaIsr.deduccionesAutorizadas.gastos.anterior} />
                      </td>
                      <td className="py-2.5 text-right font-semibold text-slate-900">
                        <Money value={cedulaIsr.deduccionesAutorizadas.gastos.periodo} />
                      </td>
                      <td className="py-2.5 text-right font-semibold text-slate-900">
                        <Money value={cedulaIsr.deduccionesAutorizadas.gastos.acumulado} />
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 text-amber-800">
                        (-) Devoluciones, descuentos o bonificaciones
                      </td>
                      <td className="py-2.5 text-right font-medium text-amber-800">
                        <Money value={cedulaIsr.deduccionesAutorizadas.devolucionesDescuentos.anterior} />
                      </td>
                      <td className="py-2.5 text-right font-semibold text-amber-800">
                        <Money value={cedulaIsr.deduccionesAutorizadas.devolucionesDescuentos.periodo} />
                      </td>
                      <td className="py-2.5 text-right font-semibold text-amber-800">
                        <Money value={cedulaIsr.deduccionesAutorizadas.devolucionesDescuentos.acumulado} />
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 text-slate-700">
                        (+) Deducción por sueldos y salarios (Nómina timbrada)
                      </td>
                      <td className="py-2.5 text-right font-medium text-slate-700">
                        <Money value={cedulaIsr.deduccionesAutorizadas.sueldosSalarios.anterior} />
                      </td>
                      <td className="py-2.5 text-right font-semibold text-slate-900">
                        <Money value={cedulaIsr.deduccionesAutorizadas.sueldosSalarios.periodo} />
                      </td>
                      <td className="py-2.5 text-right font-semibold text-slate-900">
                        <Money value={cedulaIsr.deduccionesAutorizadas.sueldosSalarios.acumulado} />
                      </td>
                    </tr>
                    <tr className="bg-emerald-50/70 font-bold text-emerald-950">
                      <td className="rounded-l-lg px-2 py-2.5">
                        (=) Total de deducciones autorizadas del periodo
                      </td>
                      <td className="py-2.5 text-right">
                        <Money value={cedulaIsr.deduccionesAutorizadas.totalDeducciones.anterior} />
                      </td>
                      <td className="py-2.5 text-right">
                        <Money value={cedulaIsr.deduccionesAutorizadas.totalDeducciones.periodo} />
                      </td>
                      <td className="rounded-r-lg px-2 py-2.5 text-right">
                        <Money value={cedulaIsr.deduccionesAutorizadas.totalDeducciones.acumulado} />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Acordeón 3: Retenciones de ISR por enterar */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => toggleAcc('retenciones')}
              className="flex w-full items-center justify-between bg-slate-50/80 px-5 py-3.5 text-left hover:bg-slate-100/70 cursor-pointer"
            >
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Retenciones de ISR por enterar
                </h2>
                <p className="text-[11px] text-slate-500">
                  ISR retenido en nómina, honorarios, arrendamiento y proveedores RESICO del periodo
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-blue-900">
                  <Money value={cedulaIsr.retencionesPorEnterar.totalRetenciones} />
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-slate-500 transition-transform ${
                    openAcc.retenciones ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </button>
            {openAcc.retenciones && (
              <div className="divide-y divide-slate-100 px-5 py-3 text-xs">
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-600">Retenciones por sueldos y salarios</span>
                  <span className="font-semibold text-slate-900">
                    <Money value={cedulaIsr.retencionesPorEnterar.sueldosSalarios} />
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-600">(+) Retenciones por asimilados a salarios</span>
                  <span className="font-semibold text-slate-900">
                    <Money value={cedulaIsr.retencionesPorEnterar.asimiladosSalarios} />
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-600">
                    (+) Retenciones por servicios profesionales
                  </span>
                  <span className="font-semibold text-slate-900">
                    <Money value={cedulaIsr.retencionesPorEnterar.serviciosProfesionales} />
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-600">(+) Retenciones por arrendamiento</span>
                  <span className="font-semibold text-slate-900">
                    <Money value={cedulaIsr.retencionesPorEnterar.arrendamiento} />
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-600">(+) Retenciones por RESICO (Régimen 626)</span>
                  <span className="font-semibold text-slate-900">
                    <Money value={cedulaIsr.retencionesPorEnterar.resico} />
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-600">(+) Otras retenciones</span>
                  <span className="font-semibold text-slate-900">
                    <Money value={cedulaIsr.retencionesPorEnterar.otrasRetenciones} />
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-blue-50/70 px-3 py-2.5 font-bold text-blue-950">
                  <span>(=) Total de retenciones de ISR por enterar</span>
                  <span className="text-sm">
                    <Money value={cedulaIsr.retencionesPorEnterar.totalRetenciones} />
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Regla de exclusiones automáticas de deducciones */}
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-2.5 text-xs text-amber-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>
            <strong>Regla automática en deducciones:</strong> se excluyen de forma predeterminada
            los CFDI <strong>cancelados</strong>, los recibidos con uso <strong>S01</strong> y los
            proveedores publicados en <strong>lista 69-B definitivo</strong>.
          </span>
        </div>

        {/* Tabla detalle ISR */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-3.5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setTab('ingresos')}
                  className={`rounded-lg px-3 py-1.5 cursor-pointer ${tab === 'ingresos' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                >
                  Ingresos cobrados ({isrPeriodo.ingresosRows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTab('deducciones')}
                  className={`rounded-lg px-3 py-1.5 cursor-pointer ${tab === 'deducciones' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                >
                  Deducciones ({isrPeriodo.deduccionesRows.length})
                </button>
              </div>

              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium">
                {(['todos', 'activos', 'inactivos'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setEstadoFiltro(f)}
                    className={`rounded-lg px-2.5 py-1 capitalize cursor-pointer ${estadoFiltro === f ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
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
                  name="isr-busqueda"
                  aria-label="Buscar en ISR por UUID, RFC o nombre"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="UUID, RFC o nombre..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-8 text-xs focus:border-blue-500 focus:bg-white focus:outline-none"
                />
              </div>
              <ColumnConfigMenu
                columns={ISR_COLUMNS}
                visibleKeys={visibleCols}
                onChange={setVisibleCols}
                onReset={() => setVisibleCols(DEFAULT_ISR_COLS)}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  {isCol('incluir') && <th className="px-3.5 py-3 font-semibold">Incluir</th>}
                  {isCol('uuid') && <th className="px-3.5 py-3 font-semibold">UUID / Observación</th>}
                  {isCol('fecha_fiscal') && <th className="px-3.5 py-3 font-semibold">Fecha fiscal</th>}
                  {isCol('serie_folio') && <th className="px-3.5 py-3 font-semibold">Folio</th>}
                  {isCol('contraparte') && <th className="px-3.5 py-3 font-semibold">Contraparte</th>}
                  {isCol('uso_cfdi') && <th className="px-3.5 py-3 font-semibold">Uso</th>}
                  {isCol('metodo') && <th className="px-3.5 py-3 font-semibold">Método</th>}
                  {isCol('monto') && <th className="px-3.5 py-3 text-right font-semibold">Monto MXN</th>}
                  <th className="px-3.5 py-3 text-right font-semibold">Detalle</th>
                </tr>
              </thead>
              <tbody className="stagger-rows divide-y divide-slate-100">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                      Sin registros para este periodo y filtro.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const cpName =
                      tab === 'ingresos' ? row.cfdi.nombre_receptor : row.cfdi.nombre_emisor;
                    const cpRfc = tab === 'ingresos' ? row.cfdi.rfc_receptor : row.cfdi.rfc_emisor;
                    return (
                      <tr
                        key={row.rowId}
                        className={row.activo ? 'hover:bg-slate-50/70' : 'bg-rose-50/30'}
                      >
                        {isCol('incluir') && (
                          <td className="px-3.5 py-2.5">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={row.activo}
                              disabled={isReadOnly}
                              onClick={() => handleToggle(row)}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${row.activo ? 'bg-blue-600' : 'bg-slate-300'
                                } ${isReadOnly ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                            >
                              <span
                                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${row.activo ? 'translate-x-4.5' : 'translate-x-1'
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
                              <p className="mt-0.5 text-[10px] font-medium text-rose-700">
                                {row.motivo_exclusion}
                              </p>
                            )}
                          </td>
                        )}
                        {isCol('fecha_fiscal') && (
                          <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-700">
                            {formatShortDate(row.fecha_fiscal)}
                          </td>
                        )}
                        {isCol('serie_folio') && (
                          <td className="px-3.5 py-2.5 whitespace-nowrap font-medium text-slate-800">
                            {row.cfdi.serie}-{row.cfdi.folio}
                          </td>
                        )}
                        {isCol('contraparte') && (
                          <td className="max-w-[220px] px-3.5 py-2.5">
                            <p className="truncate font-medium text-slate-800">{cpName}</p>
                            <p className="font-mono-code text-[10px] text-slate-500">{cpRfc}</p>
                          </td>
                        )}
                        {isCol('uso_cfdi') && (
                          <td className="px-3.5 py-2.5">
                            <StatusBadge variant={row.cfdi.uso_cfdi === 'S01' ? 'danger' : 'neutral'}>
                              {row.cfdi.uso_cfdi}
                            </StatusBadge>
                          </td>
                        )}
                        {isCol('metodo') && (
                          <td className="px-3.5 py-2.5 text-slate-600">{row.cfdi.metodo_pago}</td>
                        )}
                        {isCol('monto') && (
                          <td className="px-3.5 py-2.5 whitespace-nowrap text-right font-semibold text-slate-900">
                            <Money value={row.monto} />
                          </td>
                        )}
                        <td className="px-3.5 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => openCfdiDetail(row.uuid)}
                            title="Ver detalle del CFDI"
                            aria-label="Ver detalle del CFDI"
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-700 cursor-pointer"
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

        {/* Modal motivo de exclusión ISR */}
        {pendingRow && (
          <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]">
            <div className="animate-modal-pop w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-base font-bold text-slate-900">Excluir CFDI de ISR</h2>
                <button
                  type="button"
                  onClick={() => setPendingRow(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <form onSubmit={confirmExclude} className="mt-4 space-y-3 text-xs">
                <p className="text-slate-600">
                  Registra el motivo de exclusión para{' '}
                  <strong className="font-mono-code">{shortUuid(pendingRow.uuid)}</strong>.
                </p>
                <textarea
                  required
                  rows={3}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej. Comprobante pagado en efectivo > $2,000 (no deducible Art. 27 LISR)..."
                  className="w-full rounded-xl border border-slate-200 p-3 focus:border-blue-500 focus:outline-none"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingRow(null)}
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
