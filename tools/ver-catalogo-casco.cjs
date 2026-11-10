// Vista local del catálogo: node tools/ver-catalogo-casco.cjs. Cerrar con Ctrl+C.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const raiz = path.resolve(__dirname, '..');
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.glb': 'model/gltf-binary' };
const servidor = http.createServer((peticion, respuesta) => {
  let ruta;
  try { ruta = decodeURIComponent(new URL(peticion.url, 'http://localhost').pathname); }
  catch { respuesta.writeHead(400); return respuesta.end(); }
  if (ruta === '/') { respuesta.writeHead(302, { location: '/app/galeria-100.html' }); return respuesta.end(); }
  const archivo = path.resolve(raiz, '.' + ruta), relativa = path.relative(raiz, archivo).replace(/\\/g, '/');
  const tipo = tipos[path.extname(archivo)];
  if (!tipo || !['app/', 'core/ui/', 'node_modules/three/'].some(prefijo => relativa.startsWith(prefijo))) {
    respuesta.writeHead(403); return respuesta.end();
  }
  fs.readFile(archivo, (error, contenido) => {
    if (error) { respuesta.writeHead(404); return respuesta.end(); }
    respuesta.writeHead(200, { 'content-type': tipo, 'cache-control': 'no-store' }); respuesta.end(contenido);
  });
});
servidor.on('error', error => { console.error('No se pudo abrir la galería:', error.message); process.exitCode = 1; });
servidor.listen(47931, '127.0.0.1', () => console.log('Abre http://127.0.0.1:47931/app/galeria-100.html'));
