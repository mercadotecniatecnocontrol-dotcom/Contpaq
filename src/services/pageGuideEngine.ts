import type {
  Empresa,
  FiscalDatabaseState,
  FiscalRoute,
} from '../types/fiscal';
import type { AssistantAction, AssistantMessage, AssistantTableData } from './assistantEngine';
import {
  evaluateIndicadores,
  getCedulaIsrPeriodo,
  getCedulaIvaPeriodo,
  getIndicadoresFinancieros,
  getIsrPeriodo,
  getIvaFlujoPeriodo,
  getPpdPendientesCobro,
  getVisorSatAuditoria,
} from './fiscalCalculations';
import { basicNormalize } from './nluEngine';
import { daysUntil, formatMoney, formatShortDate } from '../utils/format';

export interface PageGuideDefinition {
  route: FiscalRoute;
  titulo: string;
  nombreCorto: string;
  rutaHash: string;
  ubicacionMenu: string;
  proposito: string;
  seccionesYElementos: string[];
  dudasFrecuentes: Array<{
    pregunta: string;
    respuesta: string;
  }>;
  rutasRelacionadas: Array<{
    route: FiscalRoute;
    rutaHash: string;
    nombre: string;
    relacion: string;
  }>;
  followUps: string[];
}

export const PAGE_GUIDE_CATALOG: Record<FiscalRoute, PageGuideDefinition> = {
  dashboard: {
    route: 'dashboard',
    titulo: 'Dashboard Fiscal y Panorama Operativo',
    nombreCorto: 'Dashboard',
    rutaHash: '#fiscal/dashboard',
    ubicacionMenu: 'Menú lateral → Panorama → Dashboard',
    proposito:
      'Concentra en una sola vista ejecutiva el pulso fiscal, financiero y de cumplimiento SAT de la empresa activa: ingresos, gastos, pre-cálculo de IVA e ISR, evolución mensual Enero–Diciembre, estatus de Opinión 32-D, alertas de cancelación y conexión con Aspel SAE.',
    seccionesYElementos: [
      'Selector de periodo (Mes y Ejercicio): en la esquina superior derecha puede cambiar entre cualquier mes (ej. Octubre 2026 o Noviembre 2026) para recalcular al instante las tarjetas KPI.',
      '4 Tarjetas KPI interactivas: muestran Ingresos netos del mes, Gastos del mes, Deducciones autorizadas ISR e IVA estimado (a cargo o a favor). Al hacer clic en cualquiera de ellas, el portal le lleva directo al módulo detallado.',
      'Gráfica anual Ingresos vs Gastos (Ene–Dic): compara visualmente la facturación y erogaciones de todo el año para detectar picos o meses atípicos.',
      'Tarjetas de diagnóstico rápido: Resumen de cumplimiento (Opinión SAT 32-D, e.firma vigente y CFDIs en proceso de cancelación), Desglose de Ingresos Nominales (Brutos − Notas de crédito − Descuentos), Cartera PPD pendiente de cobro y Estado de integración con Aspel SAE.',
    ],
    dudasFrecuentes: [
      {
        pregunta: '¿Por qué los Ingresos del Dashboard pueden diferir de los Ingresos cobrados en ISR?',
        respuesta:
          'Porque la tarjeta de Ingresos del Dashboard muestra lo facturado neto del mes (PUE + PPD emitido), mientras que para efectos de flujo de IVA y pre-cálculo de cobro se distingue entre PUE cobrado en el mes y complementos de pago (REP 2.0) efectivamente liquidados.',
      },
      {
        pregunta: '¿Qué hago si aparece una alerta de CFDIs en proceso de cancelación?',
        respuesta:
          'Haga clic en la tarjeta de alerta o en la campana superior para abrir el comprobante afectado; recuerde que el SAT otorga 72 horas hábiles para aceptar o rechazar una solicitud de cancelación en el Buzón Tributario.',
      },
    ],
    rutasRelacionadas: [
      {
        route: 'iva',
        rutaHash: '#fiscal/iva',
        nombre: 'Impuestos IVA',
        relacion: 'Desglosa el IVA en flujo (PUE + REP) y la cédula por tasa 16%, 8%, 0% y Exento.',
      },
      {
        route: 'isr',
        rutaHash: '#fiscal/isr',
        nombre: 'Impuestos ISR',
        relacion: 'Muestra la cédula de pagos provisionales, deducciones autorizadas y retenciones.',
      },
      {
        route: 'indicadores',
        rutaHash: '#fiscal/indicadores',
        nombre: 'Indicadores',
        relacion: 'Amplía el análisis comercial (Top 5 clientes/proveedores, CxC/CxP) y las 13 alertas SAT.',
      },
      {
        route: 'visor',
        rutaHash: '#fiscal/visor',
        nombre: 'Conciliación SAT',
        relacion: 'Compara los totales del Dashboard contra el Visor SAT y declaraciones provisionales.',
      },
    ],
    followUps: [
      '¿Qué asuntos fiscales requieren atención urgente?',
      'Compara octubre contra septiembre',
      'Explícame el IVA de octubre y por qué quedó a cargo',
    ],
  },

  iva: {
    route: 'iva',
    titulo: 'Pre-cálculo y Cédula de Trabajo de IVA en Flujo',
    nombreCorto: 'Impuestos IVA',
    rutaHash: '#fiscal/iva',
    ubicacionMenu: 'Menú lateral → Impuestos → Impuestos IVA',
    proposito:
      'Determina el IVA trasladado cobrado, el IVA acreditable pagado, las retenciones de IVA y el saldo estimado a cargo o a favor bajo régimen de flujo de efectivo (Art. 1-B y 5 LIVA), separando automáticamente operaciones PUE, complementos de pago REP 2.0 y operaciones PPD aún no liquidadas.',
    seccionesYElementos: [
      'Tarjetas superiores de Flujo de IVA: muestran IVA Trasladado Cobrado (PUE + REP), IVA Acreditable Pagado, IVA Retenido y el resultado final (IVA a Cargo o IVA a Favor del periodo), además del IVA pendiente en facturas PPD sin REP.',
      'Cédula de Trabajo de IVA (4 Acordeones desplegables): desglosa la base gravable y el impuesto por cada tasa oficial del SAT (16%, 8% frontera, 0% y Exento / No objeto) tanto para IVA Trasladado como para IVA Acreditable.',
      'Tabla interactiva de CFDIs que integran el IVA: permite filtrar entre Todos, Trasladado (Emitidos), Acreditable (Recibidos) y Excluidos.',
      'Interruptor "Incluir en cálculo" por factura: permite excluir temporalmente un CFDI del cálculo del mes registrando un motivo contable (ej. gasto pendiente de soporte bancario) y restaurarlo cuando lo desee.',
    ],
    dudasFrecuentes: [
      {
        pregunta: '¿Por qué una factura emitida o recibida con método PPD no suma al IVA del mes?',
        respuesta:
          'En apego a la Ley del IVA, los comprobantes PPD solo causan o acreditan IVA hasta el mes en que se cobra o paga efectivamente y se timbra su Complemento de Pago (REP 2.0) tipo "P".',
      },
      {
        pregunta: '¿Qué pasa si excluyo un CFDI con el interruptor de la tabla?',
        respuesta:
          'El importe de IVA de ese comprobante se resta inmediatamente del pre-cálculo del mes y queda guardado el motivo y la fecha del ajuste en la bitácora para auditoría interna.',
      },
    ],
    rutasRelacionadas: [
      {
        route: 'isr',
        rutaHash: '#fiscal/isr',
        nombre: 'Impuestos ISR',
        relacion: 'Revisa en paralelo la base de ingresos y deducciones autorizadas para ISR del mismo mes.',
      },
      {
        route: 'visor',
        rutaHash: '#fiscal/visor',
        nombre: 'Conciliación SAT',
        relacion: 'Compara el IVA calculado en el portal contra lo prellenado en el Visor del SAT.',
      },
      {
        route: 'emitidos',
        rutaHash: '#fiscal/emitidos',
        nombre: 'CFDIs emitidos',
        relacion: 'Consulta las facturas PPD emitidas que aún no cuentan con complemento de pago REP.',
      },
    ],
    followUps: [
      'Explícame el IVA de octubre y por qué quedó a cargo',
      '¿Cómo se calcula el IVA en flujo (PUE vs PPD)?',
      '¿Quién nos debe dinero actualmente (PPD)?',
    ],
  },

  isr: {
    route: 'isr',
    titulo: 'Pre-determinación de ISR, Deducciones y Retenciones',
    nombreCorto: 'Impuestos ISR',
    rutaHash: '#fiscal/isr',
    ubicacionMenu: 'Menú lateral → Impuestos → Impuestos ISR',
    proposito:
      'Calcula los ingresos cobrados del periodo, depura automáticamente las deducciones autorizadas (descartando gastos no deducibles por Art. 27 LISR, uso S01 o proveedores 69-B) e integra la cédula acumulada de pagos provisionales y retenciones de ISR por enterar.',
    seccionesYElementos: [
      'Tarjetas KPI de ISR: Ingresos cobrados del mes, Deducciones autorizadas, Gastos no deducibles detectados automáticamente y Base preliminar del periodo.',
      'Cédula de Trabajo de ISR (3 Acordeones con columnas Meses anteriores | Periodo | Acumulado): 1) Ingresos nominales y cobrados acumulados del ejercicio; 2) Deducciones autorizadas (Compras/gastos facturados más Sueldos y salarios timbrados en Nómina 1.2); 3) Retenciones de ISR por enterar (por sueldos, honorarios, arrendamiento y RESICO).',
      'Filtro de Comprobantes No Deducibles: permite ver exactamente qué CFDIs recibidos fueron rechazados automáticamente y el fundamento legal (ej. Pago en efectivo > $2,000 MXN, Uso CFDI S01 o Proveedor en lista 69-B Definitivo).',
      'Interruptor manual de ajuste: permite incluir o excluir cualquier comprobante con justificación documentada.',
    ],
    dudasFrecuentes: [
      {
        pregunta: '¿Por qué el portal marca automáticamente una factura recibida como No Deducible?',
        respuesta:
          'El motor fiscal valida tres causales automáticas: 1) Pagos en efectivo (forma 01) mayores a $2,000.00 MXN (Art. 27 fracc. III LISR); 2) Comprobantes con Uso CFDI S01 (Sin efectos fiscales); y 3) Facturas emitidas por un RFC publicado como Definitivo en el listado Art. 69-B del CFF.',
      },
      {
        pregunta: '¿De dónde toma la cédula el renglón de Sueldos, salarios y asimilados?',
        respuesta:
          'Lo calcula automáticamente a partir de los CFDIs de tipo Nómina ("N") vigentes timbrados en el periodo y acumulados en el ejercicio.',
      },
    ],
    rutasRelacionadas: [
      {
        route: 'iva',
        rutaHash: '#fiscal/iva',
        nombre: 'Impuestos IVA',
        relacion: 'Complementa la revisión mensual de impuestos con el flujo de IVA trasladado y acreditable.',
      },
      {
        route: 'visor',
        rutaHash: '#fiscal/visor',
        nombre: 'Conciliación SAT',
        relacion: 'Cruza los ingresos y retenciones de ISR contra el prellenado de Pagos Provisionales del SAT.',
      },
      {
        route: 'recibidos',
        rutaHash: '#fiscal/recibidos',
        nombre: 'CFDIs recibidos',
        relacion: 'Inspecciona el expediente XML/PDF de los proveedores y sus validaciones fiscales.',
      },
    ],
    followUps: [
      '¿Qué gastos de octubre no son deducibles y por qué?',
      'Resumen de ISR de octubre',
      '¿Cuánto debo contemplar de impuestos este mes?',
    ],
  },

  visor: {
    route: 'visor',
    titulo: 'Conciliación y Auditoría contra el Visor SAT',
    nombreCorto: 'Conciliación SAT',
    rutaHash: '#fiscal/visor',
    ubicacionMenu: 'Menú lateral → Control y cumplimiento → Conciliación SAT',
    proposito:
      'Audita y concilia las cifras del portal contra los repositorios del SAT en tres niveles: Declaraciones de Pagos Provisionales SAT, Visor de Facturas SAT y Cálculo en Portal, detectando al instante XML faltantes ("Solo en SAT") y alertas fiscales antes de presentar la declaración mensual.',
    seccionesYElementos: [
      'Banner de Estatus de Declaración del Periodo: informa si la declaración del mes está Presentada o Pendiente, con fecha de corte SAT y botón para descargar en 1 clic los XML que existen en el SAT pero faltaban en el portal.',
      'Comparativa Triple de ISR (Declaración SAT vs Visor SAT vs Portal): tabla comparativa de Ingresos, Deducciones y Retenciones para detectar cualquier discrepancia de prellenado.',
      'Comparativa de IVA (Visor SAT vs Portal): contrasta el IVA trasladado y acreditable estimado por el SAT frente al cálculo real en flujo del portal.',
      'Alertas Fiscales Encontradas (Emitidos vs Recibidos lado a lado): audita 10 puntos críticos que distorsionan el prellenado del SAT (ej. PUE emitido al final del mes no cobrado, PPD sin complemento de pago, notas de crédito sin relación, uso S01 o efectivo > $2,000).',
      'Tabla de Comprobantes con Diferencia ("Solo en SAT" / "Solo en Portal"): lista los UUIDs exactos que causan la diferencia para conciliarlos inmediatamente.',
    ],
    dudasFrecuentes: [
      {
        pregunta: '¿Qué significa que un CFDI aparezca como "Solo en SAT"?',
        respuesta:
          'Significa que el SAT lo tiene contabilizado en su Visor oficial pero aún no estaba descargado en la bóveda local del portal. Al pulsar "Descargar XML faltantes del SAT", el portal lo incorpora y la diferencia queda en $0.00.',
      },
      {
        pregunta: '¿Por qué el Visor del SAT suele prellenar más ingresos que los realmente cobrados?',
        respuesta:
          'Porque el prellenado automático del SAT considera como cobradas todas las facturas emitidas con método PUE dentro del mes, aunque el cliente las pague en el mes siguiente.',
      },
    ],
    rutasRelacionadas: [
      {
        route: 'sincronizacion',
        rutaHash: '#fiscal/sincronizacion',
        nombre: 'Sincronización SAT',
        relacion: 'Ejecuta descargas bajo demanda desde el Web Service del SAT o carga paquetes ZIP.',
      },
      {
        route: 'iva',
        rutaHash: '#fiscal/iva',
        nombre: 'Impuestos IVA',
        relacion: 'Ajusta o excluye CFDIs que estén generando diferencias en el IVA del periodo.',
      },
      {
        route: 'isr',
        rutaHash: '#fiscal/isr',
        nombre: 'Impuestos ISR',
        relacion: 'Verifica el detalle de ingresos nominales, deducciones y retenciones de ISR.',
      },
    ],
    followUps: [
      '¿Qué diferencias tenemos contra el SAT actualmente?',
      '¿Qué facturas están en proceso de cancelación?',
      '¿Qué asuntos fiscales requieren atención urgente?',
    ],
  },

  indicadores: {
    route: 'indicadores',
    titulo: 'Indicadores Financieros, Comerciales y de Riesgo Fiscal SAT',
    nombreCorto: 'Indicadores',
    rutaHash: '#fiscal/indicadores',
    ubicacionMenu: 'Menú lateral → Control y cumplimiento → Indicadores',
    proposito:
      'Combina inteligencia comercial y financiera (flujo cobrado/pagado vs facturado, ventas netas, compras netas, nómina, Top 5 clientes/proveedores y antigüedad de saldos CxC/CxP) con el motor de 13 reglas de auditoría preventiva del SAT y un creador de indicadores personalizados con IA.',
    seccionesYElementos: [
      'Pestaña 1 — Indicadores Financieros y Comerciales: muestra tarjetas comparativas Cobrado vs Facturado (Emitidos) y Pagado vs Facturado (Recibidos), KPIs de Ventas netas, Compras netas y Sueldos con % de variación contra el mes anterior.',
      'Gráfica anual interactiva con selector "$" (Montos MXN) y "%" (Variación mensual): permite visualizar la tendencia comercial de los 12 meses del ejercicio.',
      'Top 5 Clientes y Top 5 Proveedores + Antigüedad de Saldos (CxC y CxP): desglosa la cartera pendiente por vencer y vencida en 4 rangos (1–30 días, 31–60 días, 61–90 días y > 90 días).',
      'Pestaña 2 — Indicadores de Consistencia y Riesgo SAT (13 Reglas + IA): audita automáticamente proveedores 69-B (EFOS), sustituciones tipo 04 con ambos CFDI vigentes, PUE con forma 99, pagos fuera de periodo, efectivo > $2,000, notas de crédito > ingreso y sobrepagos REP, permitiendo además crear nuevas reglas en lenguaje natural o con el constructor visual.',
    ],
    dudasFrecuentes: [
      {
        pregunta: '¿Cómo creo un indicador personalizado con Inteligencia Artificial?',
        respuesta:
          'En la pestaña "Riesgo y Consistencia SAT", escriba en la barra de IA lo que desea vigilar (por ejemplo: "Facturas en USD mayores a 50000" o "Gastos en efectivo") y pulse Generar; o bien pídalo directamente en este chat con la frase "Crear indicador con IA: ...".',
      },
      {
        pregunta: '¿Cómo inspecciono las facturas que detonaron una alerta en un indicador?',
        respuesta:
          'Haga clic en el botón "Ver CFDIs afectados" dentro de la tarjeta del indicador para desplegar la lista exacta de folios y abrir su expediente completo.',
      },
    ],
    rutasRelacionadas: [
      {
        route: 'emitidos',
        rutaHash: '#fiscal/emitidos',
        nombre: 'CFDIs emitidos',
        relacion: 'Da seguimiento a las cuentas por cobrar (PPD) y clientes principales.',
      },
      {
        route: 'recibidos',
        rutaHash: '#fiscal/recibidos',
        nombre: 'CFDIs recibidos',
        relacion: 'Revisa proveedores con alertas de lista 69-B o cuentas por pagar vencidas.',
      },
      {
        route: 'dashboard',
        rutaHash: '#fiscal/dashboard',
        nombre: 'Dashboard Fiscal',
        relacion: 'Regresa al resumen ejecutivo general del periodo.',
      },
    ],
    followUps: [
      '¿Qué asuntos fiscales requieren atención urgente?',
      '¿Qué pasa si un proveedor está en lista 69-B?',
      'Crear indicador con IA: Facturas en USD mayores a 50000',
    ],
  },

  emitidos: {
    route: 'emitidos',
    titulo: 'Explorador y Auditoría de CFDIs Emitidos',
    nombreCorto: 'CFDIs emitidos',
    rutaHash: '#fiscal/emitidos',
    ubicacionMenu: 'Menú lateral → Comprobantes SAT → CFDIs emitidos',
    proposito:
      'Permite consultar, filtrar, auditar y exportar todos los comprobantes emitidos por la empresa (Ingresos, Egresos/Notas de crédito, Complementos de Pago REP 2.0, Nómina 1.2 y Traslados), mostrando en cada fila su efecto fiscal, validaciones SAT y documentos asociados.',
    seccionesYElementos: [
      'Barra de búsqueda y filtros multicriterio: filtra por texto libre (folio, UUID, RFC o cliente), periodo/año, Tipo de CFDI (I, E, P, N, T), Método de pago (PUE / PPD), Forma de pago, Estatus SAT (Vigente, En cancelación, Cancelado) y Estatus contable en Aspel SAE.',
      'Columnas de Auditoría Fiscal en cada fila: 1) "Efecto en impuestos" (indica si acumula en el mes, si está pendiente de REP o sin efecto); 2) "Validaciones" (alerta sobre PUE+99, cancelaciones o complementos Carta Porte/Nómina); 3) "Asociados" (muestra cuántos REP o notas de crédito están vinculados al UUID).',
      'Selector de columnas visibles y exportación masiva: permite personalizar qué columnas ver, exportar la vista filtrada a Excel (.xlsx) o descargar un paquete .ZIP con los XML seleccionados.',
      'Acciones por fila (columna fija a la derecha): botón para abrir el Expediente completo del CFDI (conceptos, impuestos, pagos REP, relaciones y póliza SAE) y botón para abrir o imprimir la Representación Impresa PDF.',
    ],
    dudasFrecuentes: [
      {
        pregunta: '¿Cómo encuentro rápidamente las facturas que mis clientes aún no me han pagado?',
        respuesta:
          'Seleccione en los filtros superiores Método de pago: "PPD" y Tipo: "Ingreso (I)", o bien pregunte en este asistente "¿Quién nos debe dinero actualmente (PPD)?".',
      },
      {
        pregunta: '¿Qué significa la etiqueta en la columna "Asociados"?',
        respuesta:
          'Muestra cuántos Complementos de Pago (REP) o Notas de Crédito/Sustituciones hacen referencia al UUID de esa factura. Al abrir el detalle del CFDI podrá ver cada documento vinculado.',
      },
    ],
    rutasRelacionadas: [
      {
        route: 'recibidos',
        rutaHash: '#fiscal/recibidos',
        nombre: 'CFDIs recibidos',
        relacion: 'Cambia al listado de facturas de compras y gastos emitidas por proveedores.',
      },
      {
        route: 'iva',
        rutaHash: '#fiscal/iva',
        nombre: 'Impuestos IVA',
        relacion: 'Verifica cómo impactan los CFDIs emitidos en el IVA trasladado del mes.',
      },
      {
        route: 'vinculaciones',
        rutaHash: '#fiscal/vinculaciones',
        nombre: 'Vinculaciones SAE',
        relacion: 'Revisa o asigna la póliza contable de Aspel SAE para cada factura emitida.',
      },
    ],
    followUps: [
      '¿Quién nos debe dinero actualmente (PPD)?',
      '¿Quiénes son nuestros mejores clientes del año?',
      '¿Qué pasó con la factura FAC-1202?',
    ],
  },

  recibidos: {
    route: 'recibidos',
    titulo: 'Explorador y Auditoría de CFDIs Recibidos (Proveedores)',
    nombreCorto: 'CFDIs recibidos',
    rutaHash: '#fiscal/recibidos',
    ubicacionMenu: 'Menú lateral → Comprobantes SAT → CFDIs recibidos',
    proposito:
      'Centraliza todas las facturas de compras, gastos, notas de crédito y complementos de pago recibidos de proveedores, auditando automáticamente en cada comprobante su deducibilidad ISR, acreditamiento de IVA y si el emisor figura en la lista negra del Art. 69-B (EFOS).',
    seccionesYElementos: [
      'Filtros inteligentes de compras y gastos: búsqueda por proveedor, RFC, folio o UUID, filtro por Tipo (Ingreso, Egreso, Pago, Traslado), Método PUE/PPD, Forma de pago y Estatus SAT.',
      'Columna "Efecto en impuestos": señala con etiquetas de color si el gasto es "Acreditable / Deducible", si está "Pendiente de REP (PPD)" o si es "No deducible (Efectivo > $2k / S01 / 69-B)".',
      'Columna "Validaciones": destaca en rojo si el proveedor está en lista 69-B (EFOS Definitivo o Presunto), si presenta inconsistencia PUE+99 o si incluye complemento Carta Porte 3.0.',
      'Expediente y PDF por comprobante: al hacer clic en una fila o en los botones de acción, puede inspeccionar los conceptos facturados, descargar el XML original o visualizar el PDF.',
    ],
    dudasFrecuentes: [
      {
        pregunta: '¿Cómo identifico si algún proveedor está en la lista 69-B del SAT?',
        respuesta:
          'En la columna "Validaciones" verá una insignia roja "69-B Definitivo" o ámbar "69-B Presunto" junto al proveedor. También puede consultarlo en #fiscal/indicadores o preguntarme "¿Tenemos proveedores en lista 69-B?".',
      },
      {
        pregunta: '¿Por qué un gasto pagado en efectivo aparece como No deducible?',
        respuesta:
          'Porque el Art. 27 fracción III de la Ley del ISR establece que todo gasto mayor a $2,000.00 MXN debe pagarse mediante transferencia, cheque nominativo o tarjeta para ser deducible.',
      },
    ],
    rutasRelacionadas: [
      {
        route: 'isr',
        rutaHash: '#fiscal/isr',
        nombre: 'Impuestos ISR',
        relacion: 'Consulta cómo se integran estos gastos en las deducciones autorizadas del mes.',
      },
      {
        route: 'indicadores',
        rutaHash: '#fiscal/indicadores',
        nombre: 'Indicadores',
        relacion: 'Analiza el Top 5 de proveedores, cuentas por pagar y alertas de riesgo SAT.',
      },
      {
        route: 'emitidos',
        rutaHash: '#fiscal/emitidos',
        nombre: 'CFDIs emitidos',
        relacion: 'Consulta los comprobantes de ingresos, nómina y pagos emitidos por la empresa.',
      },
    ],
    followUps: [
      '¿Quiénes son nuestros principales proveedores?',
      '¿Qué gastos no son deducibles y por qué?',
      '¿Tenemos proveedores en lista 69-B (EFOS)?',
    ],
  },

  sincronizacion: {
    route: 'sincronizacion',
    titulo: 'Sincronización SAT y Carga Masiva XML / ZIP',
    nombreCorto: 'Sincronización SAT',
    rutaHash: '#fiscal/sincronizacion',
    ubicacionMenu: 'Menú lateral → Comprobantes SAT → Sincronización',
    proposito:
      'Conecta el portal con la descarga masiva del SAT mediante su e.firma vigente, además de permitir la importación directa de archivos .XML y paquetes .ZIP desde su equipo y descargas históricas de hasta 5 años.',
    seccionesYElementos: [
      'Botón "Actualizar SAT": ejecuta de inmediato una consulta de los comprobantes más recientes emitidos y recibidos ante el SAT sin duplicar registros.',
      'Zona de Carga Masiva XML / ZIP (arrastrar y soltar): permite cargar archivos .xml individuales o paquetes .zip completos descargados del SAT. Interpreta automáticamente CFDI 4.0/3.3, Pagos 2.0, Nómina 1.2 y Carta Porte, y si detecta un RFC nuevo le ofrece dar de alta la empresa en un clic.',
      'Descarga Histórica (hasta 5 años): permite solicitar ejercicios completos anteriores para mantener actualizado el repositorio fiscal de la empresa.',
      'Bitácora de Solicitudes SAT: tabla con folio de solicitud, periodo, estado (Completada, Procesando, Error), conteo de emitidos/recibidos y botón "Reintentar" en caso de intermitencia del portal del SAT (código 5004).',
    ],
    dudasFrecuentes: [
      {
        pregunta: '¿Qué pasa si subo dos veces el mismo archivo XML o paquete ZIP?',
        respuesta:
          'El sistema valida cada comprobante por su folio fiscal (UUID); si el comprobante ya existe, únicamente actualiza su estatus SAT sin duplicar jamás registros ni alterar los cálculos.',
      },
      {
        pregunta: '¿Qué hago si una solicitud en la bitácora aparece con estado "Error"?',
        respuesta:
          'Pulse el botón "Reintentar" en esa misma fila. Los errores como el código 5004 son intermitencias temporales del servicio de descarga del SAT y se resuelven al relanzar la solicitud.',
      },
    ],
    rutasRelacionadas: [
      {
        route: 'efirma',
        rutaHash: '#fiscal/efirma',
        nombre: 'e.firma (FIEL)',
        relacion: 'Configura o renueva los certificados .cer y .key necesarios para descargar comprobantes del SAT.',
      },
      {
        route: 'visor',
        rutaHash: '#fiscal/visor',
        nombre: 'Conciliación SAT',
        relacion: 'Verifica que todos los comprobantes descargados cuadren contra el Visor del SAT.',
      },
      {
        route: 'emitidos',
        rutaHash: '#fiscal/emitidos',
        nombre: 'CFDIs emitidos',
        relacion: 'Explora los comprobantes recién importados o sincronizados.',
      },
    ],
    followUps: [
      '¿Cómo cargo un paquete ZIP descargado del SAT?',
      'Me salió un error en la descarga, ¿qué hago?',
      'Necesito descargar XML de hace 3 años',
    ],
  },

  documentos: {
    route: 'documentos',
    titulo: 'Expediente de Datos Fiscales (CSF, Opinión SAT 32-D e IMSS)',
    nombreCorto: 'Datos fiscales',
    rutaHash: '#fiscal/documentos',
    ubicacionMenu: 'Menú lateral → Control y cumplimiento → Datos fiscales',
    proposito:
      'Resguarda y monitorea la vigencia de los tres documentos oficiales de cumplimiento de la empresa: Constancia de Situación Fiscal (CSF), Opinión de Cumplimiento SAT (Art. 32-D) y Opinión de Cumplimiento IMSS, con visor PDF integrado y carga de actualizaciones.',
    seccionesYElementos: [
      '3 Tarjetas de Cumplimiento Oficial: muestran el sentido actual (Positiva / Negativa / Vigente), la fecha de última actualización, el nombre del archivo PDF y alertas visuales si una opinión es negativa o tiene más de 30 días.',
      'Visor y Representación Oficial de cada documento: al pulsar "Ver documento", se despliega la vista previa completa con sello digital, cadena original y botón para imprimir o guardar en PDF.',
      'Actualización de PDF real: cada tarjeta incluye el botón "Actualizar PDF" para cargar el archivo recién descargado del portal del SAT o del IMSS.',
      'Ficha técnica del RFC activo: resume razón social, régimen fiscal, código postal fiscal y tipo de persona.',
    ],
    dudasFrecuentes: [
      {
        pregunta: '¿Cada cuánto tiempo se recomienda actualizar la Opinión de Cumplimiento 32-D?',
        respuesta:
          'La Opinión de Cumplimiento 32-D tiene una vigencia práctica de 30 días naturales para trámites, licitaciones y contratación con clientes, por lo que se recomienda renovarla al inicio de cada mes.',
      },
      {
        pregunta: '¿Puedo analizar el contenido de una Constancia u Opinión en PDF con el Asistente?',
        respuesta:
          'Sí. Puede adjuntar el archivo PDF directamente en el botón de clip del Asistente Tecno para que extraiga el RFC, régimen, obligaciones y sentido del documento.',
      },
    ],
    rutasRelacionadas: [
      {
        route: 'efirma',
        rutaHash: '#fiscal/efirma',
        nombre: 'e.firma (FIEL)',
        relacion: 'Verifica la vigencia del certificado FIEL necesario para generar opiniones en el SAT.',
      },
      {
        route: 'empresas',
        rutaHash: '#fiscal/empresas',
        nombre: 'Empresas (RFC)',
        relacion: 'Consulta o edita los datos generales de las empresas dadas de alta en el portal.',
      },
      {
        route: 'visor',
        rutaHash: '#fiscal/visor',
        nombre: 'Conciliación SAT',
        relacion: 'Revisa si existen declaraciones pendientes que pudieran afectar la Opinión 32-D.',
      },
    ],
    followUps: [
      '¿Cómo está nuestra opinión de cumplimiento SAT e IMSS?',
      '¿Cuál es el documento que dice si estamos bien con el SAT?',
      '¿Cuándo vence nuestra e.firma y la de las demás empresas?',
    ],
  },

  efirma: {
    route: 'efirma',
    titulo: 'Configuración y Resguardo de e.firma (FIEL)',
    nombreCorto: 'e.firma (FIEL)',
    rutaHash: '#fiscal/efirma',
    ubicacionMenu: 'Menú lateral → Configuración → e.firma (FIEL)',
    proposito:
      'Administra la Firma Electrónica Avanzada (e.firma / FIEL) de la empresa para autenticar las descargas automáticas ante el SAT. Valida que el certificado (.cer) corresponda al RFC activo y resguarda de forma cifrada y confidencial la llave privada (.key) y contraseña.',
    seccionesYElementos: [
      'Tarjeta de Estado Actual: muestra el estatus (Activa, Por vencer o Vencida), número de serie de 20 dígitos, RFC del certificado, fechas de vigencia, días restantes y usuario que realizó la última carga.',
      'Panel de Seguridad y Resguardo: confirma que los archivos .cer y .key se encuentran protegidos con cifrado confidencial, sin exponer jamás la llave privada ni la contraseña en el navegador.',
      'Formulario de Carga / Renovación con Validación Automática: verifica que el archivo .cer corresponda al RFC de la empresa activa y rechaza automáticamente Certificados de Sello Digital (CSD de facturación).',
      'Política de Alertas Preventivas: notifica automáticamente a los 30, 15 y 5 días previos al vencimiento de la FIEL.',
    ],
    dudasFrecuentes: [
      {
        pregunta: '¿Cuál es la diferencia entre la e.firma (FIEL) y el CSD?',
        respuesta:
          'La e.firma (FIEL) acredita la identidad fiscal del contribuyente para autenticarse y descargar CFDIs del SAT, mientras que el Certificado de Sello Digital (CSD) sirve únicamente para timbrar facturas. Este módulo valida y exige exclusivamente e.firma (FIEL).',
      },
      {
        pregunta: '¿Dónde se guarda la contraseña de mi llave privada (.key)?',
        respuesta:
          'Nunca se almacena en tu navegador ni queda visible para otros usuarios; se resguarda cifrada de forma segura y confidencial exclusivamente para las descargas autorizadas ante el SAT.',
      },
    ],
    rutasRelacionadas: [
      {
        route: 'sincronizacion',
        rutaHash: '#fiscal/sincronizacion',
        nombre: 'Sincronización SAT',
        relacion: 'Utiliza la e.firma vigente para ejecutar descargas automáticas de comprobantes ante el SAT.',
      },
      {
        route: 'documentos',
        rutaHash: '#fiscal/documentos',
        nombre: 'Datos fiscales',
        relacion: 'Consulta la Constancia de Situación Fiscal y las Opiniones 32-D de la empresa.',
      },
      {
        route: 'empresas',
        rutaHash: '#fiscal/empresas',
        nombre: 'Empresas (RFC)',
        relacion: 'Cambia de RFC para revisar la vigencia de la e.firma en otras razones sociales.',
      },
    ],
    followUps: [
      '¿Cuándo vence nuestra e.firma y la de las demás empresas?',
      '¿Cuál es la diferencia entre e.firma (FIEL) y CSD?',
      '¿Cómo renuevo la e.firma en el portal?',
    ],
  },

  empresas: {
    route: 'empresas',
    titulo: 'Directorio y Selector Multi-Empresa (RFC)',
    nombreCorto: 'Empresas (RFC)',
    rutaHash: '#fiscal/empresas',
    ubicacionMenu: 'Menú lateral → Configuración → Empresas (RFC) (o selector rápido en barra lateral)',
    proposito:
      'Permite administrar todas las razones sociales (Personas Morales y Físicas) registradas en el portal, alternar el RFC activo en un clic, marcar empresas favoritas y dar de alta nuevos contribuyentes.',
    seccionesYElementos: [
      'Buscador y Ordenamiento (A–Z, RFC, Último acceso), con interruptor entre Vista de Tarjetas y Vista de Lista.',
      'Tarjetas de Empresa con diagnóstico rápido: muestran RFC, razón social, código y descripción de régimen fiscal, código postal, estrella de Favorita, estado de su e.firma y volumen de CFDIs.',
      'Botón "Seleccionar / Activa": cambia inmediatamente el contexto de todo el portal (Dashboard, IVA, ISR, CFDIs, Visor SAT y Asistente Tecno) hacia esa empresa.',
      'Modal "+ Agregar empresa": valida la estructura oficial del RFC (12 caracteres para Persona Moral, 13 para Persona Física), régimen fiscal y código postal.',
    ],
    dudasFrecuentes: [
      {
        pregunta: '¿Al cambiar de empresa se mezclan las facturas o los cálculos?',
        respuesta:
          'No. Cada empresa mantiene su información completamente separada: sus CFDIs, pagos REP, ajustes de IVA/ISR, e.firma y bitácora pertenecen exclusivamente al RFC seleccionado.',
      },
      {
        pregunta: '¿También puedo crear una empresa automáticamente al subir un ZIP del SAT?',
        respuesta:
          'Sí. Si en #fiscal/sincronizacion carga un XML o ZIP cuyo RFC no esté dado de alta, el portal lo detecta y le ofrece crear la empresa e importar sus comprobantes en un solo paso.',
      },
    ],
    rutasRelacionadas: [
      {
        route: 'efirma',
        rutaHash: '#fiscal/efirma',
        nombre: 'e.firma (FIEL)',
        relacion: 'Carga el certificado .cer y llave .key de la empresa recién seleccionada o creada.',
      },
      {
        route: 'sincronizacion',
        rutaHash: '#fiscal/sincronizacion',
        nombre: 'Sincronización SAT',
        relacion: 'Importa los primeros paquetes XML/ZIP de la empresa seleccionada.',
      },
      {
        route: 'dashboard',
        rutaHash: '#fiscal/dashboard',
        nombre: 'Dashboard Fiscal',
        relacion: 'Visualiza los indicadores ejecutivos de la empresa activa.',
      },
    ],
    followUps: [
      '¿Cuántas empresas tenemos registradas y cuál es su estado?',
      '¿Cuándo vence nuestra e.firma y la de las demás empresas?',
      'Resumen ejecutivo de la empresa',
    ],
  },

  usuarios: {
    route: 'usuarios',
    titulo: 'Control de Acceso, Perfil Propietario y Bitácora de Auditoría',
    nombreCorto: 'Usuarios y roles',
    rutaHash: '#fiscal/usuarios',
    ubicacionMenu: 'Menú lateral → Configuración → Usuarios y roles',
    proposito:
      'Gestiona los permisos de acceso por empresa según el perfil asignado (Propietario, Contador, Consulta y Pagos), muestra el perfil titular activo (C.P. Nayra Mendoza) y resguarda la bitácora de auditoría del portal.',
    seccionesYElementos: [
      'Tabla de Colaboradores y Permisos por Empresa: muestra nombre, correo corporativo, rol asignado, estado de aceptación y acciones de administración.',
      'Botón "Invitar usuario" y Exportación a Excel: permite registrar colaboradores adicionales si se requiere y descargar el padrón de accesos.',
      'Matriz de Permisos por Rol: detalla qué apartados y acciones están habilitados para Propietario, Contador, Consulta y Pagos.',
      'Bitácora de Auditoría Reciente: registra cada acción importante realizada en la empresa (cargas de e.firma, sincronizaciones SAT, exclusiones de IVA/ISR y pólizas de Aspel SAE).',
    ],
    dudasFrecuentes: [
      {
        pregunta: '¿Qué nivel de permisos tiene el perfil activo de C.P. Nayra Mendoza?',
        respuesta:
          'Cuenta con el rol de Propietario, lo que le otorga acceso total a las 16 pantallas del portal, incluyendo la Bóveda de e.firma, Sincronización SAT, ajustes de impuestos y administración de empresas.',
      },
    ],
    rutasRelacionadas: [
      {
        route: 'efirma',
        rutaHash: '#fiscal/efirma',
        nombre: 'e.firma (FIEL)',
        relacion: 'Módulo de acceso exclusivo para el rol Propietario.',
      },
      {
        route: 'empresas',
        rutaHash: '#fiscal/empresas',
        nombre: 'Empresas (RFC)',
        relacion: 'Administra las razones sociales a las que se aplican los permisos.',
      },
    ],
    followUps: [
      '¿Qué permisos tiene cada rol en el portal?',
      'Resumen ejecutivo de la empresa',
      'Muéstrame todas las rutas del portal',
    ],
  },

  vinculaciones: {
    route: 'vinculaciones',
    titulo: 'Vinculaciones Contables con Aspel SAE',
    nombreCorto: 'Vinculaciones SAE',
    rutaHash: '#fiscal/vinculaciones',
    ubicacionMenu: 'Menú lateral → Control y cumplimiento → Vinculaciones SAE',
    proposito:
      'Conecta cada CFDI emitido y recibido con su póliza contable (Ingresos IG / Egresos EG) y cuenta contable dentro de Aspel SAE, permitiendo identificar al instante qué facturas ya están contabilizadas y cuáles están pendientes de póliza.',
    seccionesYElementos: [
      'Panel de Estado de Conexión Aspel SAE: muestra el servidor/instancia configurada, base de datos, estado En línea, fecha de última sincronización e interruptor de vinculación automática.',
      'Botón "Sincronizar pendientes con Aspel SAE": genera y vincula automáticamente las pólizas de todos los CFDIs vigentes que estaban en estado Pendiente.',
      'Tarjetas de Avance Contable: total de CFDIs Con póliza, Pendientes de contabilizar y Sin registro.',
      'Tabla de Comprobantes y Pólizas: muestra folio, UUID, contraparte, total, número de póliza Aspel SAE (ej. IG-2026-10-0101), cuenta contable (ej. 4100-001-000) y botón para asignar o editar manualmente una póliza.',
    ],
    dudasFrecuentes: [
      {
        pregunta: '¿Cómo vinculo de golpe todas las facturas que aún dicen "Pendiente"?',
        respuesta:
          'Haga clic en el botón superior "Sincronizar pendientes con Aspel SAE". El servidor asignará automáticamente los folios de póliza IG/EG, actualizará el estatus a "Con póliza" y registrará el GUID de sincronización en ADD y Bitácora.',
      },
      {
        pregunta: '¿Puedo capturar o corregir manualmente el número de póliza de una factura?',
        respuesta:
          'Sí. En la columna derecha de la tabla pulse "Asignar póliza" sobre cualquier CFDI para indicar el folio de póliza y la cuenta contable específica.',
      },
    ],
    rutasRelacionadas: [
      {
        route: 'contable',
        rutaHash: '#fiscal/contable',
        nombre: 'ADD y Bitácora Contable',
        relacion: 'Consulta el historial de corridas y GUIDs de sincronización ejecutados con Aspel SAE.',
      },
      {
        route: 'emitidos',
        rutaHash: '#fiscal/emitidos',
        nombre: 'CFDIs emitidos',
        relacion: 'Filtra facturas emitidas por su estatus contable (Con póliza / Pendiente).',
      },
      {
        route: 'recibidos',
        rutaHash: '#fiscal/recibidos',
        nombre: 'CFDIs recibidos',
        relacion: 'Revisa qué gastos de proveedores ya cuentan con póliza de egreso en SAE.',
      },
    ],
    followUps: [
      '¿Qué facturas faltan por vincular en Aspel SAE?',
      '¿Cómo está la conexión con Aspel SAE?',
      'Resumen ejecutivo de la empresa',
    ],
  },

  contable: {
    route: 'contable',
    titulo: 'ADD (Administrador de Documentos Digitales) y Bitácora Contable',
    nombreCorto: 'ADD y Bitácora',
    rutaHash: '#fiscal/contable',
    ubicacionMenu: 'Menú lateral → Control y cumplimiento → ADD y Bitácora',
    proposito:
      'Registra la trazabilidad histórica de todas las sincronizaciones de documentos digitales (ADD) realizadas entre la bóveda XML del portal y el sistema Aspel SAE, incluyendo identificadores GUID, rangos de fechas y volumen de comprobantes vinculados.',
    seccionesYElementos: [
      'Resumen de Corridas ADD: muestra el número de lotes sincronizados, total de UUIDs enlazados con el ADD y estatus del puente contable.',
      'Tabla Histórica de Sincronizaciones Contables: detalla Fecha y hora, GUID único de lote (ej. SAE-HEDM-...), Rango de fechas procesado, Dirección (Emitidos, Recibidos o Ambos), Total de CFDIs sincronizados y Estatus.',
      'Acción rápida para lanzar una nueva corrida de sincronización hacia Aspel SAE o exportar la bitácora a Excel.',
    ],
    dudasFrecuentes: [
      {
        pregunta: '¿Cuál es la diferencia entre "ADD y Bitácora" y "Vinculaciones SAE"?',
        respuesta:
          '"Vinculaciones SAE" (#fiscal/vinculaciones) muestra el detalle factura por factura y su número de póliza individual, mientras que "ADD y Bitácora" (#fiscal/contable) muestra el historial de lotes o corridas completas de sincronización (con su GUID de auditoría).',
      },
    ],
    rutasRelacionadas: [
      {
        route: 'vinculaciones',
        rutaHash: '#fiscal/vinculaciones',
        nombre: 'Vinculaciones SAE',
        relacion: 'Inspecciona o asigna pólizas individuales por cada CFDI.',
      },
      {
        route: 'sincronizacion',
        rutaHash: '#fiscal/sincronizacion',
        nombre: 'Sincronización SAT',
        relacion: 'Consulta la bitácora de descargas de XML directamente desde el SAT.',
      },
    ],
    followUps: [
      '¿Qué facturas faltan por vincular en Aspel SAE?',
      '¿Cómo está la conexión con Aspel SAE?',
      'Muéstrame todas las rutas del portal',
    ],
  },

  consumo: {
    route: 'consumo',
    titulo: 'Usos, Consumos y Capacidad Operativa',
    nombreCorto: 'Usos y consumos',
    rutaHash: '#fiscal/consumo',
    ubicacionMenu: 'Menú lateral → Control y cumplimiento → Usos y consumos',
    proposito:
      'Transparenta las métricas de capacidad de la cuenta para la empresa activa: volumen de CFDIs del ejercicio frente al límite contratado, acervo de CFDIs históricos, consultas mensuales realizadas al Asistente Tecno IA y espacio de almacenamiento utilizado en la bóveda XML/PDF.',
    seccionesYElementos: [
      'Barras de Progreso de Capacidad: 1) CFDIs del ejercicio actual vs límite anual; 2) Consultas mensuales al Asistente Tecno IA; 3) Almacenamiento documental en MB.',
      'Gráfica y Desglose Anual de CFDIs Históricos: muestra cuántos comprobantes están resguardados por cada ejercicio fiscal (2022 a 2026).',
    ],
    dudasFrecuentes: [
      {
        pregunta: '¿Qué ocurre cuando hago preguntas en el Asistente Tecno?',
        respuesta:
          'El contador de "Consultas IA del mes" en esta pantalla se incrementa en tiempo real para llevar la trazabilidad de uso de la empresa activa.',
      },
    ],
    rutasRelacionadas: [
      {
        route: 'sincronizacion',
        rutaHash: '#fiscal/sincronizacion',
        nombre: 'Sincronización SAT',
        relacion: 'Amplía el acervo histórico descargando XML de hasta 5 ejercicios anteriores.',
      },
      {
        route: 'asistente',
        rutaHash: '#fiscal/asistente',
        nombre: 'Asistente Tecno',
        relacion: 'Aprovecha las consultas disponibles para auditar impuestos y documentos.',
      },
    ],
    followUps: [
      '¿Cuál es nuestro consumo actual del portal?',
      'Resumen ejecutivo de la empresa',
      'Muéstrame todas las rutas del portal',
    ],
  },

  asistente: {
    route: 'asistente',
    titulo: 'Asistente Tecno IA y Comprensión Multi-Documento',
    nombreCorto: 'Asistente Tecno',
    rutaHash: '#fiscal/asistente',
    ubicacionMenu: 'Menú lateral → Panorama → Asistente Tecno (y botón flotante inferior derecho en todas las pantallas)',
    proposito:
      'Es su copiloto fiscal y operativo en tiempo real: responde dudas sobre IVA, ISR, Visor SAT, CFDIs, lista 69-B y Aspel SAE con datos vivos de la empresa activa; explica cualquier pantalla y sus rutas; crea indicadores de riesgo en lenguaje natural; y analiza archivos adjuntos (PDF, Word .docx, PowerPoint .pptx, Excel, CSV, XML, ZIP y TXT).',
    seccionesYElementos: [
      'Selector interactivo "Explicar cualquier pantalla del portal": le permite elegir cualquiera de las 16 vistas del sistema para recibir su guía completa, rutas conectadas, estado en vivo y dudas frecuentes.',
      'Motor de Comprensión Multi-Documento (Drag & Drop o botón de clip): arrastre hasta 10 archivos simultáneamente (.pdf, .docx, .pptx, .xlsx, .csv, .xml, .zip, .txt). El asistente extrae sus cifras, tablas, RFCs y UUIDs y los cruza contra los CFDIs del portal.',
      'Tarjetas de Respuesta Enriquecida: incluyen tablas exportables a Excel, gráficas comparativas, botones de navegación directa a la ruta o al expediente de un CFDI y chips de preguntas de seguimiento.',
      'Historial de Conversaciones: guarda sus sesiones de análisis para retomarlas en cualquier momento.',
    ],
    dudasFrecuentes: [
      {
        pregunta: '¿Cómo puedo pedirle al asistente que me explique otra pantalla donde tengo dudas?',
        respuesta:
          'Puede hacer clic en cualquiera de los botones de pantallas arriba del chat, usar el botón "Explicar esta página" en la barra superior cuando esté dentro de ese módulo, o escribirme por ejemplo: "Explícame la página de IVA y sus rutas" o "Explícame la página de Conciliación SAT".',
      },
      {
        pregunta: '¿Qué tipos de archivos puedo adjuntar en el chat para que el asistente los revise?',
        respuesta:
          'Admite PDF (como Constancias CSF, Opiniones 32-D o estados de cuenta), Word (.docx), PowerPoint (.pptx), hojas de cálculo Excel (.xlsx/.xls/.csv), comprobantes XML CFDI 4.0/3.3 y paquetes ZIP del SAT.',
      },
    ],
    rutasRelacionadas: [
      {
        route: 'dashboard',
        rutaHash: '#fiscal/dashboard',
        nombre: 'Dashboard Fiscal',
        relacion: 'Panorama ejecutivo con KPIs de ingresos, gastos, IVA e ISR.',
      },
      {
        route: 'iva',
        rutaHash: '#fiscal/iva',
        nombre: 'Impuestos IVA',
        relacion: 'Cédula de IVA por tasa y flujo efectivo PUE + REP.',
      },
      {
        route: 'visor',
        rutaHash: '#fiscal/visor',
        nombre: 'Conciliación SAT',
        relacion: 'Triple comparativa contra el Visor del SAT y alertas fiscales.',
      },
      {
        route: 'indicadores',
        rutaHash: '#fiscal/indicadores',
        nombre: 'Indicadores',
        relacion: 'Indicadores financieros, comerciales y reglas de riesgo SAT.',
      },
    ],
    followUps: [
      'Muéstrame todas las rutas del portal',
      '¿Qué asuntos fiscales requieren atención urgente?',
      'Guía paso a paso para usar el portal',
    ],
  },
};

