import crypto, { type KeyObject, type X509Certificate } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const VAULT_FILE_PATH = path.join(DATA_DIR, 'vault.enc.json');

const EXTERNAL_KEY_DIR = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, 'TecnocontrolFiscal')
  : path.join(os.homedir(), '.tecnocontrol-fiscal');

export interface VaultEncryptedRecord {
  empresaId: string;
  rfc: string;
  numeroSerie: string;
  vigenciaDesde: string;
  vigenciaHasta: string;
  algoritmo: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA512-100000';
  saltHex: string;
  ivHex: string;
  authTagHex: string;
  cipherTextHex: string;
  cerSha256: string;
  keySha256: string;
  updatedAt: string;
  updatedBy: string;
}

export interface EfirmaValidationResult {
  ok: boolean;
  error?: string;
  numeroSerie?: string;
  rfcCertificado?: string;
  razonSocialCertificado?: string;
  vigenciaDesde?: string;
  vigenciaHasta?: string;
  esFielValida?: boolean;
  vaultRecord?: Omit<VaultEncryptedRecord, 'cipherTextHex' | 'saltHex' | 'ivHex' | 'authTagHex'>;
}

function readOrCreateKeyAt(dirPath: string): Buffer {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  const keyPath = path.join(dirPath, '.vault_master.key');
  if (fs.existsSync(keyPath)) {
    const hex = fs.readFileSync(keyPath, 'utf-8').trim();
    if (/^[0-9a-f]{64}$/i.test(hex)) {
      return Buffer.from(hex, 'hex');
    }
  }
  const generated = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, generated.toString('hex'), {
    encoding: 'utf-8',
    mode: 0o600,
  });
  return generated;
}

function getOrCreateMasterSecret(): Buffer {
  const envKey = process.env.TECNOCONTROL_VAULT_MASTER_KEY;
  if (envKey && envKey.length >= 32) {
    return crypto.createHash('sha256').update(envKey).digest();
  }
  try {
    return readOrCreateKeyAt(EXTERNAL_KEY_DIR);
  } catch {
    // Entornos restringidos: usar directorio temporal fuera del repositorio git
    return readOrCreateKeyAt(path.join(os.tmpdir(), 'tecnocontrol-fiscal'));
  }
}

function loadVaultStore(): Record<string, VaultEncryptedRecord> {
  if (!fs.existsSync(VAULT_FILE_PATH)) return {};
  try {
    const raw = fs.readFileSync(VAULT_FILE_PATH, 'utf-8');
    return JSON.parse(raw) as Record<string, VaultEncryptedRecord>;
  } catch {
    return {};
  }
}

