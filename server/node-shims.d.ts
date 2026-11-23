// Declaraciones de tipos nativos de Node.js para el Backend y vite.config.ts
// Archivo de declaración ambiental global (sin `export {}` en la raíz)

interface Buffer extends Uint8Array<ArrayBuffer> {
  toString(encoding?: 'utf-8' | 'utf8' | 'hex' | 'base64' | 'ascii'): string;
  slice(start?: number, end?: number): Buffer;
}

declare var Buffer: {
  from(data: string, encoding?: 'utf-8' | 'utf8' | 'hex' | 'base64' | 'ascii'): Buffer;
  from(data: ArrayBufferLike | Uint8Array | Buffer | number[]): Buffer;
  concat(list: readonly (Uint8Array | Buffer)[], totalLength?: number): Buffer;
  isBuffer(obj: unknown): obj is Buffer;
};

declare var process: {
  cwd(): string;
  env: Record<string, string | undefined>;
  exit(code?: number): never;
};

declare module 'http' {
  export interface IncomingMessage {
    url?: string;
    method?: string;
    headers: Record<string, string | string[] | undefined>;
    socket?: {
      remoteAddress?: string;
    };
    on(event: 'data', listener: (chunk: Buffer) => void): this;
    on(event: 'end', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    destroy(): void;
  }

  export interface ServerResponse {
    statusCode: number;
    setHeader(name: string, value: number | string | readonly string[]): this;
    getHeader(name: string): number | string | string[] | undefined;
    end(chunk?: string | Buffer): this;
  }

  export interface Server {
    listen(port?: number, hostname?: string, listeningListener?: () => void): this;
  }

  export function createServer(
    requestListener?: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
  ): Server;

  const httpDefault: {
    createServer: typeof createServer;
  };
  export default httpDefault;
}

declare module 'node:http' {
  export interface IncomingMessage {
    url?: string;
    method?: string;
    headers: Record<string, string | string[] | undefined>;
    socket?: {
      remoteAddress?: string;
    };
    on(event: 'data', listener: (chunk: Buffer) => void): this;
    on(event: 'end', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    destroy(): void;
  }

  export interface ServerResponse {
    statusCode: number;
    setHeader(name: string, value: number | string | readonly string[]): this;
    getHeader(name: string): number | string | string[] | undefined;
    end(chunk?: string | Buffer): this;
  }

  export interface Server {
    listen(port?: number, hostname?: string, listeningListener?: () => void): this;
  }

  export function createServer(
    requestListener?: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
  ): Server;

  const httpDefault: {
    createServer: typeof createServer;
  };
  export default httpDefault;
}

declare module 'node:fs' {
  export interface Stats {
    size: number;
    mtime: Date;
    isDirectory(): boolean;
    isFile(): boolean;
  }
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): string | undefined;
  export function readFileSync(path: string, encoding: 'utf-8' | 'utf8'): string;
  export function readFileSync(path: string): Buffer;
  export function writeFileSync(
    path: string,
    data: string | Uint8Array,
    options?: 'utf-8' | 'utf8' | { encoding?: 'utf-8' | 'utf8'; mode?: number },
  ): void;
  export function renameSync(oldPath: string, newPath: string): void;
  export function statSync(path: string): Stats;

  const fsDefault: {
    existsSync: typeof existsSync;
    mkdirSync: typeof mkdirSync;
    readFileSync: typeof readFileSync;
    writeFileSync: typeof writeFileSync;
    renameSync: typeof renameSync;
    statSync: typeof statSync;
  };
  export default fsDefault;
}

declare module 'node:path' {
  export function resolve(...paths: string[]): string;
  export function join(...paths: string[]): string;
  export function dirname(p: string): string;
  export function basename(p: string, ext?: string): string;

  const pathDefault: {
    resolve: typeof resolve;
    join: typeof join;
    dirname: typeof dirname;
    basename: typeof basename;
  };
  export default pathDefault;
}

declare module 'node:crypto' {
  export interface Hash {
    update(data: string | Uint8Array, inputEncoding?: 'utf-8' | 'utf8'): Hash;
    digest(encoding: 'hex' | 'base64'): string;
    digest(): Buffer;
  }
  export interface CipherGCM {
    update(data: string, inputEncoding: 'utf-8' | 'utf8'): Buffer;
    update(data: Uint8Array): Buffer;
    final(): Buffer;
    getAuthTag(): Buffer;
  }
  export interface DecipherGCM {
    setAuthTag(buffer: Uint8Array): this;
    update(data: Uint8Array): Buffer;
    final(): Buffer;
  }
  export class X509Certificate {
    constructor(buffer: Uint8Array | string);
    readonly subject: string;
    readonly issuer: string;
    readonly serialNumber: string;
    readonly validFrom: string;
    readonly validTo: string;
    readonly fingerprint256: string;
  }
  export function createHash(algorithm: 'sha1' | 'sha256' | 'sha512'): Hash;
  export function randomBytes(size: number): Buffer;
  export function randomUUID(): string;
  export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
  export function pbkdf2Sync(
    password: string | Uint8Array,
    salt: string | Uint8Array,
    iterations: number,
    keylen: number,
    digest: 'sha256' | 'sha512',
  ): Buffer;
  export function createCipheriv(
    algorithm: 'aes-256-gcm',
    key: Uint8Array,
    iv: Uint8Array,
  ): CipherGCM;
  export function createDecipheriv(
    algorithm: 'aes-256-gcm',
    key: Uint8Array,
    iv: Uint8Array,
  ): DecipherGCM;

  const cryptoDefault: {
    X509Certificate: typeof X509Certificate;
    createHash: typeof createHash;
    randomBytes: typeof randomBytes;
    randomUUID: typeof randomUUID;
    timingSafeEqual: typeof timingSafeEqual;
    pbkdf2Sync: typeof pbkdf2Sync;
    createCipheriv: typeof createCipheriv;
    createDecipheriv: typeof createDecipheriv;
  };
  export default cryptoDefault;
}

declare module 'node:events' {
  export class EventEmitter {
    on(eventName: string | symbol, listener: (...args: any[]) => void): this;
    emit(eventName: string | symbol, ...args: any[]): boolean;
  }
  const eventsDefault: {
    EventEmitter: typeof EventEmitter;
  };
  export default eventsDefault;
}
