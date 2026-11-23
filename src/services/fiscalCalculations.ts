import type {
  Cfdi,
  CfdiPago,
  CfdiRelacion,
  Empresa,
  FiscalDatabaseState,
  ImpuestoAjuste,
  IndicadorDefinicion,
  IndicadorResultado,
  ListaEfosEntry,
  ReglaFiltroPersonalizado,
} from '../types/fiscal';
import { getMesesForYear } from '../utils/format';

export interface ResumenMensualRow {
  periodo: string; // YYYY-MM
  mesCorto: string;
  ingresos: number;
  descuentos: number;
  ingresosNetos: number;
  gastos: number;
  ivaTrasladado: number;
  ivaAcreditable: number;
  ivaRetenido: number;
  isrIngresosCobrados: number;
  isrDeducciones: number;
}

export interface IvaDetalleRow {
  rowId: string;
  uuid: string;
  cfdi: Cfdi;
  tipoFlujo: 'trasladado' | 'acreditable';
  fecha_fiscal: string;
  fecha_emision: string;
  base: number;
  iva: number;
  iva_retenido: number;
  proporcion: number;
  uuid_rep?: string;
  activo: boolean;
  motivo_exclusion?: string;
}

export interface IsrDetalleRow {
  rowId: string;
  uuid: string;
  cfdi: Cfdi;
  categoria: 'ingreso' | 'deduccion';
  fecha_fiscal: string;
  fecha_emision: string;
  monto: number;
  activo: boolean;
  excluido_automatico: boolean;
  motivo_exclusion?: string;
}

export interface ConciliacionTipoResumen {
  tipo: 'I' | 'E' | 'P';
  label: string;
  satCount: number;
  satMonto: number;
  portalCount: number;
  portalMonto: number;
  diffCount: number;
  diffMonto: number;
}

export interface ConciliacionDetalleItem {
  cfdi: Cfdi;
  estadoConciliacion: 'coincide' | 'solo_sat' | 'solo_portal';
}

// 13 indicadores predefinidos exactos de la Guía de Desarrollo (Fase 3)
export const PREDEFINED_INDICADORES: IndicadorDefinicion[] = [
  {
    id: 'ind-01',
    empresa_id: 'global',
    codigo: 'SUST_AMBOS_VIGENTES',
    nombre: 'Con sustitución, ambos vigentes',
    descripcion: 'CFDI emitido con relación 04 (Sustitución) cuyo comprobante original continúa vigente ante el SAT.',
    grupo: 'Integridad CFDI',
    aplica_emitidos: true,
    aplica_recibidos: false,
    es_predefinido: true,
    severidad: 'alta',
  },
  {
    id: 'ind-02',
    empresa_id: 'global',
    codigo: 'PAGO_MAYOR_INGRESO',
    nombre: 'Pago mayor al ingreso relacionado',
    descripcion: 'La suma de los pagos aplicados vía REP excede el total del CFDI PPD relacionado.',
    grupo: 'Complementos de pago',
    aplica_emitidos: true,
    aplica_recibidos: true,
    es_predefinido: true,
    severidad: 'alta',
  },
  {
    id: 'ind-03',
    empresa_id: 'global',
    codigo: 'PAGO_FUERA_PERIODO',
    nombre: 'Pagos fuera de periodo',
    descripcion: 'Complemento de pago (REP) emitido después del día 5 del mes siguiente a la fecha efectiva de pago.',
    grupo: 'Complementos de pago',
    aplica_emitidos: true,
    aplica_recibidos: true,
    es_predefinido: true,
    severidad: 'media',
  },
  {
    id: 'ind-04',
    empresa_id: 'global',
    codigo: 'PARCIALIDAD_REPETIDA',
    nombre: 'Parcialidad repetida',
    descripcion: 'Mismo UUID de documento relacionado y mismo número de parcialidad registrados en dos o más REPs.',
    grupo: 'Complementos de pago',
    aplica_emitidos: true,
    aplica_recibidos: true,
    es_predefinido: true,
    severidad: 'alta',
  },
  {
    id: 'ind-05',
    empresa_id: 'global',
    codigo: 'REGIMEN_DISTINTO',
    nombre: 'Régimen fiscal distinto',
    descripcion: 'El régimen fiscal asentado en el CFDI difiere del régimen vigente en la constancia fiscal de la empresa.',
    grupo: 'Integridad CFDI',
    aplica_emitidos: true,
    aplica_recibidos: true,
    es_predefinido: true,
    severidad: 'media',
  },
  {
    id: 'ind-06',
    empresa_id: 'global',
    codigo: 'RELACIONADO_EFOS',
    nombre: 'Relacionados con EFOS',
    descripcion: 'RFC de la contraparte localizado en los listados públicos del Art. 69-B del CFF (presunto o definitivo).',
    grupo: 'Riesgo fiscal (69-B)',
    aplica_emitidos: true,
    aplica_recibidos: true,
    es_predefinido: true,
    severidad: 'alta',
  },
  {
    id: 'ind-07',
    empresa_id: 'global',
    codigo: 'EFOS_DEFINITIVO',
    nombre: 'No desvirtuados (69-B definitivo)',
    descripcion: 'Proveedor recibido con publicación definitiva en lista 69-B; comprobantes sin validez para deducción.',
    grupo: 'Riesgo fiscal (69-B)',
    aplica_emitidos: false,
    aplica_recibidos: true,
    es_predefinido: true,
    severidad: 'alta',
  },
  {
    id: 'ind-08',
    empresa_id: 'global',
    codigo: 'REP_SIN_INGRESO',
    nombre: 'REP sin ingreso relacionado',
    descripcion: 'Complemento de pago emitido que referencia un UUID de documento inexistente en el repositorio.',
    grupo: 'Complementos de pago',
    aplica_emitidos: true,
    aplica_recibidos: false,
    es_predefinido: true,
    severidad: 'media',
  },
  {
    id: 'ind-09',
    empresa_id: 'global',
    codigo: 'REP_INGRESO_CANCELADO',
    nombre: 'REP con ingresos cancelados',
    descripcion: 'Complemento de pago emitido vigente ligado a un comprobante de ingreso cancelado ante el SAT.',
    grupo: 'Complementos de pago',
    aplica_emitidos: true,
    aplica_recibidos: false,
    es_predefinido: true,
    severidad: 'alta',
  },
  {
    id: 'ind-10',
    empresa_id: 'global',
    codigo: 'PUE_CON_REP',
    nombre: 'Ingreso PUE con REP',
    descripcion: 'Comprobante expedido con método de pago PUE al cual se le vinculó posteriormente un complemento de pago.',
    grupo: 'Complementos de pago',
    aplica_emitidos: true,
    aplica_recibidos: true,
    es_predefinido: true,
    severidad: 'media',
  },
  {
    id: 'ind-11',
    empresa_id: 'global',
    codigo: 'PUE_FORMA_99',
    nombre: 'Ingreso PUE forma 99',
    descripcion: 'CFDI con método de pago PUE que registró forma de pago "99 - Por definir" (inconsistencia de llenado SAT).',
    grupo: 'Deducciones y formas de pago',
    aplica_emitidos: true,
    aplica_recibidos: true,
    es_predefinido: true,
    severidad: 'media',
  },
  {
    id: 'ind-12',
    empresa_id: 'global',
    codigo: 'PUE_NO_BANCARIZADO',
    nombre: 'PUE no bancarizado',
    descripcion: 'CFDI recibido con método PUE pagado en efectivo (01) por monto superior a $2,000 MXN (no deducible Art. 27 LISR).',
    grupo: 'Deducciones y formas de pago',
    aplica_emitidos: false,
    aplica_recibidos: true,
    es_predefinido: true,
    severidad: 'alta',
  },
  {
    id: 'ind-13',
    empresa_id: 'global',
    codigo: 'USO_CFDI_S01',
    nombre: 'Uso CFDI S01',
    descripcion: 'CFDI recibido emitido con uso S01 (Sin efectos fiscales), requiere revisión antes de deducirlo.',
    grupo: 'Deducciones y formas de pago',
    aplica_emitidos: false,
    aplica_recibidos: true,
    es_predefinido: true,
    severidad: 'media',
  },
];

function getCompanyPortalCfdis(state: FiscalDatabaseState, empresaId: string): Cfdi[] {
  return state.cfdis.filter((c) => c.empresa_id === empresaId && !c.solo_en_sat);
}

function getAjuste(
  ajustes: ImpuestoAjuste[],
  empresaId: string,
  uuid: string,
  impuesto: 'iva' | 'isr',
  periodo: string,
): ImpuestoAjuste | undefined {
  return ajustes.find(
    (a) =>
      a.empresa_id === empresaId &&
      a.uuid === uuid &&
      a.impuesto === impuesto &&
      a.periodo === periodo,
  );
}

