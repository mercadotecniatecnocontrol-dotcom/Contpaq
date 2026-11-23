import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  FileCheck2,
  Info,
  Lock,
  Mail,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { useFiscal } from '../context/FiscalContext';

export const LoginPage: React.FC = () => {
  const { login, authNotice, clearAuthNotice } = useFiscal();

  const [email, setEmail] = useState('contabilidad@tecnocontrol.com.mx');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    clearAuthNotice();

    if (!email.trim() || !password) {
      setError('Ingresa tu correo corporativo y contraseña para continuar.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await login({
        email: email.trim(),
        password,
        rememberMe,
      });
      if (!res.ok) {
        setError(res.error || 'No fue posible iniciar sesión. Verifica tus credenciales.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* Panel izquierdo corporativo (visible en escritorio) */}
      <aside className="relative hidden lg:flex lg:w-[46%] xl:w-[44%] flex-col justify-between overflow-hidden bg-gradient-to-br from-[#062442] via-[#0b3c6c] to-[#0e4b85] p-10 xl:p-14 text-white">
        {/* Acentos geométricos sutiles */}
        <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -left-20 h-96 w-96 rounded-full bg-[#c9362b]/15 blur-3xl" />

        <div className="relative z-10">
          <div className="inline-flex items-center rounded-2xl bg-white px-4 py-2.5 shadow-lg shadow-slate-950/20">
            <img
              src="./logotecno.png"
              alt="Tecnocontrol"
              className="h-7 w-auto object-contain"
            />
          </div>

          <div className="mt-10 max-w-md">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-blue-100">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
              Portal Operativo · Módulo Fiscal SAT
            </span>
            <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-white">
              Control fiscal y conciliación en tiempo real para Tecnocontrol
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-blue-100/90">
              Centraliza tus CFDIs emitidos y recibidos, cédulas de IVA e ISR, auditoría contra el
              Visor SAT, indicadores de riesgo y vinculación contable desde un entorno privado y
              protegido.
            </p>
          </div>

          <div className="mt-10 space-y-4 max-w-md">
            <div className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xs">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-blue-100">
                <TrendingUp className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white">
                  Pre-determinación de IVA e ISR en flujo
                </p>
                <p className="mt-0.5 text-xs text-blue-100/80">
                  Cédulas automáticas por tasa, complementos de pago REP 2.0, nómina y retenciones.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xs">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-blue-100">
                <FileCheck2 className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white">
                  Conciliación SAT e indicadores preventivos
                </p>
                <p className="mt-0.5 text-xs text-blue-100/80">
                  Detección inmediata de diferencias, cancelaciones en curso y validación 69-B.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xs">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-blue-100">
                <CheckCircle2 className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white">
                  Resguardo seguro y cierre automático
                </p>
                <p className="mt-0.5 text-xs text-blue-100/80">
                  Acceso autenticado, bitácora de actividad y protección por inactividad.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between border-t border-white/15 pt-5 text-[11px] text-blue-100/75">
          <span>HEDMA TECNOCONTROL S.A. DE C.V.</span>
          <span>Uso interno autorizado</span>
        </div>
      </aside>

      {/* Panel derecho: Formulario de inicio de sesión */}
      <main className="flex flex-1 flex-col items-center justify-center px-5 py-10 sm:px-8">
        <div className="animate-fade-up w-full max-w-md">
          {/* Logo móvil */}
          <div className="mb-6 flex justify-center lg:hidden">
            <img
              src="./logotecno.png"
              alt="Tecnocontrol"
              className="h-9 w-auto object-contain"
            />
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-xl shadow-slate-900/5">
            {/* Línea institucional superior */}
            <div className="flex h-1.5 w-full">
              <div className="h-full w-4/5 bg-[#0e4b85]" />
              <div className="h-full w-1/5 bg-[#c9362b]" />
            </div>

            <div className="p-7 sm:p-9">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-[#0e4b85]">
                  Acceso al Portal Fiscal
                </p>
                <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900">
                  Iniciar sesión
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Ingresa con tu correo corporativo y contraseña asignada para consultar la
                  información fiscal de la empresa.
                </p>
              </div>

              {authNotice && (
                <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50/80 px-3.5 py-2.5 text-xs text-blue-900">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                  <span>{authNotice}</span>
                </div>
              )}

              {error && (
                <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <label
                    htmlFor="login-email"
                    className="mb-1.5 block text-xs font-semibold text-slate-700"
                  >
                    Correo electrónico
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="login-email"
                      name="email"
                      type="email"
                      required
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="contabilidad@tecnocontrol.com.mx"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-2.5 pr-3.5 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="login-password"
                    className="mb-1.5 block text-xs font-semibold text-slate-700"
                  >
                    Contraseña
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="login-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Ingresa tu contraseña"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-2.5 pr-11 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-0.5">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                    <span>Mantener sesión iniciada (7 días)</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-tactile mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0b3c6c] to-[#0e4b85] px-4 py-3 text-sm font-semibold text-white shadow-md shadow-blue-900/20 hover:from-[#093057] hover:to-[#0b3c6c] disabled:opacity-55 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      <span>Verificando credenciales...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4" />
                      <span>Iniciar sesión</span>
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 border-t border-slate-100 pt-4 text-center text-[11px] text-slate-400">
                Acceso exclusivo para personal autorizado de{' '}
                <strong className="font-semibold text-slate-600">Tecnocontrol</strong>.
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
