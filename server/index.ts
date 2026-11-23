import http from 'node:http';
import { handleApiRequest } from './apiRouter';
import { backendStorage } from './storage/fileDatabase';

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '127.0.0.1';

const server = http.createServer(async (req, res) => {
  const handled = await handleApiRequest(req, res);
  if (!handled) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        ok: false,
        error: 'Ruta fuera de /api/*. Utilice los endpoints REST bajo /api/health, /api/state, etc.',
      }),
    );
  }
});

server.listen(PORT, HOST, () => {
  const stats = backendStorage.getStorageStats();
  console.log(
    `[Tecnocontrol Backend API] Servidor escuchando en http://${HOST}:${PORT}/api/health (${stats.totalCfdis} CFDIs cargados en ${stats.dbPath})`,
  );
});
