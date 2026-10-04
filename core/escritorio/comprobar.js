// Fase 3 · mirar → actuar → COMPROBAR (sin visión): compara la ventana, el elemento con foco y los elementos de UI Automation
// de antes y de después de una acción, y le dice al modelo qué cambió. Si no cambió nada, se lo dice bien claro (y control.js
// adjunta la captura para que lo vea con sus ojos). Igual que comprobar() del navegador.
//
// Los #id son ESTABLES: un elemento que sigue ahí (mismo tipo y nombre) conserva su número aunque se haya movido;
// los nuevos reciben números nuevos. Así el modelo no tiene que releer toda la lista tras cada clic.

const clave = e => `${e.tipo}|${e.nombre}`;
const centro = e => [e.x + e.ancho / 2, e.y + e.alto / 2];

function fusionar(antes = [], ahora = []) {
  const libres = new Map();
  for (const e of antes) { const k = clave(e); if (!libres.has(k)) libres.set(k, []); libres.get(k).push(e); }
  let max = antes.reduce((m, e) => Math.max(m, Number(e.id) || 0), 0);
  const elementos = [], nuevos = [], cambiados = [];
  for (const e of ahora) {
    const cands = libres.get(clave(e));
    let m = null;
    if (cands?.length) {                                   // el más cercano con el mismo tipo y nombre
      const [x, y] = centro(e);
      let mejor = 0, dm = Infinity;
      cands.forEach((c, i) => { const [cx, cy] = centro(c); const d = (cx - x) ** 2 + (cy - y) ** 2; if (d < dm) { dm = d; mejor = i; } });
      m = cands.splice(mejor, 1)[0];
    }
    if (m) {
      const n = { ...e, id: m.id };
      elementos.push(n);
      if ((m.valor || '') !== (e.valor || '') || (m.activo === false) !== (e.activo === false)) cambiados.push({ ...n, antes: m.valor || '', antesActivo: m.activo !== false });
    } else { const n = { ...e, id: ++max }; elementos.push(n); nuevos.push(n); }
  }
  const fuera = [...libres.values()].flat();
  return { elementos, nuevos, fuera, cambiados };
}

const nombreFoco = f => (f && (f.nombre || f.tipo) ? `${f.tipo || ''} "${f.nombre || ''}"`.trim() : '(nada)');
const nombreEl = e => `${e.tipo} "${e.nombre}"`;
const unir = (l, n, tam) => { const t = l.slice(0, n).join(' · '); return (t.length > tam ? t.slice(0, tam) + '…' : t) + (l.length > n ? ` (+${l.length - n})` : ''); };

function cambios({ antes, despues, diff, hayAntes }) {
  const tituloCambio = (antes.ventana?.titulo || '') !== (despues.ventana?.titulo || '') || (antes.ventana?.proceso || '') !== (despues.ventana?.proceso || '');
  const focoCambio = nombreFoco(antes.foco) !== nombreFoco(despues.foco);
  const valorCambio = !focoCambio && typeof despues.foco?.valor === 'string' && (antes.foco?.valor ?? null) !== despues.foco.valor;
  const hayEls = !!(hayAntes && (diff.nuevos.length || diff.fuera.length || diff.cambiados.length));
  return { tituloCambio, focoCambio, valorCambio, hayEls, nada: !tituloCambio && !focoCambio && !valorCambio && !hayEls };
}

// texto para el modelo. { ms, antes:{ventana,foco}, despues:{ventana,foco}, diff, hayAntes, linea(e), sinLista } → { texto, nada, resumen }
function describir({ ms, antes, despues, diff, hayAntes, linea, sinLista = false }) {
  const { tituloCambio, focoCambio, valorCambio, nada } = cambios({ antes, despues, diff, hayAntes });
  const seg = (ms / 1000).toFixed(1);
  const l = [];
  const resumen = [];
  if (nada) {
    l.push(`⚠ COMPROBACIÓN (${seg} s después): NO cambió nada — misma ventana, mismo foco y mismos elementos. Lo más probable es que NO haya funcionado. ` +
      (sinLista ? 'Usa ver_pantalla para mirarlo' : 'Mira la captura adjunta') + ': si tampoco ves el cambio, NO le digas al usuario que está hecho; reintenta de otra forma (otro elemento, la rejilla, una tecla) o pregúntale.');
    resumen.push('no cambió nada');
  } else {
    l.push(`COMPROBACIÓN (${seg} s después):`);
    if (tituloCambio) { l.push(`· ventana: "${antes.ventana?.titulo || '?'}" → "${despues.ventana?.titulo || '?'}" (${despues.ventana?.proceso || ''})`); resumen.push(`ventana → ${despues.ventana?.titulo || '?'}`); }
    if (focoCambio) { l.push(`· foco: ${nombreFoco(antes.foco)} → ${nombreFoco(despues.foco)}`); resumen.push(`foco → ${nombreFoco(despues.foco)}`); }
    if (valorCambio) {
      const corta = t => { t = String(t ?? ''); return t.length > 120 ? '…' + t.slice(-119) : t; };
      l.push(`· el campo con el foco ahora dice: "${corta(despues.foco.valor)}" (antes "${corta(antes.foco?.valor)}")`); resumen.push('texto del campo cambiado');
    }
    if (hayAntes) {
      if (diff.nuevos.length) { l.push(`· NUEVOS (${diff.nuevos.length}): ${unir(diff.nuevos.map(linea), 25, 2500)}`); resumen.push(`+${diff.nuevos.length} elementos`); }
      if (diff.fuera.length) { l.push(`· YA NO ESTÁN (${diff.fuera.length}): ${unir(diff.fuera.map(nombreEl), 15, 700)}`); resumen.push(`-${diff.fuera.length} elementos`); }
      if (diff.cambiados.length) {
        l.push(`· CAMBIARON: ${unir(diff.cambiados.map(e => `${nombreEl(e)}${(e.antes || '') !== (e.valor || '') ? ` = "${e.valor || ''}" (antes "${e.antes}")` : ''}${e.antesActivo !== (e.activo !== false) ? (e.activo === false ? ' ahora desactivado' : ' ahora activo') : ''}`), 10, 900)}`);
        resumen.push(`${diff.cambiados.length} campo(s) cambiado(s)`);
      }
    }
    l.push('Cuenta al usuario solo lo que se ve aquí.');
  }
  if (sinLista) { /* sin captura: solo ventana y foco */ } else if (!hayAntes || tituloCambio) {   // ventana nueva o sin lista previa: la lista entera (los # siguen siendo válidos)
    l.push(`ELEMENTOS AHORA (${diff.elementos.length}):`);
    for (const e of diff.elementos.slice(0, 120)) l.push(linea(e));
  } else if (diff.nuevos.length || diff.fuera.length) l.push('(Los demás #elementos siguen igual y con el mismo número.)');
  return { texto: l.join('\n'), nada, resumen: resumen.join(' · ') };
}

module.exports = { fusionar, describir, cambios, clave };