function saveVaultStore(store: Record<string, VaultEncryptedRecord>): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmp = `${VAULT_FILE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), { encoding: 'utf-8', mode: 0o600 });
  fs.renameSync(tmp, VAULT_FILE_PATH);
}

function parseSatSerialNumber(rawHex: string): string {
  const clean = rawHex.replace(/[^0-9A-Fa-f]/g, '');
  if (clean.length === 40 && /^(3[0-9]){20}$/.test(clean)) {
    let ascii = '';
    for (let i = 0; i < clean.length; i += 2) {
      ascii += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
    }
    return ascii;
  }
  return clean.slice(0, 20).padStart(20, '0');
}

/**
 * Extrae el RFC contenido en el certificado X.509 (Subject / x500UniqueIdentifier del SAT).
 */
function extractRfcFromCertificate(x509: X509Certificate): string | null {
  const subject = x509.subject || '';
  const rfcPattern = /\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/i;

  const directMatch = subject.match(rfcPattern);
  if (directMatch) return directMatch[1].toUpperCase();

  // En algunos certificados del SAT el OID 2.5.4.45 viene en formato ASCII/UTF-8 dentro del DER
  try {
    const rawAscii = x509.raw.toString('latin1');
    const rawMatch = rawAscii.match(rfcPattern);
    if (rawMatch) return rawMatch[1].toUpperCase();
  } catch {
    // ignore
  }
  return null;
}

/**
 * Desencripta estrictamente la llave privada (.key) usando la contraseña proporcionada.
 * Rechaza archivos corruptos, contraseñas incorrectas y llaves sin cifrar.
 */
function openEncryptedPrivateKey(
  keyBuffer: Buffer,
  password: string,
): { ok: true; privateKey: KeyObject } | { ok: false; error: string } {
  const keyText = keyBuffer.toString('utf-8');
  if (
    keyText.includes('-----BEGIN PRIVATE KEY-----') ||
    keyText.includes('-----BEGIN RSA PRIVATE KEY-----') ||
    keyText.includes('-----BEGIN EC PRIVATE KEY-----')
  ) {
    return {
      ok: false,
      error:
        'La llave privada (.key) no está cifrada con contraseña. El SAT únicamente emite llaves privadas cifradas (PKCS#8).',
    };
  }

  // Verificar que la llave DER no sea PKCS#8 sin cifrar
  try {
    crypto.createPrivateKey({ key: keyBuffer, format: 'der', type: 'pkcs8' });
    return {
      ok: false,
      error:
        'La llave privada (.key) no está protegida con contraseña. Usa la llave .key cifrada oficial del SAT.',
    };
  } catch {
    // Esperado: una llave .key real del SAT está cifrada y falla sin passphrase
  }

  // 1. Formato nativo del SAT: PKCS#8 DER cifrado
  try {
    const privateKey = crypto.createPrivateKey({
      key: keyBuffer,
      format: 'der',
      type: 'pkcs8',
      passphrase: password,
    });
    return { ok: true, privateKey };
  } catch {
    // Intentar formato PEM cifrado
  }

  // 2. Formato alterno: PKCS#8 / PKCS#1 PEM cifrado
  try {
    const privateKey = crypto.createPrivateKey({
      key: keyBuffer,
      format: 'pem',
      passphrase: password,
    });
    return { ok: true, privateKey };
  } catch {
    return {
      ok: false,
      error:
        'No fue posible abrir la llave privada (.key) con la contraseña proporcionada. Verifica que el archivo .key y la contraseña sean correctos.',
    };
  }
}

/**
 * Valida criptográficamente de forma estricta un par e.firma (.cer + .key + contraseña):
 * 1. Parseo X.509 real (sin fallbacks falsos)
 * 2. Verificación de vigencia real y distinción FIEL vs CSD
 * 3. Coincidencia estricta de RFC con la empresa activa
 * 4. Descifrado real de llave privada .key con contraseña (PKCS#8)
 * 5. Prueba matemática de correspondencia .key <-> .cer (checkPrivateKey + SPKI + firma/verificación SHA-256)
 */
export function inspectAndValidateEfirma(params: {
  empresaId: string;
  expectedRfc: string;
  cerFileName: string;
  cerBase64: string;
  keyFileName: string;
  keyBase64: string;
  password: string;
  usuario: string;
}): EfirmaValidationResult {
  const {
    empresaId,
    expectedRfc,
    cerFileName,
    cerBase64,
    keyFileName,
    keyBase64,
    password,
    usuario,
  } = params;

  if (!cerFileName.toLowerCase().endsWith('.cer')) {
    return { ok: false, error: 'El certificado público debe tener extensión .cer.' };
  }
  if (!keyFileName.toLowerCase().endsWith('.key')) {
    return { ok: false, error: 'La llave privada debe tener extensión .key.' };
  }
  if (!password || password.length < 4) {
    return { ok: false, error: 'La contraseña de la clave privada es obligatoria.' };
  }

  const cerBuffer = Buffer.from(cerBase64 || '', 'base64');
  const keyBuffer = Buffer.from(keyBase64 || '', 'base64');

  if (cerBuffer.length < 128) {
    return {
      ok: false,
      error: 'El archivo .cer está vacío o no contiene un certificado X.509 válido.',
    };
  }
  if (keyBuffer.length < 128) {
    return {
      ok: false,
      error: 'El archivo .key está vacío o no contiene una llave privada PKCS#8 válida.',
    };
  }

  // 1. Parseo criptográfico real X.509 (cero fallbacks simulados)
  let x509: X509Certificate;
  try {
    x509 = new crypto.X509Certificate(cerBuffer);
  } catch {
    return {
      ok: false,
      error:
        'El archivo .cer no es un certificado X.509 válido (formato DER o PEM corrupto o irreconocible).',
    };
  }

  const subject = x509.subject || '';

  // 2. Rechazar Certificados de Sello Digital (CSD) de facturación
  if (
    /unidad de facturaci[oó]n|sello digital/i.test(subject) ||
    cerFileName.toLowerCase().includes('csd') ||
    cerFileName.toLowerCase().includes('sello')
  ) {
    return {
      ok: false,
      error:
        'El certificado X.509 proporcionado corresponde a un Sello Digital (CSD) de facturación. Se requiere una e.firma (FIEL).',
    };
  }

  // En certificados SAT reales, keyUsage de FIEL incluye firma digital
  if (
    Array.isArray(x509.keyUsage) &&
    x509.keyUsage.length > 0 &&
    !x509.keyUsage.some((u: string) => /digital\s*signature/i.test(u))
  ) {
    return {
      ok: false,
      error:
        'El certificado X.509 no cuenta con el uso de clave requerido para firma digital (e.firma FIEL).',
    };
  }

  // 3. Validar vigencia real del certificado X.509
  const dFrom = new Date(x509.validFrom);
  const dTo = new Date(x509.validTo);
  if (Number.isNaN(dFrom.getTime()) || Number.isNaN(dTo.getTime())) {
    return {
      ok: false,
      error: 'No fue posible leer las fechas de vigencia del certificado X.509.',
    };
  }

  const nowMs = Date.now();
  if (nowMs < dFrom.getTime()) {
    return {
      ok: false,
      error: `El certificado .cer aún no inicia vigencia (válido a partir de ${dFrom.toISOString().slice(0, 10)}).`,
    };
  }
  if (nowMs > dTo.getTime()) {
    return {
      ok: false,
      error: `El certificado .cer está vencido desde el ${dTo.toISOString().slice(0, 10)}. Renueva la e.firma ante el SAT.`,
    };
  }

  const vigenciaDesde = dFrom.toISOString().slice(0, 10);
  const vigenciaHasta = dTo.toISOString().slice(0, 10);
  const numeroSerie = parseSatSerialNumber(x509.serialNumber || '');

  // 4. Extraer y validar coincidencia estricta del RFC del certificado
  const rfcCertificado = extractRfcFromCertificate(x509);
  if (!rfcCertificado) {
    return {
      ok: false,
      error:
        'El certificado X.509 no contiene un RFC válido en su titular (Subject). Verifica que sea una e.firma emitida por el SAT.',
    };
  }
  if (rfcCertificado !== expectedRfc.trim().toUpperCase()) {
    return {
      ok: false,
      error: `El RFC del certificado X.509 (${rfcCertificado}) no coincide con el RFC de la empresa activa (${expectedRfc.toUpperCase()}).`,
    };
  }

  const cnMatch = subject.match(/CN=([^\n\r/]+)/i);
  const razonSocialCertificado = cnMatch ? cnMatch[1].trim() : '';

  // 5. Abrir y descifrar estrictamente la llave privada (.key) con la contraseña
  const keyResult = openEncryptedPrivateKey(keyBuffer, password);
  if (!keyResult.ok) {
    return { ok: false, error: keyResult.error };
  }
  const { privateKey } = keyResult;

  // 6. Prueba criptográfica de que la llave privada (.key) corresponde al certificado público (.cer)
  let keyPairMatches = false;
  try {
    const directCheck = x509.checkPrivateKey(privateKey);
    const derivedPubDer = crypto
      .createPublicKey(privateKey)
      .export({ type: 'spki', format: 'der' });
    const certPubDer = x509.publicKey.export({ type: 'spki', format: 'der' });
    const spkiMatches =
      derivedPubDer.length === certPubDer.length &&
      crypto.timingSafeEqual(derivedPubDer, certPubDer);

    const challenge = crypto.randomBytes(32);
    const signature = crypto.sign('sha256', challenge, privateKey);
    const verified = crypto.verify('sha256', challenge, x509.publicKey, signature);

    keyPairMatches = directCheck && spkiMatches && verified;
  } catch {
    keyPairMatches = false;
  }

  if (!keyPairMatches) {
    return {
      ok: false,
      error:
        'La llave privada (.key) NO corresponde al certificado público (.cer). Verifica que ambos archivos pertenezcan al mismo par de e.firma.',
    };
  }

  // 7. Cifrar (.cer, .key y password) con AES-256-GCM + PBKDF2-SHA512 usando la llave maestra externa
  const masterSecret = getOrCreateMasterSecret();
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.pbkdf2Sync(masterSecret, salt, 100_000, 32, 'sha512');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);

  const secretPayload = JSON.stringify({
    cerBase64: cerBuffer.toString('base64'),
    keyBase64: keyBuffer.toString('base64'),
    password,
    storedAt: new Date().toISOString(),
  });

  const encrypted = Buffer.concat([cipher.update(secretPayload, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const cerSha256 = crypto.createHash('sha256').update(cerBuffer).digest('hex');
  const keySha256 = crypto.createHash('sha256').update(keyBuffer).digest('hex');
  const nowIso = new Date().toISOString();

  const record: VaultEncryptedRecord = {
    empresaId,
    rfc: rfcCertificado,
    numeroSerie,
    vigenciaDesde,
    vigenciaHasta,
    algoritmo: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA512-100000',
    saltHex: salt.toString('hex'),
    ivHex: iv.toString('hex'),
    authTagHex: authTag.toString('hex'),
    cipherTextHex: encrypted.toString('hex'),
    cerSha256,
    keySha256,
    updatedAt: nowIso,
    updatedBy: usuario,
  };

  const store = loadVaultStore();
  store[empresaId] = record;
  saveVaultStore(store);

  const { cipherTextHex: _c, saltHex: _s, ivHex: _i, authTagHex: _a, ...publicVaultMeta } = record;

  return {
    ok: true,
    numeroSerie,
    rfcCertificado,
    razonSocialCertificado,
    vigenciaDesde,
    vigenciaHasta,
    esFielValida: true,
    vaultRecord: publicVaultMeta,
  };
}

/**
 * Uso exclusivo del Worker Backend SAT: descifra en memoria la e.firma para firmar
 * solicitudes SOAP del SAT sin exponerla jamás fuera del servidor.
 */
export function decryptEfirmaForServerWorker(empresaId: string): {
  rfc: string;
  numeroSerie: string;
  cerBase64: string;
  keyBase64: string;
  password: string;
} | null {
  const store = loadVaultStore();
  const rec = store[empresaId];
  if (!rec) return null;

  try {
    const masterSecret = getOrCreateMasterSecret();
    const salt = Buffer.from(rec.saltHex, 'hex');
    const derivedKey = crypto.pbkdf2Sync(masterSecret, salt, 100_000, 32, 'sha512');
    const iv = Buffer.from(rec.ivHex, 'hex');
    const authTag = Buffer.from(rec.authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(rec.cipherTextHex, 'hex')),
      decipher.final(),
    ]).toString('utf-8');

    const parsed = JSON.parse(decrypted) as {
      cerBase64: string;
      keyBase64: string;
      password: string;
    };

    return {
      rfc: rec.rfc,
      numeroSerie: rec.numeroSerie,
      cerBase64: parsed.cerBase64,
      keyBase64: parsed.keyBase64,
      password: parsed.password,
    };
  } catch {
    return null;
  }
}

export function getPublicVaultStatus(empresaId: string) {
  const store = loadVaultStore();
  const rec = store[empresaId];
  if (!rec) {
    return {
      configuredInVault: false,
      algoritmo: 'AES-256-GCM',
      kdf: 'PBKDF2-SHA512-100000',
    };
  }
  return {
    configuredInVault: true,
    algoritmo: rec.algoritmo,
    kdf: rec.kdf,
    rfc: rec.rfc,
    numeroSerie: rec.numeroSerie,
    cerSha256: `${rec.cerSha256.slice(0, 16)}…`,
    keySha256: `${rec.keySha256.slice(0, 16)}…`,
    updatedAt: rec.updatedAt,
    updatedBy: rec.updatedBy,
  };
}