// =========================================================================
// IVA EN FLUJO (PUE en mes de emisión + PPD en mes del pago REP proporcional)
// =========================================================================
export function getIvaFlujoPeriodo(
  state: FiscalDatabaseState,
  empresaId: string,
  periodo: string,
): {
  trasladadoRows: IvaDetalleRow[];
  acreditableRows: IvaDetalleRow[];
  ivaTrasladado: number;
  ivaAcreditable: number;
  ivaRetenido: number;
  ivaACargo: number;
} {
  const cfdis = getCompanyPortalCfdis(state, empresaId);
  const cfdiByUuid = new Map(cfdis.map((c) => [c.uuid, c]));
  const pagos = state.pagos.filter((p) => p.empresa_id === empresaId);

  const trasladadoRows: IvaDetalleRow[] = [];
  const acreditableRows: IvaDetalleRow[] = [];

  for (const c of cfdis) {
    if (c.estatus_sat !== 'vigente') continue;
    if (c.tipo !== 'I' && c.tipo !== 'E') continue;
    if (c.iva_trasladado <= 0 && c.iva_retenido <= 0) continue;

    const sign = c.tipo === 'E' ? -1 : 1;
    const baseMxn = Number(((c.subtotal - c.descuento) * (c.moneda === 'MXN' ? 1 : c.tipo_cambio)).toFixed(2));
    const targetList = c.direccion === 'E' ? trasladadoRows : acreditableRows;
    const tipoFlujo = c.direccion === 'E' ? 'trasladado' : 'acreditable';

    if (c.metodo_pago === 'PUE' && c.fecha_fiscal.startsWith(periodo)) {
      const aj = getAjuste(state.ajustes, empresaId, c.uuid, 'iva', periodo);
      targetList.push({
        rowId: `${c.uuid}-pue`,
        uuid: c.uuid,
        cfdi: c,
        tipoFlujo,
        fecha_fiscal: c.fecha_fiscal,
        fecha_emision: c.fecha_emision,
        base: baseMxn * sign,
        iva: Number((c.iva_trasladado * sign).toFixed(2)),
        iva_retenido: Number((c.iva_retenido * sign).toFixed(2)),
        proporcion: 1,
        activo: aj ? aj.incluido : true,
        motivo_exclusion: aj && !aj.incluido ? aj.motivo : undefined,
      });
    } else if (c.metodo_pago === 'PPD') {
      const pagosPeriodo = pagos.filter((p) => {
        if (p.uuid_documento !== c.uuid) return false;
        if (!p.fecha_pago.startsWith(periodo)) return false;
        const rep = cfdiByUuid.get(p.uuid_pago);
        return !rep || rep.estatus_sat === 'vigente';
      });

      for (const p of pagosPeriodo) {
        const ratio = c.total > 0 ? Math.min(1, p.importe_pagado / c.total) : 0;
        const aj = getAjuste(state.ajustes, empresaId, c.uuid, 'iva', periodo);
        targetList.push({
          rowId: `${c.uuid}-${p.id}`,
          uuid: c.uuid,
          cfdi: c,
          tipoFlujo,
          fecha_fiscal: p.fecha_pago,
          fecha_emision: c.fecha_emision,
          base: Number((baseMxn * ratio * sign).toFixed(2)),
          iva: Number((c.iva_trasladado * ratio * sign).toFixed(2)),
          iva_retenido: Number((c.iva_retenido * ratio * sign).toFixed(2)),
          proporcion: ratio,
          uuid_rep: p.uuid_pago,
          activo: aj ? aj.incluido : true,
          motivo_exclusion: aj && !aj.incluido ? aj.motivo : undefined,
        });
      }
    }
  }

  const ivaTrasladado = Number(
    trasladadoRows.filter((r) => r.activo).reduce((s, r) => s + r.iva, 0).toFixed(2),
  );
  const ivaAcreditable = Number(
    acreditableRows.filter((r) => r.activo).reduce((s, r) => s + r.iva, 0).toFixed(2),
  );
  const ivaRetenido = Number(
    [...trasladadoRows, ...acreditableRows]
      .filter((r) => r.activo)
      .reduce((s, r) => s + r.iva_retenido, 0)
      .toFixed(2),
  );
  // Fórmula de la guía: IVA a cargo (o a favor) = trasladado − acreditable − retenido
  const ivaACargo = Number((ivaTrasladado - ivaAcreditable - ivaRetenido).toFixed(2));

  return {
    trasladadoRows,
    acreditableRows,
    ivaTrasladado,
    ivaAcreditable,
    ivaRetenido,
    ivaACargo,
  };
}

// =========================================================================
// ISR COBRADO Y DEDUCCIONES (v_isr_cobrado)
// Excluye automáticamente de deducciones: cancelados, uso S01 y 69-B definitivo
// =========================================================================
export function getIsrPeriodo(
  state: FiscalDatabaseState,
  empresaId: string,
  periodo: string,
): {
  ingresosRows: IsrDetalleRow[];
  deduccionesRows: IsrDetalleRow[];
  totalIngresos: number;
  totalDeducciones: number;
  baseEstimada: number;
} {
  const cfdis = getCompanyPortalCfdis(state, empresaId);
  const cfdiByUuid = new Map(cfdis.map((c) => [c.uuid, c]));
  const pagos = state.pagos.filter((p) => p.empresa_id === empresaId);
  const efosDefinitivos = new Set(
    state.lista_efos.filter((e) => e.situacion === 'Definitivo').map((e) => e.rfc.toUpperCase()),
  );

  const ingresosRows: IsrDetalleRow[] = [];
  const deduccionesRows: IsrDetalleRow[] = [];

  for (const c of cfdis) {
    if (c.tipo !== 'I' && c.tipo !== 'E') continue;
    const sign = c.tipo === 'E' ? -1 : 1;
    const subtotalMxn = Number(
      ((c.subtotal - c.descuento) * (c.moneda === 'MXN' ? 1 : c.tipo_cambio)).toFixed(2),
    );

    if (c.direccion === 'E') {
      if (c.estatus_sat !== 'vigente') continue;
      if (c.metodo_pago === 'PUE' && c.fecha_fiscal.startsWith(periodo)) {
        const aj = getAjuste(state.ajustes, empresaId, c.uuid, 'isr', periodo);
        ingresosRows.push({
          rowId: `${c.uuid}-isr-pue`,
          uuid: c.uuid,
          cfdi: c,
          categoria: 'ingreso',
          fecha_fiscal: c.fecha_fiscal,
          fecha_emision: c.fecha_emision,
          monto: subtotalMxn * sign,
          activo: aj ? aj.incluido : true,
          excluido_automatico: false,
          motivo_exclusion: aj && !aj.incluido ? aj.motivo : undefined,
        });
      } else if (c.metodo_pago === 'PPD') {
        const pagosPeriodo = pagos.filter((p) => {
          if (p.uuid_documento !== c.uuid || !p.fecha_pago.startsWith(periodo)) return false;
          const rep = cfdiByUuid.get(p.uuid_pago);
          return !rep || rep.estatus_sat === 'vigente';
        });
        for (const p of pagosPeriodo) {
          const ratio = c.total > 0 ? Math.min(1, p.importe_pagado / c.total) : 0;
          const aj = getAjuste(state.ajustes, empresaId, c.uuid, 'isr', periodo);
          ingresosRows.push({
            rowId: `${c.uuid}-isr-${p.id}`,
            uuid: c.uuid,
            cfdi: c,
            categoria: 'ingreso',
            fecha_fiscal: p.fecha_pago,
            fecha_emision: c.fecha_emision,
            monto: Number((subtotalMxn * ratio * sign).toFixed(2)),
            activo: aj ? aj.incluido : true,
            excluido_automatico: false,
            motivo_exclusion: aj && !aj.incluido ? aj.motivo : undefined,
          });
        }
      }
    } else {
      // Recibidos -> Deducciones (incluimos también los excluidos automáticamente del periodo para transparencia contable)
      let inPeriod = false;
      let ratio = 1;
      let fechaFiscal = c.fecha_fiscal;

      if (c.metodo_pago === 'PUE' && c.fecha_fiscal.startsWith(periodo)) {
        inPeriod = true;
      } else if (c.metodo_pago === 'PPD') {
        const pagoP = pagos.find(
          (p) => p.uuid_documento === c.uuid && p.fecha_pago.startsWith(periodo),
        );
        if (pagoP) {
          inPeriod = true;
          ratio = c.total > 0 ? Math.min(1, pagoP.importe_pagado / c.total) : 0;
          fechaFiscal = pagoP.fecha_pago;
        }
      }

      if (!inPeriod) continue;

      let autoReason: string | undefined;
      if (c.estatus_sat === 'cancelado') {
        autoReason = 'Excluido automáticamente: CFDI cancelado ante el SAT';
      } else if (c.uso_cfdi === 'S01') {
        autoReason = 'Excluido automáticamente: Uso CFDI S01 (Sin efectos fiscales)';
      } else if (efosDefinitivos.has(c.rfc_emisor.toUpperCase())) {
        autoReason = 'Excluido automáticamente: Proveedor en lista 69-B definitivo (EFOS)';
      }

      const aj = getAjuste(state.ajustes, empresaId, c.uuid, 'isr', periodo);
      const excluidoAuto = Boolean(autoReason);
      const activo = aj ? aj.incluido : !excluidoAuto;

      deduccionesRows.push({
        rowId: `${c.uuid}-ded`,
        uuid: c.uuid,
        cfdi: c,
        categoria: 'deduccion',
        fecha_fiscal: fechaFiscal,
        fecha_emision: c.fecha_emision,
        monto: Number((subtotalMxn * ratio * sign).toFixed(2)),
        activo,
        excluido_automatico: excluidoAuto,
        motivo_exclusion: !activo ? (aj?.motivo || autoReason) : undefined,
      });
    }
  }

  const totalIngresos = Number(
    ingresosRows.filter((r) => r.activo).reduce((s, r) => s + r.monto, 0).toFixed(2),
  );
  const totalDeducciones = Number(
    deduccionesRows.filter((r) => r.activo).reduce((s, r) => s + r.monto, 0).toFixed(2),
  );

  return {
    ingresosRows,
    deduccionesRows,
    totalIngresos,
    totalDeducciones,
    baseEstimada: Number((totalIngresos - totalDeducciones).toFixed(2)),
  };
}

