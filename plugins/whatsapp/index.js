// Plugin de APOLO: canal de WhatsApp con Baileys (es el único WhatsApp de la app; sustituyó a whatsapp.js).
// Corre en su propio proceso: solo habla con los dominios de WhatsApp declarados, la sesión vive en SU almacén y los permisos
// que resuelve son SOLO los que la app le mostró. Los mensajes de otras personas van a la app (canal.ajeno): el plugin no
// responde a nadie más que a ti salvo que la app se lo ordene (acción enviarA). La lógica está en wa.js.
const fs = require('fs');
const path = require('path');
const { definirPlugin } = require('@apolo/sdk');
const { crearWhatsapp } = require('./wa');

let w = null;

module.exports = definirPlugin({
  async activar(apolo) {
    const canal = apolo.registrarCanal({
      id: 'whatsapp', nombre: 'WhatsApp', descripcion: 'Tu chat contigo mismo en WhatsApp',
      enviar: texto => w && w.avisar(texto),
      permiso: p => (w ? w.permiso(p) : false),
      permisoResuelto: (id, decision, via) => w && w.permisoResuelto(id, decision, via),
      tarjeta: t => (w ? w.tarjeta(t) : false),
      acciones: {
        estado: () => w.estado(),
        vincular: () => w.vincular(),
        parar: () => w.parar(),
        desvincular: () => w.desvincular(),
        prueba: () => w.prueba(),
        config: () => w.config(),
        ponerConfig: d => w.ponerConfig(d),
        enviarA: d => w.enviarA(d),
        enviarOrden: d => w.enviarOrden(d),
        resolver: d => w.resolver(d),
        contactos: d => w.contactos(d),
        guardarContacto: d => w.guardarContacto(d),
        borrarContacto: d => w.borrarContacto(d),
      },
    });
    // Baileys cifra las fotos y audios en un archivo temporal: aquí el plugin solo puede escribir en su almacén
    const tmp = path.join(apolo.almacen.ruta, 'tmp');
    fs.mkdirSync(tmp, { recursive: true });
    process.env.TEMP = process.env.TMP = process.env.TMPDIR = tmp;
    w = crearWhatsapp({
      cargar: () => import('@whiskeysockets/baileys'),
      qr: texto => require('qrcode').toDataURL(texto, { margin: 1, width: 280 }),
      canal, almacen: apolo.almacen, config: apolo.config, log: (...a) => apolo.log(...a),
    });
    setImmediate(() => Promise.resolve(w.arrancar()).catch(e => apolo.log('[whatsapp] no arrancó:', e.message)));
  },
  async desactivar() { if (w) await w.parar().catch(() => { }); w = null; },
});
