// Prompts (#/prompts): laboratorio para crear prompts y banco propio de prompts. No es un chat: se parte del
// encargo, se elige el ángulo comercial (por el que se vende lo que sale), se montan los 8 bloques y el
// calibrador propio dice qué falta y qué sobra. Guardar en el banco (<datos>/prompts, también como .md) y
// copiar listo para pegar en cualquier chat. Globales PV_ (base.js no define ninguno con este prefijo).
P.prompts = '<path d="M4 6h11M4 11h8M4 16h5"/><path d="m14 17 3 3 5-6"/>';
NAV_APP.splice(NAV_APP.findIndex(n => n[0] === 'chat') + 1, 0, ['prompts', 'Prompts', 'prompts']);

const PV_ANGULOS_IC = { directo: 'rayo', problema: 'info', autoridad: 'escudo', opuesto: 'recargar', historia: 'paleta', numeros: 'grafica' };
const PV_TIPOS = [['landing', 'Landing de venta'], ['redes', 'Redes sociales'], ['email', 'Correo'], ['foto', 'Imagen / foto'], ['codigo', 'Código'], ['tema', 'Explicar un tema'], ['otro', 'Otro']];
const PV_ESTADO = { listo: ['ok', 'Listo'], mejorable: ['aviso', 'Mejorable'], flojo: ['mal', 'Flojo'] };

Object.assign(I18N.dic.en, {
  'Prompts': 'Prompts', 'Laboratorio de prompts': 'Prompt lab', 'Seis ángulos': 'Six angles',
  'El banco está vacío. Escribe el encargo y pulsa «Crear borrador» para tener el primero.':
    'The bench is empty. Write the brief and press «Create draft» to get the first one.',
});

const pvEsc = esc;
const pvCopiar = t => navigator.clipboard?.writeText(t).then(() => aviso(tr('Copiado')), () => aviso(tr('No pude copiar: selecciónalo a mano'), true));
const pvNum = n => String(+(n || 0)).padStart(3, '0');
const pvFecha = t => new Date(t).toLocaleDateString(I18N.idioma() === 'en' ? 'en' : 'es', { day: 'numeric', month: 'short' });