// =========================================================================
// VISTA v_resumen_mensual (Ene - Dic del ejercicio seleccionado)
// Ingresos con base en lo devengado (PUE + PPD) para Dashboard
// =========================================================================
export function getResumenMensual(
  state: FiscalDatabaseState,
  empresaId: string,
  year = '2026',
): ResumenMensualRow[] {
  const cfdis = getCompanyPortalCfdis(state, empresaId);
  const meses = getMesesForYear(year);

  return meses.map((m) => {
    const mesCfdis = cfdis.filter(
      (c) => c.estatus_sat === 'vigente' && c.fecha_fiscal.startsWith(m.key),
    );

    const emitidosI = mesCfdis.filter((c) => c.direccion === 'E' && c.tipo === 'I');
    const emitidosE = mesCfdis.filter((c) => c.direccion === 'E' && c.tipo === 'E');
    const recibidosI = mesCfdis.filter((c) => c.direccion === 'R' && c.tipo === 'I');

    const ingresosBrutos = emitidosI.reduce(
      (s, c) => s + c.subtotal * (c.moneda === 'MXN' ? 1 : c.tipo_cambio),
      0,
    );
    const descuentos =
      emitidosI.reduce((s, c) => s + c.descuento * (c.moneda === 'MXN' ? 1 : c.tipo_cambio), 0) +
      emitidosE.reduce((s, c) => s + c.subtotal * (c.moneda === 'MXN' ? 1 : c.tipo_cambio), 0);

    const gastos = recibidosI.reduce(
      (s, c) => s + (c.subtotal - c.descuento) * (c.moneda === 'MXN' ? 1 : c.tipo_cambio),
      0,
    );

    const iva = getIvaFlujoPeriodo(state, empresaId, m.key);
    const isr = getIsrPeriodo(state, empresaId, m.key);

    return {
      periodo: m.key,
      mesCorto: m.corto,
      ingresos: Number(ingresosBrutos.toFixed(2)),
      descuentos: Number(descuentos.toFixed(2)),
      ingresosNetos: Number((ingresosBrutos - descuentos).toFixed(2)),
      gastos: Number(gastos.toFixed(2)),
      ivaTrasladado: iva.ivaTrasladado,
      ivaAcreditable: iva.ivaAcreditable,
      ivaRetenido: iva.ivaRetenido,
      isrIngresosCobrados: isr.totalIngresos,
      isrDeducciones: isr.totalDeducciones,
    };
  });
}

export function getConciliacionSat(
  state: FiscalDatabaseState,
  empresaId: string,
  options: {
    fechaIni: string;
    fechaFin: string;
    direccion: 'ALL' | 'E' | 'R';
    metodo: 'ALL' | 'PUE' | 'PPD';
    regimen: 'ALL' | string;
    soloHastaCorteSat: boolean;
  },
): {
  resumen: ConciliacionTipoResumen[];
  detalle: ConciliacionDetalleItem[];
} {
  const corteDate = state.fecha_corte_sat.slice(0, 10);

  const scoped = state.cfdis.filter((c) => {
    if (c.empresa_id !== empresaId) return false;
    if (c.tipo !== 'I' && c.tipo !== 'E' && c.tipo !== 'P') return false;
    if (c.fecha_fiscal < options.fechaIni || c.fecha_fiscal > options.fechaFin) return false;
    if (options.soloHastaCorteSat && c.fecha_fiscal > corteDate) return false;
    if (options.direccion !== 'ALL' && c.direccion !== options.direccion) return false;
    if (options.metodo !== 'ALL' && c.metodo_pago !== options.metodo) return false;
    if (
      options.regimen !== 'ALL' &&
      c.regimen_emisor !== options.regimen &&
      c.regimen_receptor !== options.regimen
    ) {
      return false;
    }
    return true;
  });

  const detalle: ConciliacionDetalleItem[] = scoped.map((c) => ({
    cfdi: c,
    estadoConciliacion: c.solo_en_sat
      ? 'solo_sat'
      : c.solo_en_portal
        ? 'solo_portal'
        : 'coincide',
  }));

  const tipos: Array<{ tipo: 'I' | 'E' | 'P'; label: string }> = [
    { tipo: 'I', label: 'Ingresos' },
    { tipo: 'E', label: 'Egresos' },
    { tipo: 'P', label: 'Pagos (REP)' },
  ];

  const resumen: ConciliacionTipoResumen[] = tipos.map(({ tipo, label }) => {
    const ofType = detalle.filter((d) => d.cfdi.tipo === tipo);
    const enSat = ofType.filter((d) => d.estadoConciliacion !== 'solo_portal');
    const enPortal = ofType.filter((d) => d.estadoConciliacion !== 'solo_sat');

    const satMonto = Number(enSat.reduce((s, d) => s + d.cfdi.total_mxn, 0).toFixed(2));
    const portalMonto = Number(enPortal.reduce((s, d) => s + d.cfdi.total_mxn, 0).toFixed(2));

    return {
      tipo,
      label,
      satCount: enSat.length,
      satMonto,
      portalCount: enPortal.length,
      portalMonto,
      diffCount: enSat.length - enPortal.length,
      diffMonto: Number((satMonto - portalMonto).toFixed(2)),
    };
  });

  return { resumen, detalle };
}

// =========================================================================
// EVALUADOR DE INDICADORES (13 predefinidos + personalizados)
// =========================================================================
function isPagoFueraDePeriodo(pago: CfdiPago): boolean {
  const fechaPago = new Date(`${pago.fecha_pago}T12:00:00`);
  const fechaRep = new Date(`${pago.fecha_emision_rep}T12:00:00`);
  if (Number.isNaN(fechaPago.getTime()) || Number.isNaN(fechaRep.getTime())) return false;
  // Límite SAT: día 5 del mes siguiente a la fecha del pago
  const limite = new Date(fechaPago.getFullYear(), fechaPago.getMonth() + 1, 5, 23, 59, 59);
  return fechaRep.getTime() > limite.getTime();
}

function matchCustomRule(cfdi: Cfdi, regla: ReglaFiltroPersonalizado): boolean {
  const rfcContraparte = cfdi.direccion === 'E' ? cfdi.rfc_receptor : cfdi.rfc_emisor;
  const regimenContraparte = cfdi.direccion === 'E' ? cfdi.regimen_receptor : cfdi.regimen_emisor;

  const rawValue: string | number =
    regla.campo === 'rfc_contraparte'
      ? rfcContraparte
      : regla.campo === 'regimen_contraparte'
        ? regimenContraparte
        : cfdi[regla.campo];

  const target = regla.valor.trim();

  if (typeof rawValue === 'number') {
    const numTarget = parseFloat(target);
    if (Number.isNaN(numTarget)) return false;
    switch (regla.operador) {
      case 'eq':
        return rawValue === numTarget;
      case 'neq':
        return rawValue !== numTarget;
      case 'gt':
        return rawValue > numTarget;
      case 'gte':
        return rawValue >= numTarget;
      case 'lt':
        return rawValue < numTarget;
      default:
        return String(rawValue).includes(target);
    }
  }

  const left = String(rawValue).toUpperCase();
  const right = target.toUpperCase();
  switch (regla.operador) {
    case 'eq':
      return left === right;
    case 'neq':
      return left !== right;
    case 'contains':
      return left.includes(right);
    default:
      return left === right;
  }
}

