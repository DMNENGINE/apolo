// Línea de tiempo de tu vida digital con el asistente: mezcla sesiones (sessions/*.jsonl), tareas ejecutadas,
// turnos de noche, consejos, informes de sueño, permisos (historial) y recuerdos nuevos. GET /v1/linea?desde&hasta&q=&tipos=
// Cada evento: { t, tipo, titulo, detalle, ruta? (enlace del panel), extra? }. Orden: más reciente primero.
const fs = require('fs');
const path = require('path');
const { normal } = require('./memoria');

const TIPOS = ['sesion', 'tarea', 'turno', 'consejo', 'sueno', 'permiso', 'recuerdo'];

function crearLinea({ cfg, sesiones, tareas, turno, consejo, sueno, historialPermisos, memoria }) {
  const dirSes = path.join(cfg.dir, 'sesiones');
  const cache = new Map();                 // id → { mtime, mensajes resumidos }
  function mensajes(id) {
    const f = path.join(dirSes, `${id}.jsonl`);
    let st; try { st = fs.statSync(f); } catch { return []; }
    const c = cache.get(id); if (c && c.mtime === st.mtimeMs) return c.l;
    const l = [];
    for (const x of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!x) continue; let m; try { m = JSON.parse(x); } catch { continue; }
      if ((m.role === 'user' || m.role === 'assistant') && m.content) l.push({ r: m.role, t: m.t || 0, c: String(m.content).slice(0, 2000) });
      else if (m.role === 'tool') l.push({ r: 'tool', t: m.t || 0, n: m.name });
    }
    cache.set(id, { mtime: st.mtimeMs, l });
    return l;
  }
  const coincide = (q, ...textos) => !q || textos.some(t => normal(t).includes(q));
  const fragmento = (texto, q) => {
    const n = normal(texto), i = n.indexOf(q);
    if (i < 0) return texto.slice(0, 160);
    const a = Math.max(0, i - 60); return (a ? '…' : '') + texto.slice(a, i + q.length + 100).replace(/\s+/g, ' ') + '…';
  };

  function consultar({ desde = 0, hasta = Date.now() + 60_000, q = '', tipos, limite = 400 } = {}) {
    desde = +desde || 0; hasta = +hasta || Date.now() + 60_000;
    const nq = normal(String(q || '').trim());
    const quiero = new Set((tipos && tipos.length ? tipos : TIPOS).filter(t => TIPOS.includes(t)));
    const ev = [];
    const en = t => t >= desde && t <= hasta;

    if (quiero.has('sesion')) for (const s of sesiones.lista()) {
      if (s.canal === 'eval' || s.padre || s.tarea) continue;
      if (!en(s.creada) && !en(s.actualizada) && !(s.creada <= desde && s.actualizada >= hasta)) continue;
      const ms = mensajes(s.id), user = ms.filter(m => m.r === 'user');
      if (!user.length) continue;
      let detalle = user[0].c.slice(0, 160);
      if (nq) {
        const hit = ms.find(m => m.c && normal(m.c).includes(nq));
        if (!hit && !coincide(nq, s.titulo, s.modelo)) continue;
        if (hit) detalle = fragmento(hit.c, nq);
      }
      const herr = ms.filter(m => m.r === 'tool').length;
      ev.push({ t: s.creada, fin: s.actualizada, tipo: 'sesion', titulo: s.titulo || 'Conversación', detalle, ruta: `#/chat/${s.id}`,
        extra: { modelo: s.modelo, canal: s.canal, mensajes: user.length, herramientas: herr, sesion: s.id } });
    }
    if (quiero.has('tarea') && tareas?.historial) for (const h of tareas.historial({ desde, hasta })) {
      if (!coincide(nq, h.nombre, h.resultado)) continue;
      ev.push({ t: h.t, fin: h.fin, tipo: 'tarea', titulo: h.nombre, detalle: h.resultado || '', ruta: '#/auto', extra: { ok: h.ok, tipo: h.tipo } });
    }
    if (quiero.has('turno') && turno) for (const r of turno.informes(60)) {
      if (!en(r.creado)) continue;
      const i = turno.leerInforme?.(r.id) || r;
      const txt = [i.titular, ...(i.hecho || []), ...(i.pendiente || [])].filter(x => typeof x === 'string');
      if (!coincide(nq, ...txt, ...(Array.isArray(i.encargos) ? i.encargos.map(e => e.texto || '') : []))) continue;
      ev.push({ t: i.inicio || r.creado, fin: i.fin || r.creado, tipo: 'turno', titulo: `Turno de noche: ${i.titular || ''}`.trim(), detalle: Array.isArray(i.hecho) ? i.hecho.slice(0, 3).join(' · ') : '', ruta: '#/turno',
        extra: { encargos: Array.isArray(i.encargos) ? i.encargos.length : i.encargos, hechos: Array.isArray(i.hecho) ? i.hecho.length : i.hecho, video: !!i.video?.mp4 } });
    }
    if (quiero.has('consejo') && consejo) for (const c of consejo.historial(200)) {
      if (!en(c.creado) || !coincide(nq, c.pregunta)) continue;
      ev.push({ t: c.creado, tipo: 'consejo', titulo: 'Consejo de modelos', detalle: String(c.pregunta || '').slice(0, 200), ruta: '#/consejo',
        extra: { acuerdo: c.acuerdo, miembros: (c.miembros || []).length, estado: c.estado } });
    }
    if (quiero.has('sueno') && sueno) for (const s of sueno.informes(60)) {
      if (!en(s.inicio) || !coincide(nq, s.resumen, s.frase)) continue;
      ev.push({ t: s.inicio, fin: s.fin, tipo: 'sueno', titulo: 'Sueño de la memoria', detalle: String(s.resumen || '').split('\n')[0], ruta: '#/memoria/suenos',
        extra: { fusionados: s.fusionados.length, olvidados: s.olvidados.length, nuevos: s.nuevos.length, deshecho: !!s.deshecho, id: s.id } });
    }
    if (quiero.has('permiso') && historialPermisos) for (const p of historialPermisos.lista()) {
      if (!en(p.t) || !coincide(nq, p.resumen, p.herramienta)) continue;
      ev.push({ t: p.t, tipo: 'permiso', titulo: `${p.decision === 'deny' ? 'Denegado' : 'Permitido'}: ${p.herramienta}`, detalle: String(p.resumen || '').slice(0, 160), ruta: '#/ajustes/aprobaciones',
        extra: { decision: p.decision, peligro: p.peligro || '', espera: p.espera } });
    }
    if (quiero.has('recuerdo') && memoria) for (const m of memoria.lista()) {
      if (m.origen === 'sueño' || !en(m.creada || 0) || !coincide(nq, m.texto)) continue;   // los del sueño ya salen dentro de su informe
      ev.push({ t: m.creada, tipo: 'recuerdo', titulo: `Nuevo recuerdo · ${m.tipo}`, detalle: m.texto.slice(0, 200), ruta: '#/memoria', extra: { origen: m.origen || '', id: m.id } });
    }
    ev.sort((a, b) => b.t - a.t);
    const cuenta = {}; for (const e of ev) cuenta[e.tipo] = (cuenta[e.tipo] || 0) + 1;
    return { eventos: ev.slice(0, Math.min(2000, +limite || 400)), total: ev.length, cuenta, tipos: TIPOS };
  }

  return { consultar, mensajes, TIPOS };
}

module.exports = { crearLinea, TIPOS };