export const ALL_PAGE_GUIDES_ORDERED: PageGuideDefinition[] = [
  PAGE_GUIDE_CATALOG.dashboard,
  PAGE_GUIDE_CATALOG.iva,
  PAGE_GUIDE_CATALOG.isr,
  PAGE_GUIDE_CATALOG.visor,
  PAGE_GUIDE_CATALOG.indicadores,
  PAGE_GUIDE_CATALOG.emitidos,
  PAGE_GUIDE_CATALOG.recibidos,
  PAGE_GUIDE_CATALOG.sincronizacion,
  PAGE_GUIDE_CATALOG.documentos,
  PAGE_GUIDE_CATALOG.efirma,
  PAGE_GUIDE_CATALOG.empresas,
  PAGE_GUIDE_CATALOG.usuarios,
  PAGE_GUIDE_CATALOG.vinculaciones,
  PAGE_GUIDE_CATALOG.contable,
  PAGE_GUIDE_CATALOG.consumo,
  PAGE_GUIDE_CATALOG.asistente,
];

const EXPLAIN_PAGE_VERBS = [
  'explica',
  'explicame',
  'explicar',
  'guia',
  'guiame',
  'como funciona',
  'para que sirve',
  'que hago en',
  'que hago aqui',
  'que se hace en',
  'que se hace aqui',
  'como se usa',
  'como uso',
  'que contiene',
  'que hay en',
  'que significa lo que veo',
  'tengo duda',
  'tengo dudas',
  'ayuda con esta',
  'entender esta',
];

