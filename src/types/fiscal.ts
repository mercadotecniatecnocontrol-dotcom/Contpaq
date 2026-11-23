// Tipos del Módulo Fiscal SAT — Portal Operativo Tecnocontrol
// Alineado 1:1 con el modelo de 15 tablas del esquema `fiscal` en Supabase
// para permitir migrar de almacenamiento local demo a Supabase sin cambiar las vistas.

export type RolEmpresa = 'propietario' | 'contador' | 'consulta' | 'pagos';

export type TipoPersona = 'moral' | 'fisica';

export type DireccionCfdi = 'E' | 'R'; // Emitido | Recibido

export type TipoCfdi = 'I' | 'E' | 'P' | 'N' | 'T'; // Ingreso | Egreso | Pago | Nómina | Traslado

export type MetodoPago = 'PUE' | 'PPD' | '';

export type EstatusSat = 'vigente' | 'cancelado' | 'en_cancelacion';

export type OrigenCfdi = 'sat' | 'manual';

export type EstatusEfirma = 'activa' | 'por_vencer' | 'vencida' | 'no_cargada';

export type EstatusDescarga = 'Procesando' | 'Completada' | 'Error' | 'Rechazada';

export type TipoDocumentoFiscal = 'constancia' | 'opinion_sat' | 'opinion_imss';

export type SentidoDocumento = 'positiva' | 'negativa' | 'vigente';

export type EstatusContable = 'con_poliza' | 'pendiente' | 'sin_registro';

// 1. fiscal.empresas
export interface Empresa {
  id: string;
  rfc: string;
  razon_social: string;
  regimen: string; // e.g., '601'
  regimen_descripcion: string;
  tipo_persona: TipoPersona;
  favorita: boolean;
  ultimo_acceso: string; // ISO date string
  codigo_postal: string;
}

// 2. fiscal.usuarios_empresa
export interface UsuarioEmpresa {
  id: string;
  usuario_id: string;
  empresa_id: string;
  nombre: string;
  correo: string;
  rol: RolEmpresa;
  invitado_por: string;
  invitado_en: string;
  aceptado_en: string | null; // null => invitación pendiente
}

// 3. fiscal.efirma (en frontend solo se manejan metadatos; .cer/.key/pass jamás se persisten en cliente)
export interface Efirma {
  empresa_id: string;
  numero_serie: string;
  rfc_certificado: string;
  vigencia_desde: string;
  vigencia_hasta: string;
  estado: EstatusEfirma;
  actualizada_en: string;
  actualizada_por: string;
}

// 4. fiscal.descargas
export interface DescargaSat {
  id: string;
  empresa_id: string;
  periodo: string; // ej. '2026-11' o '18 nov 2026'
  tipo: 'emitidos' | 'recibidos' | 'ambos';
  formato: 'xml' | 'metadata';
  fecha_ini: string;
  fecha_fin: string;
  id_solicitud_sat: string;
  estado: EstatusDescarga;
  cfdi_emitidos: number;
  cfdi_recibidos: number;
  inicio: string;
  fin: string | null;
  error: string | null;
}

