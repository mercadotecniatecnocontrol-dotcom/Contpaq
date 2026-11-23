import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownAZ,
  BarChart3,
  Briefcase,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FolderPlus,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  CampoFiltroIndicador,
  IndicadorResultado,
  OperadorFiltro,
  ReglaFiltroPersonalizado,
} from '../types/fiscal';
import { useFiscal } from '../context/FiscalContext';
import {
  evaluateIndicadores,
  getIndicadoresFinancieros,
} from '../services/fiscalCalculations';
import { parseNaturalLanguageToIndicator } from '../services/assistantEngine';
import {
  formatMoney,
  formatShortDate,
  getAvailableYears,
  getMesesForYear,
  MASKED_AMOUNT,
  shortUuid,
} from '../utils/format';
import { exportToExcel } from '../utils/exportExcel';
import { Money } from '../components/shared/Money';
import { RoleGuard } from '../components/shared/RoleGuard';
import { StatusBadge } from '../components/shared/StatusBadge';

const CAMPOS_CONSTRUCTOR: Array<{ value: CampoFiltroIndicador; label: string }> = [
  { value: 'tipo', label: 'Tipo CFDI (I/E/P/N/T)' },
  { value: 'metodo_pago', label: 'Método de pago (PUE/PPD)' },
  { value: 'forma_pago', label: 'Forma de pago (01, 03, 99...)' },
  { value: 'uso_cfdi', label: 'Uso CFDI (G01, G03, S01...)' },
  { value: 'moneda', label: 'Moneda (MXN/USD/EUR)' },
  { value: 'total_mxn', label: 'Total en MXN' },
  { value: 'estatus_sat', label: 'Estatus SAT (vigente/cancelado/en_cancelacion)' },
  { value: 'rfc_contraparte', label: 'RFC Contraparte' },
];

const OPERADORES: Array<{ value: OperadorFiltro; label: string }> = [
  { value: 'eq', label: 'Igual a (=)' },
  { value: 'neq', label: 'Diferente de (≠)' },
  { value: 'gt', label: 'Mayor que (>)' },
  { value: 'gte', label: 'Mayor o igual (≥)' },
  { value: 'lt', label: 'Menor que (<)' },
  { value: 'contains', label: 'Contiene' },
];

