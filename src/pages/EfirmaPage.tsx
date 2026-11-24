import React, { useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileKey2,
  KeyRound,
  Lock,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { useFiscal } from '../context/FiscalContext';
import { RoleGuard } from '../components/shared/RoleGuard';
import { StatusBadge } from '../components/shared/StatusBadge';
import { daysUntil, formatDateTime, formatShortDate } from '../utils/format';

export const EfirmaPage: React.FC = () => {
  const {
    db,
    activeEmpresa,
    uploadEfirmaToServerVault,
    backendHealth,
  } = useFiscal();
  const [modalOpen, setModalOpen] = useState(false);

  const [cerFile, setCerFile] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const efirma = db.efirmas.find((e) => e.empresa_id === activeEmpresa.id);
  const remainingDays = efirma ? daysUntil(efirma.vigencia_hasta) : null;

  const efirmaBitacora = db.bitacora
    .filter((b) => b.empresa_id === activeEmpresa.id && b.modulo.includes('e.firma'))
    .slice(0, 5);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!cerFile || !cerFile.name.toLowerCase().endsWith('.cer')) {
      setErrorMsg('Selecciona un archivo de certificado público válido con extensión .cer');
      return;
    }
    if (!keyFile || !keyFile.name.toLowerCase().endsWith('.key')) {
      setErrorMsg('Selecciona un archivo de llave privada válido con extensión .key');
      return;
    }
    if (password.length < 4) {
      setErrorMsg('Ingresa la contraseña de la clave privada de la e.firma.');
      return;
    }

    setSubmitting(true);
    try {
      const vaultRes = await uploadEfirmaToServerVault({
        cerFile,
        keyFile,
        password,
      });

      if (!vaultRes.ok) {
        setErrorMsg(
          vaultRes.error ||
            'No fue posible validar criptográficamente los archivos de la e.firma (.cer y .key).',
        );
        return;
      }

      // Limpiar inmediatamente de memoria (jamás se guarda .key ni password en navegador)
      setCerFile(null);
      setKeyFile(null);
      setPassword('');
      setModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <RoleGuard allowedRoles={['propietario']} sectionName="Administración de e.firma (FIEL)">
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              e.firma (Certificado FIEL)
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Credencial cifrada para autenticación automática con el Web Service de Descarga Masiva
              del SAT.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm cursor-pointer"
          >
            <Upload className="h-4 w-4" />
            {efirma ? 'Actualizar e.firma' : 'Cargar e.firma'}
          </button>
        </div>

        {/* Alertas de vencimiento 30 / 15 / 5 días */}
        {efirma && remainingDays !== null && remainingDays < 0 && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            <div className="text-xs">
              <p className="font-bold">e.firma vencida — descarga SAT detenida</p>
              <p className="mt-0.5 text-rose-800">
                El certificado de <strong>{activeEmpresa.razon_social}</strong> expiró el{' '}
                <strong>{formatShortDate(efirma.vigencia_hasta)}</strong> (hace{' '}
                {Math.abs(remainingDays)} días). Carga la renovación para reanudar descargas
                automáticas.
              </p>
            </div>
          </div>
        )}

        {efirma && remainingDays !== null && remainingDays >= 0 && remainingDays <= 30 && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="text-xs">
              <p className="font-bold">
                Alerta de vencimiento ({remainingDays <= 5 ? 'crítica ≤ 5 días' : remainingDays <= 15 ? '≤ 15 días' : '≤ 30 días'})
              </p>
              <p className="mt-0.5 text-amber-800">
                La e.firma vence en <strong>{remainingDays} día(s)</strong> (
                {formatShortDate(efirma.vigencia_hasta)}). Programa su renovación ante el SAT.
              </p>
            </div>
          </div>
        )}

        {/* Tarjeta principal de estado */}
        <div className="stagger-grid grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="panel-surface rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#083058] to-[#0e4b85] text-blue-100 shadow-sm">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">{activeEmpresa.razon_social}</h2>
                  <p className="font-mono-code text-xs text-slate-500">
                    {activeEmpresa.rfc
                      ? `RFC: ${activeEmpresa.rfc}`
                      : `Régimen ${activeEmpresa.regimen} · ${activeEmpresa.regimen_descripcion}`}
                  </p>
                </div>
              </div>
              {efirma ? (
                remainingDays !== null && remainingDays < 0 ? (
                  <StatusBadge variant="danger" dot pulse>
                    Vencida
                  </StatusBadge>
                ) : remainingDays !== null && remainingDays <= 30 ? (
                  <StatusBadge variant="warning" dot pulse>
                    Por vencer ({remainingDays} días)
                  </StatusBadge>
                ) : (
                  <StatusBadge variant="success" dot>
                    Activa
                  </StatusBadge>
                )
              ) : (
                <StatusBadge variant="neutral">Sin cargar</StatusBadge>
              )}
            </div>

            {efirma ? (
              <>
                <div className="stagger-grid mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-3.5 transition-colors hover:bg-slate-100/80">
                    <span className="text-[11px] font-medium text-slate-500">
                      Número de serie (Folio FIEL)
                    </span>
                    <p className="mt-1 font-mono-code text-xs font-semibold text-slate-900 break-all">
                      {efirma.numero_serie}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3.5 transition-colors hover:bg-slate-100/80">
                    <span className="text-[11px] font-medium text-slate-500">RFC del certificado</span>
                    <p className="mt-1 font-mono-code text-xs font-semibold text-slate-900">
                      {efirma.rfc_certificado}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3.5 transition-colors hover:bg-slate-100/80">
                    <span className="text-[11px] font-medium text-slate-500">Vigencia desde</span>
                    <p className="mt-1 text-xs font-semibold text-slate-900">
                      {formatShortDate(efirma.vigencia_desde)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3.5 transition-colors hover:bg-slate-100/80">
                    <span className="text-[11px] font-medium text-slate-500">
                      Fecha de expiración
                    </span>
                    <p className="mt-1 text-xs font-bold text-slate-900">
                      {formatShortDate(efirma.vigencia_hasta)}{' '}
                      {remainingDays !== null && remainingDays >= 0 && (
                        <span className="font-normal text-slate-500">({remainingDays} días restantes)</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Barra animada de vida útil restante */}
                {remainingDays !== null && (
                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-[11px] text-slate-500">
                      <span>Vigencia del certificado (4 años SAT)</span>
                      <span className="font-semibold text-slate-700">
                        {remainingDays < 0 ? 'Expirada' : `${remainingDays} días vigentes`}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`animate-bar-fill h-full rounded-full ${remainingDays < 0
                          ? 'bg-rose-500'
                          : remainingDays <= 30
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                          }`}
                        style={{
                          width: `${Math.max(4, Math.min(100, Math.round((Math.max(0, remainingDays) / 1460) * 100)))}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="py-10 text-center">
                <FileKey2 className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-2 text-sm font-semibold text-slate-700">
                  Aún no hay e.firma registrada para este RFC
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Carga los archivos .cer y .key junto con su contraseña para activar la descarga
                  diaria.
                </p>
              </div>
            )}

            {efirma && (
              <p className="mt-4 text-[11px] text-slate-400">
                Última actualización: {formatDateTime(efirma.actualizada_en)} por{' '}
                {efirma.actualizada_por}.
              </p>
            )}
          </div>

          {/* Política de seguridad y resguardo de e.firma */}
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                Seguridad y resguardo de tu e.firma
              </div>
              <StatusBadge variant="success" dot>
                Resguardo cifrado
              </StatusBadge>
            </div>
            <ul className="space-y-2.5 text-xs text-slate-600">
              <li className="flex items-start gap-2">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
                <span>
                  Tus archivos <code className="font-mono-code">.cer</code>,{' '}
                  <code className="font-mono-code">.key</code> y contraseña se validan
                  automáticamente para confirmar que correspondan a tu <strong>e.firma (FIEL)</strong>{' '}
                  y se resguardan cifrados de forma confidencial.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                <span>
                  Tu llave privada y contraseña nunca se guardan en el navegador ni quedan visibles
                  para otros usuarios.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <span>
                  Alertas automáticas configuradas a <strong>30, 15 y 5 días</strong> antes del
                  vencimiento.
                </span>
              </li>
            </ul>
            {backendHealth?.vault?.configuredInVault && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-[11px] text-emerald-950">
                <p className="font-semibold">
                  Certificado FIEL validado y resguardado de forma segura para descargas del SAT.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Bitácora de movimientos de e.firma */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-bold text-slate-900">Bitácora de carga y renovación</h3>
          <div className="mt-3 space-y-2">
            {efirmaBitacora.length === 0 ? (
              <p className="text-xs text-slate-500">Sin eventos registrados para esta empresa.</p>
            ) : (
              efirmaBitacora.map((b) => (
                <div
                  key={b.id}
                  className="flex flex-col justify-between gap-1 rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-2.5 text-xs sm:flex-row sm:items-center"
                >
                  <div>
                    <span className="font-semibold text-slate-900">{b.accion}</span>
                    <span className="mx-1.5 text-slate-300">·</span>
                    <span className="text-slate-600">{b.detalle}</span>
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400">
                    {b.usuario} · {formatDateTime(b.fecha)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Modal Actualizar e.firma */}
        {modalOpen && (
          <div className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]">
            <div className="animate-modal-pop w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-base font-bold text-slate-900">
                  {efirma ? 'Actualizar e.firma (FIEL)' : 'Cargar e.firma (FIEL)'}
                </h2>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 text-xs">
                <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-blue-900">
                  Validación automática: verificamos que el certificado corresponda al RFC{' '}
                  <strong className="font-mono-code">{activeEmpresa.rfc}</strong> y sea{' '}
                  <strong>FIEL</strong> (no Sello Digital CSD).
                </div>

                <div>
                  <label className="mb-1 block font-semibold text-slate-700">
                    Certificado público (.cer) *
                  </label>
                  <input
                    type="file"
                    accept=".cer"
                    onChange={(e) => setCerFile(e.target.files?.[0] || null)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-medium file:text-slate-700"
                  />
                </div>

                <div>
                  <label className="mb-1 block font-semibold text-slate-700">
                    Llave privada (.key) *
                  </label>
                  <input
                    type="file"
                    accept=".key"
                    onChange={(e) => setKeyFile(e.target.files?.[0] || null)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-medium file:text-slate-700"
                  />
                </div>

                <div>
                  <label className="mb-1 block font-semibold text-slate-700">
                    Contraseña de clave privada *
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    autoComplete="off"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {errorMsg && (
                  <p className="rounded-lg bg-rose-50 px-3 py-2 font-medium text-rose-700">
                    {errorMsg}
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
                    disabled={submitting}
                    className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                  >
                    {submitting ? 'Cifrando en Bóveda...' : 'Validar y cifrar'}
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