// 5. fiscal.cfdi
export interface Cfdi {
  uuid: string;
  empresa_id: string;
  direccion: DireccionCfdi;
  tipo: TipoCfdi;
  version: '4.0' | '3.3';
  serie: string;
  folio: string;
  fecha_emision: string; // ISO datetime
  fecha_timbrado: string;
  fecha_fiscal: string; // YYYY-MM-DD
  rfc_emisor: string;
  nombre_emisor: string;
  regimen_emisor: string;
  rfc_receptor: string;
  nombre_receptor: string;
  regimen_receptor: string;
  uso_cfdi: string;
  metodo_pago: MetodoPago;
  forma_pago: string; // '01', '03', '99', etc.
  moneda: 'MXN' | 'USD' | 'EUR';
  tipo_cambio: number;
  subtotal: number;
  descuento: number;
  total: number;
  total_mxn: number;
  iva_trasladado: number;
  iva_retenido: number;
  isr_retenido: number;
  ieps: number;
  estatus_sat: EstatusSat;
  fecha_cancelacion: string | null;
  xml_path: string;
  origen: OrigenCfdi;
  // Integración Aspel SAE (Vinculaciones)
  estatus_contable?: EstatusContable;
  poliza_aspel?: string | null;
  fecha_poliza?: string | null;
  cuenta_contable?: string | null;
  // Bandera para Visor SAT (conciliación)
  solo_en_sat?: boolean;
  solo_en_portal?: boolean;
  // Metadatos estructurados de complementos SAT (Nómina 1.2 / Carta Porte 2.0-3.1)
  nomina_info?: {
    tipo_nomina: string;
    fecha_pago: string;
    fecha_inicial: string;
    fecha_final: string;
    num_dias_pagados: number;
    total_percepciones: number;
    total_deducciones: number;
    total_otros_pagos: number;
    curp?: string;
    num_empleado?: string;
    puesto?: string;
    departamento?: string;
  };
  carta_porte_info?: {
    version: string;
    transp_internac: string;
    total_dist_rec?: number;
    num_mercancias?: number;
    peso_bruto_total?: number;
    unidad_peso?: string;
    origen?: string;
    destino?: string;
  };
}

// 6. fiscal.cfdi_relaciones
export interface CfdiRelacion {
  id: string;
  empresa_id: string;
  uuid: string;
  uuid_relacionado: string;
  tipo_relacion: string; // '01', '04', '07', etc.
}

// 7. fiscal.cfdi_pagos (Complemento de Pagos 2.0 / REP)
export interface CfdiPago {
  id: string;
  empresa_id: string;
  uuid_pago: string; // UUID del CFDI tipo P
  uuid_documento: string; // UUID del CFDI PPD pagado
  num_parcialidad: number;
  saldo_anterior: number;
  importe_pagado: number;
  saldo_insoluto: number;
  fecha_pago: string; // YYYY-MM-DD
  fecha_emision_rep: string; // YYYY-MM-DD
  forma_pago: string;
}

// 8. fiscal.cfdi_conceptos
export interface CfdiConcepto {
  id: string;
  uuid: string;
  clave_prod_serv: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  valor_unitario: number;
  importe: number;
  objeto_imp: '01' | '02' | '03';
}

// 9. fiscal.impuesto_ajustes
export interface ImpuestoAjuste {
  id: string;
  empresa_id: string;
  uuid: string;
  impuesto: 'iva' | 'isr';
  periodo: string; // 'YYYY-MM'
  incluido: boolean;
  motivo: string;
  usuario: string;
  fecha: string;
}

// 10. fiscal.totales_sat (Metadatos SAT para Visor SAT)
export interface TotalSat {
  id: string;
  empresa_id: string;
  periodo: string; // 'YYYY-MM'
  direccion: DireccionCfdi;
  tipo: 'I' | 'E' | 'P';
  cfdi_sat: number;
  monto_sat: number;
  fecha_corte: string;
}

// 11. fiscal.documentos_fiscales
export interface DocumentoFiscal {
  id: string;
  empresa_id: string;
  tipo: TipoDocumentoFiscal;
  titulo: string;
  sentido: SentidoDocumento;
  folio_documento: string;
  fecha_consulta: string;
  archivo_path: string;
  archivo_nombre: string;
  blob_url?: string;
  notas?: string;
}

// 12. fiscal.indicadores (+ reglas personalizadas)
export type CampoFiltroIndicador =
  | 'tipo'
  | 'metodo_pago'
  | 'forma_pago'
  | 'uso_cfdi'
  | 'moneda'
  | 'total_mxn'
  | 'estatus_sat'
  | 'rfc_contraparte'
  | 'regimen_contraparte';

export type OperadorFiltro = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'contains';

export interface ReglaFiltroPersonalizado {
  campo: CampoFiltroIndicador;
  operador: OperadorFiltro;
  valor: string;
}

