import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { handleApiRequest } from './server/apiRouter';

// Monta el servidor Backend Node.js (/api/*) directamente en el servidor HTTP de Vite (dev y preview)
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
        if (httpReq.url && httpReq.url.startsWith('/api/')) {
          const handled = await handleApiRequest(httpReq, httpRes);
          if (handled) return;
        }
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const httpReq = req as unknown as IncomingMessage;
        const httpRes = res as unknown as ServerResponse;
        if (httpReq.url && httpReq.url.startsWith('/api/')) {
          const handled = await handleApiRequest(httpReq, httpRes);
          if (handled) return;
        }
        next();
      });
    },
  };
}

// Inyecta Content-Security-Policy estricta en el HTML de producción (sin interferir con HMR en dev)
function injectProductionCsp(): Plugin {
  const csp = [
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

  return {
    name: 'inject-production-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta name="referrer" content="no-referrer" />',
        `<meta http-equiv="Content-Security-Policy" content="${csp}" />\n    <meta name="referrer" content="no-referrer" />`,
      );
    },
  };
}

export default defineConfig(({ command }) => ({
  base: './',
  server: {
    host: '127.0.0.1',
    port: 3000,
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
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app-[hash].js',
        chunkFileNames: 'assets/c-[hash].js',
        assetFileNames: 'assets/a-[hash][extname]',
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('recharts') || id.includes('d3-')) return 'v1';
          if (id.includes('xlsx')) return 'v2';
          if (id.includes('pdfjs-dist')) return 'v3';
          if (id.includes('lucide-react')) return 'v4';
        },
      },
    },
  },
}));