export function evaluateIndicadores(
  state: FiscalDatabaseState,
  empresa: Empresa,
  periodo: string,
): IndicadorResultado[] {
  const cfdis = getCompanyPortalCfdis(state, empresa.id);
  const cfdiByUuid = new Map(cfdis.map((c) => [c.uuid, c]));
  const relaciones = state.relaciones.filter((r) => r.empresa_id === empresa.id);
  const pagos = state.pagos.filter((p) => p.empresa_id === empresa.id);
  const efosMap = new Map<string, ListaEfosEntry>(
    state.lista_efos.map((e) => [e.rfc.toUpperCase(), e]),
  );

  const customForCompany = state.indicadores_custom.filter(
    (i) => i.empresa_id === empresa.id || i.empresa_id === 'global',
  );
  const allDefs = [...PREDEFINED_INDICADORES, ...customForCompany];

  const matchIdsForRule = (ind: IndicadorDefinicion): Set<string> => {
    const matched = new Set<string>();

    if (!ind.es_predefinido && ind.filtros && ind.filtros.length > 0) {
      for (const c of cfdis) {
        if (c.direccion === 'E' && !ind.aplica_emitidos) continue;
        if (c.direccion === 'R' && !ind.aplica_recibidos) continue;
        if (ind.filtros.every((f) => matchCustomRule(c, f))) {
          matched.add(c.uuid);
        }
      }
      return matched;
    }

    switch (ind.codigo) {
      case 'SUST_AMBOS_VIGENTES': {
        for (const r of relaciones) {
          if (r.tipo_relacion !== '04') continue;
          const sust = cfdiByUuid.get(r.uuid);
          const orig = cfdiByUuid.get(r.uuid_relacionado);
          if (
            sust &&
            orig &&
            sust.direccion === 'E' &&
            sust.estatus_sat === 'vigente' &&
            orig.estatus_sat === 'vigente'
          ) {
            matched.add(sust.uuid);
          }
        }
        break;
      }

      case 'PAGO_MAYOR_INGRESO': {
        const sumByDoc = new Map<string, number>();
        for (const p of pagos) {
          const rep = cfdiByUuid.get(p.uuid_pago);
          if (rep && rep.estatus_sat !== 'vigente') continue;
          sumByDoc.set(p.uuid_documento, (sumByDoc.get(p.uuid_documento) || 0) + p.importe_pagado);
        }
        for (const [docUuid, sumPagado] of sumByDoc.entries()) {
          const doc = cfdiByUuid.get(docUuid);
          if (doc && doc.metodo_pago === 'PPD' && sumPagado > doc.total + 0.01) {
            matched.add(doc.uuid);
          }
        }
        break;
      }

      case 'PAGO_FUERA_PERIODO': {
        for (const p of pagos) {
          if (isPagoFueraDePeriodo(p)) {
            const rep = cfdiByUuid.get(p.uuid_pago);
            if (rep && rep.estatus_sat === 'vigente') {
              matched.add(rep.uuid);
            }
          }
        }
        break;
      }

      case 'PARCIALIDAD_REPETIDA': {
        const seen = new Map<string, string[]>();
        for (const p of pagos) {
          const key = `${p.uuid_documento}#${p.num_parcialidad}`;
          const arr = seen.get(key) || [];
          arr.push(p.uuid_pago);
          seen.set(key, arr);
        }
        for (const repUuids of seen.values()) {
          if (repUuids.length > 1) {
            repUuids.forEach((u) => matched.add(u));
          }
        }
        break;
      }

      case 'REGIMEN_DISTINTO': {
        for (const c of cfdis) {
          const regEmpresa = c.direccion === 'E' ? c.regimen_emisor : c.regimen_receptor;
          if (regEmpresa && regEmpresa !== empresa.regimen) {
            matched.add(c.uuid);
          }
        }
        break;
      }

      case 'RELACIONADO_EFOS': {
        for (const c of cfdis) {
          const contraparte = c.direccion === 'E' ? c.rfc_receptor : c.rfc_emisor;
          if (efosMap.has(contraparte.toUpperCase())) {
            matched.add(c.uuid);
          }
        }
        break;
      }

      case 'EFOS_DEFINITIVO': {
        for (const c of cfdis) {
          if (c.direccion !== 'R') continue;
          const entry = efosMap.get(c.rfc_emisor.toUpperCase());
          if (entry && entry.situacion === 'Definitivo') {
            matched.add(c.uuid);
          }
        }
        break;
      }

      case 'REP_SIN_INGRESO': {
        for (const p of pagos) {
          const rep = cfdiByUuid.get(p.uuid_pago);
          if (rep && rep.direccion === 'E' && !cfdiByUuid.has(p.uuid_documento)) {
            matched.add(rep.uuid);
          }
        }
        break;
      }

      case 'REP_INGRESO_CANCELADO': {
        for (const p of pagos) {
          const rep = cfdiByUuid.get(p.uuid_pago);
          const doc = cfdiByUuid.get(p.uuid_documento);
          if (
            rep &&
            rep.direccion === 'E' &&
            rep.estatus_sat === 'vigente' &&
            doc &&
            doc.estatus_sat === 'cancelado'
          ) {
            matched.add(rep.uuid);
          }
        }
        break;
      }

      case 'PUE_CON_REP': {
        for (const p of pagos) {
          const doc = cfdiByUuid.get(p.uuid_documento);
          if (doc && doc.metodo_pago === 'PUE') {
            matched.add(doc.uuid);
          }
        }
        break;
      }

      case 'PUE_FORMA_99': {
        for (const c of cfdis) {
          if (c.tipo === 'I' && c.metodo_pago === 'PUE' && c.forma_pago === '99') {
            matched.add(c.uuid);
          }
        }
        break;
      }

      case 'PUE_NO_BANCARIZADO': {
        for (const c of cfdis) {
          if (
            c.direccion === 'R' &&
            c.tipo === 'I' &&
            c.metodo_pago === 'PUE' &&
            c.forma_pago === '01' &&
            c.total_mxn > 2000
          ) {
            matched.add(c.uuid);
          }
        }
        break;
      }

      case 'USO_CFDI_S01': {
        for (const c of cfdis) {
          if (c.direccion === 'R' && c.tipo === 'I' && c.uso_cfdi === 'S01') {
            matched.add(c.uuid);
          }
        }
        break;
      }
    }

    return matched;
  };

  const yearPrefix = periodo.slice(0, 4);

  return allDefs.map((indicador) => {
    const allUuids = Array.from(matchIdsForRule(indicador));
    const uuidsEjercicio = allUuids.filter((u) => {
      const c = cfdiByUuid.get(u);
      return c ? c.fecha_fiscal.startsWith(yearPrefix) : false;
    });
    const uuidsPeriodo = uuidsEjercicio.filter((u) => {
      const c = cfdiByUuid.get(u);
      return c ? c.fecha_fiscal.startsWith(periodo) : false;
    });

    return {
      indicador,
      uuids_periodo: uuidsPeriodo,
      uuids_ejercicio: uuidsEjercicio,
      conteo_periodo: uuidsPeriodo.length,
      conteo_ejercicio: uuidsEjercicio.length,
    };
  });
}

export function getPpdPendientesCobro(
  state: FiscalDatabaseState,
  empresaId: string,
): Array<{ cfdi: Cfdi; pagado: number; pendiente: number }> {
  const cfdis = getCompanyPortalCfdis(state, empresaId).filter(
    (c) => c.direccion === 'E' && c.tipo === 'I' && c.metodo_pago === 'PPD' && c.estatus_sat === 'vigente',
  );
  const pagos = state.pagos.filter((p) => p.empresa_id === empresaId);

  return cfdis
    .map((c) => {
      const pagado = pagos
        .filter((p) => p.uuid_documento === c.uuid)
        .reduce((s, p) => s + p.importe_pagado, 0);
      const pendiente = Math.max(0, Number((c.total - pagado).toFixed(2)));
      return { cfdi: c, pagado, pendiente };
    })
    .filter((item) => item.pendiente > 1);
}

export interface CedulaIvaPeriodo {
  trasladado: {
    actos16: number;
    actos8: number;
    actos0: number;
    actosExentos: number;
    actosNoObjeto: number;
    ivaCobrado16: number;
    ivaCobrado8: number;
    ivaCobradoTotal: number;
    ivaDevoluciones: number;
    retencionesIvaRealizadas: number;
    totalIvaTrasladado: number;
  };
  acreditable: {
    actosPagados16: number;
    actosPagados8: number;
    actosPagados0: number;
    actosPagadosExentos: number;
    actosPagadosNoObjeto: number;
    ivaPagado16: number;
    ivaPagado8: number;
    ivaPagadoTotal: number;
    ivaDevolucionesCompras: number;
    totalIvaAcreditable: number;
  };
  pagoDefinitivo: {
    totalIvaTrasladado: number;
    totalIvaAcreditable: number;
    ivaRetenidoAcreditable: number;
    ivaACargoOFavor: number;
    esACargo: boolean;
  };
  ivaRetenidoPorPagar: number;
}