VISTAS.prompts = {
  salir() { clearTimeout(this.tm); },

  async pintar(v, sub) {
    this.salir(); this.v = v;
    let D0;
    try { D0 = await api('GET', '/prompts'); }
    catch (e) {
      v.innerHTML = `<div class="pagina">${cabecera('Prompts', 'Laboratorio para crear prompts y tu banco de prompts.')}
        <div class="caja pad sk-vacio">${ic('info')}<p>${e.message.includes('404') || /ruta/i.test(e.message)
          ? tr('Esta función necesita reiniciar APOLO (el núcleo que está corriendo es de antes). Bandeja → Salir y vuelve a abrirlo.')
          : pvEsc(e.message)}</p></div></div>`;
      return;
    }
    this.D = D0;
    // pestaña de entrada: «banco»/«angulos» si la ruta lo pide; si no, el laboratorio (con el prompt que toque)
    const pedida = (location.hash.match(/^#\/prompts\/(banco|angulos|skill)/) || [])[1];
    this.pestana = pedida || 'lab';
    const idUrl = sub || (location.hash.match(/^#\/prompts\/([a-z0-9][\w.-]*)$/i) || [])[1];
    // un id en la ruta abre ESE prompt; sin id se arranca de cero (borrador limpio)
    if (idUrl) { try { this.p = await api('GET', `/prompts/${encodeURIComponent(idUrl)}`); } catch { this.p = null; } }
    const D = this.D;

    v.innerHTML = `<div class="pagina ancha pv">
      ${cabecera('Prompts', 'El laboratorio arranca del encargo: elige el ángulo por el que se vende, monta los ocho bloques y el calibrador dice qué falta. Guarda el que funcione en tu banco.',
        `<button class="btn" id="pvImportar">${ic('archivo')}${tr('Pegar uno y repararlo')}</button><button class="btn pri" id="pvNuevo">${ic('mas')}${tr('Nuevo prompt')}</button>`)}
      <div class="pestanas" id="pvPestanas">
        <button data-t="lab" class="${this.pestana === 'lab' ? 'on' : ''}">${ic('chispa')}${tr('Laboratorio de prompts')}</button>
        <button data-t="banco" class="${this.pestana === 'banco' ? 'on' : ''}">${ic('carpeta')}${tr('Banco')}<span class="n">${D.prompts.length}</span></button>
        <button data-t="angulos" class="${this.pestana === 'angulos' ? 'on' : ''}">${ic('mundo')}${tr('Seis ángulos')}</button>
        <button data-t="skill" class="${this.pestana === 'skill' ? 'on' : ''}">${ic('pieza')}${tr('Skill de un enlace')}</button>
      </div>
      <div id="pvCuerpo"></div></div>`;

    $('#pvPestanas', v).onclick = e => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      // la pestaña pedida se pisa DESPUÉS de pintar: pintar() la vuelve a leer de la ruta
      const cual = b.dataset.t, id = this.p?.id;
      this.pintar(v, b.dataset.t === 'banco' ? null : id).then(() => this.mostrarPestana(cual, id));
    };
    $('#pvNuevo', v).onclick = () => { this.p = null; this.pestana = 'lab'; history.replaceState(null, '', '#/prompts'); this.pintaCuerpo(); this.pintar(v); };
    $('#pvImportar', v).onclick = () => this.importar();
    this.pintaCuerpo();
  },

  // cambia de pestaña sin volver a pedir la lista (y deja la ruta acorde)
  mostrarPestana(cual, id) {
    this.pestana = cual || 'lab';
    history.replaceState(null, '', this.pestana === 'lab' ? (id ? `#/prompts/${encodeURIComponent(id)}` : '#/prompts') : `#/prompts/${this.pestana}`);
    $$('#pvPestanas [data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === this.pestana));
    this.pintaCuerpo();
  },

  pintaCuerpo() {
    const v = this.v, c = $('#pvCuerpo', v); if (!c) return;
    if (this.pestana === 'banco') return this.pintaBanco(c);
    if (this.pestana === 'angulos') return this.pintaAngulos(c);
    if (this.pestana === 'skill') return this.pintaSkill(c);
    this.pintaLab(c);
  },

  // ---------- de un enlace (o un texto) a una skill ----------
  pintaSkill(c) {
    const v = this.v, d = this.dossier;
    c.innerHTML = `<div class="caja pad">
        <div class="seccion" style="margin-top:0">${tr('Fuente')}</div>
        <p class="seccion-ayuda">${tr('Un enlace (artículo o vídeo de YouTube) o un texto pegado. Se lee de verdad, se saca el método con sus pasos, el autor, las cifras y lo que NO dice, y con eso se redacta un borrador de skill. La skill nace desactivada y pasa por el escáner.')}</p>
        <input id="pvFuenteUrl" class="crece" style="width:100%" placeholder="${pvEsc(tr('https://… un artículo o un vídeo de YouTube'))}">
        <div class="flex pv-fila" style="margin-top:8px">
          <input id="pvObjetivo" class="crece" placeholder="${pvEsc(tr('¿Para qué la quieres? (opcional) p. ej. vender plantillas pintadas'))}">
          <button class="btn pri" id="pvAnalizar">${ic('buscar')}${tr('Analizar')}</button>
        </div>
        <details style="margin-top:10px"><summary class="tenue" style="cursor:pointer">${tr('…o pega un texto')}</summary>
          <textarea id="pvTexto" rows="5" style="width:100%;margin-top:8px" placeholder="${pvEsc(tr('Pega la transcripción o el texto que quieres convertir en skill'))}"></textarea>
          <button class="btn" id="pvAnalizarTexto" style="margin-top:6px">${ic('chispa')}${tr('Analizar el texto')}</button></details>
        <div id="pvEstadoFuente" class="tenue" style="margin-top:8px;font-size:12px"></div>
      </div>
      ${d ? this.dossierHtml() : ''}`;
    $('#pvAnalizar', v).onclick = () => this.analizar({ url: $('#pvFuenteUrl', v).value.trim(), objetivo: $('#pvObjetivo', v).value.trim() });
    $('#pvAnalizarTexto', v).onclick = () => this.analizar({ texto: $('#pvTexto', v).value, objetivo: $('#pvObjetivo', v).value.trim() });
    if (d) this.eventosDossier();
  },

  dossierHtml() {
    const d = this.dossier, f = d.fuente || {};
    const lista = (t, xs, cls = '') => xs?.length ? `<div class="pv-d-sec"><b>${tr(t)}</b><ul class="pv-d-ul ${cls}">${xs.map(x => `<li>${pvEsc(x)}</li>`).join('')}</ul></div>` : '';
    const nivel = { experto: 'experto', practicante: 'practicante', principiante: 'principiante', desconocido: 'sin datos' }[d.quien?.nivel] || 'sin datos';
    return `<div class="pv-grid" style="margin-top:14px">
      <div class="pv-col">
        <div class="seccion" style="margin-top:0">${tr('Lo que dice la fuente')}<span class="crece"></span><span class="chip">${pvEsc(f.tipo || '')}${f.dominio ? ' · ' + pvEsc(f.dominio) : ''}</span></div>
        <div class="caja pad pv-d">
          <b class="pv-d-tit">${pvEsc(f.titulo || f.origen || '')}</b>
          ${f.origen && f.origen !== '(texto pegado)' ? `<small class="tenue pv-d-url">${pvEsc(f.origen)}</small>` : ''}
          <p class="pv-d-ens">${pvEsc(d.que_ensena || '')}</p>
          <div class="flex" style="gap:6px;flex-wrap:wrap"><span class="chip">${tr('autor')}: ${tr(nivel)}</span>${d.metodo?.length ? `<span class="chip">${d.metodo.length} ${tr('pasos')}</span>` : ''}${f.truncado ? `<span class="chip aviso">${tr('fuente recortada')}</span>` : ''}</div>
          ${d.metodo?.length ? `<div class="pv-d-sec"><b>${tr('Método')}</b><ol class="pv-d-ol">${d.metodo.map(p => `<li><span>${pvEsc(p.paso)}</span>${p.porque ? `<small class="tenue">${pvEsc(p.porque)}</small>` : ''}</li>`).join('')}</ol></div>` : ''}
          ${lista('Herramientas', d.herramientas)}
          ${lista('Cifras', d.cifras)}
          ${lista('Errores que menciona', d.trampas)}
          ${d.citas?.length ? `<div class="pv-d-sec"><b>${tr('Citas literales')}</b>${d.citas.map(x => `<blockquote class="pv-d-cita">${pvEsc(x)}</blockquote>`).join('')}</div>` : ''}
          ${lista('Lo que NO dice', d.dudas, 'aviso')}
          ${lista('Sin respaldo', d.ojo, 'mal')}
        </div>
      </div>
      <div class="pv-col">
        <div class="seccion" style="margin-top:0">${tr('De esto, una skill')}</div>
        <div class="caja pad">
          <label class="campo">${tr('Nombre de la skill')}<input id="pvSkillNombre" value="${pvEsc(this.nombreSkill || '')}" placeholder="${pvEsc(tr('se propone solo con la fuente'))}"></label>
          <p class="tenue" style="font-size:12px;line-height:1.5">${tr('Se crea en el taller: SKILL.md con los pasos, la ficha completa en references/fuente.md y 3 pruebas de evaluación. Queda DESACTIVADA, con el escáner ya pasado, para que la leas y la actives en Skills.')}</p>
          <button class="btn pri" id="pvCrearSkill">${ic('pieza')}${tr('Crear borrador de skill')}</button>
        </div>
        <div id="pvSkillResultado"></div>
      </div></div>`;
  },

  eventosDossier() {
    const v = this.v;
    $('#pvSkillNombre', v).oninput = e => { this.nombreSkill = e.target.value; };
    $('#pvCrearSkill', v).onclick = async e => {
      const b = e.currentTarget; b.disabled = true; const txt = b.innerHTML;
      b.innerHTML = `<span class="punto ok vivo"></span>${tr('Creando…')}`;
      try {
        const objetivo = ($('#pvObjetivo', v)?.value || '').trim();
        const r = await api('POST', '/fuente/crear-skill', { dossier: this.dossier, nombre: this.nombreSkill || '', objetivo });
        const nv = r.skill?.escaneo?.nivel || 'pendiente';
        $('#pvSkillResultado', v).innerHTML = `<div class="caja pad pv-bien" style="margin-top:12px">${ic('check')}<div><b>${pvEsc(r.skill.nombre || r.skill.slug)}</b>
          <small class="tenue">${tr('borrador guardado · escáner')}: <span class="chip ${nv === 'verde' ? 'ok' : nv === 'rojo' ? 'mal' : 'aviso'}">${pvEsc(nv)}</span></small></div>
          <a class="btn mini pri" href="#/skills/${encodeURIComponent(r.skill.slug)}">${tr('Revisar y activar')}</a></div>`;
        aviso(tr('Skill creada como borrador'));
      } catch (er) { aviso(er.message, true); b.disabled = false; b.innerHTML = txt; }
    };
  },

  async analizar({ url, texto, objetivo }) {
    const v = this.v, est = $('#pvEstadoFuente', v);
    if (!url && !String(texto || '').trim()) return aviso(tr('Pon un enlace o pega un texto'), true);
    const btns = $$('#pvAnalizar, #pvAnalizarTexto', v);
    btns.forEach(b => { b.disabled = true; });
    if (est) { est.innerHTML = `<span class="punto ok vivo"></span>${tr('Leyendo la fuente y sacando el método… (puede tardar)')}`; }
    try {
      const r = await api('POST', '/fuente/analizar', { url, texto, objetivo });
      this.dossier = r.dossier;
      this.nombreSkill = `de-${(r.fuente?.dominio || r.fuente?.tipo || 'fuente').replace(/[^a-z0-9]+/gi, '-')}`.toLowerCase();
      this.pintaCuerpo();
      aviso(tr('Fuente analizada'));
    } catch (e) {
      aviso(e.message, true);
      if (est) est.innerHTML = `<span class="mal-txt">${pvEsc(e.message)}</span>`;
      btns.forEach(b => { b.disabled = false; });
    }
  },

  // ---------- laboratorio ----------
  pintaLab(c) {
    const v = this.v, p = this.p;
    if (!p) {
      c.innerHTML = `<div class="caja pad pv-encargo">
        <div class="seccion" style="margin-top:0">${tr('El encargo')}</div>
        <p class="seccion-ayuda">${tr('Qué tiene que salir. Con la idea y el tipo ya se rellenan los ocho bloques; luego los ajustas.')}</p>
        <textarea id="pvIdea" rows="3" style="width:100%" placeholder="${pvEsc(tr('vender mis prompts de Etsy a gente que empieza'))}"></textarea>
        <div class="flex pv-fila" style="margin-top:10px">
          <select id="pvTipo">${PV_TIPOS.map(([k, t]) => `<option value="${k}">${tr(t)}</option>`).join('')}</select>
          <input id="pvNombre" class="crece" placeholder="${pvEsc(tr('Nombre del prompt (opcional)'))}">
          <button class="btn pri" id="pvCrear">${ic('chispa')}${tr('Crear borrador')}</button>
        </div>
        <div class="seccion">${tr('Seis ángulos')}</div>
        <p class="seccion-ayuda">${tr('Cada ángulo reordena los bloques y cambia lo que pesa en el resultado. Se cambia después, lo que quieras.')}</p>
        <div class="pv-angulos">${this.D.angulos.map(a => `<div class="pv-angle">${ic(PV_ANGULOS_IC[a.id] || 'chispa')}<b>${tr(a.t)}</b><small>${tr(a.d)}</small></div>`).join('')}</div>
        <div class="seccion">${tr('O empieza por uno que ya tengas')}</div>
        <div class="flex pv-fila"><textarea id="pvPegar" rows="5" class="crece" placeholder="${pvEsc(tr('Pega aquí un prompt flojo o a medias: lo parto en bloques y el calibrador dice qué le falta.'))}"></textarea>
          <button class="btn" id="pvReparar">${ic('recargar')}${tr('Reparar')}</button></div>
      </div>`;
      $('#pvCrear', v).onclick = async () => {
        const idea = $('#pvIdea', v).value.trim();
        if (!idea) return $('#pvIdea', v).focus();
        await this.crea({ idea, tipo: $('#pvTipo', v).value, nombre: $('#pvNombre', v).value.trim() });
      };
      $('#pvIdea', v).onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('#pvCrear', v).click(); };
      $('#pvReparar', v).onclick = () => this.reparar($('#pvPegar', v).value);
      return;
    }
    const m = p.medida || {}, [cls, txt] = PV_ESTADO[m.estado] || ['chip', m.estado || ''];
    c.innerHTML = `<div class="seccion" style="margin-top:0">${tr('Borrador')}<span class="crece"></span><span class="chip ${cls}">${tr(txt)} · ${m.puntos ?? 0}/100</span></div>
      <div class="pv-cab">
        <input id="pvNombreE" class="crece pv-nombre" value="${pvEsc(p.nombre || '')}" placeholder="${pvEsc(tr('Nombre del prompt'))}">
        <select id="pvTipoE">${PV_TIPOS.map(([k, t]) => `<option value="${k}"${p.tipo === k ? ' selected' : ''}>${tr(t)}</option>`).join('')}</select>
        ${p.id ? `<button class="btn" id="pvFav">${ic('chispa')}${p.favorito ? tr('En favoritos') : tr('Favorito')}</button>` : ''}
        <button class="btn" id="pvGuardar">${ic('check')}${tr(p.id ? 'Guardar cambios' : 'Guardar en el banco')}</button>
        <button class="btn" id="pvCopiar">${ic('copiar')}${tr('Copiar')}</button>
        <button class="btn fantasma" id="pvEnviar">${ic('enviar')}${tr('Usar en el chat')}</button>
      </div>
      <div class="pv-grid">
        <div class="pv-col">
          <div class="seccion">${tr('Ángulo')}</div>
          <div id="pvAng">${this.D.angulos.map(a => `<button class="pv-ang${p.angulo === a.id ? ' on' : ''}" data-a="${a.id}">${ic(PV_ANGULOS_IC[a.id] || 'chispa')}<span><b>${tr(a.t)}</b><small>${tr(a.d)}</small></span></button>`).join('')}</div>
          <div class="seccion">${tr('Los ocho bloques')}<span class="tenue" style="text-transform:none;letter-spacing:0;font-weight:400">${tr('▮▮ = hueco que rellena quien use el prompt')}</span></div>
          <div id="pvBloques">${this.D.bloques.map(b => this.campo(b)).join('')}</div>
        </div>
        <div class="pv-col">
          <div class="seccion">${tr('Calibrador')} <span class="n">${m.puntos ?? 0}</span><span class="crece"></span><button class="btn mini" id="pvMejorar">${ic('rayo')}${tr('Mejorar')}</button><button class="btn mini fantasma" id="pvMedir">${ic('recargar')}${tr('Revisar')}</button></div>
          <div class="pv-medidor"><div class="pv-bar"><i style="width:${Math.max(2, m.puntos || 0)}%"></i></div>
            <div class="pv-datos">${(m.piezas || []).map(x => `<span class="chip ${x.hay ? 'ok' : 'mal'}">${x.hay ? ic('check') : ic('x')}${tr(x.titulo)}</span>`).join('')}</div></div>
          <div id="pvProblemas">${this.problemas()}</div>
          <div class="seccion">${tr('Prompt montado')}<span class="crece"></span><button class="btn mini fantasma" id="pvVerTxt">${ic('ojo')}${tr('Ver texto')}</button></div>
          <pre class="pv-pre" id="pvPre">${pvEsc((p.texto || '').slice(0, 4000))}</pre>
        </div>
      </div>`;
    this.pintaEventos();
  },

  campo(b) {
    const p = this.p;
    return `<div class="pv-bloque${(p.bloques || {})[b.id] ? ' on' : ''}" data-b="${b.id}">
      <div class="pv-b-cab"><b>${tr(b.t)}</b><span class="tenue pv-pal">${(String((p.bloques || {})[b.id] || '').match(/\S+/g) || []).length}</span></div>
      <small class="tenue pv-b-d">${tr(b.d)}</small>
      <textarea class="pv-ta" id="pvT_${b.id}" rows="4" placeholder="${pvEsc(b.ejemplo)}">${pvEsc((p.bloques || {})[b.id] || '')}</textarea>
    </div>`;
  },

  problemas() {
    const m = this.p?.medida || {}, ps = m.problemas || [], av = m.avisos || [];
    if (!ps.length) return `<div class="caja pad pv-bien">${ic('check')}<div><b>${tr('Cumple los mínimos: cada vez que lo uses sale parecido.')}</b>
      <small class="tenue">${tr('Añadir un ejemplo de salida lo mejora más que cualquier otro retoque.')}</small></div></div>`;
    const g = { alta: 'mal', media: 'aviso', baja: 'aviso' };
    const fila = (x) => `<div class="pv-problema"><span class="chip ${g[x.gravedad] || ''}">${tr(x.bloque || 'general')}</span>
      <span class="pv-p-txt">${pvEsc(x.texto)}</span><div class="crece"></div>
      <button class="btn mini fantasma" data-fix="${pvEsc(x.bloque || '')}" title="${pvEsc(tr('Poner el mínimo que falta en este bloque'))}">${ic('llaveinglesa')}${tr('Arreglar')}</button></div>`;
    return `<div class="pv-problemas">${ps.map(fila).join('')}${av.map(a => `<div class="pv-problema"><span class="chip">${tr(a.bloque || 'general')}</span><span class="pv-p-txt">${pvEsc(a.texto)}</span></div>`).join('')}</div>`;
  },

  pintaEventos() {
    const v = this.v, p = this.p;
    $('#pvAng', v).onclick = e => { const b = e.target.closest('[data-a]'); if (!b) return; this.p = { ...p, angulo: b.dataset.a }; this.remonta(); };
    $('#pvBloques', v).oninput = e => {
      const t = e.target.closest('.pv-ta'); if (!t) return;
      const id = t.id.replace('pvT_', '');
      this.p = { ...this.p, bloques: { ...(this.p.bloques || {}), [id]: t.value } };
      const caja = t.closest('.pv-bloque'); if (caja) caja.classList.toggle('on', !!t.value.trim());
      clearTimeout(this.tm); this.tm = setTimeout(() => this.medir(true), 700);
    };
    $('#pvNombreE', v).oninput = e => { this.p = { ...this.p, nombre: e.target.value }; };
    $('#pvTipoE', v).onchange = e => { this.p = { ...this.p, tipo: e.target.value }; };
    $('#pvGuardar', v).onclick = e => this.guardar(e.currentTarget);
    $('#pvCopiar', v).onclick = () => this.copiar();
    $('#pvEnviar', v).onclick = () => this.enviar();
    $('#pvMejorar', v).onclick = () => this.mejorar();
    $('#pvMedir', v).onclick = () => this.medir(false);
    const ver = $('#pvVerTxt', v); if (ver) ver.onclick = () => this.verTexto();
    const fav = $('#pvFav', v); if (fav) fav.onclick = async () => { try { const r = await api('POST', `/prompts/favorito/${encodeURIComponent(p.id)}`); this.p = { ...this.p, favorito: r.favorito }; aviso(tr(r.favorito ? 'En favoritos' : 'Fuera de favoritos')); this.remonta(); } catch (e) { aviso(e.message, true); } };
    const probs = $('#pvProblemas', v); if (probs) probs.onclick = e => {
      const b = e.target.closest('[data-fix]'); if (!b || !b.dataset.fix) return;
      const id = b.dataset.fix, ej = (this.D.bloques.find(x => x.id === id) || {}).ejemplo || '';
      this.p = { ...this.p, bloques: { ...(this.p.bloques || {}), [id]: (this.p.bloques || {})[id] ? (this.p.bloques || {})[id] : ej } };
      this.remonta();
    };
  },

  remonta() { this.pintaCuerpo(); },

  // recalcula el texto y la medida sin volver a pedir la lista
  async medir(silencioso) {
    if (!this.p) return;
    try {
      const r = await api('POST', '/prompts/medir', { ...this.p, angulo: this.p.angulo });
      this.p = { ...this.p, medida: r.medida, texto: r.texto };
      if (silencioso) { const v = this.v; const m = this.p.medida; const chip = $('.pv-cab .chip', v); if (chip) { const [cls, t] = PV_ESTADO[m.estado] || ['', m.estado]; chip.className = 'chip ' + cls; chip.textContent = `${tr(t)} · ${m.puntos}/100`; } $('#pvProblemas', v).innerHTML = this.problemas(); this.pintaEventos(); $('#pvPre', v).textContent = (this.p.texto || '').slice(0, 4000); const i = $('.pv-bar i', v); if (i) i.style.width = Math.max(2, m.puntos) + '%'; const d = $('.pv-datos', v); if (d) d.innerHTML = (m.piezas || []).map(x => `<span class="chip ${x.hay ? 'ok' : 'mal'}">${x.hay ? ic('check') : ic('x')}${tr(x.titulo)}</span>`).join(''); }
      else this.remonta();
    } catch (e) { if (!silencioso) aviso(e.message, true); }
  },

  async crea(entrada) {
    try { const r = await api('POST', '/prompts/crear', entrada); this.p = r; this.pestana = 'lab'; this.remonta(); }
    catch (e) { aviso(e.message, true); }
  },

  async mejorar() {
    if (!this.p) return;
    try { const r = await api('POST', '/prompts/mejorar', this.p); this.p = { ...this.p, ...r }; aviso(tr(r.cambios?.length ? 'Mejorado: {n} cambios' : 'Ya estaba bien', { n: r.cambios?.length || 0 })); this.remonta(); }
    catch (e) { aviso(e.message, true); }
  },

  async reparar(texto) {
    if (!String(texto || '').trim()) return aviso(tr('Pega primero el prompt'), true);
    try { const r = await api('POST', '/prompts/reparar', { texto }); this.p = r; this.pestana = 'lab'; aviso(tr(r.notas?.length ? 'Partido en bloques ({n} huecos)' : 'Partido en bloques', { n: r.notas?.length || 0 })); this.remonta(); }
    catch (e) { aviso(e.message, true); }
  },

  async guardar(btn) {
    if (!this.p) return;
    btn.disabled = true;
    try { const r = await api('POST', '/prompts/guardar', this.p); this.p = { ...this.p, ...r }; aviso(tr('Guardado en el banco')); history.replaceState(null, '', `#/prompts/${encodeURIComponent(r.id)}`); await this.pintar(this.v, r.id); }
    catch (e) { aviso(e.message, true); btn.disabled = false; }
  },

  copiar() { const t = this.p?.texto; if (!t) return aviso(tr('Nada que copiar'), true); pvCopiar(t); },

  async enviar() {
    const t = this.p?.texto; if (!t) return;
    location.hash = `#/chat?prompt=${encodeURIComponent(t)}`;
  },

  verTexto() {
    const t = this.p?.texto || '';
    modal({ titulo: tr('Prompt montado'), cuerpo: `<pre class="pv-pre" style="max-height:60vh">${pvEsc(t)}</pre>`, ancho: '820px', botones: [{ txt: tr('Copiar'), valor: 'copiar' }, { txt: tr('Cerrar'), valor: null }] })
      .then(v => { if (v === 'copiar') pvCopiar(t); });
  },

  importar() { this.pestana = 'lab'; this.p = null; this.pintaCuerpo(); setTimeout(() => { const t = $('#pvPegar', this.v); if (t) t.focus(); }, 30); },

  // ---------- banco ----------
  pintaBanco(c) {
    const v = this.v, L = this.D.prompts;
    if (!L.length) { c.innerHTML = `<div class="caja pad sk-vacio">${ic('carpeta')}<p>${tr('El banco está vacío. Escribe el encargo y pulsa «Crear borrador» para tener el primero.')}</p></div>`; return; }
    c.innerHTML = `<div class="rn-busca">${ic('buscar')}<input id="pvQ" placeholder="${pvEsc(tr('Buscar en el banco…'))}"></div>
      <div class="pv-banco" id="pvLista">${this.tarjetas(L)}</div>`;
    this.cargarMinis(v);
    $('#pvQ', v).oninput = e => { const q = e.target.value.trim().toLowerCase(); $('#pvLista', v).innerHTML = this.tarjetas(L.filter(x => !q || `${x.nombre} ${x.tipo} ${x.angulo}`.toLowerCase().includes(q))); this.cargarMinis(v); };
    $('#pvLista', v).onclick = async e => {
      const ver = e.target.closest('[data-ver]');
      if (ver) { e.preventDefault(); this.verVista(ver.dataset.ver, ver.dataset.nombre); return; }
      const del = e.target.closest('[data-borrar]');
      if (del) { e.preventDefault(); if (!(await confirmar(tr('Borrar prompt'), `«${del.dataset.nombre}» ${tr('se borrará del banco.')}`, true))) return; try { await api('DELETE', `/prompts/${encodeURIComponent(del.dataset.borrar)}`); aviso(tr('Borrado')); this.pestana = 'banco'; await this.pintar(this.v); } catch (er) { aviso(er.message, true); } }
    };
  },

  // la miniatura va dentro del prompt guardado: se pide aparte para que la lista siga ligera
  async cargarMinis(raiz) {
    this.minis = this.minis || {};
    for (const el of raiz.querySelectorAll('[data-mini]')) {
      const id = el.dataset.mini;
      if (!(id in this.minis)) { try { this.minis[id] = (await api('GET', '/prompts/' + encodeURIComponent(id))).miniatura || ''; } catch { this.minis[id] = ''; } }
      const m = this.minis[id];
      if (el.isConnected && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(m)) { const i = new Image(); i.alt = ''; i.src = m; el.replaceChildren(i); }
    }
  },

  verVista(id, nombre) {
    return modal({ titulo: nombre, ancho: 1100, cuerpo: `<iframe class="pv-vista" sandbox="allow-scripts" title="${pvEsc(tr('Vista previa'))}" src="/prompt-vista/${encodeURIComponent(id)}"></iframe>`,
      alAbrir: v => { $('.modal', v).style.maxHeight = '94vh'; } });
  },

  tarjetas(L) {
    return L.length ? `<div class="pv-grid-b">${L.map(x => {
      const ang = this.D.angulos.find(a => a.id === x.angulo) || {};
      return `<a class="caja pv-item" href="#/prompts/${encodeURIComponent(x.id)}"><div class="pv-mini" data-mini="${pvEsc(x.id)}">${ic('carpeta')}</div>
        <div class="pv-item-cab"><b>${pvEsc(x.nombre)}</b>${x.favorito ? `<span class="chip acento">${ic('chispa')}</span>` : ''}</div>
        <div class="flex" style="gap:6px;flex-wrap:wrap"><span class="chip">${tr(ang.t || x.angulo)}</span><span class="chip">${tr((PV_TIPOS.find(t => t[0] === x.tipo) || [])[1] || x.tipo)}</span><span class="chip ${x.puntos >= 80 ? 'ok' : x.puntos >= 50 ? 'aviso' : 'mal'}">${x.puntos}/100</span></div>
        <small class="tenue">${pvFecha(x.creado)} · ${x.palabras || 0} ${tr('palabras')}</small>
        ${x.vista ? `<button class="btn mini pv-ver" data-ver="${pvEsc(x.id)}" data-nombre="${pvEsc(x.nombre)}">${ic('play')}${tr('Vista previa')}</button>` : ''}
        <button class="btn mini fantasma mal" data-borrar="${pvEsc(x.id)}" data-nombre="${pvEsc(x.nombre)}" title="${pvEsc(tr('Borrar'))}">${ic('basura')}</button></a>`;
    }).join('')}</div>` : `<div class="caja pad tenue">${tr('Nada con ese nombre.')}</div>`;
  },

  // ---------- seis ángulos ----------
  pintaAngulos(c) {
    c.innerHTML = `<div class="pv-angulos-2">${this.D.angulos.map(a => `<div class="caja pad pv-a"><div class="flex"><span class="pv-a-ic">${ic(PV_ANGULOS_IC[a.id] || 'chispa')}</span><b>${tr(a.t)}</b></div>
      <p class="tenue">${tr(a.d)}</p>
      <small class="tenue">${tr('Orden:')} ${a.orden.map(id => tr((this.D.bloques.find(b => b.id === id) || {}).t || id)).join(' → ')}</small></div>`).join('')}</div>`;
  },
};

if (!document.getElementById('pvEstilo')) {
  const s = document.createElement('style'); s.id = 'pvEstilo';
  s.textContent = `.pv-encargo textarea,.pv-ta{width:100%;font-family:var(--sans);line-height:1.5;resize:vertical}
.pv-fila{align-items:flex-start;gap:10px;flex-wrap:wrap}
.pv-angulos{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px}
.pv-angle{display:grid;grid-template-columns:18px 1fr;column-gap:9px;row-gap:2px;align-items:start;background:var(--capa-2);border:1px solid var(--borde);border-radius:var(--radio-s);padding:10px 12px}
.pv-angle .i{grid-row:1;width:16px;height:16px;color:var(--acento);margin-top:2px}
.pv-angle b{grid-column:2;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pv-angle small{grid-column:2;color:var(--txt-3);font-size:11.5px;line-height:1.4}
.pv-cab{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:4px 0 6px}
.pv-nombre{font-size:15px;font-weight:600}
.pv-grid{display:grid;grid-template-columns:minmax(320px,1fr) minmax(360px,1.05fr);gap:18px;align-items:start}
@media(max-width:960px){.pv-grid{grid-template-columns:1fr}}
.pv-col{min-width:0}
.pv-ang{display:flex;gap:9px;align-items:flex-start;width:100%;text-align:left;background:var(--capa);border:1px solid var(--borde);border-radius:var(--radio-s);padding:8px 10px;margin-bottom:6px;cursor:pointer;color:var(--txt)}
.pv-ang span b{display:block;font-size:12.5px}.pv-ang span small{color:var(--txt-3);font-size:11px}
.pv-ang.on{border-color:var(--acento);background:color-mix(in srgb,var(--acento) 8%,transparent)}
.pv-bloque{background:var(--capa);border:1px solid var(--borde);border-radius:var(--radio-s);padding:10px 12px;margin-bottom:8px}
.pv-bloque.on{border-color:color-mix(in srgb,var(--acento) 45%,var(--borde))}
.pv-b-cab{display:flex;align-items:center;gap:8px}.pv-b-cab b{font-size:13px}
.pv-b-d{display:block;margin:2px 0 6px;line-height:1.4}
.pv-pal{font-variant-numeric:tabular-nums;font-size:11px}
.pv-medidor{margin:8px 0 10px}
.pv-bar{height:8px;border-radius:99px;background:var(--capa-3);overflow:hidden}
.pv-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--mal),var(--aviso) 55%,var(--ok));transition:width .35s}
.pv-datos{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
.pv-problema{display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border:1px solid var(--borde);border-radius:var(--radio-s);background:var(--capa-2);margin-bottom:6px;font-size:12.5px;line-height:1.45}
.pv-p-txt{color:var(--txt-2)}
.pv-bien{display:flex;gap:10px;align-items:flex-start}.pv-bien b{display:block}
.pv-pre{margin:0;background:var(--fondo);border:1px solid var(--borde);border-radius:var(--radio-s);padding:12px 14px;font-size:12px;line-height:1.6;white-space:pre-wrap;max-height:46vh;overflow:auto}
.pv-banco{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.pv-grid-b{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;grid-column:1/-1}
.pv-grid-b>.pv-item{margin:0}
.pv-item .btn.pv-ver{position:static;opacity:1;align-self:flex-start}
.pv-vista{display:block;width:100%;height:72vh;border:0;border-radius:10px;background:#000}
.pv-mini{margin:-12px -14px 2px;aspect-ratio:16/9;background:#050608;display:flex;align-items:center;justify-content:center;color:var(--tenue,#667);overflow:hidden;border-radius:inherit;border-bottom-left-radius:0;border-bottom-right-radius:0}
.pv-mini img{width:100%;height:100%;object-fit:cover;display:block}
.pv-item{padding:12px 14px;display:flex;flex-direction:column;gap:8px;color:var(--txt);text-decoration:none;position:relative}
.pv-item-cab{display:flex;align-items:center;gap:8px}.pv-item-cab b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pv-item .btn{position:absolute;right:8px;bottom:8px;opacity:.0;transition:opacity .15s}
.pv-item:hover .btn{opacity:1}
.pv-angulos-2{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.pv-a-ic{color:var(--acento);display:inline-flex}
.pv-a p{margin:8px 0;font-size:13px}
.pv-d-tit{display:block;font-size:14px}
.pv-d-url{display:block;margin:2px 0 8px;word-break:break-all}
.pv-d-ens{margin:8px 0;font-size:13px;line-height:1.55;color:var(--txt-2)}
.pv-d-sec{margin-top:12px}.pv-d-sec>b{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--txt-3);margin-bottom:5px}
.pv-d-ol{margin:0;padding-left:20px;font-size:12.5px;line-height:1.5}.pv-d-ol li{margin-bottom:6px}.pv-d-ol small{display:block}
.pv-d-ul{margin:0;padding-left:18px;font-size:12.5px;line-height:1.5}.pv-d-ul.aviso li{color:var(--aviso)}.pv-d-ul.mal li{color:var(--mal)}
.pv-d-cita{margin:0 0 6px;padding:7px 10px;border-left:2px solid var(--acento);background:var(--capa-2);font-size:12.5px;border-radius:0 var(--radio-s) var(--radio-s) 0}
.pv-campo-campo{display:block;margin:0 0 10px}
@media(prefers-reduced-motion:reduce){.pv-bar i{transition:none}}`;
  document.head.append(s);
}