const CURRENT_PAGE_REFS = [
  'esta pagina',
  'esta pantalla',
  'esta vista',
  'esta seccion',
  'este modulo',
  'este apartado',
  'pagina actual',
  'pantalla actual',
  'vista actual',
  'donde estoy',
  'aqui',
  'sus rutas',
];

const SPECIFIC_ROUTE_KEYWORDS: Array<{ route: FiscalRoute; patterns: RegExp[] }> = [
  {
    route: 'iva',
    patterns: [
      /\b(pagina|pantalla|vista|seccion|modulo|apartado)\s+(de\s+)?(impuestos\s+)?iva\b/i,
      /\bexplica(me|r)?\s+(el\s+modulo\s+de\s+|la\s+pagina\s+de\s+|la\s+pantalla\s+de\s+)(impuestos\s+)?iva\b/i,
    ],
  },
  {
    route: 'isr',
    patterns: [
      /\b(pagina|pantalla|vista|seccion|modulo|apartado)\s+(de\s+)?(impuestos\s+)?isr\b/i,
      /\bexplica(me|r)?\s+(el\s+modulo\s+de\s+|la\s+pagina\s+de\s+|la\s+pantalla\s+de\s+)(impuestos\s+)?isr\b/i,
    ],
  },
  {
    route: 'visor',
    patterns: [/\b(pagina|pantalla|vista|seccion|modulo|apartado)\s+(de\s+|del\s+)?(visor|conciliacion)\b/i],
  },
  {
    route: 'indicadores',
    patterns: [/\b(pagina|pantalla|vista|seccion|modulo|apartado)\s+(de\s+)?indicadores\b/i],
  },
  {
    route: 'emitidos',
    patterns: [/\b(pagina|pantalla|vista|seccion|modulo|apartado)\s+(de\s+)?(cfdis?\s+)?emitidos\b/i],
  },
  {
    route: 'recibidos',
    patterns: [/\b(pagina|pantalla|vista|seccion|modulo|apartado)\s+(de\s+)?(cfdis?\s+)?recibidos\b/i],
  },
  {
    route: 'sincronizacion',
    patterns: [/\b(pagina|pantalla|vista|seccion|modulo|apartado)\s+(de\s+)?sincronizacion\b/i],
  },
  {
    route: 'documentos',
    patterns: [/\b(pagina|pantalla|vista|seccion|modulo|apartado)\s+(de\s+)?(datos\s+fiscales|documentos)\b/i],
  },
  {
    route: 'efirma',
    patterns: [/\b(pagina|pantalla|vista|seccion|modulo|apartado)\s+(de\s+)?(e\.?firma|e\s+firma|fiel)\b/i],
  },
  {
    route: 'empresas',
    patterns: [/\b(pagina|pantalla|vista|seccion|modulo|apartado)\s+(de\s+)?empresas\b/i],
  },
  {
    route: 'usuarios',
    patterns: [/\b(pagina|pantalla|vista|seccion|modulo|apartado)\s+(de\s+)?usuarios\b/i],
  },
  {
    route: 'vinculaciones',
    patterns: [/\b(pagina|pantalla|vista|seccion|modulo|apartado)\s+(de\s+)?(vinculaciones|aspel)\b/i],
  },
  {
    route: 'contable',
    patterns: [/\b(pagina|pantalla|vista|seccion|modulo|apartado)\s+(de\s+)?(add|bitacora\s+contable|contable)\b/i],
  },
  {
    route: 'consumo',
    patterns: [/\b(pagina|pantalla|vista|seccion|modulo|apartado)\s+(de\s+)?(usos|consumos?)\b/i],
  },
  {
    route: 'dashboard',
    patterns: [/\b(pagina|pantalla|vista|seccion|modulo|apartado)\s+(de\s+|del\s+)?(dashboard|tablero)\b/i],
  },
  {
    route: 'asistente',
    patterns: [/\b(pagina|pantalla|vista|seccion|modulo|apartado)\s+(de\s+|del\s+)?asistente\b/i],
  },
];