export function getCedulaIvaPeriodo(
  state: FiscalDatabaseState,
  empresaId: string,
  periodo: string,
): CedulaIvaPeriodo {
  const ivaFlujo = getIvaFlujoPeriodo(state, empresaId, periodo);
  const cfdis = getCompanyPortalCfdis(state, empresaId);

  // Actos tasa 0% (ej. exportación USD-018 u otros CFDI tasa 0 cobrados en el periodo)
  const actos0Emitidos = cfdis
    .filter(
      (c) =>
        c.direccion === 'E' &&
        c.tipo === 'I' &&
        c.estatus_sat === 'vigente' &&
        c.iva_trasladado === 0 &&
        c.fecha_fiscal.startsWith(periodo),
    )
    .reduce((s, c) => s + (c.subtotal - c.descuento) * (c.moneda === 'MXN' ? 1 : c.tipo_cambio), 0);

  const actos0Recibidos = cfdis
    .filter(
      (c) =>
        c.direccion === 'R' &&
        c.tipo === 'I' &&
        c.estatus_sat === 'vigente' &&
        c.iva_trasladado === 0 &&
        c.fecha_fiscal.startsWith(periodo),
    )
    .reduce((s, c) => s + (c.subtotal - c.descuento) * (c.moneda === 'MXN' ? 1 : c.tipo_cambio), 0);

  const trasActivos = ivaFlujo.trasladadoRows.filter((r) => r.activo);
  const trasIngresos = trasActivos.filter((r) => r.cfdi.tipo === 'I');
  const trasEgresos = trasActivos.filter((r) => r.cfdi.tipo === 'E');

  const actos16 = Number(
    trasIngresos
      .filter((r) => r.base === 0 || Math.abs(r.iva / r.base) >= 0.12)
      .reduce((s, r) => s + r.base, 0)
      .toFixed(2),
  );
  const actos8 = Number(
    trasIngresos
      .filter((r) => r.base > 0 && Math.abs(r.iva / r.base) < 0.12)
      .reduce((s, r) => s + r.base, 0)
      .toFixed(2),
  );
  const ivaCobrado16 = Number(
    trasIngresos
      .filter((r) => r.base === 0 || Math.abs(r.iva / r.base) >= 0.12)
      .reduce((s, r) => s + r.iva, 0)
      .toFixed(2),
  );
  const ivaCobrado8 = Number(
    trasIngresos
      .filter((r) => r.base > 0 && Math.abs(r.iva / r.base) < 0.12)
      .reduce((s, r) => s + r.iva, 0)
      .toFixed(2),
  );
  const ivaCobradoTotal = Number((ivaCobrado16 + ivaCobrado8).toFixed(2));
  const ivaDevoluciones = Number(
    Math.abs(trasEgresos.reduce((s, r) => s + r.iva, 0)).toFixed(2),
  );
  const retencionesIvaRealizadas = Number(
    trasActivos.reduce((s, r) => s + Math.max(0, r.iva_retenido), 0).toFixed(2),
  );
  const totalIvaTrasladado = Number((ivaCobradoTotal - ivaDevoluciones).toFixed(2));

  const acredActivos = ivaFlujo.acreditableRows.filter((r) => r.activo);
  const acredGastos = acredActivos.filter((r) => r.cfdi.tipo === 'I');
  const acredEgresos = acredActivos.filter((r) => r.cfdi.tipo === 'E');

  const actosPagados16 = Number(
    acredGastos
      .filter((r) => r.base === 0 || Math.abs(r.iva / r.base) >= 0.12)
      .reduce((s, r) => s + r.base, 0)
      .toFixed(2),
  );
  const actosPagados8 = Number(
    acredGastos
      .filter((r) => r.base > 0 && Math.abs(r.iva / r.base) < 0.12)
      .reduce((s, r) => s + r.base, 0)
      .toFixed(2),
  );
  const ivaPagado16 = Number(
    acredGastos
      .filter((r) => r.base === 0 || Math.abs(r.iva / r.base) >= 0.12)
      .reduce((s, r) => s + r.iva, 0)
      .toFixed(2),
  );
  const ivaPagado8 = Number(
    acredGastos
      .filter((r) => r.base > 0 && Math.abs(r.iva / r.base) < 0.12)
      .reduce((s, r) => s + r.iva, 0)
      .toFixed(2),
  );
  const ivaPagadoTotal = Number((ivaPagado16 + ivaPagado8).toFixed(2));
  const ivaDevolucionesCompras = Number(
    Math.abs(acredEgresos.reduce((s, r) => s + r.iva, 0)).toFixed(2),
  );
  const totalIvaAcreditable = Number((ivaPagadoTotal - ivaDevolucionesCompras).toFixed(2));

  const ivaRetenidoPorPagar = Number(
    acredActivos.reduce((s, r) => s + Math.max(0, r.iva_retenido), 0).toFixed(2),
  );

  const ivaACargoOFavor = Number(
    (totalIvaTrasladado - totalIvaAcreditable - ivaFlujo.ivaRetenido).toFixed(2),
  );

  return {
    trasladado: {
      actos16,
      actos8,
      actos0: Number(actos0Emitidos.toFixed(2)),
      actosExentos: 0,
      actosNoObjeto: 0,
      ivaCobrado16,
      ivaCobrado8,
      ivaCobradoTotal,
      ivaDevoluciones,
      retencionesIvaRealizadas,
      totalIvaTrasladado,
    },
    acreditable: {
      actosPagados16,
      actosPagados8,
      actosPagados0: Number(actos0Recibidos.toFixed(2)),
      actosPagadosExentos: 0,
      actosPagadosNoObjeto: 0,
      ivaPagado16,
      ivaPagado8,
      ivaPagadoTotal,
      ivaDevolucionesCompras,
      totalIvaAcreditable,
    },
    pagoDefinitivo: {
      totalIvaTrasladado,
      totalIvaAcreditable,
      ivaRetenidoAcreditable: ivaFlujo.ivaRetenido,
      ivaACargoOFavor,
      esACargo: ivaACargoOFavor >= 0,
    },
    ivaRetenidoPorPagar,
  };
}

export interface TripleMontoIsr {
  anterior: number;
  periodo: number;
  acumulado: number;
}

export interface CedulaIsrPeriodo {
  ingresosNominales: {
    ingresosBrutos: TripleMontoIsr;
    disminucionIngresos: TripleMontoIsr;
    ingresosNetos: TripleMontoIsr;
    ingresosCobradosFlujo: TripleMontoIsr;
  };
  deduccionesAutorizadas: {
    gastos: TripleMontoIsr;
    devolucionesDescuentos: TripleMontoIsr;
    sueldosSalarios: TripleMontoIsr;
    totalDeducciones: TripleMontoIsr;
  };
  retencionesPorEnterar: {
    sueldosSalarios: number;
    asimiladosSalarios: number;
    serviciosProfesionales: number;
    arrendamiento: number;
    resico: number;
    otrasRetenciones: number;
    totalRetenciones: number;
  };
}

export function getCedulaIsrPeriodo(
  state: FiscalDatabaseState,
  empresaId: string,
  periodo: string,
): CedulaIsrPeriodo {
  const year = periodo.slice(0, 4);
  const meses = getMesesForYear(year);
  const cfdis = getCompanyPortalCfdis(state, empresaId);
  const targetIdx = meses.findIndex((m) => m.key === periodo);
  const activeMonths = meses.slice(0, targetIdx >= 0 ? targetIdx + 1 : 12);

  let antIngBrutos = 0;
  let perIngBrutos = 0;
  let antDisminucion = 0;
  let perDisminucion = 0;
  let antIngFlujo = 0;
  let perIngFlujo = 0;

  let antGastos = 0;
  let perGastos = 0;
  let antDevCompras = 0;
  let perDevCompras = 0;
  let antNomina = 0;
  let perNomina = 0;

  for (const m of activeMonths) {
    const isCurrent = m.key === periodo;
    const mesCfdis = cfdis.filter(
      (c) => c.estatus_sat === 'vigente' && c.fecha_fiscal.startsWith(m.key),
    );

    const emitidosI = mesCfdis.filter((c) => c.direccion === 'E' && c.tipo === 'I');
    const emitidosE = mesCfdis.filter((c) => c.direccion === 'E' && c.tipo === 'E');
    const emitidosN = mesCfdis.filter((c) => c.direccion === 'E' && c.tipo === 'N');

    const brutos = emitidosI.reduce(
      (s, c) => s + c.subtotal * (c.moneda === 'MXN' ? 1 : c.tipo_cambio),
      0,
    );
    const dism =
      emitidosI.reduce((s, c) => s + c.descuento * (c.moneda === 'MXN' ? 1 : c.tipo_cambio), 0) +
      emitidosE.reduce((s, c) => s + c.subtotal * (c.moneda === 'MXN' ? 1 : c.tipo_cambio), 0);

    const isrMes = getIsrPeriodo(state, empresaId, m.key);
    const activosDed = isrMes.deduccionesRows.filter((r) => r.activo);
    const gastosMes = activosDed
      .filter((r) => r.cfdi.tipo === 'I')
      .reduce((s, r) => s + r.monto, 0);
    const devComprasMes = Math.abs(
      activosDed.filter((r) => r.cfdi.tipo === 'E').reduce((s, r) => s + r.monto, 0),
    );
    const nominaMes = emitidosN.reduce(
      (s, c) => s + (c.nomina_info ? c.nomina_info.total_percepciones : c.subtotal),
      0,
    );

    if (isCurrent) {
      perIngBrutos = brutos;
      perDisminucion = dism;
      perIngFlujo = isrMes.totalIngresos;
      perGastos = gastosMes;
      perDevCompras = devComprasMes;
      perNomina = nominaMes;
    } else {
      antIngBrutos += brutos;
      antDisminucion += dism;
      antIngFlujo += isrMes.totalIngresos;
      antGastos += gastosMes;
      antDevCompras += devComprasMes;
      antNomina += nominaMes;
    }
  }

  const mkTriple = (ant: number, per: number): TripleMontoIsr => ({
    anterior: Number(ant.toFixed(2)),
    periodo: Number(per.toFixed(2)),
    acumulado: Number((ant + per).toFixed(2)),
  });

  // Retenciones de ISR por enterar del periodo seleccionado
  const mesVigentes = cfdis.filter(
    (c) => c.estatus_sat === 'vigente' && c.fecha_fiscal.startsWith(periodo),
  );
  const nominasMes = mesVigentes.filter((c) => c.direccion === 'E' && c.tipo === 'N');
  const retSueldos = Number(
    nominasMes
      .reduce((s, c) => s + (c.isr_retenido > 0 ? c.isr_retenido : 0), 0)
      .toFixed(2),
  );

  const recibidosConRet = mesVigentes.filter(
    (c) => c.direccion === 'R' && c.isr_retenido > 0,
  );
  const retResico = Number(
    recibidosConRet
      .filter((c) => c.regimen_emisor === '626')
      .reduce((s, c) => s + c.isr_retenido, 0)
      .toFixed(2),
  );
  const retServiciosProf = Number(
    recibidosConRet
      .filter((c) => c.regimen_emisor === '612')
      .reduce((s, c) => s + c.isr_retenido, 0)
      .toFixed(2),
  );
  const retOtras = Number(
    recibidosConRet
      .filter((c) => c.regimen_emisor !== '626' && c.regimen_emisor !== '612')
      .reduce((s, c) => s + c.isr_retenido, 0)
      .toFixed(2),
  );

  const totalRetenciones = Number(
    (retSueldos + retResico + retServiciosProf + retOtras).toFixed(2),
  );

  return {
    ingresosNominales: {
      ingresosBrutos: mkTriple(antIngBrutos, perIngBrutos),
      disminucionIngresos: mkTriple(antDisminucion, perDisminucion),
      ingresosNetos: mkTriple(antIngBrutos - antDisminucion, perIngBrutos - perDisminucion),
      ingresosCobradosFlujo: mkTriple(antIngFlujo, perIngFlujo),
    },
    deduccionesAutorizadas: {
      gastos: mkTriple(antGastos, perGastos),
      devolucionesDescuentos: mkTriple(antDevCompras, perDevCompras),
      sueldosSalarios: mkTriple(antNomina, perNomina),
      totalDeducciones: mkTriple(
        antGastos - antDevCompras + antNomina,
        perGastos - perDevCompras + perNomina,
      ),
    },
    retencionesPorEnterar: {
      sueldosSalarios: retSueldos,
      asimiladosSalarios: 0,
      serviciosProfesionales: retServiciosProf,
      arrendamiento: 0,
      resico: retResico,
      otrasRetenciones: retOtras,
      totalRetenciones,
    },
  };
}

