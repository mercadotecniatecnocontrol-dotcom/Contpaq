import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RolEmpresa } from '../../src/types/fiscal';
import { safeJsonParse } from '../../src/utils/security';

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const AUTH_USERS_PATH = path.join(DATA_DIR, 'auth_users.json');
const SESSIONS_PATH = path.join(DATA_DIR, 'sessions.json');

export const SESSION_COOKIE_NAME = 'tc_fiscal_session';
const PBKDF2_ITERATIONS = 120_000;
const PBKDF2_KEYLEN = 64;
const SESSION_TTL_SHORT_MS = 8 * 60 * 60 * 1000; // 8 horas
const SESSION_TTL_REMEMBER_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 5 * 60 * 1000; // 5 minutos

// Contraseña inicial de primer acceso para C.P. Nayra Mendoza (se guarda solo como hash PBKDF2-SHA512)
export const INITIAL_ADMIN_EMAIL = 'contabilidad@tecnocontrol.com.mx';
export const INITIAL_ADMIN_PASSWORD = process.env.FISCAL_ADMIN_PASSWORD || 'Tecnocontrol2026!';

export interface PublicAuthUser {
  id: string;
  nombre: string;
  correo: string;
  rol: RolEmpresa;
  area: string;
  ultimoAcceso?: string;
}

interface StoredAuthUser extends PublicAuthUser {
  passwordHash: string;
  passwordSalt: string;
  activo: boolean;
  creadoEn: string;
  actualizadoEn: string;
}

interface StoredSession {
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  ip: string;
}

interface FailedLoginBucket {
  attempts: number;
  lockedUntil: number;
}

const failedAttempts = new Map<string, FailedLoginBucket>();

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function hashPassword(password: string, saltHex?: string): { hash: string; salt: string } {
  const salt = saltHex || crypto.randomBytes(16).toString('hex');
  const derived = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, 'sha512');
  return { hash: derived.toString('hex'), salt };
}

