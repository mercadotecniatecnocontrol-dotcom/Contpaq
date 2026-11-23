import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { handleApiRequest } from './server/apiRouter';
import { getAuthenticatedSession } from './server/auth/authService';

const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const PRODUCTION_HTTP_CSP = `${PRODUCTION_CSP}; frame-ancestors 'none'`;

const PREVIEW_STATIC_ALLOWLIST = new Set(['/', '/index.html', '/logotecno.png', '/pdf.worker.min.mjs']);
const PREVIEW_ASSET_RE = /^\/assets\/[a-zA-Z0-9._-]+\.(?:js|mjs|css|woff2?|png|svg|ico)$/;

const DEV_BLOCKED_PREFIXES = [
  '/server',
  '/dist',
  '/supabase',
  '/.git',
  '/.github',
  '/.env',
  '/package.json',
  '/package-lock.json',
  '/tsconfig',
  '/vite.config',
  '/readme',
  '/_headers',
  '/public/_headers',
];

function applyDocumentSecurityHeaders(res: ServerResponse, isProduction: boolean): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  if (isProduction) {
    res.setHeader('Content-Security-Policy', PRODUCTION_HTTP_CSP);
  }
}

function sendPlainError(res: ServerResponse, statusCode: number, message: string, isProduction: boolean): void {
  applyDocumentSecurityHeaders(res, isProduction);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.statusCode = statusCode;
  res.end(message);
}

function safeDecodePathname(rawUrl: string): { ok: boolean; pathname: string; decodedLower: string } {
  try {
    const parsed = new URL(rawUrl, 'http://127.0.0.1:3000');
    const rawPathname = parsed.pathname;
    const decodedOnce = decodeURIComponent(rawPathname);
    let decodedTwice = decodedOnce;
    try {
      decodedTwice = decodeURIComponent(decodedOnce);
    } catch {
      // No estaba doblemente codificado
    }
    if (
      rawPathname.includes('\0') ||
      decodedOnce.includes('\0') ||
      decodedTwice.includes('\0') ||
      rawPathname.includes('\\') ||
      decodedOnce.includes('\\') ||
      decodedTwice.includes('\\') ||
      decodedOnce.includes('..') ||
      decodedTwice.includes('..')
    ) {
      return { ok: false, pathname: '', decodedLower: '' };
    }
    return {
      ok: true,
      pathname: decodedOnce,
      decodedLower: decodedTwice.toLowerCase(),
    };
  } catch {
    return { ok: false, pathname: '', decodedLower: '' };
  }
}

// Monta el servidor Backend Node.js (/api/*) y el firewall de archivos estáticos (dev y preview)
function tecnocontrolBackendApi(): Plugin {
  return {
    name: 'tecnocontrol-backend-api',
    handleHotUpdate({ file }) {
      // Evitar recargas de página cuando el backend persiste datos en server/data/* o server/.dist/*
      if (/server[\\/]+(data|\.dist)/i.test(file)) {
        return [];
      }
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const httpReq = req as unknown as IncomingMessage;
        const httpRes = res as unknown as ServerResponse;
        const rawUrl = httpReq.url || '/';

        if (rawUrl.startsWith('/api/')) {
          const handled = await handleApiRequest(httpReq, httpRes);
          if (handled) return;
        }

        const decoded = safeDecodePathname(rawUrl);
        if (!decoded.ok) {
          sendPlainError(httpRes, 403, 'Acceso denegado', false);
          return;
        }

        const lower = decoded.decodedLower;
        const isBlockedPrefix = DEV_BLOCKED_PREFIXES.some(
          (prefix) => lower === prefix || lower.startsWith(`${prefix}/`) || lower.startsWith(`${prefix}.`),
        );
        const isSensitiveFsAccess =
          lower.startsWith('/@fs/') &&
          /(?:^|\/)(?:server|dist|supabase|\.git|\.github|\.env|package(?:-lock)?\.json|tsconfig|vite\.config|readme|_headers)(?:\/|$)/i.test(
            lower,
          );
        const isHiddenDotFile =
          /\/\.[^/]+/.test(lower) && !lower.startsWith('/@') && !lower.includes('/node_modules/');
        const isSensitiveExt = /\.(?:sql|key|cer|pem|env|log|bak|md)$/i.test(lower);

        if (isBlockedPrefix || isSensitiveFsAccess || isHiddenDotFile || isSensitiveExt) {
          sendPlainError(httpRes, 403, 'Acceso denegado', false);
          return;
        }

        applyDocumentSecurityHeaders(httpRes, false);
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const httpReq = req as unknown as IncomingMessage;
        const httpRes = res as unknown as ServerResponse;
        const rawUrl = httpReq.url || '/';
        const method = (httpReq.method || 'GET').toUpperCase();

        if (rawUrl.startsWith('/api/')) {
          const handled = await handleApiRequest(httpReq, httpRes);
          if (handled) return;
        }

        if (method !== 'GET' && method !== 'HEAD') {
          sendPlainError(httpRes, 405, 'Método no permitido', true);
          return;
        }

        const decoded = safeDecodePathname(rawUrl);
        if (!decoded.ok) {
          sendPlainError(httpRes, 403, 'Acceso denegado', true);
          return;
        }

        const { pathname, decodedLower } = decoded;

        // Bloquear explícitamente intentos de lectura de código fuente, backend, dist o configuración
        if (
          decodedLower.startsWith('/server') ||
          decodedLower.startsWith('/src') ||
          decodedLower.startsWith('/dist') ||
          decodedLower.startsWith('/@fs') ||
          decodedLower.startsWith('/@vite') ||
          decodedLower.startsWith('/node_modules') ||
          decodedLower.startsWith('/supabase') ||
          decodedLower.startsWith('/.') ||
          decodedLower === '/_headers' ||
          decodedLower.endsWith('.map')
        ) {
          sendPlainError(httpRes, 403, 'Acceso denegado', true);
          return;
        }

        // Lista blanca estricta: únicamente HTML raíz, activos públicos compilados y chunks privados autenticados
        const isAllowedStatic = PREVIEW_STATIC_ALLOWLIST.has(pathname);
        const isAllowedAsset = PREVIEW_ASSET_RE.test(pathname);
        if (!isAllowedStatic && !isAllowedAsset) {
          sendPlainError(httpRes, 404, 'Recurso no encontrado', true);
          return;
        }

        // Los módulos internos del portal solo se entregan a sesiones autenticadas
        if (pathname.startsWith('/assets/private-')) {
          const session = getAuthenticatedSession(httpReq);
          if (!session.authenticated) {
            sendPlainError(httpRes, 401, 'Acceso no autorizado', true);
            return;
          }
          httpRes.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
        } else if (pathname === '/' || pathname === '/index.html') {
          httpRes.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        } else {
          httpRes.setHeader('Cache-Control', 'public, max-age=3600');
        }

        applyDocumentSecurityHeaders(httpRes, true);
        next();
      });
    },
  };
}

