import React from 'react';
import { Database, Download, HardDrive, Layers, Sparkles } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useFiscal } from '../context/FiscalContext';
import { formatNumber } from '../utils/format';
import { exportToExcel } from '../utils/exportExcel';
import { RoleGuard } from '../components/shared/RoleGuard';
import { AnimatedNumber } from '../components/shared/AnimatedNumber';

export const ConsumoPage: React.FC = () => {
  const { db, activeEmpresa } = useFiscal();

  const consumo =
    db.consumos.find((c) => c.empresa_id === activeEmpresa.id) || {
      empresa_id: activeEmpresa.id,
      cfdi_historicos: 0,
      cfdi_ejercicio_limite: 5000,
      consultas_ia_mes: 0,
      consultas_ia_limite: 250,
      almacenamiento_mb: 0,
      almacenamiento_limite_mb: 1024,
      desglose_anual: [{ anio: '2026', cantidad: 0 }],
    };

  const cfdiEjercicioActual =
    (consumo.desglose_anual.find((a) => a.anio === '2026')?.cantidad || 0) +
    db.cfdis.filter((c) => c.empresa_id === activeEmpresa.id && !c.solo_en_sat).length;

  const pctEjercicio = Math.min(
    100,
    Math.round((cfdiEjercicioActual / Math.max(1, consumo.cfdi_ejercicio_limite)) * 100),
  );
  const pctIa = Math.min(
    100,
    Math.round((consumo.consultas_ia_mes / Math.max(1, consumo.consultas_ia_limite)) * 100),
  );
  const pctStorage = Math.min(
    100,
    Math.round((consumo.almacenamiento_mb / Math.max(1, consumo.almacenamiento_limite_mb)) * 100),
  );

  const handleExport = () => {
    exportToExcel(
      db.empresas.map((emp) => {
        const c = db.consumos.find((x) => x.empresa_id === emp.id);
        return {
          Empresa: emp.razon_social,
          RFC: emp.rfc,
          'CFDI Históricos': c?.cfdi_historicos || 0,
          'Límite Ejercicio': c?.cfdi_ejercicio_limite || 0,
          'Consultas IA (Mes)': c?.consultas_ia_mes || 0,
          'Límite IA (Mes)': c?.consultas_ia_limite || 0,
          'Almacenamiento (MB)': c?.almacenamiento_mb || 0,
        };
      }),
      'Usos_y_Consumos_Tecnocontrol',
      'Consumos',
    );
  };

  return (
    <RoleGuard
      allowedRoles={['propietario', 'contador', 'consulta']}
      sectionName="Usos y consumos"
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Usos y consumos</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Monitoreo interno de volumen de CFDIs, almacenamiento de archivos y consultas al
              Asistente Tecno.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 self-start rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer sm:self-auto"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar Excel
          </button>
        </div>

        {/* 4 Tarjetas de consumo */}
        <div className="stagger-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="card-interactive rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">CFDI históricos totales</span>
              <Layers className="h-4 w-4 text-blue-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              <AnimatedNumber value={consumo.cfdi_historicos} />
            </p>
            <p className="mt-2 text-[11px] text-slate-500">
              Incorporados entre 2022 y 2026 sin duplicados
            </p>
          </div>

          <div className="card-interactive rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                CFDI ejercicio 2026 vs límite
              </span>
              <Database className="h-4 w-4 text-indigo-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              <AnimatedNumber value={cfdiEjercicioActual} />{' '}
              <span className="text-xs font-normal text-slate-400">
                / {formatNumber(consumo.cfdi_ejercicio_limite)}
              </span>
            </p>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="animate-bar-fill h-full rounded-full bg-gradient-to-r from-indigo-600 to-blue-500"
                style={{ width: `${pctEjercicio}%` }}
              />
            </div>
            <p className="mt-1 text-right text-[11px] font-medium text-slate-500">
              {pctEjercicio}% del límite interno
            </p>
          </div>

          <div className="card-interactive rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                Consultas Asistente IA (mes)
              </span>
              <Sparkles className="h-4 w-4 text-sky-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              <AnimatedNumber value={consumo.consultas_ia_mes} />{' '}
              <span className="text-xs font-normal text-slate-400">
                / {formatNumber(consumo.consultas_ia_limite)}
              </span>
            </p>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="animate-bar-fill h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-500"
                style={{ width: `${pctIa}%` }}
              />
            </div>
            <p className="mt-1 text-right text-[11px] font-medium text-slate-500">
              {pctIa}% utilizado en Nov 2026
            </p>
          </div>

          <div className="card-interactive rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                Almacenamiento XML / PDF
              </span>
              <HardDrive className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              <AnimatedNumber value={consumo.almacenamiento_mb} />{' '}
              <span className="text-xs font-normal text-slate-400">
                / {consumo.almacenamiento_limite_mb} MB
              </span>
            </p>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="animate-bar-fill h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                style={{ width: `${pctStorage}%` }}
              />
            </div>
            <p className="mt-1 text-right text-[11px] font-medium text-slate-500">
              {pctStorage}% bucket privado
            </p>
          </div>
        </div>

        {/* Gráfica histórica + comparativo por empresa */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-bold text-slate-900">
              CFDIs incorporados por ejercicio ({activeEmpresa.rfc})
            </h2>
            <p className="text-xs text-slate-500">Volumen anual almacenado en repositorio SAT</p>
            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={consumo.desglose_anual}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="anio" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} />
                  <Tooltip />
                  <Bar dataKey="cantidad" name="CFDIs" fill="#0e4b85" radius={[6, 6, 0, 0]} animationDuration={850} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-bold text-slate-900">Consumo consolidado por empresa</h2>
              <p className="text-xs text-slate-500">
                Resumen multi-RFC del Portal Operativo Tecnocontrol
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Empresa</th>
                    <th className="px-4 py-3 text-right font-semibold">Históricos</th>
                    <th className="px-4 py-3 text-right font-semibold">Consultas IA</th>
                    <th className="px-4 py-3 text-right font-semibold">Storage</th>
                  </tr>
                </thead>
                <tbody className="stagger-rows divide-y divide-slate-100">
                  {db.empresas.map((emp) => {
                    const c = db.consumos.find((x) => x.empresa_id === emp.id);
                    return (
                      <tr
                        key={emp.id}
                        className={emp.id === activeEmpresa.id ? 'bg-blue-50/40' : ''}
                      >
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{emp.razon_social}</p>
                          <p className="font-mono-code text-[10px] text-slate-500">{emp.rfc}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">
                          {formatNumber(c?.cfdi_historicos || 0)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {c?.consultas_ia_mes || 0} / {c?.consultas_ia_limite || 0}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {c?.almacenamiento_mb || 0} MB
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
    </RoleGuard>
  );
};