function verifyPassword(password: string, storedHash: string, storedSalt: string): boolean {
  const derived = crypto.pbkdf2Sync(password, storedSalt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, 'sha512');
  const expected = Buffer.from(storedHash, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf-8').digest('hex');
}

function writeJsonAtomic(filePath: string, data: unknown): void {
  ensureDataDir();
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

function loadUsers(): StoredAuthUser[] {
  ensureDataDir();
  if (!fs.existsSync(AUTH_USERS_PATH)) {
    const nowIso = new Date().toISOString();
    const { hash, salt } = hashPassword(INITIAL_ADMIN_PASSWORD);
    const seedUsers: StoredAuthUser[] = [
      {
        id: 'usr-nayra-mendoza',
        nombre: 'C.P. Nayra Mendoza',
        correo: INITIAL_ADMIN_EMAIL,
        rol: 'propietario',
        area: 'Contabilidad y Fiscal',
        passwordHash: hash,
        passwordSalt: salt,
        activo: true,
        creadoEn: nowIso,
        actualizadoEn: nowIso,
      },
    ];
    writeJsonAtomic(AUTH_USERS_PATH, seedUsers);
    return seedUsers;
  }

  try {
    const raw = fs.readFileSync(AUTH_USERS_PATH, 'utf-8');
    const parsed = safeJsonParse<StoredAuthUser[]>(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // regenerar si el archivo está corrupto
  }

  const nowIso = new Date().toISOString();
  const { hash, salt } = hashPassword(INITIAL_ADMIN_PASSWORD);
  const fallback: StoredAuthUser[] = [
    {
      id: 'usr-nayra-mendoza',
      nombre: 'C.P. Nayra Mendoza',
      correo: INITIAL_ADMIN_EMAIL,
      rol: 'propietario',
      area: 'Contabilidad y Fiscal',
      passwordHash: hash,
      passwordSalt: salt,
      activo: true,
      creadoEn: nowIso,
      actualizadoEn: nowIso,
    },
  ];
  writeJsonAtomic(AUTH_USERS_PATH, fallback);
  return fallback;
}

function saveUsers(users: StoredAuthUser[]): void {
  writeJsonAtomic(AUTH_USERS_PATH, users);
}

function loadSessions(): StoredSession[] {
  ensureDataDir();
  if (!fs.existsSync(SESSIONS_PATH)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(SESSIONS_PATH, 'utf-8');
    const parsed = safeJsonParse<StoredSession[]>(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter((s) => new Date(s.expiresAt).getTime() > now);
  } catch {
    return [];
  }
}

function saveSessions(sessions: StoredSession[]): void {
  const now = Date.now();
  const active = sessions.filter((s) => new Date(s.expiresAt).getTime() > now);
  writeJsonAtomic(SESSIONS_PATH, active);
}

function toPublicUser(u: StoredAuthUser): PublicAuthUser {
  return {
    id: u.id,
    nombre: u.nombre,
    correo: u.correo,
    rol: u.rol,
    area: u.area,
    ultimoAcceso: u.ultimoAcceso,
  };
}

export function extractSessionToken(req: IncomingMessage): string | null {
  // 1. Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token.length >= 32) return token;
  }

  // 2. Cookie HttpOnly
  const cookieHeader = req.headers.cookie;
  if (typeof cookieHeader === 'string') {
    const pairs = cookieHeader.split(';');
    for (const pair of pairs) {
      const idx = pair.indexOf('=');
      if (idx < 0) continue;
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      if (key === SESSION_COOKIE_NAME && val.length >= 32) {
        return decodeURIComponent(val);
      }
    }
  }

  return null;
}

export function setSessionCookie(
  res: ServerResponse,
  token: string,
  maxAgeSeconds: number,
): void {
  const cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
  res.setHeader('Set-Cookie', cookie);
}

export function clearSessionCookie(res: ServerResponse): void {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
  );
}

export function authenticateCredentials(payload: {
  email: string;
  password: string;
  rememberMe?: boolean;
  clientIp: string;
}): {
  ok: boolean;
  statusCode: number;
  error?: string;
  user?: PublicAuthUser;
  token?: string;
  expiresAt?: string;
  maxAgeSeconds?: number;
} {
  const emailNorm = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '');
  const lockKey = `${payload.clientIp}::${emailNorm}`;
  const now = Date.now();

  const bucket = failedAttempts.get(lockKey);
  if (bucket && bucket.lockedUntil > now) {
    const waitMin = Math.ceil((bucket.lockedUntil - now) / 60_000);
    return {
      ok: false,
      statusCode: 429,
      error: `Demasiados intentos fallidos. Por seguridad, intenta nuevamente en ${waitMin} minuto(s).`,
    };
  }

  if (!emailNorm || !password) {
    return {
      ok: false,
      statusCode: 400,
      error: 'Ingresa tu correo electrónico y contraseña.',
    };
  }

  const users = loadUsers();
  const userIdx = users.findIndex((u) => u.correo.toLowerCase() === emailNorm && u.activo);
  const foundUser = userIdx >= 0 ? users[userIdx] : null;

  const passwordValid = foundUser
    ? verifyPassword(password, foundUser.passwordHash, foundUser.passwordSalt)
    : false;

  if (!foundUser || !passwordValid) {
    const nextAttempts = (bucket?.attempts || 0) + 1;
    if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
      failedAttempts.set(lockKey, {
        attempts: nextAttempts,
        lockedUntil: now + LOCKOUT_WINDOW_MS,
      });
      return {
        ok: false,
        statusCode: 429,
        error:
          'Se alcanzó el límite de 5 intentos fallidos. El acceso quedó bloqueado temporalmente por 5 minutos.',
      };
    }
    failedAttempts.set(lockKey, { attempts: nextAttempts, lockedUntil: 0 });
    return {
      ok: false,
      statusCode: 401,
      error: 'Correo o contraseña incorrectos. Verifica tus credenciales.',
    };
  }

  // Acceso correcto: limpiar intentos fallidos
  failedAttempts.delete(lockKey);

  const nowIso = new Date().toISOString();
  const ttlMs = payload.rememberMe ? SESSION_TTL_REMEMBER_MS : SESSION_TTL_SHORT_MS;
  const expiresIso = new Date(now + ttlMs).toISOString();
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken);

  users[userIdx] = {
    ...foundUser,
    ultimoAcceso: nowIso,
  };
  saveUsers(users);

  const sessions = loadSessions();
  sessions.push({
    tokenHash,
    userId: foundUser.id,
    createdAt: nowIso,
    expiresAt: expiresIso,
    lastSeenAt: nowIso,
    ip: payload.clientIp,
  });
  saveSessions(sessions);

  return {
    ok: true,
    statusCode: 200,
    user: toPublicUser(users[userIdx]),
    token: rawToken,
    expiresAt: expiresIso,
    maxAgeSeconds: Math.floor(ttlMs / 1000),
  };
}

