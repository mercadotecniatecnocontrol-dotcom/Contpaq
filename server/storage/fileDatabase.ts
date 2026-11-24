import fs from 'node:fs';
import path from 'node:path';
import type { FiscalDatabaseState } from '../../src/types/fiscal';
import { createInitialSeed } from '../../src/data/mockSeed';
import { safeJsonParse, stripSensitiveSecrets } from '../../src/utils/security';

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const DB_FILE_PATH = path.join(DATA_DIR, 'fiscal_db.json');
const HEDMA_ID = 'emp-hedma';

const LEGACY_DEMO_USER_EMAILS = new Set([
  'direccion@tecnocontrol.com.mx',
  'pagos@tecnocontrol.com.mx',
  'gerencia.admin@tecnocontrol.com.mx',
  'aux.contable@tecnocontrol.com.mx',
]);

export function createCleanInitialState(): FiscalDatabaseState {
  const nowIso = new Date().toISOString();
  const full = createInitialSeed();

  const hedmaCfdis = full.cfdis.filter((c) => c.empresa_id === HEDMA_ID);
  const hedmaUuids = new Set(hedmaCfdis.map((c) => c.uuid));

  const hedmaEmpresa = full.empresas.find((e) => e.id === HEDMA_ID);

  return {
    fecha_corte_sat: full.fecha_corte_sat,
    empresas: [
      {
        id: HEDMA_ID,
        rfc: hedmaEmpresa?.rfc || 'HTE140318KQ9',
        razon_social: 'Hedma Tecno Control',
        regimen: hedmaEmpresa?.regimen || '601',
        regimen_descripcion: hedmaEmpresa?.regimen_descripcion || 'General de Ley Personas Morales',
        tipo_persona: 'moral',
        favorita: true,
        ultimo_acceso: nowIso,
        codigo_postal: hedmaEmpresa?.codigo_postal || '76125',
      },
    ],
    usuarios: [
      {
        id: 'usr-nayra-hedma',
        usuario_id: 'usr-nayra-mendoza',
        empresa_id: HEDMA_ID,
        nombre: 'C.P. Nayra Mendoza',
        correo: 'contabilidad@tecnocontrol.com.mx',
        rol: 'propietario',
        invitado_por: 'Sistema',
        invitado_en: '2026-01-10T09:00:00',
        aceptado_en: '2026-01-10T09:12:00',
      },
    ],
    efirmas: full.efirmas.filter((e) => e.empresa_id === HEDMA_ID),
    descargas: full.descargas.filter((d) => d.empresa_id === HEDMA_ID),
    cfdis: hedmaCfdis,
    relaciones: full.relaciones.filter((r) => r.empresa_id === HEDMA_ID),
    pagos: full.pagos.filter((p) => p.empresa_id === HEDMA_ID),
    conceptos: full.conceptos.filter((con) => hedmaUuids.has(con.uuid)),
    ajustes: full.ajustes.filter((a) => a.empresa_id === HEDMA_ID),
    totales_sat: full.totales_sat.filter((t) => t.empresa_id === HEDMA_ID),
    documentos: full.documentos.filter((d) => d.empresa_id === HEDMA_ID),
    indicadores_custom: full.indicadores_custom.filter(
      (i) => i.empresa_id === HEDMA_ID || i.empresa_id === 'global',
    ),
    grupos_indicadores: full.grupos_indicadores,
    notificaciones: full.notificaciones.filter((n) => n.empresa_id === HEDMA_ID),
    bitacora: full.bitacora.filter((b) => b.empresa_id === HEDMA_ID),
    contable_logs: full.contable_logs
      .filter((l) => l.empresa_id === HEDMA_ID)
      .map((l) => ({ ...l, empresa_nombre: 'Hedma Tecno Control' })),
    aspel_configs: full.aspel_configs.filter((a) => a.empresa_id === HEDMA_ID),
    consumos: full.consumos.filter((c) => c.empresa_id === HEDMA_ID),
    lista_efos: full.lista_efos,
  };
}

function normalizeSingleNayraProfile(state: FiscalDatabaseState): FiscalDatabaseState {
  if (!Array.isArray(state.usuarios)) return state;
  const cleanedUsers = state.usuarios
    .filter((u) => !LEGACY_DEMO_USER_EMAILS.has(u.correo.toLowerCase()))
    .map((u) =>
      u.correo.toLowerCase() === 'contabilidad@tecnocontrol.com.mx'
        ? { ...u, nombre: 'C.P. Nayra Mendoza', rol: 'propietario' as const }
        : u,
    );
  return {
    ...state,
    usuarios: cleanedUsers,
  };
}

export interface BackendStorageAdapter {
  readonly driverName: 'node-file-storage' | 'supabase-postgres';
  loadState(): FiscalDatabaseState;
  saveState(state: FiscalDatabaseState): FiscalDatabaseState;
  resetState(): FiscalDatabaseState;
  getStorageStats(): {
    driver: string;
    dbPath: string;
    fileSizeBytes: number;
    lastModified: string;
    totalCfdis: number;
    totalEmpresas: number;
  };
}

class NodeFileStorageAdapter implements BackendStorageAdapter {
  readonly driverName = 'node-file-storage' as const;
  private cache: FiscalDatabaseState | null = null;

  private ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  loadState(): FiscalDatabaseState {
    this.ensureDataDir();
    if (this.cache) {
      return this.cache;
    }

    if (!fs.existsSync(DB_FILE_PATH)) {
      const clean = createCleanInitialState();
      return this.saveState(clean);
    }

    try {
      const raw = fs.readFileSync(DB_FILE_PATH, 'utf-8');
      const parsed = safeJsonParse<FiscalDatabaseState>(raw);
      if (!parsed || !Array.isArray(parsed.empresas)) {
        const clean = createCleanInitialState();
        return this.saveState(clean);
      }
      const normalized = normalizeSingleNayraProfile(parsed);
      this.cache = normalized;
      return normalized;
    } catch {
      const clean = createCleanInitialState();
      return this.saveState(clean);
    }
  }

  saveState(state: FiscalDatabaseState): FiscalDatabaseState {
    this.ensureDataDir();
    // Jamás persistir llaves privadas ni contraseñas en la base de datos general
    const sanitized = stripSensitiveSecrets(normalizeSingleNayraProfile(state));
    const tmpPath = `${DB_FILE_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(sanitized, null, 2), 'utf-8');
    fs.renameSync(tmpPath, DB_FILE_PATH);
    this.cache = sanitized;
    return sanitized;
  }

  resetState(): FiscalDatabaseState {
    const clean = createCleanInitialState();
    return this.saveState(clean);
  }

  getStorageStats() {
    const state = this.loadState();
    let fileSizeBytes = 0;
    let lastModified = new Date().toISOString();
    try {
      if (fs.existsSync(DB_FILE_PATH)) {
        const st = fs.statSync(DB_FILE_PATH);
        fileSizeBytes = st.size;
        lastModified = st.mtime.toISOString();
      }
    } catch {
      // ignore stat errors
    }

    return {
      driver: this.driverName,
      dbPath: 'almacenamiento-servidor',
      fileSizeBytes,
      lastModified,
      totalCfdis: state.cfdis.length,
      totalEmpresas: state.empresas.length,
    };
  }
}

export const backendStorage: BackendStorageAdapter = new NodeFileStorageAdapter();
