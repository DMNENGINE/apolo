// Diccionario de cada canal: lo que el usuario corrige en los subtítulos desde Revisión ("no dice Juan, dice Chuy") se
// aprende y se aplica solo en los clips siguientes del mismo kit (todas las veces que salga), y las palabras bien escritas
// se le dan a Whisper como pista. Archivo <datos>/craft/diccionario/<kit>.json: { entradas: [{ mal, bien, clips: [ids], creado, ultimo }] }
'use strict';
const fs = require('fs');
const path = require('path');

const ID = /^[a-z0-9][a-z0-9_-]{0,40}$/;
const norm = w => String(w).toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\d]/gu, '');
const clave = s => String(s || '').split(/\s+/).map(norm).filter(Boolean).join(' ');
// igual de verdad (solo sin puntuación): "que" y "qué" son distintas — una tilde también es una corrección
const exacta = s => String(s || '').replace(/[^\p{L}\d ]/gu, '').replace(/\s+/g, ' ').trim();

// cambia TODAS las veces que sale cada "mal" (palabra a palabra, sin mirar tildes ni mayúsculas) por su "bien", repartiendo
// el tiempo de las palabras viejas entre las nuevas (puro). Devuelve { palabras, cambios }
function aplicarDiccionario(palabras, entradas = []) {
  let ps = [...palabras], cambios = 0;
  // las más largas primero ("don chuy" antes que "chuy")
  for (const en of [...entradas].sort((a, b) => clave(b.mal).split(' ').length - clave(a.mal).split(' ').length)) {
    const mal = clave(en.mal).split(' ').filter(Boolean), bien = String(en.bien || '').trim().split(/\s+/).filter(Boolean);
    if (!mal.length || !bien.length || exacta(en.bien) === exacta(en.mal)) continue;
    for (let i = 0; i + mal.length <= ps.length; i++) {
      if (!mal.every((m, j) => norm(ps[i + j].w) === m)) continue;
      const s = ps[i].s, e = ps[i + mal.length - 1].e, paso = (e - s) / bien.length;
      const fin = (String(ps[i + mal.length - 1].w).match(/[.,!?…;:]+$/) || [''])[0];
      const nuevas = bien.map((w, j) => ({ ...ps[i], w: j === bien.length - 1 ? w.replace(/[.,!?…;:]+$/, '') + fin : w, s: +(s + j * paso).toFixed(3), e: +(s + (j + 1) * paso).toFixed(3), p: 1 }));
      const antes = ps.slice(i, i + mal.length).map(p => p.w).join(' ');
      if (exacta(antes) === exacta(bien.join(' '))) { i += mal.length - 1; continue; }   // ya estaba bien escrito
      ps = [...ps.slice(0, i), ...nuevas, ...ps.slice(i + mal.length)];
      i += nuevas.length - 1; cambios++;
    }
  }
  return { palabras: ps, cambios };
}

function crearDiccionario({ cfg } = {}) {
  const dir = path.join(cfg?.dir || path.join(require('os').homedir(), '.apolo'), 'craft', 'diccionario');
  const archivo = kit => { const k = String(kit || '').toLowerCase(); if (!ID.test(k)) throw new Error('kit no válido'); return path.join(dir, `${k}.json`); };
  const leer = kit => { try { return JSON.parse(fs.readFileSync(archivo(kit), 'utf8')).entradas || []; } catch { return []; } };
  const guardar = (kit, entradas) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(archivo(kit), JSON.stringify({ entradas }, null, 2)); };
  const lista = kit => (kit ? leer(kit) : []);

  // correcciones que ya se aplicaron en un clip → al diccionario (una por "mal"; el mismo clip no cuenta dos veces)
  function aprender(kit, correcciones = [], clip = null) {
    if (!kit) return [];
    const es = leer(kit), nuevas = [];
    for (const c of correcciones) {
      const k = clave(c.mal), bien = String(c.bien || '').trim().slice(0, 120);
      if (!k || !bien || exacta(c.mal) === exacta(bien)) continue;
      if (!k.includes(' ') && k.length <= 2) continue;     // "a", "y", "de"…: cambiarlas en todos los clips haría más daño que bien
      let en = es.find(x => clave(x.mal) === k);
      if (!en) { en = { mal: String(c.mal).trim().slice(0, 120), bien, clips: [], creado: Date.now() }; es.push(en); nuevas.push(en); }
      else en.bien = bien;                                  // la corrección más reciente manda
      if (clip && !en.clips.includes(clip)) en.clips.push(clip);
      en.ultimo = Date.now();
    }
    guardar(kit, es.slice(-500));
    return nuevas;
  }
  function quitar(kit, mal) {
    const es = leer(kit), k = clave(mal), quedan = es.filter(x => clave(x.mal) !== k);
    if (quedan.length === es.length) throw Object.assign(new Error('esa palabra no está en el diccionario'), { status: 404 });
    guardar(kit, quedan); return quedan;
  }
  function anadir(kit, mal, bien) {
    if (!clave(mal) || !String(bien || '').trim()) throw Object.assign(new Error('faltan "mal" y "bien"'), { status: 400 });
    aprender(kit, [{ mal, bien }]); return leer(kit);
  }
  // pista para Whisper: las palabras bien escritas (nombres propios, apodos…)
  const pista = kit => [...new Set(leer(kit).map(x => x.bien))].slice(-60).join(', ');

  return { lista, aprender, quitar, anadir, pista, aplicar: (kit, palabras) => aplicarDiccionario(palabras, leer(kit)) };
}

module.exports = { crearDiccionario, aplicarDiccionario };