// =========================================================================
// INDICADORES FINANCIEROS Y COMERCIALES (Ventas, Compras, Nómina, Top 5, Aging)
// =========================================================================
export interface TopContraparteRow {
  rank: number;
  nombre: string;
  rfc: string;
  flujoMonto: number; // Total cobrado o pagado
  pendienteMonto: number; // Pendiente por cobrar o pagar
  totalFacturado: number;
}

export interface AgingSaldos {
  total: number;
  hasta30: number;
  de31a60: number;
  de61a90: number;
  masDe90: number;
}

export interface IndicadoresFinancierosData {
  ventas: {
    ventasBrutas: number;
    ventasBrutasPct: number;
    descuentos: number;
    descuentosPct: number;
    ventasNetas: number;
    ventasNetasPct: number;
  };
  compras: {
    comprasBrutas: number;
    comprasBrutasPct: number;
    descuentos: number;
    descuentosPct: number;
    comprasNetas: number;
    comprasNetasPct: number;
  };
  nomina: {
    empleados: number;
    empleadosPct: number;
    percepciones: number;
    percepcionesPct: number;
    deducciones: number;
    deduccionesPct: number;
    otrosPagos: number;
    otrosPagosPct: number;
    sueldosNetos: number;
    sueldosNetosPct: number;
  };
  serieAnual: Array<{
    periodo: string;
    mesCorto: string;
    ventasNetas: number;
    comprasNetas: number;
    ventasPct: number;
    comprasPct: number;
  }>;
  topClientes: TopContraparteRow[];
  topProveedores: TopContraparteRow[];
  cuentasPorCobrar: { todos: AgingSaldos; mes: AgingSaldos };
  cuentasPorPagar: { todos: AgingSaldos; mes: AgingSaldos };
}

function calcPctDiff(curr: number, prev: number): number {
  if (Math.abs(prev) < 0.01) return curr > 0 ? 100 : 0;
  return Number((((curr - prev) / prev) * 100).toFixed(2));
}

export function getIndicadoresFinancieros(
  state: FiscalDatabaseState,
  empresaId: string,
  periodo: string,
  criterio: 'flujo' | 'facturado' = 'flujo',
): IndicadoresFinancierosData {
  const year = periodo.slice(0, 4);
  const meses = getMesesForYear(year);
  const cfdis = getCompanyPortalCfdis(state, empresaId).filter(
    (c) => c.estatus_sat === 'vigente',
  );
  const pagos = state.pagos.filter((p) => p.empresa_id === empresaId);

  const calcMonthMetrics = (mesKey: string) => {
    const mesCfdis = cfdis.filter((c) => c.fecha_fiscal.startsWith(mesKey));
    const emitidosI = mesCfdis.filter((c) => c.direccion === 'E' && c.tipo === 'I');
    const emitidosE = mesCfdis.filter((c) => c.direccion === 'E' && c.tipo === 'E');
    const recibidosI = mesCfdis.filter((c) => c.direccion === 'R' && c.tipo === 'I');
    const recibidosE = mesCfdis.filter((c) => c.direccion === 'R' && c.tipo === 'E');
    const nominas = mesCfdis.filter((c) => c.direccion === 'E' && c.tipo === 'N');

    let ventasBrutas = 0;
    let descuentosVentas =
      emitidosI.reduce((s, c) => s + c.descuento * (c.moneda === 'MXN' ? 1 : c.tipo_cambio), 0) +
      emitidosE.reduce((s, c) => s + c.subtotal * (c.moneda === 'MXN' ? 1 : c.tipo_cambio), 0);

    let comprasBrutas = 0;
    let descuentosCompras =
      recibidosI.reduce((s, c) => s + c.descuento * (c.moneda === 'MXN' ? 1 : c.tipo_cambio), 0) +
      recibidosE.reduce((s, c) => s + c.subtotal * (c.moneda === 'MXN' ? 1 : c.tipo_cambio), 0);

    if (criterio === 'facturado') {
      ventasBrutas = emitidosI.reduce(
        (s, c) => s + c.subtotal * (c.moneda === 'MXN' ? 1 : c.tipo_cambio),
        0,
      );
      comprasBrutas = recibidosI.reduce(
        (s, c) => s + c.subtotal * (c.moneda === 'MXN' ? 1 : c.tipo_cambio),
        0,
      );
    } else {
      const isr = getIsrPeriodo(state, empresaId, mesKey);
      ventasBrutas = isr.totalIngresos + descuentosVentas;
      comprasBrutas = isr.totalDeducciones + descuentosCompras;
    }

    const ventasNetas = Math.max(0, Number((ventasBrutas - descuentosVentas).toFixed(2)));
    const comprasNetas = Math.max(0, Number((comprasBrutas - descuentosCompras).toFixed(2)));

    const percepciones = nominas.reduce(
      (s, c) => s + (c.nomina_info ? c.nomina_info.total_percepciones : c.subtotal),
      0,
    );
    const deducciones = nominas.reduce(
      (s, c) => s + (c.nomina_info ? c.nomina_info.total_deducciones : c.descuento),
      0,
    );
    const otrosPagos = nominas.reduce(
      (s, c) => s + (c.nomina_info ? c.nomina_info.total_otros_pagos : 0),
      0,
    );
    const sueldosNetos = Number((percepciones - deducciones + otrosPagos).toFixed(2));
    const empleadosSet = new Set(
      nominas
        .map((c) => c.nomina_info?.curp || c.nomina_info?.num_empleado || c.rfc_receptor)
        .filter(Boolean),
    );
    const empleados = empleadosSet.size;

    return {
      ventasBrutas: Number(ventasBrutas.toFixed(2)),
      descuentosVentas: Number(descuentosVentas.toFixed(2)),
      ventasNetas,
      comprasBrutas: Number(comprasBrutas.toFixed(2)),
      descuentosCompras: Number(descuentosCompras.toFixed(2)),
      comprasNetas,
      empleados,
      percepciones: Number(percepciones.toFixed(2)),
      deducciones: Number(deducciones.toFixed(2)),
      otrosPagos: Number(otrosPagos.toFixed(2)),
      sueldosNetos,
    };
  };

  const currIdx = Math.max(0, meses.findIndex((m) => m.key === periodo));
  const prevKey = currIdx > 0 ? meses[currIdx - 1].key : meses[0].key;
  const currM = calcMonthMetrics(periodo);
  const prevM = calcMonthMetrics(prevKey);

  const rawAnual = meses.map((m) => ({
    periodo: m.key,
    mesCorto: m.corto,
    ...calcMonthMetrics(m.key),
  }));
  const maxAnual = Math.max(
    1,
    ...rawAnual.map((r) => Math.max(r.ventasNetas, r.comprasNetas)),
  );

  const serieAnual = rawAnual.map((r) => ({
    periodo: r.periodo,
    mesCorto: r.mesCorto,
    ventasNetas: r.ventasNetas,
    comprasNetas: r.comprasNetas,
    ventasPct: Number(((r.ventasNetas / maxAnual) * 100).toFixed(1)),
    comprasPct: Number(((r.comprasNetas / maxAnual) * 100).toFixed(1)),
  }));

  // Top 5 Clientes y Top 5 Proveedores (del ejercicio hasta el periodo o del periodo si tiene datos)
  const buildTop5 = (dir: 'E' | 'R'): TopContraparteRow[] => {
    const scopeCfdis = cfdis.filter(
      (c) =>
        c.direccion === dir &&
        c.tipo === 'I' &&
        c.fecha_fiscal.startsWith(year) &&
        c.fecha_fiscal <= `${periodo}-31`,
    );
    const map = new Map<
      string,
      { nombre: string; rfc: string; cobrado: number; pendiente: number; facturado: number }
    >();

    for (const c of scopeCfdis) {
      const rfc = dir === 'E' ? c.rfc_receptor : c.rfc_emisor;
      const nombre = dir === 'E' ? c.nombre_receptor : c.nombre_emisor;
      const totalMxn = c.total_mxn;

      let cobrado = totalMxn;
      let pendiente = 0;
      if (c.metodo_pago === 'PPD') {
        const pagadoDoc = pagos
          .filter((p) => p.uuid_documento === c.uuid)
          .reduce((s, p) => s + p.importe_pagado, 0);
        cobrado = Math.min(totalMxn, pagadoDoc);
        pendiente = Math.max(0, Number((totalMxn - cobrado).toFixed(2)));
      }

      const prev = map.get(rfc) || {
        nombre,
        rfc,
        cobrado: 0,
        pendiente: 0,
        facturado: 0,
      };
      prev.cobrado = Number((prev.cobrado + cobrado).toFixed(2));
      prev.pendiente = Number((prev.pendiente + pendiente).toFixed(2));
      prev.facturado = Number((prev.facturado + totalMxn).toFixed(2));
      map.set(rfc, prev);
    }

    return Array.from(map.values())
      .sort((a, b) => b.facturado - a.facturado)
      .slice(0, 5)
      .map((item, idx) => ({
        rank: idx + 1,
        nombre: item.nombre,
        rfc: item.rfc,
        flujoMonto: item.cobrado,
        pendienteMonto: item.pendiente,
        totalFacturado: item.facturado,
      }));
  };

  // Antigüedad de saldos (Cuentas por cobrar y Cuentas por pagar)
  const buildAging = (dir: 'E' | 'R', onlyMonth: boolean): AgingSaldos => {
    const refDate = new Date();
    const ppdList = cfdis.filter(
      (c) =>
        c.direccion === dir &&
        c.tipo === 'I' &&
        c.metodo_pago === 'PPD' &&
        (onlyMonth ? c.fecha_fiscal.startsWith(periodo) : c.fecha_fiscal.startsWith(year)),
    );

    let hasta30 = 0;
    let de31a60 = 0;
    let de61a90 = 0;
    let masDe90 = 0;

    for (const c of ppdList) {
      const pagado = pagos
        .filter((p) => p.uuid_documento === c.uuid)
        .reduce((s, p) => s + p.importe_pagado, 0);
      const saldo = Math.max(0, Number((c.total_mxn - pagado).toFixed(2)));
      if (saldo <= 1) continue;

      const emision = new Date(`${c.fecha_fiscal}T12:00:00`);
      const dias = Math.max(
        1,
        Math.round((refDate.getTime() - emision.getTime()) / (1000 * 60 * 60 * 24)),
      );
      if (dias <= 30) hasta30 += saldo;
      else if (dias <= 60) de31a60 += saldo;
      else if (dias <= 90) de61a90 += saldo;
      else masDe90 += saldo;
    }

    const total = Number((hasta30 + de31a60 + de61a90 + masDe90).toFixed(2));
    return {
      total,
      hasta30: Number(hasta30.toFixed(2)),
      de31a60: Number(de31a60.toFixed(2)),
      de61a90: Number(de61a90.toFixed(2)),
      masDe90: Number(masDe90.toFixed(2)),
    };
  };

  return {
    ventas: {
      ventasBrutas: currM.ventasBrutas,
      ventasBrutasPct: calcPctDiff(currM.ventasBrutas, prevM.ventasBrutas),
      descuentos: currM.descuentosVentas,
      descuentosPct: calcPctDiff(currM.descuentosVentas, prevM.descuentosVentas),
      ventasNetas: currM.ventasNetas,
      ventasNetasPct: calcPctDiff(currM.ventasNetas, prevM.ventasNetas),
    },
    compras: {
      comprasBrutas: currM.comprasBrutas,
      comprasBrutasPct: calcPctDiff(currM.comprasBrutas, prevM.comprasBrutas),
      descuentos: currM.descuentosCompras,
      descuentosPct: calcPctDiff(currM.descuentosCompras, prevM.descuentosCompras),
      comprasNetas: currM.comprasNetas,
      comprasNetasPct: calcPctDiff(currM.comprasNetas, prevM.comprasNetas),
    },
    nomina: {
      empleados: currM.empleados,
      empleadosPct: calcPctDiff(currM.empleados, prevM.empleados),
      percepciones: currM.percepciones,
      percepcionesPct: calcPctDiff(currM.percepciones, prevM.percepciones),
      deducciones: currM.deducciones,
      deduccionesPct: calcPctDiff(currM.deducciones, prevM.deducciones),
      otrosPagos: currM.otrosPagos,
      otrosPagosPct: calcPctDiff(currM.otrosPagos, prevM.otrosPagos),
      sueldosNetos: currM.sueldosNetos,
      sueldosNetosPct: calcPctDiff(currM.sueldosNetos, prevM.sueldosNetos),
    },
    serieAnual,
    topClientes: buildTop5('E'),
    topProveedores: buildTop5('R'),
    cuentasPorCobrar: {
      todos: buildAging('E', false),
      mes: buildAging('E', true),
    },
    cuentasPorPagar: {
      todos: buildAging('R', false),
      mes: buildAging('R', true),
    },
  };
}

