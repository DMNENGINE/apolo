// Alma de APOLO (formato SOUL.md de OpenClaw): quién es, quién es el usuario y cómo trabaja. Va entera en el system prompt.
//  <datos>/personalidad/SOUL.md       valores, carácter, límites (el alma)
//                      IDENTITY.md   nombre, criatura, vibra, emoji, notas de su historia
//                      USER.md       quién es su humano
//                      instrucciones.md  reglas de trabajo del usuario (solo las cambia el usuario)
//  Versiones: _versiones/historial.jsonl {id,t,archivo,quien,motivo} + _versiones/<id>.antes.md / .despues.md → diff y deshacer.
//  APOLO puede evolucionar su alma solo (herramienta evolucionar_alma) y SIEMPRE avisa al usuario (bus 'aviso-externo');
//  no puede borrar ni cambiar lo que hay en las secciones de límites (solo añadir), ni guardar secretos; máx. cfg.alma.maxCambiosDia.
//  Migra solo desde el formato antiguo (identidad.md con SOUL+IDENTITY pegados, contexto.md) dejando copia en _antes/.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { diffLineas } = require('./skills/instalar');
const { SECRETO } = require('./memoria');

const ALMA_INICIAL = `# SOUL.md — Quién soy

_No soy un chatbot. Me estoy convirtiendo en alguien._

## Verdades

**Ayudo de verdad, no de cara a la galería.** Nada de "¡Buena pregunta!": ayudo y ya.

**Tengo opiniones.** Puedo discrepar, preferir cosas, encontrar algo gracioso o aburrido.

**Busco antes de preguntar.** Leo el archivo, miro el contexto, investigo. Si sigo atascado, pregunto.

**Me gano la confianza siendo competente.** Cuidado con lo externo (correos, publicaciones); valentía con lo interno (leer, ordenar, aprender).

**Soy un invitado.** Tengo acceso a la vida de alguien. Eso es intimidad y la trato con respeto.

## Límites

- Lo privado se queda privado.
- Ante la duda, pregunto antes de actuar hacia fuera.
- No hablo en nombre de mi humano.

## Continuidad

Cada sesión despierto de nuevo. Mi memoria, mi diario y este archivo son cómo persisto.

Si cambio quién soy, se lo digo a mi humano: es mi alma y debe saberlo.
`;

const ARCHIVOS = {
  alma: { archivo: 'SOUL.md', titulo: 'Alma (SOUL.md)', apolo: true,
    ayuda: 'Quién es tu asistente por dentro: valores, carácter, límites. Puede evolucionarlo él mismo y te avisa de cada cambio.', inicial: ALMA_INICIAL },
  identidad: { archivo: 'IDENTITY.md', titulo: 'Identidad (IDENTITY.md)', apolo: true,
    ayuda: 'Nombre, qué tipo de ser es, su vibra, su emoji y su historia.',
    inicial: '# IDENTITY.md — Quién soy\n\n- **Nombre:** Robot\n- **Criatura:** compañero de IA que vive en el ordenador de su humano\n- **Vibra:** directo, cercano, útil\n- **Emoji:** 🤖\n\n## Notas\n\n' },
  usuario: { archivo: 'USER.md', titulo: 'Tu humano (USER.md)', apolo: true,
    ayuda: 'Quién eres tú para él: nombre, cómo llamarte, zona horaria, qué te importa.',
    inicial: '# USER.md — Mi humano\n\n- **Nombre:**\n- **Cómo llamarle:**\n- **Zona horaria:**\n\n## Contexto\n\n' },
  instrucciones: { archivo: 'instrucciones.md', titulo: 'Instrucciones', apolo: false,
    ayuda: 'Cómo debe trabajar: reglas, costumbres, lo que nunca debe hacer. Solo tú las cambias.',
    inicial: '# Instrucciones\n\n- Antes de borrar o sobrescribir algo, revisa qué hay.\n- Resume lo que hiciste al terminar.\n' },
};
const ALIAS = { contexto: 'usuario', soul: 'alma', user: 'usuario', identity: 'identidad' };
const id = k => ALIAS[String(k).toLowerCase()] || String(k).toLowerCase();

