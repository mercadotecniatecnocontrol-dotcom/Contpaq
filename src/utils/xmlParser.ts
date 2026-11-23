import type {
  Cfdi,
  CfdiConcepto,
  CfdiPago,
  CfdiRelacion,
  Empresa,
  MetodoPago,
  TipoCfdi,
} from '../types/fiscal';
import { assertSafeXml } from './security';

export interface DetectedPartyRfcs {
  emisor: string;
  emisorNombre: string;
  emisorRegimen: string;
  receptor: string;
  receptorNombre: string;
  receptorRegimen: string;
}

export interface ParsedXmlResult {
  ok: boolean;
  error?: string;
  errorCode?: 'invalid_xml' | 'duplicate' | 'rfc_mismatch';
  detectedRfcs?: DetectedPartyRfcs;
  cfdi?: Cfdi;
  conceptos?: CfdiConcepto[];
  relaciones?: CfdiRelacion[];
  pagos?: CfdiPago[];
}

function getAttr(el: Element | null, ...names: string[]): string {
  if (!el) return '';
  for (const name of names) {
    const direct = el.getAttribute(name);
    if (direct !== null) return direct;
  }
  // Búsqueda case-insensitive como respaldo para XMLs 3.3/PAC especiales
  const lowerNames = names.map((n) => n.toLowerCase());
  for (let i = 0; i < el.attributes.length; i++) {
    const attr = el.attributes[i];
    if (lowerNames.includes(attr.name.toLowerCase())) {
      return attr.value;
    }
  }
  return '';
}

function numAttr(el: Element | null, ...names: string[]): number {
  const raw = getAttr(el, ...names);
  if (!raw) return 0;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

function findFirstByLocalName(root: Document | Element, localName: string): Element | null {
  const target = localName.toLowerCase();
  const all = root.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    if (all[i].localName.toLowerCase() === target) {
      return all[i];
    }
  }
  return null;
}

function findAllByLocalName(root: Document | Element, localName: string): Element[] {
  const target = localName.toLowerCase();
  const result: Element[] = [];
  const all = root.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    if (all[i].localName.toLowerCase() === target) {
      result.push(all[i]);
    }
  }
  return result;
}

function findDirectChildByLocalName(parent: Element, localName: string): Element | null {
  const target = localName.toLowerCase();
  for (let i = 0; i < parent.children.length; i++) {
    if (parent.children[i].localName.toLowerCase() === target) {
      return parent.children[i];
    }
  }
  return null;
}

function findDirectChildrenByLocalName(parent: Element, localName: string): Element[] {
  const target = localName.toLowerCase();
  const list: Element[] = [];
  for (let i = 0; i < parent.children.length; i++) {
    if (parent.children[i].localName.toLowerCase() === target) {
      list.push(parent.children[i]);
    }
  }
  return list;
}