// =========================================================================
// VISOR SAT AUDITORÍA: COMPARATIVA INGRESOS NOMINALES, IVA Y ALERTAS LADO A LADO
// =========================================================================
export interface AlertaSideBucket {
  count: number;
  subtotal: number;
  iva: number;
  total: number;
  uuids: string[];
}

export interface AlertaFiscalComparativaRow {
  codigo: string;
  titulo: string;
  descripcion: string;
  emitidos: AlertaSideBucket;
  recibidos: AlertaSideBucket;
}

export interface VisorSatAuditoriaData {
  declaracion: {
    presentada: boolean;
    fechaPresentacion: string;
    mensaje: string;
  };
  ingresosNominales: {
    pagosProvisionalesSat: number;
    visorFacturasSat: number;
    calculoPortal: number;
    discrepanciaVisor: number;
  };
  ivaComparativa: {
    visorSatTrasladado: number;
    portalTrasladado: number;
    discrepanciaTrasladado: number;
    visorSatAcreditable: number;
    portalAcreditable: number;
    discrepanciaAcreditable: number;
  };
  alertasComparativas: AlertaFiscalComparativaRow[];
}

export function getVisorSatAuditoria(
  state: FiscalDatabaseState,
  empresa: Empresa,
  periodo: string,
): VisorSatAuditoriaData {
  // Todos los CFDIs vigentes de la empresa en el periodo (incluyendo solo_en_sat para simular Visor SAT)
  const allPeriodCfdis = state.cfdis.filter(
    (c) =>
      c.empresa_id === empresa.id &&
      c.estatus_sat === 'vigente' &&
      c.fecha_fiscal.startsWith(periodo),
  );
  const satCfdis = allPeriodCfdis.filter((c) => !c.solo_en_portal);
  const portalCfdis = allPeriodCfdis.filter((c) => !c.solo_en_sat);

  const calcNominal = (list: Cfdi[]) => {
    const ing = list
      .filter((c) => c.direccion === 'E' && c.tipo === 'I')
      .reduce((s, c) => s + (c.subtotal - c.descuento) * (c.moneda === 'MXN' ? 1 : c.tipo_cambio), 0);
    const egr = list
      .filter((c) => c.direccion === 'E' && c.tipo === 'E')
      .reduce((s, c) => s + c.subtotal * (c.moneda === 'MXN' ? 1 : c.tipo_cambio), 0);
    return Number((ing - egr).toFixed(2));
  };

  const visorFacturasSat = calcNominal(satCfdis);
  const calculoPortal = calcNominal(portalCfdis);
  const pagosProvisionalesSat = Math.round(visorFacturasSat);
  const discrepanciaVisor = Number((calculoPortal - visorFacturasSat).toFixed(2));

  // Comparativa IVA SAT vs Portal
  const ivaPortal = getIvaFlujoPeriodo(state, empresa.id, periodo);
  const soloSatEmitidosIva = satCfdis
    .filter((c) => c.solo_en_sat && c.direccion === 'E' && c.tipo === 'I')
    .reduce((s, c) => s + c.iva_trasladado, 0);
  const soloSatRecibidosIva = satCfdis
    .filter((c) => c.solo_en_sat && c.direccion === 'R' && c.tipo === 'I')
    .reduce((s, c) => s + c.iva_trasladado, 0);

  const visorSatTrasladado = Number((ivaPortal.ivaTrasladado + soloSatEmitidosIva).toFixed(2));
  const visorSatAcreditable = Number((ivaPortal.ivaAcreditable + soloSatRecibidosIva).toFixed(2));

  // Alertas fiscales encontradas lado a lado (evaluadas sobre el ejercicio o periodo activo)
  const yearPrefix = periodo.slice(0, 4);
  const scopeAlertCfdis = state.cfdis.filter(
    (c) =>
      c.empresa_id === empresa.id &&
      !c.solo_en_sat &&
      c.estatus_sat === 'vigente' &&
      c.fecha_fiscal.startsWith(yearPrefix),
  );
  const efosSet = new Set(state.lista_efos.map((e) => e.rfc.toUpperCase()));
  const pagos = state.pagos.filter((p) => p.empresa_id === empresa.id);

  const buildBucket = (items: Cfdi[]): AlertaSideBucket => ({
    count: items.length,
    subtotal: Number(
      items
        .reduce((s, c) => s + (c.subtotal - c.descuento) * (c.moneda === 'MXN' ? 1 : c.tipo_cambio), 0)
        .toFixed(2),
    ),
    iva: Number(items.reduce((s, c) => s + c.iva_trasladado, 0).toFixed(2)),
    total: Number(items.reduce((s, c) => s + c.total_mxn, 0).toFixed(2)),
    uuids: items.map((c) => c.uuid),
  });

  // Regla 1: Forma de pago 99 por definir en PUE
  const r1 = scopeAlertCfdis.filter((c) => c.metodo_pago === 'PUE' && c.forma_pago === '99');

  // Regla 2: Emitidos/Recibidos PUE al final del mes (día >= 25)
  const r2 = scopeAlertCfdis.filter((c) => {
    if (c.metodo_pago !== 'PUE' || c.tipo !== 'I') return false;
    const day = parseInt(c.fecha_fiscal.slice(8, 10), 10);
    return day >= 25;
  });

  // Regla 3: Operaciones con EFOS (69-B)
  const r3 = scopeAlertCfdis.filter((c) => {
    const rfcCp = c.direccion === 'E' ? c.rfc_receptor : c.rfc_emisor;
    return efosSet.has(rfcCp.toUpperCase());
  });

  // Regla 4: Pagos (REP) con fecha de pago de otro mes / fuera de plazo
  const repFueraUuids = new Set(
    pagos
      .filter(
        (p) =>
          p.fecha_pago.slice(0, 7) !== p.fecha_emision_rep.slice(0, 7) || isPagoFueraDePeriodo(p),
      )
      .map((p) => p.uuid_pago),
  );
  const r4 = scopeAlertCfdis.filter((c) => repFueraUuids.has(c.uuid));

  const alertasComparativas: AlertaFiscalComparativaRow[] = [
    {
      codigo: 'FORMA_99',
      titulo: 'Forma de pago 99 por definir',
      descripcion: 'Comprobantes PUE timbrados con clave 99 (riesgo de no deducibilidad / llenado).',
      emitidos: buildBucket(r1.filter((c) => c.direccion === 'E')),
      recibidos: buildBucket(r1.filter((c) => c.direccion === 'R')),
    },
    {
      codigo: 'PUE_FIN_MES',
      titulo: 'Comprobantes PUE al final del mes',
      descripcion: 'Facturas PUE expedidas en los últimos días del mes que podrían no estar cobradas/pagadas en el mismo periodo.',
      emitidos: buildBucket(r2.filter((c) => c.direccion === 'E')),
      recibidos: buildBucket(r2.filter((c) => c.direccion === 'R')),
    },
    {
      codigo: 'EFOS_69B',
      titulo: 'Operaciones con EFOS (Art. 69-B)',
      descripcion: 'Comprobantes celebrados con RFCs incluidos en el listado 69-B del SAT.',
      emitidos: buildBucket(r3.filter((c) => c.direccion === 'E')),
      recibidos: buildBucket(r3.filter((c) => c.direccion === 'R')),
    },
    {
      codigo: 'PAGOS_OTRO_MES',
      titulo: 'Pagos con fecha de pago de otro mes',
      descripcion: 'Complementos de pago (REP) cuya fecha de emisión corresponde a un mes distinto al flujo efectivo.',
      emitidos: buildBucket(r4.filter((c) => c.direccion === 'E')),
      recibidos: buildBucket(r4.filter((c) => c.direccion === 'R')),
    },
  ];

  const [yStr, mStr] = periodo.split('-');
  const mNum = parseInt(mStr || '1', 10);
  const nextMonth = mNum === 12 ? 1 : mNum + 1;
  const nextYear = mNum === 12 ? parseInt(yStr, 10) + 1 : parseInt(yStr, 10);
  const fechaLimite = `17/${String(nextMonth).padStart(2, '0')}/${nextYear}`;
  const hasPeriodData = allPeriodCfdis.length > 0;

  return {
    declaracion: {
      presentada: false,
      fechaPresentacion: hasPeriodData ? fechaLimite : '—',
      mensaje: hasPeriodData
        ? `Período en pre-determinación · Fecha límite SAT: ${fechaLimite}`
        : 'Sin comprobantes ni información SAT cargada para este período',
    },
    ingresosNominales: {
      pagosProvisionalesSat,
      visorFacturasSat,
      calculoPortal,
      discrepanciaVisor,
    },
    ivaComparativa: {
      visorSatTrasladado,
      portalTrasladado: ivaPortal.ivaTrasladado,
      discrepanciaTrasladado: Number((ivaPortal.ivaTrasladado - visorSatTrasladado).toFixed(2)),
      visorSatAcreditable,
      portalAcreditable: ivaPortal.ivaAcreditable,
      discrepanciaAcreditable: Number((ivaPortal.ivaAcreditable - visorSatAcreditable).toFixed(2)),
    },
    alertasComparativas,
  };
}