export function detectPageExplanationIntent(
  rawPrompt: string,
  currentRoute: FiscalRoute = 'dashboard',
  previousRoute?: FiscalRoute,
): FiscalRoute | null {
  const q = basicNormalize(rawPrompt);

  // 1. Comando directo con hash o etiqueta explícita: "Explícame la pantalla #fiscal/iva"
  const hashMatch = rawPrompt.match(/#fiscal\/([a-z]+)/i);
  if (hashMatch) {
    const candidate = hashMatch[1].toLowerCase() as FiscalRoute;
    if (PAGE_GUIDE_CATALOG[candidate]) {
      return candidate;
    }
  }

  // 2. Mención explícita de "página/pantalla/sección/módulo de [X]"
  for (const item of SPECIFIC_ROUTE_KEYWORDS) {
    if (item.patterns.some((rx) => rx.test(q))) {
      return item.route;
    }
  }

  // 3. Mención contextual a la pantalla actual ("explícame esta página", "¿qué hago aquí?", "explica esta pantalla y sus rutas")
  const hasExplainVerb = EXPLAIN_PAGE_VERBS.some((v) => q.includes(v));
  const hasCurrentPageRef = CURRENT_PAGE_REFS.some((r) => q.includes(r));

  if (
    (hasExplainVerb && hasCurrentPageRef) ||
    q === 'explicar esta pagina' ||
    q === 'explicame esta pagina' ||
    q === 'explica esta pantalla' ||
    q === 'que hago aqui' ||
    q === 'como funciona esta pagina' ||
    q === 'para que sirve esta pagina'
  ) {
    if (currentRoute === 'asistente' && previousRoute && previousRoute !== 'asistente') {
      // Si el usuario pregunta por "la página anterior / donde estaba"
      if (q.includes('estaba') || q.includes('anterior')) {
        return previousRoute;
      }
    }
    return currentRoute;
  }

  if (
    (q.includes('pantalla donde estaba') || q.includes('pagina donde estaba') || q.includes('pagina anterior')) &&
    previousRoute
  ) {
    return previousRoute;
  }

  return null;
}

function buildLiveRouteSnapshot(
  route: FiscalRoute,
  state: FiscalDatabaseState,
  empresa: Empresa,
  ocultarMontos: boolean,
  periodo: string,
): string {
  const companyCfdis = state.cfdis.filter((c) => c.empresa_id === empresa.id && !c.solo_en_sat);

  switch (route) {
    case 'dashboard': {
      const iva = getIvaFlujoPeriodo(state, empresa.id, periodo);
      const isr = getIsrPeriodo(state, empresa.id, periodo);
      const ppd = getPpdPendientesCobro(state, empresa.id);
      const enCanc = companyCfdis.filter((c) => c.estatus_sat === 'en_cancelacion').length;
      return `En este momento para **${empresa.razon_social}** (${periodo}): registra **${formatMoney(isr.totalIngresos, ocultarMontos)}** de ingresos cobrados, **${formatMoney(isr.totalDeducciones, ocultarMontos)}** de deducciones autorizadas, **${iva.ivaACargo >= 0 ? 'IVA a cargo' : 'IVA a favor'} de ${formatMoney(Math.abs(iva.ivaACargo), ocultarMontos)}**, **${ppd.length} factura(s) PPD por cobrar** y **${enCanc} CFDI(s) en proceso de cancelación**.`;
    }
    case 'iva': {
      const iva = getIvaFlujoPeriodo(state, empresa.id, periodo);
      const cedIva = getCedulaIvaPeriodo(state, empresa.id, periodo);
      const excluidosCount = [...iva.trasladadoRows, ...iva.acreditableRows].filter(
        (r) => !r.activo,
      ).length;
      return `En este momento en **Impuestos IVA** (${periodo}): **IVA Trasladado Cobrado** de **${formatMoney(iva.ivaTrasladado, ocultarMontos)}** (tasa 16%: ${formatMoney(cedIva.trasladado.ivaCobrado16, ocultarMontos)}), **IVA Acreditable Pagado** de **${formatMoney(iva.ivaAcreditable, ocultarMontos)}**, **IVA Retenido** de **${formatMoney(iva.ivaRetenido, ocultarMontos)}** y **${iva.ivaACargo >= 0 ? 'IVA a cargo' : 'IVA a favor'} de ${formatMoney(Math.abs(iva.ivaACargo), ocultarMontos)}** (con **${excluidosCount} CFDI(s) excluido(s) manualmente**).`;
    }
    case 'isr': {
      const isr = getIsrPeriodo(state, empresa.id, periodo);
      const cedIsr = getCedulaIsrPeriodo(state, empresa.id, periodo);
      const noDeduciblesCount = isr.deduccionesRows.filter((r) => r.excluido_automatico).length;
      return `En este momento en **Impuestos ISR** (${periodo}): **Ingresos cobrados del mes** por **${formatMoney(cedIsr.ingresosNominales.ingresosCobradosFlujo.periodo, ocultarMontos)}** (acumulado anual: **${formatMoney(cedIsr.ingresosNominales.ingresosCobradosFlujo.acumulado, ocultarMontos)}**), **Deducciones autorizadas del mes** por **${formatMoney(cedIsr.deduccionesAutorizadas.totalDeducciones.periodo, ocultarMontos)}** (incluyendo **${formatMoney(cedIsr.deduccionesAutorizadas.sueldosSalarios.periodo, ocultarMontos)}** de nómina), **${noDeduciblesCount} comprobante(s) no deducible(s)** y **Retenciones de ISR por enterar** de **${formatMoney(cedIsr.retencionesPorEnterar.totalRetenciones, ocultarMontos)}**.`;
    }
    case 'visor': {
      const aud = getVisorSatAuditoria(state, empresa, periodo);
      const conc = getConciliacionSummaryCount(state, empresa.id, periodo);
      return `En este momento en **Conciliación SAT** (${periodo}): estatus de declaración **${aud.declaracion.presentada ? 'PRESENTADA' : 'PENDIENTE'}**, diferencia de ingresos Visor SAT vs Portal de **${formatMoney(aud.ingresosNominales.discrepanciaVisor, ocultarMontos)}** y **${conc} comprobante(s) marcado(s) como "Solo en SAT"** pendientes de descargar.`;
    }
    case 'indicadores': {
      const fin = getIndicadoresFinancieros(state, empresa.id, periodo);
      const inds = evaluateIndicadores(state, empresa, periodo).filter((i) => i.conteo_ejercicio > 0);
      return `En este momento en **Indicadores** (${periodo}): **Ventas netas** por **${formatMoney(fin.ventas.ventasNetas, ocultarMontos)}** (${fin.ventas.ventasNetasPct >= 0 ? '+' : ''}${fin.ventas.ventasNetasPct.toFixed(1)}% vs mes anterior), **Cuentas por cobrar** de **${formatMoney(fin.cuentasPorCobrar.todos.total, ocultarMontos)}**, **Cuentas por pagar** de **${formatMoney(fin.cuentasPorPagar.todos.total, ocultarMontos)}** y **${inds.length} indicador(es) de riesgo SAT con incidencias activas**.`;
    }
    case 'emitidos': {
      const emitidos = companyCfdis.filter((c) => c.direccion === 'E');
      const ppd = getPpdPendientesCobro(state, empresa.id);
      return `En este momento en **CFDIs emitidos**: **${emitidos.length} comprobantes emitidos** registrados para **${empresa.razon_social}**, de los cuales **${ppd.length} facturas PPD** mantienen saldo pendiente de cobro por **${formatMoney(ppd.reduce((s, p) => s + p.pendiente, 0), ocultarMontos)}**.`;
    }
    case 'recibidos': {
      const recibidos = companyCfdis.filter((c) => c.direccion === 'R');
      const efos = recibidos.filter((c) =>
        state.lista_efos.some((e) => e.rfc.toUpperCase() === c.rfc_emisor.toUpperCase()),
      );
      return `En este momento en **CFDIs recibidos**: **${recibidos.length} comprobantes de proveedores** registrados para **${empresa.razon_social}**, con **${efos.length} comprobante(s) emitido(s) por RFCs en listado 69-B (EFOS)** detectados por las validaciones automáticas.`;
    }
    case 'sincronizacion': {
      const descs = state.descargas.filter((d) => d.empresa_id === empresa.id);
      const errs = descs.filter((d) => d.estado === 'Error').length;
      return `En este momento en **Sincronización SAT**: **${descs.length} solicitud(es) registradas en bitácora** para **${empresa.razon_social}** (${errs > 0 ? `**${errs} con error pendiente de reintento**` : 'todas completadas sin errores'}) y **${companyCfdis.length} XML activos** en la bóveda local.`;
    }
    case 'documentos': {
      const docs = state.documentos.filter((d) => d.empresa_id === empresa.id);
      const opSat = docs.find((d) => d.tipo === 'opinion_sat');
      const opImss = docs.find((d) => d.tipo === 'opinion_imss');
      return `En este momento en **Datos fiscales**: Opinión SAT 32-D en sentido **${opSat?.sentido.toUpperCase() || 'SIN CARGAR'}** (${opSat ? formatShortDate(opSat.fecha_consulta) : '—'}) y Opinión IMSS en sentido **${opImss?.sentido.toUpperCase() || 'SIN CARGAR'}**.`;
    }
    case 'efirma': {
      const ef = state.efirmas.find((e) => e.empresa_id === empresa.id);
      const dias = ef ? daysUntil(ef.vigencia_hasta) : 0;
      return ef
        ? `En este momento en **e.firma (FIEL)**: certificado serie **${ef.numero_serie}** con estatus **${ef.estado.toUpperCase()}**, vigente hasta **${formatShortDate(ef.vigencia_hasta)}** (**${dias} días restantes**) y resguardado de forma cifrada.`
        : `En este momento **${empresa.razon_social}** aún no tiene un certificado e.firma cargado.`;
    }
    case 'empresas': {
      return `En este momento en **Empresas (RFC)**: cuenta con **${state.empresas.length} empresas registradas** en el portal y se encuentra seleccionada como activa **${empresa.razon_social} (${empresa.rfc})** bajo el régimen **${empresa.regimen} · ${empresa.regimen_descripcion}**.`;
    }
    case 'usuarios': {
      const users = state.usuarios.filter((u) => u.empresa_id === empresa.id);
      return `En este momento en **Usuarios y roles**: sesión titular única activa de **C.P. Nayra Mendoza** (\`contabilidad@tecnocontrol.com.mx\`) con rol **Propietario** (${users.length} registro activo en **${empresa.razon_social}**).`;
    }
    case 'vinculaciones': {
      const cfg = state.aspel_configs.find((a) => a.empresa_id === empresa.id);
      const pendientes = companyCfdis.filter((c) => c.estatus_contable === 'pendiente' && c.estatus_sat === 'vigente').length;
      const conPoliza = companyCfdis.filter((c) => c.estatus_contable === 'con_poliza').length;
      return `En este momento en **Vinculaciones SAE**: conexión con servidor **${cfg?.servidor || 'SAE-SRV-01'}** **${cfg?.conectado ? 'EN LÍNEA' : 'DESCONECTADA'}**, con **${conPoliza} CFDIs con póliza asignada** y **${pendientes} comprobante(s) pendiente(s) de sincronizar**.`;
    }
    case 'contable': {
      const logs = state.contable_logs.filter((l) => l.empresa_id === empresa.id);
      return `En este momento en **ADD y Bitácora Contable**: **${logs.length} corrida(s) de sincronización ADD** registrada(s) hacia Aspel SAE para **${empresa.razon_social}**.`;
    }
    case 'consumo': {
      const con = state.consumos.find((c) => c.empresa_id === empresa.id);
      return `En este momento en **Usos y consumos**: **${companyCfdis.length}/${con?.cfdi_ejercicio_limite ?? 25000}** CFDIs en el ejercicio (**${con?.cfdi_historicos ?? companyCfdis.length}** históricos), **${con?.consultas_ia_mes ?? 0}/${con?.consultas_ia_limite ?? 500}** consultas mensuales a Asistente Tecno y **${con?.almacenamiento_mb ?? 0} MB** utilizados.`;
    }
    case 'asistente': {
      return `En este momento en **Asistente Tecno**: conectado en vivo con la base de datos de **${empresa.razon_social} (${empresa.rfc})**, auditando **${companyCfdis.length} CFDIs**, cédulas de IVA/ISR y motor de comprensión documental (PDF, Word, PPTX, Excel, CSV, XML y ZIP).`;
    }
  }
}

function getConciliacionSummaryCount(
  state: FiscalDatabaseState,
  empresaId: string,
  periodo: string,
): number {
  return state.cfdis.filter(
    (c) => c.empresa_id === empresaId && c.fecha_fiscal.startsWith(periodo) && c.solo_en_sat,
  ).length;
}

export function buildPageExplanationMessage(
  targetRoute: FiscalRoute,
  state: FiscalDatabaseState,
  empresa: Empresa,
  ocultarMontos: boolean,
  saludoNombre: string,
  periodo = '2026-10',
): Omit<AssistantMessage, 'id' | 'sender' | 'timestamp'> {
  const guide = PAGE_GUIDE_CATALOG[targetRoute] || PAGE_GUIDE_CATALOG.dashboard;
  const liveSnapshot = buildLiveRouteSnapshot(targetRoute, state, empresa, ocultarMontos, periodo);

  const seccionesList = guide.seccionesYElementos
    .map((item, idx) => `• **${idx + 1}.** ${item}`)
    .join('\n');

  const dudasList = guide.dudasFrecuentes
    .map((d) => `• **${d.pregunta}**\n  ${d.respuesta}`)
    .join('\n');

  const table: AssistantTableData = {
    exportName: `Guia_Rutas_${guide.route}_${empresa.rfc}`,
    headers: ['Pantalla conectada', 'Ruta en el menú', '¿Para qué ir a esa sección desde aquí?'],
    rows: [
      [
        `${guide.nombreCorto} (Pantalla actual)`,
        guide.ubicacionMenu.replace(/^Menú lateral →\s*/i, ''),
        'Vista explicada en este resumen.',
      ],
      ...guide.rutasRelacionadas.map((r) => {
        const relGuide = PAGE_GUIDE_CATALOG[r.route];
        return [
          r.nombre,
          relGuide ? relGuide.ubicacionMenu.replace(/^Menú lateral →\s*/i, '') : r.nombre,
          r.relacion,
        ];
      }),
    ],
  };

  const actions: AssistantAction[] = [
    { label: `Abrir ${guide.nombreCorto}`, route: guide.route },
    ...guide.rutasRelacionadas.slice(0, 3).map((r) => ({
      label: `Ir a ${r.nombre}`,
      route: r.route,
    })),
  ];

  const text = [
    `Con todo gusto le explico a detalle la pantalla **${guide.titulo}**${saludoNombre}:`,
    `**1. ¿Para qué sirve esta página?**\n${guide.proposito}\n• **Cómo llegar:** ${guide.ubicacionMenu}.`,
    `**2. Estado en vivo de ${empresa.razon_social} en esta pantalla:**\n${liveSnapshot}`,
    `**3. Todo lo que encuentra en esta pantalla (paso a paso):**\n${seccionesList}`,
    `**4. Dudas frecuentes resueltas sobre esta vista:**\n${dudasList}`,
    `Debajo encontrará la tabla con las **rutas conectadas** a esta pantalla y botones directos para desplazarse a cualquiera de ellas en un clic.`,
  ].join('\n\n');

  return {
    vistaConsultada: `Guía interactiva · ${guide.nombreCorto}`,
    text,
    table,
    actions,
    followUps: guide.followUps,
  };
}
