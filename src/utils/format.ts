export const MASKED_AMOUNT = '•••••';

export function formatMoney(
  value: number,
  ocultarMontos = false,
  moneda: string = 'MXN',
): string {
  if (ocultarMontos) return MASKED_AMOUNT;
  const formatted = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: moneda === 'EUR' ? 'EUR' : moneda === 'USD' ? 'USD' : 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
  if (moneda === 'USD' && !formatted.toUpperCase().includes('USD')) {
    return `${formatted} USD`;
  }
  return formatted;
}

export function formatNumber(value: number, ocultar = false): string {
  if (ocultar) return MASKED_AMOUNT;
  return new Intl.NumberFormat('es-MX').format(Number.isFinite(value) ? value : 0);
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const clean = iso.includes('T') ? iso : `${iso}T12:00:00`;
  const d = new Date(clean);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function shortUuid(uuid: string): string {
  if (!uuid) return '—';
  return uuid.length > 14 ? `${uuid.slice(0, 8)}…${uuid.slice(-4)}` : uuid;
}

const NOMBRES_MESES = [
  { num: 1, corto: 'Ene', largo: 'Enero' },
  { num: 2, corto: 'Feb', largo: 'Febrero' },
  { num: 3, corto: 'Mar', largo: 'Marzo' },
  { num: 4, corto: 'Abr', largo: 'Abril' },
  { num: 5, corto: 'May', largo: 'Mayo' },
  { num: 6, corto: 'Jun', largo: 'Junio' },
  { num: 7, corto: 'Jul', largo: 'Julio' },
  { num: 8, corto: 'Ago', largo: 'Agosto' },
  { num: 9, corto: 'Sep', largo: 'Septiembre' },
  { num: 10, corto: 'Oct', largo: 'Octubre' },
  { num: 11, corto: 'Nov', largo: 'Noviembre' },
  { num: 12, corto: 'Dic', largo: 'Diciembre' },
];

export function getMesesForYear(year: string) {
  return NOMBRES_MESES.map((m) => ({
    key: `${year}-${String(m.num).padStart(2, '0')}`,
    num: m.num,
    corto: m.corto,
    largo: `${m.largo} ${year}`,
  }));
}

export function getAvailableYears(
  cfdis: Array<{ fecha_fiscal: string }> = [],
  minHistoryYears = 6,
): string[] {
  const set = new Set<string>();
  const latestBase = Math.max(2026, new Date().getFullYear());
  for (let i = 0; i < minHistoryYears; i++) {
    set.add(String(latestBase - i));
  }
  for (const c of cfdis) {
    const y = c.fecha_fiscal?.slice(0, 4);
    if (y && /^\d{4}$/.test(y)) set.add(y);
  }
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

export function getLastDayOfMonth(yearMonth: string): string {
  const [yStr, mStr] = yearMonth.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    return `${yearMonth}-30`;
  }
  const lastDay = new Date(y, m, 0).getDate();
  return `${yStr}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

export const MESES_ES = getMesesForYear('2026');

export const CATALOGO_TIPO_CFDI: Record<string, string> = {
  I: 'Ingreso',
  E: 'Egreso',
  P: 'Pago',
  N: 'Nómina',
  T: 'Traslado',
};

export const CATALOGO_FORMA_PAGO: Record<string, string> = {
  '01': '01 - Efectivo',
  '02': '02 - Cheque nominativo',
  '03': '03 - Transferencia electrónica',
  '04': '04 - Tarjeta de crédito',
  '28': '28 - Tarjeta de débito',
  '31': '31 - Intermediario pagos',
  '99': '99 - Por definir',
  '': '—',
};

export const CATALOGO_USO_CFDI: Record<string, string> = {
  G01: 'G01 - Adquisición de mercancías',
  G02: 'G02 - Devoluciones, descuentos o bonificaciones',
  G03: 'G03 - Gastos en general',
  I04: 'I04 - Equipo de cómputo y accesorios',
  I08: 'I08 - Otra maquinaria y equipo',
  CP01: 'CP01 - Pagos',
  CN01: 'CN01 - Nómina',
  S01: 'S01 - Sin efectos fiscales',
};

export const CATALOGO_TIPO_RELACION: Record<string, string> = {
  '01': '01 - Nota de crédito de los documentos relacionados',
  '02': '02 - Nota de débito de los documentos relacionados',
  '03': '03 - Devolución de mercancía',
  '04': '04 - Sustitución de los CFDI previos',
  '07': '07 - CFDI por aplicación de anticipo',
};

export const CATALOGO_REGIMEN: Record<string, string> = {
  '601': '601 - General de Ley Personas Morales',
  '603': '603 - Personas Morales con Fines no Lucrativos',
  '605': '605 - Sueldos y Salarios',
  '612': '612 - Personas Físicas con Actividades Empresariales',
  '626': '626 - Régimen Simplificado de Confianza (RESICO)',
};

export const CATALOGO_ROLES: Record<
  string,
  { label: string; descripcion: string; color: string }
> = {
  propietario: {
    label: 'Propietario',
    descripcion: 'Acceso total al módulo, incluida la carga de e.firma y alta de empresas.',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  contador: {
    label: 'Contador',
    descripcion: 'Operación fiscal completa (CFDIs, impuestos, conciliación, indicadores), sin acceso a e.firma.',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  consulta: {
    label: 'Consulta',
    descripcion: 'Solo lectura de reportes y CFDIs. No ve e.firma ni puede invitar o modificar ajustes.',
    color: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  pagos: {
    label: 'Pagos',
    descripcion: 'Acceso operativo a CFDIs emitidos y recibidos, sin módulos de impuestos ni administración.',
    color: 'bg-amber-50 text-amber-700 border-amber-200',
  },
};

export function daysUntil(isoDate: string, referenceDate = '2026-11-19'): number {
  const target = new Date(`${isoDate.slice(0, 10)}T00:00:00`);
  const ref = new Date(`${referenceDate}T00:00:00`);
  return Math.ceil((target.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));
}
