import fs from 'node:fs';
import path from 'node:path';
import type { FiscalDatabaseState } from '../../src/types/fiscal';
import { createInitialSeed } from '../../src/data/mockSeed';
import { safeJsonParse, stripSensitiveSecrets } from '../../src/utils/security';

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const DB_FILE_PATH = path.join(DATA_DIR, 'fiscal_db.json');

const LEGACY_DEMO_USER_EMAILS = new Set([
  'direccion@tecnocontrol.com.mx',
  'pagos@tecnocontrol.com.mx',
  'gerencia.admin@tecnocontrol.com.mx',
  'aux.contable@tecnocontrol.com.mx',
]);

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
      const seed = createInitialSeed();
      return this.saveState(seed);
    }

    try {
      const raw = fs.readFileSync(DB_FILE_PATH, 'utf-8');
      const parsed = safeJsonParse<FiscalDatabaseState>(raw);
      if (!parsed || !Array.isArray(parsed.empresas) || parsed.empresas.length === 0) {
        const seed = createInitialSeed();
        return this.saveState(seed);
      }
      const normalized = normalizeSingleNayraProfile(parsed);
      this.cache = normalized;
      return normalized;
    } catch {
      const seed = createInitialSeed();
      return this.saveState(seed);
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
    const seed = createInitialSeed();
    return this.saveState(seed);
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
      dbPath: 'server/data/fiscal_db.json',
      fileSizeBytes,
      lastModified,
      totalCfdis: state.cfdis.length,
      totalEmpresas: state.empresas.length,
    };
  }
}

export const backendStorage: BackendStorageAdapter = new NodeFileStorageAdapter();