// Inyecta Content-Security-Policy estricta en el HTML de producción (sin interferir con HMR en dev)
function injectProductionCsp(): Plugin {
  return {
    name: 'inject-production-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta name="referrer" content="no-referrer" />',
        `<meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}" />\n    <meta name="referrer" content="no-referrer" />`,
      );
    },
  };
}

export default defineConfig(({ command }) => ({
  base: './',
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
    fs: {
      strict: true,
      deny: [
        '**/server/**',
        '**/supabase/**',
        '**/dist/**',
        '**/.git/**',
        '**/.github/**',
        '**/.env*',
        '**/package*.json',
        '**/tsconfig*.json',
        '**/vite.config.*',
        '**/_headers',
        '**/*.sql',
        '**/*.md',
        '**/*.key',
        '**/*.cer',
        '**/*.pem',
      ],
    },
    watch: {
      ignored: [
        '**/server/data/**',
        '**/server/.dist/**',
        '**/server/data/*.json',
        '**/server/data/*.tmp',
        /server[\\/]+(data|\.dist)/i,
      ],
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
  },
  plugins: [react(), tailwindcss(), tecnocontrolBackendApi(), injectProductionCsp()],
  esbuild:
    command === 'build'
      ? {
          drop: ['console', 'debugger'],
          legalComments: 'none',
        }
      : undefined,
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    modulePreload: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app-[hash].js',
        chunkFileNames(chunkInfo) {
          const facade = (chunkInfo.facadeModuleId || '').replace(/\\/g, '/');
          const hasPrivateAppModule = (chunkInfo.moduleIds || []).some((mod) => {
            const norm = mod.replace(/\\/g, '/');
            return (
              norm.endsWith('/src/AuthenticatedShell.tsx') ||
              (norm.includes('/src/pages/') && !norm.endsWith('/src/pages/LoginPage.tsx')) ||
              (norm.includes('/src/services/') && !norm.endsWith('/src/services/fiscalRepository.ts')) ||
              norm.includes('/src/components/')
            );
          });
          if (
            chunkInfo.name === 'AuthenticatedShell' ||
            chunkInfo.name.startsWith('private-') ||
            facade.endsWith('/src/AuthenticatedShell.tsx') ||
            hasPrivateAppModule
          ) {
            return 'assets/private-[hash].js';
          }
          return 'assets/c-[hash].js';
        },
        assetFileNames: 'assets/a-[hash][extname]',
        manualChunks(id) {
          const norm = id.replace(/\\/g, '/');
          if (!norm.includes('/node_modules/')) return;
          if (norm.includes('recharts') || norm.includes('d3-')) return 'v1';
          if (norm.includes('xlsx')) return 'v2';
          if (norm.includes('pdfjs-dist')) return 'v3';
          if (norm.includes('lucide-react')) return 'v4';
        },
      },
    },
  },
}));