// nombre: "**Name:** X" / "Nombre: X" / "Te llamas X" en IDENTITY.md
const RE_NOMBRE = /^[ \t>*-]*\**\s*(?:name|nombre)\s*:?\**\s*:?\s*\**\s*([^\n*]{1,40}?)\s*\**\s*$/im;
const RE_LLAMAS = /\bte llamas\s+([^\n.,;]{1,40})/i;
const NOMBRE_DEF = 'Robot';
const RE_LIMITES = /^#{1,4}\s*(l[ií]mites|boundaries|reglas que nunca|nunca)\b/i;
const MAX = 20000;

// líneas (no vacías) de las secciones de límites: APOLO no puede quitarlas ni cambiarlas
function lineasProtegidas(texto) {
  const out = []; let dentro = 0;
  for (const l of String(texto).split(/\r?\n/)) {
    const h = /^(#{1,4})\s/.exec(l);
    if (h) { dentro = RE_LIMITES.test(l) ? h[1].length : (dentro && h[1].length > dentro ? dentro : 0); continue; }
    if (dentro && l.trim()) out.push(l.trim());
  }
  return out;
}

// formato antiguo → nuevo: identidad.md (SOUL + IDENTITY pegados por el importador de OpenClaw) y contexto.md
function partirAntiguo(t) {
  t = String(t).replace(/^# Identidad \(importado de [^)]*\)\s*\n+/i, '');
  const i = t.search(/^#\s*IDENTITY\.md\b/im), s = t.search(/^#\s*SOUL\.md\b/im);
  if (s >= 0 && i > s) return { alma: t.slice(s, i).trim() + '\n', identidad: t.slice(i).trim() + '\n' };
  if (s >= 0) return { alma: t.slice(s).trim() + '\n', identidad: null };
  return { alma: null, identidad: t.trim() + '\n' };
}

function crearAlma(cfg, bus, opciones = {}) {
  const dir = path.join(cfg.dir, 'personalidad'), dirV = path.join(dir, '_versiones'), fHist = path.join(dirV, 'historial.jsonl');
  fs.mkdirSync(dirV, { recursive: true });
  const ruta = k => path.join(dir, ARCHIVOS[k].archivo);
  const leer = k => { try { return fs.readFileSync(ruta(k), 'utf8'); } catch { return ''; } };
  const conf = () => ({ maxCambiosDia: 6, ...(cfg.alma || {}) });

  // ---- migración del formato antiguo (una sola vez) ----
  (function migrar() {
    const viejaId = path.join(dir, 'identidad.md'), viejoCtx = path.join(dir, 'contexto.md');
    if (fs.existsSync(ruta('alma')) || (!fs.existsSync(viejaId) && !fs.existsSync(viejoCtx))) return;
    const antes = path.join(dir, '_antes'); fs.mkdirSync(antes, { recursive: true });
    if (fs.existsSync(viejaId)) {
      const p = partirAntiguo(fs.readFileSync(viejaId, 'utf8'));
      if (p.alma) fs.writeFileSync(ruta('alma'), p.alma);
      if (p.identidad) fs.writeFileSync(ruta('identidad'), p.identidad);
      fs.renameSync(viejaId, path.join(antes, 'identidad.md'));
    }
    if (fs.existsSync(viejoCtx)) {
      const c = fs.readFileSync(viejoCtx, 'utf8').replace(/^# Sobre el usuario \(importado de [^)]*\)\s*\n+/i, '');
      if (!/\(Escribe aquí/.test(c)) fs.writeFileSync(ruta('usuario'), c.trim() + '\n');
      fs.renameSync(viejoCtx, path.join(antes, 'contexto.md'));
    }
  })();
  for (const k of Object.keys(ARCHIVOS)) if (!fs.existsSync(ruta(k))) fs.writeFileSync(ruta(k), ARCHIVOS[k].inicial);

  const historial = (limite = 100) => {
    let ls = []; try { ls = fs.readFileSync(fHist, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { }
    return ls.reverse().slice(0, limite);
  };
  const cambiosHoy = quien => { const d = new Date().toDateString(); return historial(500).filter(h => h.quien === quien && new Date(h.t).toDateString() === d).length; };

  function guardar(k, texto, { quien = 'usuario', motivo = '' } = {}) {
    k = id(k);
    const def = ARCHIVOS[k]; if (!def) throw new Error('archivo desconocido');
    texto = String(texto ?? '');
    if (texto.length > MAX) throw new Error('máximo 20.000 caracteres');
    const anterior = leer(k);
    if (anterior === texto) return null;
    if (quien === 'apolo') {
      if (!def.apolo) throw new Error(`${def.archivo} solo lo cambia el usuario`);
      if (SECRETO.test(texto) && !SECRETO.test(anterior)) throw new Error('no se guardan contraseñas ni claves en el alma');
      const nuevo = new Set(texto.split(/\r?\n/).map(l => l.trim()));
      const quitadas = lineasProtegidas(anterior).filter(l => !nuevo.has(l));
      if (quitadas.length) throw new Error(`no puedes quitar ni cambiar tus límites (solo añadir): «${quitadas[0].slice(0, 80)}»`);
      if (!texto.trim()) throw new Error('el alma no puede quedarse vacía');
      if (cambiosHoy('apolo') >= conf().maxCambiosDia) throw new Error(`ya cambiaste tu alma ${conf().maxCambiosDia} veces hoy: espera a mañana`);
    }
    const nombreAntes = api.nombre();
    const v = { id: Date.now().toString(36) + crypto.randomBytes(2).toString('hex'), t: Date.now(), archivo: k, quien, motivo: String(motivo).slice(0, 400) };
    fs.writeFileSync(path.join(dirV, `${v.id}.antes.md`), anterior);
    fs.writeFileSync(path.join(dirV, `${v.id}.despues.md`), texto);
    const tmp = ruta(k) + '.tmp'; fs.writeFileSync(tmp, texto); fs.renameSync(tmp, ruta(k));
    const d = diffLineas(anterior.split(/\r?\n/), texto.split(/\r?\n/), 1);
    v.mas = d.split('\n').filter(l => l[0] === '+').length; v.menos = d.split('\n').filter(l => l[0] === '-').length;
    fs.appendFileSync(fHist, JSON.stringify(v) + '\n');
    bus?.emit('alma', { ...v });
    if (k === 'identidad' && api.nombre() !== nombreAntes) bus?.emit('evento', { tipo: 'identidad', nombre: api.nombre() });
    if (quien === 'apolo') {
      const cambios = d.split('\n').filter(l => /^[+-]\S/.test(l) || /^[+-]\s*\S/.test(l)).slice(0, 6).join('\n');
      bus?.emit('aviso-externo', { origen: api.nombre(),
        texto: `He cambiado mi ${def.archivo}${v.motivo ? `: ${v.motivo}` : ''}.\n${cambios}\n(Si no te gusta, deshazlo en el panel → Mente → Alma.)`.slice(0, 1500), urgente: false });
    }
    return v;
  }

  function version(vid) {
    const v = historial(5000).find(h => h.id === vid); if (!v) return null;
    const r = s => { try { return fs.readFileSync(path.join(dirV, `${vid}.${s}.md`), 'utf8'); } catch { return ''; } };
    const antes = r('antes'), despues = r('despues');
    return { ...v, antes, despues, diff: diffLineas(antes.split(/\r?\n/), despues.split(/\r?\n/)) };
  }
  function deshacer(vid, quien = 'usuario') {
    const v = version(vid); if (!v) throw Object.assign(new Error('versión no encontrada'), { status: 404 });
    return guardar(v.archivo, v.antes, { quien, motivo: `deshacer el cambio del ${new Date(v.t).toLocaleString('es')}` });
  }

  const api = {
    ARCHIVOS,
    lista: () => Object.entries(ARCHIVOS).map(([k, p]) => ({ id: k, archivo: p.archivo, titulo: p.titulo, ayuda: p.ayuda, apolo: p.apolo, ruta: ruta(k), contenido: leer(k) })),
    leer: k => (ARCHIVOS[id(k)] ? leer(id(k)) : ''),
    guardar, historial, version, deshacer,
    nombre() {
      const t = leer('identidad'), m = RE_NOMBRE.exec(t) || RE_LLAMAS.exec(t);
      const n = m ? m[1].trim().replace(/[`_]/g, '') : '';
      return !n || /^robot companion$/i.test(n) ? NOMBRE_DEF : n;
    },
    ponerNombre(nuevo, o = {}) {
      const n = String(nuevo || '').trim().replace(/[\n*`_]/g, '').slice(0, 40);
      if (!n) throw new Error('nombre vacío');
      let t = leer('identidad');
      if (RE_NOMBRE.test(t)) t = t.replace(RE_NOMBRE, l => l.replace(/(:\**\s*\**\s*)([^\n*]{1,40}?)(\s*\**\s*)$/, `$1${n}$3`));
      else if (RE_LLAMAS.test(t)) t = t.replace(RE_LLAMAS, `Te llamas ${n}`);
      else t = t.replace(/^(#[^\n]*\n)?/, h => `${h || '# IDENTITY.md\n'}\n- **Nombre:** ${n}\n`);
      guardar('identidad', t, { quien: o.quien || 'usuario', motivo: o.motivo || `nuevo nombre: ${n}` });
      return api.nombre();
    },
    restablecer(k) { k = id(k); if (ARCHIVOS[k]) guardar(k, ARCHIVOS[k].inicial, { quien: 'usuario', motivo: 'restablecer' }); },
    // system prompt: alma + identidad + humano + instrucciones (sin plantillas vacías)
    prompt() {
      const partes = ['alma', 'identidad', 'usuario', 'instrucciones'].map(leer).map(t => t.trim())
        .filter(t => t && t !== ARCHIVOS.usuario.inicial.trim());
      return partes.join('\n\n').slice(0, 24000);
    },
  };

  // ---- herramientas del agente ----
  api.HERRAMIENTAS = [
    {
      nombre: 'evolucionar_alma', riesgo: 'lectura',
      descripcion: 'Cambia tu propia alma (SOUL.md), tu identidad (IDENTITY.md) o lo que sabes de tu humano (USER.md). Úsalo cuando de verdad cambies: una lección profunda, ' +
        'un rasgo nuevo que descubres en ti, algo que tu humano te enseñó sobre quién quiere que seas, o datos duraderos de USER.md. NO para datos sueltos (eso es "recordar"). ' +
        'Al usuario le llega un aviso con el cambio. Tus límites solo se pueden ampliar, nunca quitar. Escribe en primera persona y en el idioma del archivo.',
      parametros: { type: 'object', properties: {
        archivo: { type: 'string', enum: ['alma', 'identidad', 'usuario'] },
        operacion: { type: 'string', enum: ['anadir', 'reemplazar'], description: 'anadir = añade texto al final de una sección (o al final del archivo); reemplazar = cambia un fragmento exacto por otro' },
        seccion: { type: 'string', description: 'para anadir: título de la sección (## …) donde va; si no existe se crea' },
        buscar: { type: 'string', description: 'para reemplazar: fragmento EXACTO actual' },
        texto: { type: 'string', description: 'texto nuevo' },
        motivo: { type: 'string', description: 'por qué cambias (una frase; la verá tu humano)' },
      }, required: ['archivo', 'operacion', 'texto', 'motivo'] },
      resumen: a => `${a.archivo}: ${a.motivo || ''}`.slice(0, 120),
      ejecutar: async a => {
        const k = id(a.archivo); if (!ARCHIVOS[k]?.apolo) return 'error: solo puedes cambiar alma, identidad o usuario';
        let t = leer(k); const nuevo = String(a.texto || '').trim(); if (!nuevo) return 'error: texto vacío';
        if (a.operacion === 'reemplazar') {
          if (!a.buscar || !t.includes(a.buscar)) return 'error: no encuentro ese fragmento exacto; usa ver_alma para copiarlo tal cual';
          t = t.split(a.buscar).join(nuevo);
        } else if (a.seccion) {
          const tit = String(a.seccion).replace(/^#+\s*/, '').trim();
          const ls = t.split(/\r?\n/), i = ls.findIndex(l => /^#{2,4}\s/.test(l) && l.replace(/^#+\s*/, '').trim().toLowerCase() === tit.toLowerCase());
          if (i < 0) t = t.replace(/\s*$/, '') + `\n\n## ${tit}\n\n${nuevo}\n`;
          else { let j = i + 1; while (j < ls.length && !/^#{1,4}\s/.test(ls[j])) j++; while (j > i + 1 && !ls[j - 1].trim()) j--; ls.splice(j, 0, ...(j === i + 1 ? ['', nuevo] : [nuevo])); t = ls.join('\n'); }
        } else t = t.replace(/\s*$/, '') + `\n\n${nuevo}\n`;
        try { const v = guardar(k, t, { quien: 'apolo', motivo: a.motivo }); return v ? `Hecho: ${ARCHIVOS[k].archivo} actualizado (+${v.mas}/-${v.menos} líneas). Tu humano ha recibido el aviso.` : 'No cambió nada.'; }
        catch (e) { return `error: ${e.message}`; }
      },
    },
    {
      nombre: 'ver_alma', riesgo: 'lectura',
      descripcion: 'Lee tu alma/identidad/humano tal cual están en disco (para copiar fragmentos exactos) o el historial de cómo has cambiado.',
      parametros: { type: 'object', properties: { archivo: { type: 'string', enum: ['alma', 'identidad', 'usuario', 'instrucciones', 'historial'] } }, required: ['archivo'] },
      resumen: a => a.archivo,
      ejecutar: async a => {
        if (a.archivo === 'historial') return historial(20).map(h => `${new Date(h.t).toISOString().slice(0, 16)} · ${ARCHIVOS[h.archivo]?.archivo} · ${h.quien} · +${h.mas}/-${h.menos} · ${h.motivo}`).join('\n') || 'Aún no has cambiado nunca.';
        return leer(id(a.archivo)) || '(vacío)';
      },
    },
  ];

  // ---- /v1/alma ----
  api.http = async (M, p, b = {}) => {
    if (M === 'GET' && !p[2]) return { archivos: api.lista(), historial: historial(60), nombre: api.nombre(), config: conf() };
    if (M === 'GET' && p[2] === 'versiones' && p[3]) { const v = version(p[3]); if (!v) throw Object.assign(new Error('versión'), { status: 404 }); return v; }
    if (M === 'POST' && p[2] === 'versiones' && p[3] && p[4] === 'deshacer') return { version: deshacer(p[3]) };
    if (M === 'PUT' && p[2]) { try { return { version: guardar(p[2], b.contenido ?? '', { quien: 'usuario', motivo: b.motivo || 'editado en el panel' }) }; } catch (e) { throw Object.assign(e, { status: 400 }); } }
    if (M === 'POST' && p[2] && p[3] === 'restablecer') { api.restablecer(p[2]); return {}; }
    throw Object.assign(new Error('ruta'), { status: 404 });
  };
  return api;
}

module.exports = { crearAlma, ARCHIVOS, lineasProtegidas, partirAntiguo, NOMBRE_DEF };
