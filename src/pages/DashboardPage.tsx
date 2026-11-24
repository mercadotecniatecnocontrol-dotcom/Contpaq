import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Calculator,
  CheckCircle2,
  FileWarning,
  Info,
  Link2,
  Percent,
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
import { useFiscal } from '../context/FiscalContext';
import { getResumenMensual } from '../services/fiscalCalculations';
import {
  formatMoney,
  formatShortDate,
  getAvailableYears,
  getMesesForYear,
  MASKED_AMOUNT,
} from '../utils/format';
import { Money } from '../components/shared/Money';
import { AnimatedNumber } from '../components/shared/AnimatedNumber';
import { RoleGuard } from '../components/shared/RoleGuard';
import { StatusBadge } from '../components/shared/StatusBadge';

export const DashboardPage: React.FC = () => {
  const { db, activeEmpresa, navigate, ocultarMontos, openCfdiDetail, routePreset, clearRoutePreset } =
    useFiscal();
  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedMes, setSelectedMes] = useState('2026-10');
  const [desgloseOpen, setDesgloseOpen] = useState(false);
  const [showIngresosBar, setShowIngresosBar] = useState(true);
  const [showGastosBar, setShowGastosBar] = useState(true);

  useEffect(() => {
    if (routePreset?.periodo) {
      setSelectedYear(routePreset.periodo.slice(0, 4));
      setSelectedMes(routePreset.periodo);
      clearRoutePreset();
    }
  }, [routePreset, clearRoutePreset]);

  const companyCfdis = useMemo(
    () => db.cfdis.filter((c) => c.empresa_id === activeEmpresa.id && !c.solo_en_sat),
    [db.cfdis, activeEmpresa.id],
  );
  const availableYears = useMemo(() => getAvailableYears(companyCfdis), [companyCfdis]);

  useEffect(() => {
    if (!availableYears.includes(selectedYear)) {
      const targetYear = availableYears[0];
      setSelectedYear(targetYear);
      const latestInYear = companyCfdis
        .filter((c) => c.fecha_fiscal.startsWith(targetYear))
        .map((c) => c.fecha_fiscal.slice(0, 7))
        .sort()
        .pop();
      setSelectedMes(latestInYear || `${targetYear}-10`);
    }
  }, [availableYears, selectedYear, companyCfdis]);

  const mesesAnio = useMemo(() => getMesesForYear(selectedYear), [selectedYear]);

  const resumenMensual = useMemo(
    () => getResumenMensual(db, activeEmpresa.id, selectedYear),
    [db, activeEmpresa.id, selectedYear],
  );

  const mesActual = resumenMensual.find((r) => r.periodo === selectedMes) || resumenMensual[9];
  const mesLabel = mesesAnio.find((m) => m.key === selectedMes)?.largo || selectedMes;

  const acumulado = useMemo(() => {
    const upToIdx = mesesAnio.findIndex((m) => m.key === selectedMes);
    const slice = resumenMensual.slice(0, upToIdx >= 0 ? upToIdx + 1 : 12);
    return {
      ingresos: slice.reduce((s, r) => s + r.ingresosNetos, 0),
      gastos: slice.reduce((s, r) => s + r.gastos, 0),
      deduccionesIsr: slice.reduce((s, r) => s + r.isrDeducciones, 0),
      ivaTrasladado: slice.reduce((s, r) => s + r.ivaTrasladado, 0),
      ivaAcreditable: slice.reduce((s, r) => s + r.ivaAcreditable, 0),
    };
  }, [resumenMensual, mesesAnio, selectedMes]);

  const opinionSat = db.documentos.find(
    (d) => d.empresa_id === activeEmpresa.id && d.tipo === 'opinion_sat',
  );
  const opinionNegativa = opinionSat?.sentido === 'negativa';

  const cancelEmitidos = db.cfdis.filter(
    (c) =>
      c.empresa_id === activeEmpresa.id &&
      c.direccion === 'E' &&
      c.estatus_sat === 'en_cancelacion',
  );
  const cancelRecibidos = db.cfdis.filter(
    (c) =>
      c.empresa_id === activeEmpresa.id &&
      c.direccion === 'R' &&
      c.estatus_sat === 'en_cancelacion',
  );

  const aspelConfig = db.aspel_configs.find((a) => a.empresa_id === activeEmpresa.id);

  // Conteo real de CFDIs del ejercicio seleccionado
  const companyCfdisInYear = useMemo(
    () => companyCfdis.filter((c) => c.fecha_fiscal.startsWith(selectedYear)),
    [companyCfdis, selectedYear],
  );
  const cfdisAnualesRegistrados = companyCfdisInYear.length;

  // Desglose ingresos nominales del mes seleccionado
  const desgloseIngresos = useMemo(
    () =>
      db.cfdis.filter(
        (c) =>
          c.empresa_id === activeEmpresa.id &&
          !c.solo_en_sat &&
          c.direccion === 'E' &&
          c.estatus_sat === 'vigente' &&
          (c.tipo === 'I' || c.tipo === 'E') &&
          c.fecha_fiscal.startsWith(selectedMes),
      ),
    [db.cfdis, activeEmpresa.id, selectedMes],
  );

  return (
    <RoleGuard allowedRoles={['propietario', 'contador', 'consulta']} sectionName="Dashboard Fiscal">
      <div className="space-y-5">
        {/* Encabezado hero ejecutivo Tecnocontrol + selector de mes */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#083058] via-[#0e4b85] to-[#1a5f9e] animate-ambient-gradient p-5 text-white shadow-sm">
          <div className="pointer-events-none absolute -top-12 -right-12 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-16 left-1/3 h-40 w-40 rounded-full bg-sky-200/10 blur-2xl" />
          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3.5">
              <div className="hidden rounded-xl bg-white/95 px-3 py-2 shadow-sm sm:block">
                <img
                  src="./logotecno.png"
                  alt="Tecnocontrol"
                  className="h-7 w-auto object-contain"
                />
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-blue-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                  Portal Operativo Tecnocontrol
                  {activeEmpresa.rfc ? ` · ${activeEmpresa.rfc}` : ''}
                </span>
                <h1 className="mt-1.5 text-xl font-bold tracking-tight text-white">
                  Dashboard Fiscal
                </h1>
                <p className="mt-0.5 text-sm text-blue-100/90">
                  Panorama mensual y acumulado del ejercicio {selectedYear} ·{' '}
                  <span className="font-semibold text-white">{activeEmpresa.razon_social}</span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <select
                id="dash-ejercicio"
                name="dash-ejercicio"
                aria-label="Ejercicio"
                value={selectedYear}
                onChange={(e) => {
                  const y = e.target.value;
                  setSelectedYear(y);
                  setSelectedMes(`${y}-${selectedMes.slice(5, 7)}`);
                }}
                className="rounded-xl border border-white/20 bg-white/12 px-3 py-2 text-xs font-semibold text-white backdrop-blur focus:border-white/50 focus:outline-none [&>option]:text-slate-900"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <select
                id="dash-mes"
                name="dash-mes"
                aria-label="Periodo mensual"
                value={selectedMes}
                onChange={(e) => setSelectedMes(e.target.value)}
                className="rounded-xl border border-white/20 bg-white/12 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur focus:border-white/50 focus:outline-none [&>option]:text-slate-900"
              >
                {mesesAnio.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.largo}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {db.empresas.length === 0 && (
          <div className="flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50/80 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 text-xs text-blue-950">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
              <div>
                <p className="font-bold">Comienza registrando tu empresa</p>
                <p className="mt-0.5 text-blue-800">
                  Da de alta tu RFC para consultar comprobantes del SAT, pre-determinar IVA e ISR y
                  administrar el cumplimiento fiscal desde el portal.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('empresas')}
              className="btn-tactile inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#0e4b85] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0b3c6c] cursor-pointer"
            >
              Registrar empresa
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Aviso si el ejercicio seleccionado aún no tiene CFDIs descargados */}
        {db.empresas.length > 0 && companyCfdisInYear.length === 0 && (
          <div className="animate-fade-up flex flex-col gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/75 px-4 py-3 text-xs text-amber-950 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p>
                Aún no hay comprobantes CFDI incorporados para el ejercicio{' '}
                <strong>{selectedYear}</strong> en <strong>{activeEmpresa.razon_social}</strong>.
                Puedes cargar tus paquetes XML/ZIP o solicitar la descarga histórica en
                Sincronización.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('sincronizacion')}
              className="shrink-0 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 cursor-pointer"
            >
              Ir a Sincronización histórica
            </button>
          </div>
        )}

        {/* Nota devengado + conteo real de CFDIs */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="animate-fade-up flex items-start gap-2.5 rounded-2xl border border-blue-200 bg-blue-50/70 px-4 py-3 text-xs text-blue-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <p>
              <strong>Los ingresos se muestran con base en lo devengado (PUE + PPD).</strong> Las
              cifras de impuestos son estimaciones de apoyo para pre-determinación; la declaración
              definitiva la valida Contabilidad.
            </p>
          </div>

          <div className="animate-fade-up flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-700">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              <span>
                <strong>Comprobantes registrados ({selectedYear}):</strong>{' '}
                <strong>{cfdisAnualesRegistrados.toLocaleString('es-MX')}</strong> CFDI(s)
                registrados para {activeEmpresa.razon_social}.
              </span>
            </div>
            <button
              type="button"
              onClick={() => navigate('consumo')}
              className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              Ver consumos
            </button>
          </div>
        </div>

        {/* 4 Tarjetas KPI principales */}
        <div className="stagger-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Ingresos */}
          <button
            type="button"
            onClick={() => navigate('emitidos', { periodo: selectedMes, tipo: 'I' })}
            className="card-interactive group rounded-2xl border border-slate-200 bg-white p-5 text-left hover:border-blue-400 cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Ingresos ({mesLabel})</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-transform duration-300 group-hover:scale-110 group-hover:bg-blue-600 group-hover:text-white">
                <ArrowUpRight className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
              <Money value={mesActual.ingresosNetos} animate />
            </p>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-500">
              <span>Ejercicio {selectedYear}</span>
              <span className="font-semibold text-slate-800">
                <Money value={acumulado.ingresos} animate />
              </span>
            </div>
          </button>

          {/* Gastos */}
          <button
            type="button"
            onClick={() => navigate('recibidos', { periodo: selectedMes, tipo: 'I' })}
            className="card-interactive group rounded-2xl border border-slate-200 bg-white p-5 text-left hover:border-amber-400 cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Gastos ({mesLabel})</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 transition-transform duration-300 group-hover:scale-110 group-hover:bg-amber-500 group-hover:text-white">
                <ArrowDownLeft className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
              <Money value={mesActual.gastos} animate />
            </p>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-500">
              <span>Ejercicio {selectedYear}</span>
              <span className="font-semibold text-slate-800">
                <Money value={acumulado.gastos} animate />
              </span>
            </div>
          </button>

          {/* Deducciones ISR */}
          <button
            type="button"
            onClick={() => navigate('isr', { periodo: selectedMes })}
            className="card-interactive group rounded-2xl border border-slate-200 bg-white p-5 text-left hover:border-emerald-400 cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Deducciones ISR</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition-transform duration-300 group-hover:scale-110 group-hover:bg-emerald-600 group-hover:text-white">
                <Calculator className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
              <Money value={mesActual.isrDeducciones} animate />
            </p>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-500">
              <span>Acumuladas {selectedYear}</span>
              <span className="font-semibold text-slate-800">
                <Money value={acumulado.deduccionesIsr} animate />
              </span>
            </div>
          </button>

          {/* IVA */}
          <button
            type="button"
            onClick={() => navigate('iva', { periodo: selectedMes })}
            className="card-interactive group rounded-2xl border border-slate-200 bg-white p-5 text-left hover:border-indigo-400 cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">IVA en flujo ({mesLabel})</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 transition-transform duration-300 group-hover:scale-110 group-hover:bg-indigo-600 group-hover:text-white">
                <Percent className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Trasladado</span>
                <span className="font-bold text-slate-900">
                  <Money value={mesActual.ivaTrasladado} animate />
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Acreditable</span>
                <span className="font-bold text-emerald-700">
                  <Money value={mesActual.ivaAcreditable} animate />
                </span>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-500">
              <span>Saldo mes (est.)</span>
              <span className="font-bold text-blue-700">
                <Money
                  value={
                    mesActual.ivaTrasladado - mesActual.ivaAcreditable - mesActual.ivaRetenido
                  }
                  animate
                />
              </span>
            </div>
          </button>
        </div>

        {/* Gráfica Ene-Dic + Tarjetas laterales de cumplimiento y cancelación */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {/* Gráfica mensual Ene-Dic */}
          <div className="panel-surface animate-fade-up rounded-2xl border border-slate-200 bg-white p-5 xl:col-span-2" style={{ ['--delay' as string]: '120ms' }}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Ingresos vs Gastos mensuales (Ene – Dic {selectedYear})
                </h2>
                <p className="text-xs text-slate-500">Montos netos en MXN antes de IVA</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <button
                  type="button"
                  aria-pressed={showIngresosBar}
                  onClick={() => setShowIngresosBar((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1 font-semibold transition-colors cursor-pointer ${
                    showIngresosBar
                      ? 'border-blue-600 bg-[#0e4b85] text-white'
                      : 'border-slate-200 bg-slate-100 text-slate-500'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-current" />
                  Ingresos
                </button>
                <button
                  type="button"
                  aria-pressed={showGastosBar}
                  onClick={() => setShowGastosBar((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1 font-semibold transition-colors cursor-pointer ${
                    showGastosBar
                      ? 'border-slate-400 bg-slate-700 text-white'
                      : 'border-slate-200 bg-slate-100 text-slate-500'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-current" />
                  Gastos
                </button>
              </div>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={resumenMensual}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="mesCorto"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    width={58}
                    tickFormatter={(v) =>
                      ocultarMontos ? '•••' : `$${Math.round(Number(v) / 1000)}k`
                    }
                  />
                  <Tooltip
                    formatter={(val: number, name: string) => [
                      ocultarMontos ? MASKED_AMOUNT : formatMoney(val),
                      name,
                    ]}
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      fontSize: '12px',
                      boxShadow: '0 10px 25px -5px rgba(15,23,42,0.1)',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  {showIngresosBar && (
                    <Bar
                      dataKey="ingresosNetos"
                      name="Ingresos netos"
                      fill="#0e4b85"
                      radius={[6, 6, 0, 0]}
                      animationDuration={750}
                    />
                  )}
                  {showGastosBar && (
                    <Bar
                      dataKey="gastos"
                      name="Gastos"
                      fill="#9fb4c8"
                      radius={[6, 6, 0, 0]}
                      animationDuration={900}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Columna derecha: Opinión SAT + CFDI en proceso de cancelación + Aspel SAE */}
          <div className="stagger-grid space-y-4">
            {/* Tarjeta Opinión SAT */}
            <button
              type="button"
              onClick={() => navigate('documentos')}
              className={`card-interactive group w-full rounded-2xl border p-4 text-left cursor-pointer ${
                opinionNegativa
                  ? 'border-rose-300 bg-rose-50 hover:border-rose-400'
                  : 'border-slate-200 bg-white hover:border-blue-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-semibold ${
                    opinionNegativa ? 'text-rose-800' : 'text-slate-500'
                  }`}
                >
                  Estado de cumplimiento SAT (32-D)
                </span>
                {opinionNegativa ? (
                  <AlertTriangle className="h-5 w-5 text-rose-600 animate-pulse" />
                ) : opinionSat ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 transition-transform duration-300 group-hover:scale-110" />
                ) : (
                  <Info className="h-5 w-5 text-slate-400" />
                )}
              </div>
              <div className="mt-2 flex items-center justify-between">
                <p
                  className={`text-lg font-bold capitalize ${
                    opinionNegativa
                      ? 'text-rose-900'
                      : opinionSat
                        ? 'text-emerald-700'
                        : 'text-slate-500'
                  }`}
                >
                  {opinionSat ? opinionSat.sentido : 'Sin cargar'}
                </p>
                <span className="text-xs font-medium text-blue-600 inline-flex items-center gap-1">
                  Ver documentos{' '}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                </span>
              </div>
              <p
                className={`mt-1 text-[11px] ${
                  opinionNegativa ? 'text-rose-700' : 'text-slate-500'
                }`}
              >
                Última consulta: {formatShortDate(opinionSat?.fecha_consulta)}
              </p>
            </button>

            {/* Tarjeta CFDI en proceso de cancelación */}
            <div className="panel-surface rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">
                  CFDI en proceso de cancelación
                </span>
                <FileWarning className="h-4 w-4 text-amber-500" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => navigate('emitidos', { estatus: 'en_cancelacion' })}
                  className="btn-tactile rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-left hover:bg-amber-100/70 cursor-pointer"
                >
                  <span className="text-[11px] font-medium text-amber-800">Emitidos</span>
                  <p className="mt-0.5 text-xl font-bold text-amber-900">
                    <AnimatedNumber value={cancelEmitidos.length} />
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('recibidos', { estatus: 'en_cancelacion' })}
                  className="btn-tactile rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-left hover:bg-amber-100/70 cursor-pointer"
                >
                  <span className="text-[11px] font-medium text-amber-800">Recibidos</span>
                  <p className="mt-0.5 text-xl font-bold text-amber-900">
                    <AnimatedNumber value={cancelRecibidos.length} />
                  </p>
                </button>
              </div>
            </div>

            {/* Tarjeta Vinculación Aspel SAE */}
            <button
              type="button"
              onClick={() => navigate('vinculaciones')}
              className={`card-interactive w-full rounded-2xl border p-4 text-left cursor-pointer ${
                aspelConfig?.conectado
                  ? 'border-slate-200 bg-white hover:border-blue-400'
                  : 'border-amber-300 bg-amber-50/60 hover:border-amber-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <Link2 className="h-4 w-4 text-blue-600" />
                  Integración Aspel SAE
                </span>
                <StatusBadge
                  variant={aspelConfig?.conectado ? 'success' : 'warning'}
                  dot
                  pulse={!aspelConfig?.conectado}
                >
                  {aspelConfig?.conectado ? 'Vinculada' : 'Sin vincular'}
                </StatusBadge>
              </div>
              <p className="mt-2 text-xs text-slate-600">
                {aspelConfig?.conectado
                  ? `Conectado a ${aspelConfig.base_datos}. Revisa el estado contable por UUID.`
                  : 'Conecta esta empresa con Aspel SAE para consultar pólizas asociadas a cada CFDI.'}
              </p>
            </button>
          </div>
        </div>

        {/* Ingresos nominales con desglose */}
        <div className="panel-surface animate-fade-up rounded-2xl border border-slate-200 bg-white p-5" style={{ ['--delay' as string]: '200ms' }}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Ingresos nominales — {mesLabel}
              </h2>
              <p className="text-xs text-slate-500">
                Resumen de facturación bruta, descuentos / notas de crédito e ingresos netos del
                periodo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDesgloseOpen(true)}
              className="btn-tactile group inline-flex items-center gap-1.5 self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 cursor-pointer sm:self-auto"
            >
              Ver desglose
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
            </button>
          </div>

          <div className="stagger-grid mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-4 transition-colors hover:bg-slate-100/80">
              <span className="text-xs text-slate-500">Ingresos brutos</span>
              <p className="mt-1 text-lg font-bold text-slate-900">
                <Money value={mesActual.ingresos} animate />
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 transition-colors hover:bg-slate-100/80">
              <span className="text-xs text-slate-500">Descuentos y notas de crédito</span>
              <p className="mt-1 text-lg font-bold text-amber-700">
                <Money value={-mesActual.descuentos} animate />
              </p>
            </div>
            <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
              <span className="text-xs font-medium text-blue-700">Ingresos nominales netos</span>
              <p className="mt-1 text-lg font-bold text-blue-900">
                <Money value={mesActual.ingresosNetos} animate />
              </p>
            </div>
          </div>
        </div>

        {/* Modal Desglose de Ingresos Nominales */}
        {desgloseOpen && (
          <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]">
            <div className="animate-modal-pop flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Desglose de ingresos nominales · {mesLabel}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Comprobantes emitidos vigentes tipo Ingreso (I) y Egreso (E).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDesgloseOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Folio</th>
                        <th className="px-3 py-2 font-semibold">Tipo</th>
                        <th className="px-3 py-2 font-semibold">Cliente</th>
                        <th className="px-3 py-2 font-semibold">Método</th>
                        <th className="px-3 py-2 text-right font-semibold">Neto MXN</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {desgloseIngresos.map((c) => {
                        const sign = c.tipo === 'E' ? -1 : 1;
                        const neto =
                          (c.subtotal - c.descuento) * (c.moneda === 'MXN' ? 1 : c.tipo_cambio) * sign;
                        return (
                          <tr key={c.uuid} className="hover:bg-slate-50">
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setDesgloseOpen(false);
                                  openCfdiDetail(c.uuid);
                                }}
                                className="font-semibold text-blue-700 hover:underline cursor-pointer"
                              >
                                {c.serie}-{c.folio}
                              </button>
                            </td>
                            <td className="px-3 py-2">{c.tipo === 'E' ? 'Nota crédito' : 'Ingreso'}</td>
                            <td className="max-w-[200px] truncate px-3 py-2 text-slate-700">
                              {c.nombre_receptor}
                            </td>
                            <td className="px-3 py-2">{c.metodo_pago}</td>
                            <td className="px-3 py-2 text-right font-semibold">
                              <Money value={neto} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
};