export function getAuthenticatedSession(req: IncomingMessage): {
  authenticated: boolean;
  user?: PublicAuthUser;
  expiresAt?: string;
} {
  const token = extractSessionToken(req);
  if (!token) return { authenticated: false };

  const tokenHash = hashSessionToken(token);
  const sessions = loadSessions();
  const session = sessions.find((s) => s.tokenHash === tokenHash);
  if (!session) return { authenticated: false };

  const users = loadUsers();
  const user = users.find((u) => u.id === session.userId && u.activo);
  if (!user) return { authenticated: false };

  return {
    authenticated: true,
    user: toPublicUser(user),
    expiresAt: session.expiresAt,
  };
}

export function revokeSessionFromRequest(req: IncomingMessage): void {
  const token = extractSessionToken(req);
  if (!token) return;
  const tokenHash = hashSessionToken(token);
  const sessions = loadSessions();
  const next = sessions.filter((s) => s.tokenHash !== tokenHash);
  if (next.length !== sessions.length) {
    saveSessions(next);
  }
}

export function changeUserPassword(payload: {
  userId: string;
  currentPassword: string;
  newPassword: string;
  currentToken?: string | null;
}): { ok: boolean; statusCode: number; error?: string } {
  const currentPassword = String(payload.currentPassword || '');
  const newPassword = String(payload.newPassword || '');

  if (newPassword.length < 8) {
    return {
      ok: false,
      statusCode: 400,
      error: 'La nueva contraseña debe tener al menos 8 caracteres.',
    };
  }
  if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
    return {
      ok: false,
      statusCode: 400,
      error: 'La nueva contraseña debe incluir letras y al menos un número.',
    };
  }
  if (newPassword === currentPassword) {
    return {
      ok: false,
      statusCode: 400,
      error: 'La nueva contraseña debe ser diferente a la actual.',
    };
  }

  const users = loadUsers();
  const idx = users.findIndex((u) => u.id === payload.userId && u.activo);
  if (idx < 0) {
    return { ok: false, statusCode: 404, error: 'Usuario no encontrado.' };
  }

  const user = users[idx];
  if (!verifyPassword(currentPassword, user.passwordHash, user.passwordSalt)) {
    return {
      ok: false,
      statusCode: 401,
      error: 'La contraseña actual es incorrecta.',
    };
  }

  const { hash, salt } = hashPassword(newPassword);
  users[idx] = {
    ...user,
    passwordHash: hash,
    passwordSalt: salt,
    actualizadoEn: new Date().toISOString(),
  };
  saveUsers(users);

  // Cerrar otras sesiones del mismo usuario excepto la actual
  const keepHash = payload.currentToken ? hashSessionToken(payload.currentToken) : null;
  const sessions = loadSessions();
  saveSessions(
    sessions.filter((s) => s.userId !== payload.userId || (keepHash && s.tokenHash === keepHash)),
  );

  return { ok: true, statusCode: 200 };
}