export const IndicadoresPage: React.FC = () => {
  const {
    db,
    activeEmpresa,
    currentUser,
    ocultarMontos,
    addCustomIndicator,
    deleteCustomIndicator,
    addIndicatorGroup,
    openCfdiDetail,
    showToast,
  } = useFiscal();

  const [selectedYear, setSelectedYear] = useState('2026');
  const [periodo, setPeriodo] = useState('2026-10');
  const [criterioFinanciero, setCriterioFinanciero] = useState<'flujo' | 'facturado'>('flujo');
  const [monedaVista, setMonedaVista] = useState('MXN');
  const [chartUnit, setChartUnit] = useState<'monto' | 'porcentaje'>('monto');
  const [cxcScope, setCxcScope] = useState<'todos' | 'mes'>('todos');
  const [cxpScope, setCxpScope] = useState<'todos' | 'mes'>('todos');
  const availableYears = useMemo(
    () =>
      getAvailableYears(
        db.cfdis.filter((c) => c.empresa_id === activeEmpresa.id && !c.solo_en_sat),
      ),
    [db.cfdis, activeEmpresa.id],
  );
  const mesesAnio = useMemo(() => getMesesForYear(selectedYear), [selectedYear]);

  useEffect(() => {
    if (!availableYears.includes(selectedYear)) {
      const y = availableYears[0];
      setSelectedYear(y);
      setPeriodo(`${y}-${periodo.slice(5, 7)}`);
    }
  }, [availableYears, selectedYear, periodo]);
  const [search, setSearch] = useState('');
  const [soloIncidencias, setSoloIncidencias] = useState(false);
  const [grupoFiltro, setGrupoFiltro] = useState('ALL');
  const [sortBy, setSortBy] = useState<'incidencias' | 'az'>('incidencias');
  const [detailResult, setDetailResult] = useState<IndicadorResultado | null>(null);

  // Modales constructor y grupos
  const [builderOpen, setBuilderOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [grupo, setGrupo] = useState(db.grupos_indicadores[0] || 'Integridad CFDI');
  const [aplicaEmitidos, setAplicaEmitidos] = useState(true);
  const [aplicaRecibidos, setAplicaRecibidos] = useState(true);
  const [creadoConIa, setCreadoConIa] = useState(false);
  const [filtros, setFiltros] = useState<ReglaFiltroPersonalizado[]>([
    { campo: 'moneda', operador: 'eq', valor: 'USD' },
  ]);
  const [newGroupName, setNewGroupName] = useState('');
  const [groupModalOpen, setGroupModalOpen] = useState(false);

  const isReadOnly = currentUser.rol === 'consulta';

  const resultados = useMemo(
    () => evaluateIndicadores(db, activeEmpresa, periodo),
    [db, activeEmpresa, periodo],
  );

  const finData = useMemo(
    () => getIndicadoresFinancieros(db, activeEmpresa.id, periodo, criterioFinanciero),
    [db, activeEmpresa.id, periodo, criterioFinanciero],
  );

  const renderPctBadge = (pct: number) => {
    const isPos = pct >= 0;
    return (
      <span
        className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
          isPos ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
        }`}
      >
        {isPos ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {isPos ? `+${pct}%` : `${pct}%`}
      </span>
    );
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return resultados
      .filter((r) => {
        if (soloIncidencias && r.conteo_ejercicio === 0 && r.conteo_periodo === 0) return false;
        if (grupoFiltro !== 'ALL' && r.indicador.grupo !== grupoFiltro) return false;
        if (!q) return true;
        return (
          r.indicador.nombre.toLowerCase().includes(q) ||
          r.indicador.descripcion.toLowerCase().includes(q) ||
          r.indicador.grupo.toLowerCase().includes(q)
        );
      })
      .sort((a, b) =>
        sortBy === 'az'
          ? a.indicador.nombre.localeCompare(b.indicador.nombre)
          : b.conteo_ejercicio - a.conteo_ejercicio || a.indicador.nombre.localeCompare(b.indicador.nombre),
      );
  }, [resultados, soloIncidencias, grupoFiltro, search, sortBy]);

  const totalConIncidencias = resultados.filter((r) => r.conteo_ejercicio > 0).length;

  const handleApplyAiPrompt = () => {
    if (!aiPrompt.trim()) return;
    const suggestion = parseNaturalLanguageToIndicator(aiPrompt);
    setNombre(suggestion.nombre);
    setDescripcion(suggestion.descripcion);
    setGrupo(suggestion.grupo);
    setAplicaEmitidos(suggestion.aplica_emitidos);
    setAplicaRecibidos(suggestion.aplica_recibidos);
    setFiltros(suggestion.filtros);
    setCreadoConIa(true);
    showToast('Filtro sugerido por Asistente Tecno listo para revisión');
  };

  const handleSaveIndicator = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim() || filtros.length === 0) return;
    addCustomIndicator({
      codigo: `CUST_${Date.now().toString().slice(-5)}`,
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || 'Indicador personalizado de consistencia CFDI.',
      grupo,
      aplica_emitidos: aplicaEmitidos,
      aplica_recibidos: aplicaRecibidos,
      severidad: 'media',
      filtros,
      creado_con_ia: creadoConIa,
    });
    setBuilderOpen(false);
    setAiPrompt('');
    setNombre('');
    setDescripcion('');
    setCreadoConIa(false);
  };

  const handleExportSummary = () => {
    exportToExcel(
      filtered.map((r) => ({
        Indicador: r.indicador.nombre,
        Tipo: r.indicador.es_predefinido ? 'Predefinido SAT' : 'Personalizado',
        Grupo: r.indicador.grupo,
        Emitidos: r.indicador.aplica_emitidos ? 'Sí' : 'No',
        Recibidos: r.indicador.aplica_recibidos ? 'Sí' : 'No',
        [`Periodo (${periodo})`]: r.conteo_periodo,
        [`Ejercicio ${selectedYear}`]: r.conteo_ejercicio,
        Regla: r.indicador.descripcion,
      })),
      `Indicadores_Fiscales_${activeEmpresa.rfc}`,
      'Indicadores',
    );
  };

  const detailCfdis = useMemo(() => {
    if (!detailResult) return [];
    const set = new Set(detailResult.uuids_ejercicio);
    return db.cfdis.filter((c) => set.has(c.uuid));
  }, [detailResult, db.cfdis]);

  return (
    <RoleGuard
      allowedRoles={['propietario', 'contador', 'consulta']}
      sectionName="Indicadores fiscales"
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Indicadores de consistencia y riesgo
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              13 reglas fiscales SAT (69-B, REP, PUE/PPD, sustituciones) + reglas personalizadas.
              Revalidación diaria automática.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => showToast('Indicadores revalidados sobre el repositorio actual')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Revalidar
            </button>
            <button
              type="button"
              onClick={handleExportSummary}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar Excel
            </button>
            {!isReadOnly && (
              <>
                <button
                  type="button"
                  onClick={() => setGroupModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  Grupo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreadoConIa(false);
                    setBuilderOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Nuevo / Crear con IA
                </button>
              </>
            )}
          </div>
        </div>

        {/* TABLERO FINANCIERO Y COMERCIAL (Ventas, Compras, Nómina, Top 5 y Antigüedad de Saldos) */}
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Indicadores financieros y comerciales ({periodo})
              </h2>
              <p className="text-xs text-slate-500">
                Comparativa mensual, Top 5 clientes y proveedores, y antigüedad de cuentas por cobrar / pagar.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select
                name="ind-fin-ejercicio"
                aria-label="Ejercicio financiero"
                value={selectedYear}
                onChange={(e) => {
                  const y = e.target.value;
                  setSelectedYear(y);
                  setPeriodo(`${y}-${periodo.slice(5, 7)}`);
                }}
                className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-semibold text-slate-800"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>

              <select
                name="ind-fin-periodo"
                aria-label="Mes financiero"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-semibold text-slate-800"
              >
                {mesesAnio.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.largo}
                  </option>
                ))}
              </select>

              <select
                name="ind-moneda-vista"
                aria-label="Moneda de visualización"
                value={monedaVista}
                onChange={(e) => setMonedaVista(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-700"
              >
                <option value="MXN">MXN - Peso Mexicano</option>
                <option value="USD">USD - Dólar Americano</option>
              </select>

              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 font-semibold">
                <button
                  type="button"
                  onClick={() => setCriterioFinanciero('flujo')}
                  className={`rounded-lg px-3 py-1.5 cursor-pointer ${
                    criterioFinanciero === 'flujo'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  Cobrado / Pagado
                </button>
                <button
                  type="button"
                  onClick={() => setCriterioFinanciero('facturado')}
                  className={`rounded-lg px-3 py-1.5 cursor-pointer ${
                    criterioFinanciero === 'facturado'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  Facturado
                </button>
              </div>
            </div>
          </div>

          {/* 3 KPIs financieros del mes con % respecto al mes anterior */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* 1. Ventas netas */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">Ventas netas</span>
                {renderPctBadge(finData.ventas.ventasNetasPct)}
              </div>
              <p className="mt-1.5 text-2xl font-bold text-slate-900">
                <Money value={finData.ventas.ventasNetas} animate />
              </p>
              <p className="text-[11px] text-slate-400">Respecto al mes anterior</p>
              <div className="mt-3 space-y-1.5 border-t border-slate-200/80 pt-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Ventas</span>
                  <span className="font-semibold text-slate-800">
                    <Money value={finData.ventas.ventasBrutas} />{' '}
                    <span className="text-[10px] text-slate-500">
                      ({finData.ventas.ventasBrutasPct >= 0 ? '+' : ''}
                      {finData.ventas.ventasBrutasPct}%)
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Descuentos y devoluciones sobre ventas</span>
                  <span className="font-semibold text-amber-800">
                    <Money value={finData.ventas.descuentos} />{' '}
                    <span className="text-[10px] text-slate-500">
                      ({finData.ventas.descuentosPct >= 0 ? '+' : ''}
                      {finData.ventas.descuentosPct}%)
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Compras netas */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">Compras netas</span>
                {renderPctBadge(finData.compras.comprasNetasPct)}
              </div>
              <p className="mt-1.5 text-2xl font-bold text-slate-900">
                <Money value={finData.compras.comprasNetas} animate />
              </p>
              <p className="text-[11px] text-slate-400">Respecto al mes anterior</p>
              <div className="mt-3 space-y-1.5 border-t border-slate-200/80 pt-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Compras</span>
                  <span className="font-semibold text-slate-800">
                    <Money value={finData.compras.comprasBrutas} />{' '}
                    <span className="text-[10px] text-slate-500">
                      ({finData.compras.comprasBrutasPct >= 0 ? '+' : ''}
                      {finData.compras.comprasBrutasPct}%)
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Descuentos y devoluciones sobre compras</span>
                  <span className="font-semibold text-amber-800">
                    <Money value={finData.compras.descuentos} />{' '}
                    <span className="text-[10px] text-slate-500">
                      ({finData.compras.descuentosPct >= 0 ? '+' : ''}
                      {finData.compras.descuentosPct}%)
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {/* 3. Sueldos y salarios */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <Briefcase className="h-3.5 w-3.5 text-indigo-600" />
                  Sueldos y salarios
                </span>
                {renderPctBadge(finData.nomina.sueldosNetosPct)}
              </div>
              <p className="mt-1.5 text-2xl font-bold text-slate-900">
                <Money value={finData.nomina.sueldosNetos} animate />
              </p>
              <p className="text-[11px] text-slate-400">Respecto al mes anterior</p>
              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-slate-200/80 pt-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Empleados:</span>
                  <span className="font-bold text-slate-900">{finData.nomina.empleados}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Percepciones:</span>
                  <span className="font-semibold text-emerald-700">
                    <Money value={finData.nomina.percepciones} />
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Deducciones:</span>
                  <span className="font-semibold text-rose-700">
                    <Money value={finData.nomina.deducciones} />
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Otros pagos:</span>
                  <span className="font-semibold text-slate-800">
                    <Money value={finData.nomina.otrosPagos} />
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Gráfica anual Ventas y compras netas con toggle Porcentaje (%) / Monto ($) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Ventas y compras netas ({selectedYear})
                </h3>
              </div>
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setChartUnit('porcentaje')}
                  className={`rounded-lg px-2.5 py-1 cursor-pointer ${
                    chartUnit === 'porcentaje'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  Porcentaje (%)
                </button>
                <button
                  type="button"
                  onClick={() => setChartUnit('monto')}
                  className={`rounded-lg px-2.5 py-1 cursor-pointer ${
                    chartUnit === 'monto'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  Monto ($)
                </button>
              </div>
            </div>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={finData.serieAnual}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="mesCorto" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    width={58}
                    tickFormatter={(v) =>
                      chartUnit === 'porcentaje'
                        ? `${v}%`
                        : ocultarMontos
                          ? '•••'
                          : `$${Math.round(Number(v) / 1000)}k`
                    }
                  />
                  <Tooltip
                    formatter={(val: number, name: string) => [
                      chartUnit === 'porcentaje'
                        ? `${val}%`
                        : ocultarMontos
                          ? MASKED_AMOUNT
                          : formatMoney(val),
                      name,
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar
                    dataKey={chartUnit === 'porcentaje' ? 'ventasPct' : 'ventasNetas'}
                    name="Ventas netas"
                    fill="#0e4b85"
                    radius={[5, 5, 0, 0]}
                  />
                  <Bar
                    dataKey={chartUnit === 'porcentaje' ? 'comprasPct' : 'comprasNetas'}
                    name="Compras netas"
                    fill="#38bdf8"
                    radius={[5, 5, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tablas Top 5 Clientes y Top 5 Proveedores */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {/* Top 5 Clientes */}
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
                <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
                  <Users className="h-3.5 w-3.5 text-blue-600" />
                  Top 5 clientes
                </h3>
                <span className="text-[11px] font-medium text-slate-500">Acumulado {selectedYear}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-white text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-semibold">#</th>
                      <th className="px-3 py-2 font-semibold">Cliente / RFC</th>
                      <th className="px-3 py-2 text-right font-semibold">Total cobrado</th>
                      <th className="px-3 py-2 text-right font-semibold">Pendiente por cobrar</th>
                      <th className="px-3 py-2 text-right font-semibold">Total facturado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {finData.topClientes.map((c) => (
                      <tr key={c.rfc} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2 font-bold text-slate-500">{c.rank}</td>
                        <td className="max-w-[165px] px-3 py-2">
                          <p className="truncate font-semibold text-slate-900">{c.nombre}</p>
                          <p className="font-mono-code text-[10px] text-slate-500">{c.rfc}</p>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                          <Money value={c.flujoMonto} />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-amber-700">
                          <Money value={c.pendienteMonto} />
                        </td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-900">
                          <Money value={c.totalFacturado} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top 5 Proveedores */}
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
                <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
                  <Users className="h-3.5 w-3.5 text-amber-600" />
                  Top 5 proveedores
                </h3>
                <span className="text-[11px] font-medium text-slate-500">Acumulado {selectedYear}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-white text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-semibold">#</th>
                      <th className="px-3 py-2 font-semibold">Proveedor / RFC</th>
                      <th className="px-3 py-2 text-right font-semibold">Total pagado</th>
                      <th className="px-3 py-2 text-right font-semibold">Pendiente por pagar</th>
                      <th className="px-3 py-2 text-right font-semibold">Total facturado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {finData.topProveedores.map((p) => (
                      <tr key={p.rfc} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2 font-bold text-slate-500">{p.rank}</td>
                        <td className="max-w-[165px] px-3 py-2">
                          <p className="truncate font-semibold text-slate-900">{p.nombre}</p>
                          <p className="font-mono-code text-[10px] text-slate-500">{p.rfc}</p>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                          <Money value={p.flujoMonto} />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-amber-700">
                          <Money value={p.pendienteMonto} />
                        </td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-900">
                          <Money value={p.totalFacturado} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Antigüedad de Saldos: Cuentas por Cobrar y Cuentas por Pagar */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {/* Cuentas por cobrar */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Clock className="h-3.5 w-3.5 text-blue-600" />
                    Cuentas por cobrar (PPD pendientes)
                  </span>
                  <p className="mt-1 text-xl font-bold text-blue-950">
                    <Money
                      value={
                        cxcScope === 'todos'
                          ? finData.cuentasPorCobrar.todos.total
                          : finData.cuentasPorCobrar.mes.total
                      }
                      animate
                    />
                  </p>
                </div>
                <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setCxcScope('todos')}
                    className={`rounded-lg px-2.5 py-1 cursor-pointer ${
                      cxcScope === 'todos' ? 'bg-blue-600 text-white' : 'text-slate-600'
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setCxcScope('mes')}
                    className={`rounded-lg px-2.5 py-1 cursor-pointer ${
                      cxcScope === 'mes' ? 'bg-blue-600 text-white' : 'text-slate-600'
                    }`}
                  >
                    Del mes
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                {(
                  [
                    ['30 días o menos', 'hasta30'],
                    ['31 a 60 días', 'de31a60'],
                    ['61 a 90 días', 'de61a90'],
                    ['Más de 90 días', 'masDe90'],
                  ] as const
                ).map(([lbl, key]) => {
                  const val =
                    cxcScope === 'todos'
                      ? finData.cuentasPorCobrar.todos[key]
                      : finData.cuentasPorCobrar.mes[key];
                  return (
                    <div key={key} className="rounded-xl border border-slate-200 bg-white p-2.5">
                      <span className="text-[10px] font-medium text-slate-500">{lbl}</span>
                      <p className="mt-1 font-bold text-slate-900">
                        <Money value={val} />
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Cuentas por pagar */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Clock className="h-3.5 w-3.5 text-amber-600" />
                    Cuentas por pagar (PPD pendientes)
                  </span>
                  <p className="mt-1 text-xl font-bold text-amber-950">
                    <Money
                      value={
                        cxpScope === 'todos'
                          ? finData.cuentasPorPagar.todos.total
                          : finData.cuentasPorPagar.mes.total
                      }
                      animate
                    />
                  </p>
                </div>
                <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setCxpScope('todos')}
                    className={`rounded-lg px-2.5 py-1 cursor-pointer ${
                      cxpScope === 'todos' ? 'bg-blue-600 text-white' : 'text-slate-600'
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setCxpScope('mes')}
                    className={`rounded-lg px-2.5 py-1 cursor-pointer ${
                      cxpScope === 'mes' ? 'bg-blue-600 text-white' : 'text-slate-600'
                    }`}
                  >
                    Del mes
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                {(
                  [
                    ['30 días o menos', 'hasta30'],
                    ['31 a 60 días', 'de31a60'],
                    ['61 a 90 días', 'de61a90'],
                    ['Más de 90 días', 'masDe90'],
                  ] as const
                ).map(([lbl, key]) => {
                  const val =
                    cxpScope === 'todos'
                      ? finData.cuentasPorPagar.todos[key]
                      : finData.cuentasPorPagar.mes[key];
                  return (
                    <div key={key} className="rounded-xl border border-slate-200 bg-white p-2.5">
                      <span className="text-[10px] font-medium text-slate-500">{lbl}</span>
                      <p className="mt-1 font-bold text-slate-900">
                        <Money value={val} />
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Barra de controles de las 13 reglas de consistencia SAT */}
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                name="ind-busqueda"
                aria-label="Buscar indicador o regla"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar indicador o regla..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-8 text-xs focus:border-blue-500 focus:bg-white focus:outline-none"
              />
            </div>

            <select
              name="ind-ejercicio"
              aria-label="Ejercicio"
              value={selectedYear}
              onChange={(e) => {
                const y = e.target.value;
                setSelectedYear(y);
                setPeriodo(`${y}-${periodo.slice(5, 7)}`);
              }}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            <select
              name="ind-periodo"
              aria-label="Periodo mensual"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800"
            >
              {mesesAnio.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.largo}
                </option>
              ))}
            </select>

            <select
              name="ind-grupo"
              aria-label="Filtrar por grupo de indicadores"
              value={grupoFiltro}
              onChange={(e) => setGrupoFiltro(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
            >
              <option value="ALL">Todos los grupos</option>
              {db.grupos_indicadores.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setSoloIncidencias((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 font-semibold cursor-pointer ${soloIncidencias
                ? 'border-amber-300 bg-amber-50 text-amber-800'
                : 'border-slate-200 bg-white text-slate-600'
                }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Solo incidencias ({totalConIncidencias})
            </button>

            <button
              type="button"
              onClick={() => setSortBy((s) => (s === 'az' ? 'incidencias' : 'az'))}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <ArrowDownAZ className="h-3.5 w-3.5" />
              {sortBy === 'az' ? 'Orden A–Z' : 'Más incidencias'}
            </button>
          </div>
        </div>

        {/* Lista / cuadrícula de indicadores */}
        <div className="stagger-grid grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((res) => {
            const hasAlert = res.conteo_ejercicio > 0;
            return (
              <div
                key={res.indicador.id}
                onClick={() => setDetailResult(res)}
                className={`card-interactive group flex flex-col justify-between rounded-2xl border bg-white p-4 cursor-pointer ${hasAlert
                  ? 'border-amber-200 hover:border-amber-400'
                  : 'border-slate-200 hover:border-emerald-300'
                  }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <div
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${hasAlert
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-50 text-emerald-600'
                          }`}
                      >
                        {hasAlert ? (
                          <AlertTriangle className="h-4 w-4" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-700">
                          {res.indicador.nombre}
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500">{res.indicador.descripcion}</p>
                      </div>
                    </div>

                    {!res.indicador.es_predefinido && !isReadOnly && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteCustomIndicator(res.indicador.id);
                        }}
                        title="Eliminar indicador personalizado"
                        className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <StatusBadge variant="neutral">{res.indicador.grupo}</StatusBadge>
                    {res.indicador.aplica_emitidos && (
                      <StatusBadge variant="info">Emitidos</StatusBadge>
                    )}
                    {res.indicador.aplica_recibidos && (
                      <StatusBadge variant="neutral">Recibidos</StatusBadge>
                    )}
                    {res.indicador.creado_con_ia && (
                      <StatusBadge variant="info">Creado con IA</StatusBadge>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                  <div className="flex gap-4">
                    <div>
                      <span className="text-[11px] text-slate-500">Periodo ({periodo})</span>
                      <p
                        className={`text-sm font-bold tabular-nums ${res.conteo_periodo > 0 ? 'text-amber-700' : 'text-emerald-700'
                          }`}
                      >
                        {res.conteo_periodo} CFDI
                      </p>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500">Ejercicio {selectedYear}</span>
                      <p
                        className={`text-sm font-bold tabular-nums ${res.conteo_ejercicio > 0 ? 'text-amber-700' : 'text-emerald-700'
                          }`}
                      >
                        {res.conteo_ejercicio} CFDI
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-blue-600">Ver UUIDs →</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Drill-down de UUIDs del indicador */}
        {detailResult && (
          <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]">
            <div className="animate-modal-pop flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {detailResult.indicador.nombre}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {detailResult.indicador.descripcion}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      exportToExcel(
                        detailCfdis.map((c) => ({
                          Indicador: detailResult.indicador.nombre,
                          UUID: c.uuid,
                          Folio: `${c.serie}-${c.folio}`,
                          Dirección: c.direccion === 'E' ? 'Emitido' : 'Recibido',
                          Fecha: c.fecha_fiscal,
                          Contraparte: c.direccion === 'E' ? c.nombre_receptor : c.nombre_emisor,
                          RFC: c.direccion === 'E' ? c.rfc_receptor : c.rfc_emisor,
                          'Total MXN': c.total_mxn,
                          Estatus: c.estatus_sat,
                        })),
                        `Indicador_${detailResult.indicador.codigo}`,
                        'Incidencias',
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailResult(null)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                {detailCfdis.length === 0 ? (
                  <div className="py-10 text-center">
                    <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
                    <p className="mt-2 text-sm font-semibold text-slate-800">
                      Sin incidencias detectadas en {selectedYear}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-3 py-2 font-semibold">UUID / Folio</th>
                          <th className="px-3 py-2 font-semibold">Dir.</th>
                          <th className="px-3 py-2 font-semibold">Fecha</th>
                          <th className="px-3 py-2 font-semibold">Contraparte</th>
                          <th className="px-3 py-2 text-right font-semibold">Total MXN</th>
                          <th className="px-3 py-2 text-right font-semibold">Abrir</th>
                        </tr>
                      </thead>
                      <tbody className="stagger-rows divide-y divide-slate-100">
                        {detailCfdis.map((c) => (
                          <tr key={c.uuid} className="hover:bg-slate-50">
                            <td className="px-3 py-2">
                              <p className="font-semibold text-slate-900">
                                {c.serie}-{c.folio}
                              </p>
                              <p className="font-mono-code text-[10px] text-slate-500">
                                {shortUuid(c.uuid)}
                              </p>
                            </td>
                            <td className="px-3 py-2">
                              {c.direccion === 'E' ? 'Emitido' : 'Recibido'}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {formatShortDate(c.fecha_fiscal)}
                            </td>
                            <td className="max-w-[200px] truncate px-3 py-2">
                              {c.direccion === 'E' ? c.nombre_receptor : c.nombre_emisor}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold">
                              <Money value={c.total_mxn} />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setDetailResult(null);
                                  openCfdiDetail(c.uuid);
                                }}
                                title="Ver detalle del CFDI"
                                aria-label="Ver detalle del CFDI"
                                className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50 cursor-pointer"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal Constructor de Indicadores + Crear con IA */}
        {builderOpen && (
          <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]">
            <div className="animate-modal-pop max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-base font-bold text-slate-900">
                  Constructor de indicador personalizado
                </h2>
                <button
                  type="button"
                  onClick={() => setBuilderOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Crear indicador con IA */}
              <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-3.5 text-xs">
                <p className="flex items-center gap-1.5 font-bold text-blue-900">
                  <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                  Crear indicador con IA
                </p>
                <p className="mt-0.5 text-blue-800">
                  Describe la condición en lenguaje natural y la convertimos en filtros revisables:
                </p>
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="Ej. Facturas recibidas en dólares mayores a 50000"
                    className="flex-1 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleApplyAiPrompt}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-700 cursor-pointer"
                  >
                    Generar filtro
                  </button>
                </div>
              </div>

              <form onSubmit={handleSaveIndicator} className="mt-4 space-y-3.5 text-xs">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">
                    Nombre del indicador *
                  </label>
                  <input
                    type="text"
                    required
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej. Gastos en efectivo sin deducción"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </div>

                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Descripción</label>
                  <input
                    type="text"
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    placeholder="Explica brevemente qué valida esta regla"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">Grupo</label>
                    <select
                      value={grupo}
                      onChange={(e) => setGrupo(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2"
                    >
                      {db.grupos_indicadores.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">Aplica sobre</label>
                    <div className="flex items-center gap-4 pt-2">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={aplicaEmitidos}
                          onChange={(e) => setAplicaEmitidos(e.target.checked)}
                        />
                        Emitidos
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={aplicaRecibidos}
                          onChange={(e) => setAplicaRecibidos(e.target.checked)}
                        />
                        Recibidos
                      </label>
                    </div>
                  </div>
                </div>

                {/* Condiciones */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="font-semibold text-slate-700">
                      Condiciones (todas deben cumplirse)
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setFiltros((prev) => [
                          ...prev,
                          { campo: 'total_mxn', operador: 'gt', valor: '10000' },
                        ])
                      }
                      className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" /> Agregar condición
                    </button>
                  </div>

                  <div className="space-y-2">
                    {filtros.map((f, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-1.5">
                        <select
                          value={f.campo}
                          onChange={(e) =>
                            setFiltros((prev) =>
                              prev.map((item, i) =>
                                i === idx
                                  ? { ...item, campo: e.target.value as CampoFiltroIndicador }
                                  : item,
                              ),
                            )
                          }
                          className="col-span-5 rounded-lg border border-slate-200 px-2 py-1.5"
                        >
                          {CAMPOS_CONSTRUCTOR.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                        <select
                          value={f.operador}
                          onChange={(e) =>
                            setFiltros((prev) =>
                              prev.map((item, i) =>
                                i === idx
                                  ? { ...item, operador: e.target.value as OperadorFiltro }
                                  : item,
                              ),
                            )
                          }
                          className="col-span-3 rounded-lg border border-slate-200 px-2 py-1.5"
                        >
                          {OPERADORES.map((op) => (
                            <option key={op.value} value={op.value}>
                              {op.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={f.valor}
                          onChange={(e) =>
                            setFiltros((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, valor: e.target.value } : item,
                              ),
                            )
                          }
                          className="col-span-3 rounded-lg border border-slate-200 px-2 py-1.5"
                        />
                        <button
                          type="button"
                          disabled={filtros.length <= 1}
                          onClick={() => setFiltros((prev) => prev.filter((_, i) => i !== idx))}
                          className="col-span-1 flex items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setBuilderOpen(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 font-medium text-slate-700 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 cursor-pointer"
                  >
                    Guardar indicador
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Nuevo Grupo */}
        {groupModalOpen && (
          <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]">
            <div className="animate-modal-pop w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-sm font-bold text-slate-900">Nuevo grupo de indicadores</h2>
                <button
                  type="button"
                  onClick={() => setGroupModalOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addIndicatorGroup(newGroupName);
                  setNewGroupName('');
                  setGroupModalOpen(false);
                }}
                className="mt-4 space-y-3 text-xs"
              >
                <input
                  type="text"
                  required
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Ej. Auditoría cierre anual"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setGroupModalOpen(false)}
                    className="rounded-xl border border-slate-200 px-3 py-1.5 font-medium text-slate-700 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-700 cursor-pointer"
                  >
                    Crear grupo
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
