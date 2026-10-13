#!/usr/bin/env node

/**
 * Frontend Server
 * Sirve archivos estáticos (HTML, CSS, JS) en puerto 5501
 * Usado en producción para servir la interfaz del sistema médico
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.FRONTEND_PORT || 5501;
const ROOT_DIR = __dirname;

// Tipos MIME comunes
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
  // Parse la URL
  const parsedUrl = url.parse(req.url, true);
  let pathname = parsedUrl.pathname;

  // Seguridad: prevenir directory traversal
  if (pathname.includes('..') || pathname.includes('//')) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad Request');
    return;
  }

  // Ruta por defecto: index.html
  if (pathname === '/') {
    pathname = '/index.html';
  }

  // Construir ruta completa
  let filePath = path.join(ROOT_DIR, pathname);

  // Si es un directorio, servir index.html
  try {
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch (err) {
    // Archivo no existe, se manejará abajo
  }

  // Leer archivo
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Archivo no encontrado
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>404 - No Encontrado</title>
              <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                h1 { color: #e74c3c; }
              </style>
            </head>
            <body>
              <h1>404 - Página no encontrada</h1>
              <p>No se encontró: ${pathname}</p>
              <a href="/">Volver al inicio</a>
            </body>
          </html>
        `);
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Error del servidor: ${err.message}`);
      }
      return;
    }

    // Determinar Content-Type
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Enviar respuesta
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Frontend ejecutándose en http://0.0.0.0:${PORT}`);
  console.log(`📁 Sirviendo archivos desde: ${ROOT_DIR}`);
  console.log(`🌐 Accede en: http://localhost:${PORT}`);
});

// Manejo de errores
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Puerto ${PORT} ya está en uso`);
    process.exit(1);
  } else {
    console.error('❌ Error del servidor:', err);
    process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📍 Cerrando frontend server...');
  server.close(() => {
    console.log('✅ Frontend server cerrado');
    process.exit(0);
  });
});