export interface IndicadorDefinicion {
  id: string;
  empresa_id: string | 'global';
  codigo: string;
  nombre: string;
  descripcion: string;
  grupo: string;
  aplica_emitidos: boolean;
  aplica_recibidos: boolean;
  es_predefinido: boolean;
  severidad: 'alta' | 'media' | 'informativa';
  filtros?: ReglaFiltroPersonalizado[];
  creado_con_ia?: boolean;
}

// 13. fiscal.indicador_resultados (calculado dinámicamente)
export interface IndicadorResultado {
  indicador: IndicadorDefinicion;
  uuids_periodo: string[];
  uuids_ejercicio: string[];
  conteo_periodo: number;
  conteo_ejercicio: number;
}

// 14. fiscal.notificaciones
export type TipoNotificacion =
  | 'cancelacion_proceso'
  | 'cfdi_cancelado'
  | 'descarga_error'
  | 'indicador_incidencia'
  | 'opinion_negativa'
  | 'efirma_vencimiento';

export interface NotificacionFiscal {
  id: string;
  empresa_id: string;
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  uuid?: string;
  fecha: string;
  leida: boolean;
  ruta_destino: FiscalRoute;
}

// 15. fiscal.bitacora (y registros contables Aspel SAE)
export interface BitacoraEvento {
  id: string;
  empresa_id: string;
  usuario: string;
  rol: RolEmpresa;
  accion: string;
  modulo: string;
  detalle: string;
  fecha: string;
}

export interface SincronizacionContable {
  id: string;
  empresa_id: string;
  empresa_nombre: string;
  guid: string;
  fecha: string;
  rango_inicio: string;
  rango_fin: string;
  direccion: 'Emitidos' | 'Recibidos' | 'Ambos';
  total_sincronizados: number;
  estatus: 'Completada' | 'Con advertencias' | 'Error';
  sistema: 'Aspel SAE';
}

export interface ConfiguracionAspel {
  empresa_id: string;
  conectado: boolean;
  servidor: string;
  base_datos: string;
  version_sae: string;
  ultima_sincronizacion: string;
  error_conexion: string | null;
}

export interface ConsumoEmpresa {
  empresa_id: string;
  cfdi_historicos: number;
  cfdi_ejercicio_limite: number;
  consultas_ia_mes: number;
  consultas_ia_limite: number;
  almacenamiento_mb: number;
  almacenamiento_limite_mb: number;
  desglose_anual: { anio: string; cantidad: number }[];
}

export interface ListaEfosEntry {
  rfc: string;
  razon_social: string;
  situacion: 'Presunto' | 'Definitivo' | 'Desvirtuado';
  fecha_publicacion: string;
}

// Rutas exactas del inventario (17 apartados)
export type FiscalRoute =
  | 'dashboard'
  | 'empresas'
  | 'efirma'
  | 'usuarios'
  | 'sincronizacion'
  | 'emitidos'
  | 'recibidos'
  | 'iva'
  | 'isr'
  | 'visor'
  | 'documentos'
  | 'indicadores'
  | 'contable'
  | 'vinculaciones'
  | 'consumo'
  | 'asistente';

export interface PreferenciasNotificacion {
  cancelacion_proceso: boolean;
  cfdi_cancelado: boolean;
  descarga_error: boolean;
  indicador_incidencia: boolean;
  opinion_negativa: boolean;
  efirma_vencimiento: boolean;
}

export interface FiscalDatabaseState {
  empresas: Empresa[];
  usuarios: UsuarioEmpresa[];
  efirmas: Efirma[];
  descargas: DescargaSat[];
  cfdis: Cfdi[];
  relaciones: CfdiRelacion[];
  pagos: CfdiPago[];
  conceptos: CfdiConcepto[];
  ajustes: ImpuestoAjuste[];
  totales_sat: TotalSat[];
  documentos: DocumentoFiscal[];
  indicadores_custom: IndicadorDefinicion[];
  grupos_indicadores: string[];
  notificaciones: NotificacionFiscal[];
  bitacora: BitacoraEvento[];
  contable_logs: SincronizacionContable[];
  aspel_configs: ConfiguracionAspel[];
  consumos: ConsumoEmpresa[];
  lista_efos: ListaEfosEntry[];
  fecha_corte_sat: string;
}