export function parseCfdiXml(
  xmlText: string,
  empresa: Empresa,
  existingUuids: Set<string>,
): ParsedXmlResult {
  try {
    // Limpiar BOM UTF-8 y validar seguridad contra XXE / XML Bombs antes de parsear
    const cleanText = xmlText.replace(/^\uFEFF/, '').trim();
    const xmlCheck = assertSafeXml(cleanText);
    if (!xmlCheck.ok) {
      return { ok: false, errorCode: 'invalid_xml', error: xmlCheck.error };
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(cleanText, 'application/xml');
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      return { ok: false, errorCode: 'invalid_xml', error: 'El archivo no es un XML bien formado.' };
    }

    const comp = findFirstByLocalName(doc, 'Comprobante');
    if (!comp) {
      return {
        ok: false,
        errorCode: 'invalid_xml',
        error: 'No se encontró el nodo cfdi:Comprobante.',
      };
    }

    const emisor = findDirectChildByLocalName(comp, 'Emisor') || findFirstByLocalName(comp, 'Emisor');
    const receptor =
      findDirectChildByLocalName(comp, 'Receptor') || findFirstByLocalName(comp, 'Receptor');
    const timbre = findFirstByLocalName(comp, 'TimbreFiscalDigital');

    const uuid = getAttr(timbre, 'UUID', 'uuid').trim().toUpperCase();
    if (!uuid) {
      return {
        ok: false,
        errorCode: 'invalid_xml',
        error: 'El XML no contiene complemento TimbreFiscalDigital con UUID.',
      };
    }

    if (existingUuids.has(uuid)) {
      return {
        ok: false,
        errorCode: 'duplicate',
        error: `Duplicado omitido: UUID ${uuid.slice(0, 8)}… ya existe.`,
      };
    }

    const rfcEmisor = getAttr(emisor, 'Rfc', 'rfc').trim().toUpperCase();
    const nombreEmisor = getAttr(emisor, 'Nombre', 'nombre').trim() || rfcEmisor;
    const regimenEmisor = getAttr(emisor, 'RegimenFiscal', 'regimenFiscal').trim() || '601';

    const rfcReceptor = getAttr(receptor, 'Rfc', 'rfc').trim().toUpperCase();
    const nombreReceptor = getAttr(receptor, 'Nombre', 'nombre').trim() || rfcReceptor;
    const regimenReceptor =
      getAttr(receptor, 'RegimenFiscalReceptor', 'RegimenFiscal').trim() || '601';

    const detectedRfcs: DetectedPartyRfcs = {
      emisor: rfcEmisor,
      emisorNombre: nombreEmisor,
      emisorRegimen: regimenEmisor,
      receptor: rfcReceptor,
      receptorNombre: nombreReceptor,
      receptorRegimen: regimenReceptor,
    };

    const empresaRfc = empresa.rfc.trim().toUpperCase();
    let direccion: 'E' | 'R';
    if (rfcEmisor === empresaRfc) {
      direccion = 'E';
    } else if (rfcReceptor === empresaRfc) {
      direccion = 'R';
    } else {
      return {
        ok: false,
        errorCode: 'rfc_mismatch',
        detectedRfcs,
        error: `RFC no coincide con ${empresaRfc} (Emisor: ${rfcEmisor || 'N/A'} / Receptor: ${rfcReceptor || 'N/A'}).`,
      };
    }

    const versionRaw = getAttr(comp, 'Version', 'version');
    const version: '4.0' | '3.3' = versionRaw === '3.3' ? '3.3' : '4.0';
    const tipoRaw = getAttr(comp, 'TipoDeComprobante', 'tipoDeComprobante').trim().toUpperCase();
    const tipo: TipoCfdi = (['I', 'E', 'P', 'N', 'T'].includes(tipoRaw) ? tipoRaw : 'I') as TipoCfdi;

    const fechaEmision = getAttr(comp, 'Fecha', 'fecha') || new Date().toISOString();
    const fechaTimbrado = getAttr(timbre, 'FechaTimbrado', 'fechaTimbrado') || fechaEmision;
    const fechaFiscal = fechaEmision.slice(0, 10);

    const subtotal = numAttr(comp, 'SubTotal', 'subTotal');
    const descuento = numAttr(comp, 'Descuento', 'descuento');
    const total = numAttr(comp, 'Total', 'total');
    const monedaRaw = getAttr(comp, 'Moneda', 'moneda').trim().toUpperCase();
    const moneda: 'MXN' | 'USD' | 'EUR' =
      monedaRaw === 'USD' ? 'USD' : monedaRaw === 'EUR' ? 'EUR' : 'MXN';
    const tipoCambio = moneda === 'MXN' ? 1 : numAttr(comp, 'TipoCambio', 'tipoCambio') || 1;
    const fx = moneda === 'MXN' ? 1 : tipoCambio;
    const totalMxn = Number((total * fx).toFixed(2));

    // =========================================================================
    // IMPUESTOS (CFDI 4.0 / 3.3 — nodo raíz cfdi:Impuestos + respaldo por concepto)
    // =========================================================================
    const impuestosRoot = findDirectChildByLocalName(comp, 'Impuestos');
    let ivaTrasladado = 0;
    let ivaRetenido = 0;
    let isrRetenido = 0;
    let ieps = 0;

    if (impuestosRoot) {
      const traslados = findAllByLocalName(impuestosRoot, 'Traslado');
      for (const t of traslados) {
        const imp = getAttr(t, 'Impuesto');
        const amt = numAttr(t, 'Importe');
        if (imp === '002' || imp.toUpperCase() === 'IVA') ivaTrasladado += amt * fx;
        if (imp === '003' || imp.toUpperCase() === 'IEPS') ieps += amt * fx;
      }
      const retenciones = findAllByLocalName(impuestosRoot, 'Retencion');
      for (const r of retenciones) {
        const imp = getAttr(r, 'Impuesto');
        const amt = numAttr(r, 'Importe');
        if (imp === '002' || imp.toUpperCase() === 'IVA') ivaRetenido += amt * fx;
        if (imp === '001' || imp.toUpperCase() === 'ISR') isrRetenido += amt * fx;
      }
      // Si solo venía TotalImpuestosTrasladados sin hijos desglosados
      if (ivaTrasladado === 0 && ieps === 0) {
        const totalTras = numAttr(impuestosRoot, 'TotalImpuestosTrasladados');
        if (totalTras > 0) ivaTrasladado = totalTras * fx;
      }
    }

    const metodoRaw = getAttr(comp, 'MetodoPago', 'metodoPago').trim().toUpperCase();
    const metodoPago: MetodoPago = metodoRaw === 'PUE' ? 'PUE' : metodoRaw === 'PPD' ? 'PPD' : '';
    let formaPago = getAttr(comp, 'FormaPago', 'formaPago').trim();

    // =========================================================================
    // COMPLEMENTO DE PAGOS 2.0 (pago20:Pagos) Y 1.0 (pago10:Pagos)
    // =========================================================================
    const pagos: CfdiPago[] = [];
    const pagosRoot = findFirstByLocalName(comp, 'Pagos');
    if (pagosRoot) {
      const pagoNodes = findAllByLocalName(pagosRoot, 'Pago');
      pagoNodes.forEach((pagoEl, pIdx) => {
        const fechaPagoRaw = getAttr(pagoEl, 'FechaPago') || fechaEmision;
        const fechaPago = fechaPagoRaw.slice(0, 10);
        const formaPagoP = getAttr(pagoEl, 'FormaDePagoP') || '03';
        const monedaP = getAttr(pagoEl, 'MonedaP').toUpperCase() || 'MXN';
        const tcP = monedaP === 'MXN' ? 1 : numAttr(pagoEl, 'TipoCambioP') || 1;
        if (!formaPago) formaPago = formaPagoP;

        const doctos = findAllByLocalName(pagoEl, 'DoctoRelacionado');
        doctos.forEach((dr, dIdx) => {
          const idDoc = getAttr(dr, 'IdDocumento').trim().toUpperCase();
          if (!idDoc) return;
          const monedaDr = getAttr(dr, 'MonedaDR').toUpperCase() || monedaP;
          const equivDr = numAttr(dr, 'EquivalenciaDR') || 1;
          // Conversión a MXN si el documento está en moneda extranjera
          const drFactor =
            monedaDr === 'MXN' ? 1 : monedaP === 'MXN' ? 1 / (equivDr || 1) : tcP / (equivDr || 1);

          const saldoAnt = Number((numAttr(dr, 'ImpSaldoAnt') * drFactor).toFixed(2));
          const impPagado = Number((numAttr(dr, 'ImpPagado') * drFactor).toFixed(2));
          const saldoIns = Number((numAttr(dr, 'ImpSaldoInsoluto') * drFactor).toFixed(2));
          const numParc = Math.max(1, Math.round(numAttr(dr, 'NumParcialidad') || 1));

          pagos.push({
            id: `pag-${uuid}-${pIdx}-${dIdx}`,
            empresa_id: empresa.id,
            uuid_pago: uuid,
            uuid_documento: idDoc,
            num_parcialidad: numParc,
            saldo_anterior: saldoAnt,
            importe_pagado: impPagado,
            saldo_insoluto: saldoIns,
            fecha_pago: fechaPago,
            fecha_emision_rep: fechaFiscal,
            forma_pago: formaPagoP,
          });
        });
      });
    }

    // =========================================================================
    // COMPLEMENTO DE NÓMINA 1.2 (nomina12:Nomina)
    // =========================================================================
    let nominaInfo: Cfdi['nomina_info'];
    const nominaEl = findFirstByLocalName(comp, 'Nomina');
    if (nominaEl) {
      const nomReceptor = findFirstByLocalName(nominaEl, 'Receptor');
      const deducciones = findAllByLocalName(nominaEl, 'Deduccion');
      if (isrRetenido === 0) {
        for (const ded of deducciones) {
          if (getAttr(ded, 'TipoDeduccion') === '002') {
            isrRetenido += numAttr(ded, 'Importe');
          }
        }
      }
      nominaInfo = {
        tipo_nomina: getAttr(nominaEl, 'TipoNomina') === 'E' ? 'Extraordinaria' : 'Ordinaria',
        fecha_pago: getAttr(nominaEl, 'FechaPago').slice(0, 10) || fechaFiscal,
        fecha_inicial: getAttr(nominaEl, 'FechaInicialPago').slice(0, 10) || fechaFiscal,
        fecha_final: getAttr(nominaEl, 'FechaFinalPago').slice(0, 10) || fechaFiscal,
        num_dias_pagados: numAttr(nominaEl, 'NumDiasPagados'),
        total_percepciones: numAttr(nominaEl, 'TotalPercepciones'),
        total_deducciones: numAttr(nominaEl, 'TotalDeducciones'),
        total_otros_pagos: numAttr(nominaEl, 'TotalOtrosPagos'),
        curp: getAttr(nomReceptor, 'Curp') || undefined,
        num_empleado: getAttr(nomReceptor, 'NumEmpleado') || undefined,
        puesto: getAttr(nomReceptor, 'Puesto') || undefined,
        departamento: getAttr(nomReceptor, 'Departamento') || undefined,
      };
    }

    // =========================================================================
    // COMPLEMENTO CARTA PORTE 2.0 / 3.0 / 3.1
    // =========================================================================
    let cartaPorteInfo: Cfdi['carta_porte_info'];
    const cpEl = findFirstByLocalName(comp, 'CartaPorte');
    if (cpEl) {
      const mercanciasEl = findFirstByLocalName(cpEl, 'Mercancias');
      const ubicaciones = findAllByLocalName(cpEl, 'Ubicacion');
      let origen: string | undefined;
      let destino: string | undefined;
      for (const ub of ubicaciones) {
        const tipoUb = getAttr(ub, 'TipoUbicacion').toLowerCase();
        const dom = findFirstByLocalName(ub, 'Domicilio');
        const label = [getAttr(dom, 'Municipio'), getAttr(dom, 'Estado'), getAttr(dom, 'CodigoPostal')]
          .filter(Boolean)
          .join(', ');
        if (tipoUb === 'origen') origen = label || getAttr(ub, 'NombreRemitenteDestinatario') || 'Origen';
        if (tipoUb === 'destino') destino = label || getAttr(ub, 'NombreRemitenteDestinatario') || 'Destino';
      }

      cartaPorteInfo = {
        version: getAttr(cpEl, 'Version') || '3.1',
        transp_internac: getAttr(cpEl, 'TranspInternac') || 'No',
        total_dist_rec: numAttr(cpEl, 'TotalDistRec') || undefined,
        num_mercancias: numAttr(mercanciasEl, 'NumTotalMercancias') || undefined,
        peso_bruto_total: numAttr(mercanciasEl, 'PesoBrutoTotal') || undefined,
        unidad_peso: getAttr(mercanciasEl, 'UnidadPeso') || undefined,
        origen,
        destino,
      };
    }

    const cfdi: Cfdi = {
      uuid,
      empresa_id: empresa.id,
      direccion,
      tipo,
      version,
      serie: getAttr(comp, 'Serie', 'serie') || (tipo === 'P' ? 'REP' : tipo === 'N' ? 'NOM' : 'S/S'),
      folio: getAttr(comp, 'Folio', 'folio') || uuid.slice(0, 6),
      fecha_emision: fechaEmision,
      fecha_timbrado: fechaTimbrado,
      fecha_fiscal: fechaFiscal,
      rfc_emisor: rfcEmisor,
      nombre_emisor: nombreEmisor,
      regimen_emisor: regimenEmisor,
      rfc_receptor: rfcReceptor,
      nombre_receptor: nombreReceptor,
      regimen_receptor: regimenReceptor,
      uso_cfdi: getAttr(receptor, 'UsoCFDI', 'usoCFDI').trim() || (tipo === 'P' ? 'CP01' : tipo === 'N' ? 'CN01' : 'G03'),
      metodo_pago: metodoPago,
      forma_pago: formaPago,
      moneda,
      tipo_cambio: tipoCambio,
      subtotal,
      descuento,
      total,
      total_mxn: totalMxn,
      iva_trasladado: Number(ivaTrasladado.toFixed(2)),
      iva_retenido: Number(ivaRetenido.toFixed(2)),
      isr_retenido: Number(isrRetenido.toFixed(2)),
      ieps: Number(ieps.toFixed(2)),
      estatus_sat: 'vigente',
      fecha_cancelacion: null,
      xml_path: `manual/${empresa.rfc}/${fechaFiscal.slice(0, 4)}/${uuid}.xml`,
      origen: 'manual',
      estatus_contable: 'pendiente',
      poliza_aspel: null,
      fecha_poliza: null,
      cuenta_contable: null,
      nomina_info: nominaInfo,
      carta_porte_info: cartaPorteInfo,
    };

    // Conceptos
    const conceptosParent = findDirectChildByLocalName(comp, 'Conceptos');
    const conceptosEls = conceptosParent
      ? findDirectChildrenByLocalName(conceptosParent, 'Concepto')
      : findAllByLocalName(comp, 'Concepto');

    const conceptos: CfdiConcepto[] = conceptosEls.map((c, idx) => ({
      id: `con-${uuid}-${idx}`,
      uuid,
      clave_prod_serv: getAttr(c, 'ClaveProdServ') || '84111506',
      descripcion: getAttr(c, 'Descripcion') || 'Concepto importado',
      cantidad: numAttr(c, 'Cantidad') || 1,
      unidad: getAttr(c, 'ClaveUnidad', 'Unidad') || 'E48',
      valor_unitario: numAttr(c, 'ValorUnitario'),
      importe: numAttr(c, 'Importe'),
      objeto_imp: (getAttr(c, 'ObjetoImp') as '01' | '02' | '03') || '02',
    }));

    // Relaciones (CFDI 4.0 admite múltiples nodos CfdiRelacionados)
    const relsParents = findAllByLocalName(comp, 'CfdiRelacionados');
    const relaciones: CfdiRelacion[] = [];
    for (const parent of relsParents) {
      const tipoRel = getAttr(parent, 'TipoRelacion') || '04';
      const relNodes = findAllByLocalName(parent, 'CfdiRelacionado');
      for (const rn of relNodes) {
        const relUuid = getAttr(rn, 'UUID').trim().toUpperCase();
        if (relUuid) {
          relaciones.push({
            id: `rel-${uuid}-${relUuid}-${tipoRel}`,
            empresa_id: empresa.id,
            uuid,
            uuid_relacionado: relUuid,
            tipo_relacion: tipoRel,
          });
        }
      }
    }

    return { ok: true, cfdi, conceptos, relaciones, pagos };
  } catch (err) {
    return {
      ok: false,
      errorCode: 'invalid_xml',
      error: err instanceof Error ? err.message : 'Error inesperado al analizar el XML.',
    };
  }
}