// =========================================================================
// EFECTO EN IMPUESTOS Y VALIDACIONES POR FILA DE CFDI (Gestor de CFDIs)
// =========================================================================
export interface CfdiRowTaxMeta {
  efectoEstado: 'con_efecto' | 'sin_efecto' | 'con_alertas';
  efectoLabel: string;
  efectoDetalle: string;
  validaciones: Array<{ label: string; variant: 'warning' | 'danger' | 'info' }>;
  asociadosCount: number;
}

export function getCfdiRowTaxAndAlerts(
  state: FiscalDatabaseState,
  empresa: Empresa,
  cfdi: Cfdi,
): CfdiRowTaxMeta {
  const validaciones: Array<{ label: string; variant: 'warning' | 'danger' | 'info' }> = [];
  const efosMap = new Map(state.lista_efos.map((e) => [e.rfc.toUpperCase(), e]));
  const cpRfc = (cfdi.direccion === 'E' ? cfdi.rfc_receptor : cfdi.rfc_emisor).toUpperCase();

  if (cfdi.metodo_pago === 'PUE' && cfdi.forma_pago === '99') {
    validaciones.push({ label: 'Por definir (99)', variant: 'warning' });
  }
  const day = parseInt(cfdi.fecha_fiscal.slice(8, 10), 10);
  if (cfdi.metodo_pago === 'PUE' && cfdi.tipo === 'I' && day >= 25) {
    validaciones.push({ label: 'PUE fin de mes', variant: 'info' });
  }
  if (efosMap.has(cpRfc)) {
    validaciones.push({ label: 'EFOS 69-B', variant: 'danger' });
  }
  if (cfdi.direccion === 'R' && cfdi.uso_cfdi === 'S01') {
    validaciones.push({ label: 'Uso S01', variant: 'warning' });
  }
  if (
    cfdi.direccion === 'R' &&
    cfdi.metodo_pago === 'PUE' &&
    cfdi.forma_pago === '01' &&
    cfdi.total_mxn > 2000
  ) {
    validaciones.push({ label: 'Efectivo > $2,000', variant: 'danger' });
  }

  const pagosRel = state.pagos.filter(
    (p) => p.uuid_documento === cfdi.uuid || p.uuid_pago === cfdi.uuid,
  );
  if (
    cfdi.tipo === 'P' &&
    pagosRel.some(
      (p) => p.fecha_pago.slice(0, 7) !== p.fecha_emision_rep.slice(0, 7) || isPagoFueraDePeriodo(p),
    )
  ) {
    validaciones.push({ label: 'Pagos de otro mes', variant: 'warning' });
  }

  const relCount = state.relaciones.filter(
    (r) => r.uuid === cfdi.uuid || r.uuid_relacionado === cfdi.uuid,
  ).length;
  const asociadosCount = relCount + pagosRel.length;

  // Determinar efecto en impuestos
  if (cfdi.estatus_sat === 'cancelado') {
    return {
      efectoEstado: 'sin_efecto',
      efectoLabel: 'Sin efecto',
      efectoDetalle: 'Comprobante cancelado ante el SAT; no acumula en IVA ni ISR.',
      validaciones,
      asociadosCount,
    };
  }

  if (cfdi.tipo === 'T') {
    return {
      efectoEstado: 'sin_efecto',
      efectoLabel: 'Sin efecto',
      efectoDetalle: 'CFDI de Traslado / Carta Porte (comprobante logístico informativo sin impacto en IVA/ISR).',
      validaciones,
      asociadosCount,
    };
  }

  if (
    cfdi.direccion === 'R' &&
    (cfdi.uso_cfdi === 'S01' || efosMap.get(cpRfc)?.situacion === 'Definitivo')
  ) {
    return {
      efectoEstado: 'con_alertas',
      efectoLabel: 'Con alertas',
      efectoDetalle:
        'Excluido automáticamente de deducciones ISR por regla fiscal (Uso S01 o proveedor en lista 69-B definitivo).',
      validaciones,
      asociadosCount,
    };
  }

  if (cfdi.metodo_pago === 'PPD' && pagosRel.length === 0) {
    return {
      efectoEstado: 'sin_efecto',
      efectoLabel: 'Pendiente REP',
      efectoDetalle:
        'Acumula en ingresos nominales devengados, pero su IVA e ISR en flujo se activan al recibir el Complemento de Pago (REP).',
      validaciones,
      asociadosCount,
    };
  }

  if (validaciones.some((v) => v.variant === 'danger' || v.variant === 'warning')) {
    return {
      efectoEstado: 'con_alertas',
      efectoLabel: 'Con alertas',
      efectoDetalle: `Incluido en pre-determinación de ${cfdi.direccion === 'E' ? 'IVA Trasladado e ISR Ingresos' : 'IVA Acreditable e ISR Deducciones'}, con ${validaciones.length} observación(es) de auditoría.`,
      validaciones,
      asociadosCount,
    };
  }

  return {
    efectoEstado: 'con_efecto',
    efectoLabel: 'Explorar efecto',
    efectoDetalle:
      cfdi.tipo === 'P'
        ? `Complemento de Pago (REP): acredita flujo efectivo para IVA e ISR sobre ${pagosRel.length} factura(s) PPD.`
        : cfdi.tipo === 'N'
          ? 'CFDI de Nómina: acumula como deducción por sueldos y salarios y retención de ISR por enterar.'
          : cfdi.direccion === 'E'
            ? 'Acumula al 100% en Ingresos Nominales, Ingresos Cobrados ISR e IVA Trasladado del periodo.'
            : 'Acumula al 100% en Deducciones Autorizadas ISR e IVA Acreditable del periodo.',
    validaciones,
    asociadosCount,
  };
}
