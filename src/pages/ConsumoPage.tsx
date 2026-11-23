import React, { useMemo } from 'react';
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

  const currentYear = String(new Date().getFullYear());
  const currentMonthLabel = new Intl.DateTimeFormat('es-MX', {
    month: 'short',
    year: 'numeric',
  }).format(new Date());

  const consumo = db.consumos.find((c) => c.empresa_id === activeEmpresa.id);

  const companyCfdis = useMemo(
    () => db.cfdis.filter((c) => c.empresa_id === activeEmpresa.id && !c.solo_en_sat),
    [db.cfdis, activeEmpresa.id],
  );

  const cfdiHistoricos = companyCfdis.length;
  const cfdiEjercicioActual = companyCfdis.filter((c) =>
    c.fecha_fiscal.startsWith(currentYear),
  ).length;
  const consultasIaMes = consumo?.consultas_ia_mes || 0;
  const almacenamientoMb = consumo?.almacenamiento_mb || 0;

  const desgloseAnual = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of companyCfdis) {
      const y = c.fecha_fiscal?.slice(0, 4);
      if (y && /^\d{4}$/.test(y)) {
        counts.set(y, (counts.get(y) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([anio, cantidad]) => ({ anio, cantidad }));
  }, [companyCfdis]);

  const handleExport = () => {
    exportToExcel(
      db.empresas.map((emp) => {
        const c = db.consumos.find((x) => x.empresa_id === emp.id);
        const empCfdiCount = db.cfdis.filter(
          (item) => item.empresa_id === emp.id && !item.solo_en_sat,
        ).length;
        return {
          Empresa: emp.razon_social,
          RFC: emp.rfc,
          'CFDI Registrados': empCfdiCount,
          'Consultas IA (Mes)': c?.consultas_ia_mes || 0,
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
              Monitoreo real del volumen de CFDIs cargados, almacenamiento de archivos y consultas al
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

        {/* 4 Tarjetas de consumo real (sin límites ficticios) */}
        <div className="stagger-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="card-interactive rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">CFDI históricos totales</span>
              <Layers className="h-4 w-4 text-blue-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              <AnimatedNumber value={cfdiHistoricos} />
            </p>
            <p className="mt-2 text-[11px] text-slate-500">
              Comprobantes reales incorporados sin duplicados
            </p>
          </div>

          <div className="card-interactive rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                CFDI ejercicio {currentYear}
              </span>
              <Database className="h-4 w-4 text-indigo-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              <AnimatedNumber value={cfdiEjercicioActual} />
            </p>
            <p className="mt-2 text-[11px] text-slate-500">
              Comprobantes con fecha fiscal en {currentYear}
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
              <AnimatedNumber value={consultasIaMes} />
            </p>
            <p className="mt-2 text-[11px] text-slate-500 capitalize">
              Registradas en {currentMonthLabel}
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
              <AnimatedNumber value={almacenamientoMb} />{' '}
              <span className="text-xs font-normal text-slate-400">MB</span>
            </p>
            <p className="mt-2 text-[11px] text-slate-500">
              Espacio utilizado por archivos cargados
            </p>
          </div>
        </div>

        {/* Gráfica histórica + comparativo por empresa */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-bold text-slate-900">
              CFDIs incorporados por ejercicio ({activeEmpresa.rfc})
            </h2>
            <p className="text-xs text-slate-500">Volumen anual real en el repositorio</p>
            {desgloseAnual.length === 0 ? (
              <div className="mt-4 flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-xs text-slate-500">
                Sin comprobantes cargados todavía.
              </div>
            ) : (
              <div className="mt-4 h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={desgloseAnual}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="anio" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} />
                    <Tooltip />
                    <Bar
                      dataKey="cantidad"
                      name="CFDIs"
                      fill="#0e4b85"
                      radius={[6, 6, 0, 0]}
                      animationDuration={850}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
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
                    <th className="px-4 py-3 text-right font-semibold">CFDIs</th>
                    <th className="px-4 py-3 text-right font-semibold">Consultas IA</th>
                    <th className="px-4 py-3 text-right font-semibold">Almacenamiento</th>
                  </tr>
                </thead>
                <tbody className="stagger-rows divide-y divide-slate-100">
                  {db.empresas.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                        Aún no hay empresas registradas.
                      </td>
                    </tr>
                  ) : (
                    db.empresas.map((emp) => {
                      const c = db.consumos.find((x) => x.empresa_id === emp.id);
                      const count = db.cfdis.filter(
                        (item) => item.empresa_id === emp.id && !item.solo_en_sat,
                      ).length;
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
                            {formatNumber(count)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {c?.consultas_ia_mes || 0}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {c?.almacenamiento_mb || 0} MB
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
};
