// Estudio de Avatares (#/avatar): "Tu avatar" (perfil en panel/móvil/Wrapped) y "Avatar de APOLO" (skin 2D del compañero para la isla
// y el overlay, apagada por defecto). Modo Forma (instantáneo, offline: core/ui/avatar.js) y modo Personaje IA (OpenAI/Gemini, con
// coste y prompt visibles ANTES de generar). También: paso del asistente de bienvenida, sección en Configuración → Apariencia y el
// avatar del usuario junto a sus mensajes del chat (variable CSS --av-usuario). API /v1/avatar. Globales con prefijo AV_/AVP_.
'use strict';
P.carita = '<circle cx="12" cy="12" r="9"/><path d="M9 9.5v1.5M15 9.5v1.5"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/>';
{ const i = NAV_APP.findIndex(n => n[0] === 'wrapped'); NAV_APP.splice(i < 0 ? NAV_APP.length : i + 1, 0, ['avatar', 'Avatar', 'carita']); }

Object.assign(I18N.dic.en, {
  'Avatar': 'Avatar', 'Tu avatar': 'Your avatar', 'Avatar de {n}': '{n}\'s avatar', 'Forma': 'Shape', 'Personaje IA': 'AI character',
  'Tu cara en el panel, el móvil y el Wrapped, y si quieres una skin 2D para el compañero. Se guarda como una receta pequeña: se ve igual en todas partes.': 'Your face in the panel, the phone and Wrapped, and optionally a 2D skin for your companion. It is saved as a tiny recipe: it looks the same everywhere.',
  'Aleatorio': 'Random', 'Exportar PNG': 'Export PNG', 'Exportar SVG': 'Export SVG', 'Guardar': 'Save', 'Guardado': 'Saved', 'Sin guardar': 'Not saved', 'Guardar avatar': 'Save avatar',
  'Silueta': 'Silhouette', 'Color': 'Color', 'Ojos': 'Eyes', 'Color de ojos': 'Eye color', 'Detalles': 'Details', 'Mejillas': 'Cheeks', 'Accesorio': 'Accessory', 'Fondo': 'Background',
  'Transparente': 'Transparent', 'Degradado': 'Gradient', 'Otra semilla': 'Reroll',
  'Círculo': 'Circle', 'Cuadrado': 'Square', 'Píldora': 'Pill', 'Panal': 'Honeycomb', 'Gota': 'Drop', 'Nube': 'Cloud', 'Escudo': 'Shield', 'Estrella': 'Star', 'Corazón': 'Heart',
  'Trébol': 'Clover', 'Flor': 'Flower', 'Rombo': 'Diamond', 'Triángulo': 'Triangle', 'Burbuja': 'Bubble', 'Casco APOLO': 'APOLO helmet', 'Blob': 'Blob',
  'Puntos': 'Dots', 'Cápsulas': 'Capsules', 'Píxel': 'Pixel', 'Felices': 'Happy', 'Ninguno': 'None', 'Antena': 'Antenna', 'Auriculares': 'Headphones', 'Visor': 'Visor', 'Gorra': 'Cap',
  'Reposo': 'Idle', 'Trabajando': 'Working', 'Permiso': 'Permission', 'Listo': 'Done', 'Error': 'Error', 'Dormido': 'Asleep',
  'Presets': 'Presets', 'Avatar vivo: los mismos estados que el casco': 'Living avatar: the same states as the helmet', 'Historial': 'History', 'Aún no hay historial.': 'No history yet.',
  'Usar avatar en lugar del casco': 'Use avatar instead of the helmet', 'En la isla, el casco 3D se cambia por este avatar 2D (gasta menos).': 'On the island, the 3D helmet is replaced by this 2D avatar (lighter).',
  'Mostrar también en el overlay de streaming': 'Also show it on the streaming overlay', 'Solo si usas el avatar en lugar del casco.': 'Only if you use the avatar instead of the helmet.',
  'Generadores de imagen': 'Image generators', 'listo': 'ready', 'Describe a tu personaje': 'Describe your character',
  'Qué es, qué le gusta, cómo se mueve… (en tu idioma)': 'What it is, what it likes, how it moves… (any language)', 'Pelo': 'Hair', 'Colores': 'Colors', 'Ropa': 'Outfit',
  'Estilo': 'Style', 'Juguete 3D': '3D toy', 'Ilustración 2D': '2D illustration', 'Género (opcional)': 'Gender (optional)', 'Edad aparente (opcional)': 'Apparent age (optional)',
  'Sin especificar (neutro)': 'Unspecified (neutral)', 'Sin especificar': 'Unspecified', 'Femenino': 'Feminine', 'Masculino': 'Masculine', 'Andrógino': 'Androgynous',
  'Niño/a': 'Child', 'Joven': 'Teen', 'Adulto/a': 'Adult', 'Mayor': 'Older adult',
  'Partir de mi avatar Forma (mantiene su color y sus ojos)': 'Start from my Shape avatar (keeps its color and eyes)',
  'Nunca deducimos edad ni género: si no los eliges, el personaje es neutro.': 'We never guess age or gender: if you do not choose them, the character is neutral.',
  'Ver coste y generar': 'See cost and generate', 'Generar 1 imagen': 'Generate 1 image', 'Generando… (puede tardar un minuto)': 'Generating… (may take a minute)',
  '¿Generar el personaje?': 'Generate the character?', 'Se generará 1 imagen con {m} ({mod}).': '1 image will be generated with {m} ({mod}).', 'Coste aproximado': 'Approximate cost',
  'Prompt que se enviará': 'Prompt that will be sent', 'Se manda también tu avatar Forma como referencia.': 'Your Shape avatar is also sent as a reference.',
  'Personaje generado': 'Character generated', 'Tus personajes IA': 'Your AI characters', 'Aún no has generado ninguno.': 'You have not generated any yet.',
  'Usar': 'Use', 'Borrar': 'Delete', '¿Borrar esta imagen?': 'Delete this image?', 'Se borra del disco. Si era tu avatar, vuelves al modo Forma.': 'It is deleted from disk. If it was your avatar, you go back to Shape mode.',
  'No hay ningún generador de imágenes configurado.': 'No image generator is configured.',
  'Añade una API key de OpenAI o de Gemini en Configuración → Claves de API. El modo Forma funciona sin nada de esto.': 'Add an OpenAI or Gemini API key in Settings → API keys. Shape mode works without any of this.',
  'Ir a Claves de API': 'Go to API keys', 'Avatares': 'Avatars', 'Tu foto de perfil en el panel, el móvil y el Wrapped.': 'Your profile picture in the panel, the phone and Wrapped.',
  'Una skin 2D opcional para el compañero (isla y overlay).': 'An optional 2D skin for your companion (island and overlay).', 'Editar': 'Edit', 'sin elegir': 'not chosen',
  'Elige tu avatar': 'Pick your avatar', 'Es tu cara en el panel, el móvil y el Wrapped. Luego puedes diseñarlo a tu gusto en Avatar.': 'It is your face in the panel, the phone and Wrapped. You can design it your way later in Avatar.',
  'Personalizarlo después': 'Customize it later', 'PNG descargado': 'PNG downloaded', 'Ya': 'Done',
});

const AVF = window.AvatarSVG;
const AVP_FORMA_TXT = { circulo: 'Círculo', cuadrado: 'Cuadrado', pildora: 'Píldora', hexagono: 'Panal', gota: 'Gota', nube: 'Nube', escudo: 'Escudo', estrella: 'Estrella', corazon: 'Corazón',
  trebol: 'Trébol', flor: 'Flor', rombo: 'Rombo', triangulo: 'Triángulo', burbuja: 'Burbuja', casco: 'Casco APOLO', blob: 'Blob' };
const AVP_OJOS_TXT = { casco: 'Casco APOLO', puntos: 'Puntos', capsulas: 'Cápsulas', pixel: 'Píxel', felices: 'Felices' };
const AVP_ACC_TXT = { ninguno: 'Ninguno', antena: 'Antena', auriculares: 'Auriculares', visor: 'Visor', gorra: 'Gorra' };
const AVP_EST_TXT = { reposo: 'Reposo', trabajando: 'Trabajando', permiso: 'Permiso', listo: 'Listo', error: 'Error', dormido: 'Dormido' };
const AVP_OJOS_COL = ['#1d232b', '#f4f6f8', '#46d7be', '#7dffc4', '#5ab0ff', '#ff8fab', '#ffd84d', '#a78bfa'];
const AVP_FONDO_COL = ['#07110c', '#0b1422', '#1a1030', '#24120c', '#f2efe9', '#e8f4ff', '#2bdc7c', '#ff5fa2'];

// ---------- global: el avatar del usuario en todo el panel ----------
const AV_G = { datos: null, img: new Map() };
async function AV_urlIA(id, comoData) {                // las imágenes IA piden token → blob URL (o data: para exportar)
  const k = id + (comoData ? ':d' : '');
  if (AV_G.img.has(k)) return AV_G.img.get(k);
  const r = await fetch(`/v1/avatar/ia/${encodeURIComponent(id)}`, { headers: { 'x-robot-token': TOKEN } });
  if (!r.ok) return '';
  const b = await r.blob();
  const u = comoData ? await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b); }) : URL.createObjectURL(b);
  AV_G.img.set(k, u); return u;
}
async function AV_svg(receta, op = {}) {
  if (!receta) return '';
  return AVF.svg(receta, receta.tipo === 'ia' ? { ...op, imagen: await AV_urlIA(receta.ia.id, op.comoData) } : op);
}
async function AV_aplicarGlobal() {
  const r = AV_G.datos?.usuario;
  document.body.classList.toggle('con-avatar', !!r);
  if (!r) return document.documentElement.style.removeProperty('--av-usuario');
  const s = await AV_svg(r, { animado: false });
  document.documentElement.style.setProperty('--av-usuario', `url("${AVF.dataUri(s).replace(/"/g, '%22')}")`);
}
async function AV_cargarGlobal() { if (!TOKEN) return; try { AV_G.datos = await api('GET', '/avatar'); await AV_aplicarGlobal(); } catch { } }
document.addEventListener('DOMContentLoaded', () => setTimeout(AV_cargarGlobal, 400));
const AVP_mini = (r, op = {}) => AVF.svg(r, { animado: false, ...op });
function AVP_descargar(blob, nombre) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }

// ---------- página ----------
VISTAS.avatar = {
  claves: 'avatar perfil foto personaje skin cara ojos forma ia imagen',
  quien: 'usuario', modo: 'forma', estado: 'reposo', borr: null, sucio: false, d: null,
  async pintar(v, sub) {
    this.v = v;
    if (sub === 'apolo' || sub === 'usuario') this.quien = sub;
    this.d = AV_G.datos = await api('GET', '/avatar');
    this.cargarBorrador();
    const nombre = E.estado?.nombre || 'APOLO';
    v.innerHTML = `<div class="pagina av-pag" id="avpRaiz">${cabecera('Avatar', 'Tu cara en el panel, el móvil y el Wrapped, y si quieres una skin 2D para el compañero. Se guarda como una receta pequeña: se ve igual en todas partes.',
      `<button class="btn" id="avpAzar">${ic('chispa')}${tr('Aleatorio')}</button><button class="btn" id="avpPng">${ic('abajo')}${tr('Exportar PNG')}</button><button class="btn" id="avpSvg">${ic('abajo')}${tr('Exportar SVG')}</button>`)}
      <div class="av-quien">${seg('avQuien', [['usuario', 'Tu avatar'], ['apolo', tr('Avatar de {n}', { n: nombre })]], this.quien)}</div>
      <div class="av-grid">
        <section class="caja av-prev"><div class="av-escena" id="avpEscena"></div>
          <div class="av-estados" id="avpEstados">${AVF.ESTADOS.map(e => `<button class="chip-btn" data-est="${e}">${tr(AVP_EST_TXT[e])}</button>`).join('')}</div>
          <div class="av-guardar"><span class="tenue" id="avpSucio"></span><button class="btn pri" id="avpGuardar">${ic('check')}${tr('Guardar avatar')}</button></div>
          <div id="avpSkin"></div></section>
        <section class="av-editor"><div class="av-modo">${seg('avModo', [['forma', 'Forma'], ['ia', 'Personaje IA']], this.modo)}</div><div id="avpEditor"></div></section>
      </div>
      <div class="seccion">${tr('Avatar vivo: los mismos estados que el casco')}</div><div class="av-hoja" id="avpHoja"></div>
      <div class="seccion">${tr('Presets')}</div><div class="av-presets" id="avpPresets"></div>
      <div class="seccion">${tr('Historial')}</div><div class="av-hist" id="avpHist"></div></div>`;
    const raiz = $('#avpRaiz', v);                    // eventos en la raíz de la página (#vista se reutiliza entre vistas)
    raiz.onclick = e => this.clic(e);
    raiz.oninput = e => this.entrada(e);
    enlazarControles(raiz, (id, val) => this.control(id, val));
    this.pintarTodo();
  },
  salir() { this.v = null; },
  cargarBorrador() {
    const r = this.d[this.quien];
    this.borr = AVF.normalizar(r || (this.quien === 'apolo' ? AVF.PRESETS[0] : AVF.PRESETS[1]));
    this.sucio = !r; this.modo = this.borr.tipo === 'ia' ? 'ia' : 'forma';
  },
  cambiar(c) { this.borr = AVF.normalizar({ ...this.borr, ...c }); this.sucio = true; this.pintarTodo(); },
  async pintarTodo() {
    if (!this.v) return;
    $('#avpEscena', this.v).innerHTML = await AV_svg(this.borr, { estado: this.estado });
    $$('[data-est]', this.v).forEach(b => b.classList.toggle('on', b.dataset.est === this.estado));
    $('#avpSucio', this.v).textContent = tr(this.sucio ? 'Sin guardar' : 'Guardado');
    $('#avpGuardar', this.v).disabled = !this.sucio;
    $('#avpSkin', this.v).innerHTML = this.quien === 'apolo' ? `<div class="av-skin">${fila('Usar avatar en lugar del casco', 'En la isla, el casco 3D se cambia por este avatar 2D (gasta menos).', sw('avIsla', this.d.usarEnIsla))}
      ${fila('Mostrar también en el overlay de streaming', 'Solo si usas el avatar en lugar del casco.', sw('avOverlay', this.d.enOverlay))}</div>` : '';
    this.pintarEditor();
    const hoja = await Promise.all(AVF.ESTADOS.map(async e => `<figure><div>${await AV_svg(this.borr, { estado: e })}</div><figcaption>${tr(AVP_EST_TXT[e])}</figcaption></figure>`));
    $('#avpHoja', this.v).innerHTML = hoja.join('');
    $('#avpPresets', this.v).innerHTML = AVF.PRESETS.map((p, i) => `<button class="av-carta" data-preset="${i}" title="${esc(p.nombre)}">${AVP_mini(p)}<span>${esc(p.nombre)}</span></button>`).join('');
    const hist = (this.d.historial || []).filter(h => h.quien === this.quien).slice(0, 12);
    $('#avpHist', this.v).innerHTML = hist.length ? (await Promise.all(hist.map(async (h, i) => `<button class="av-carta mini" data-hist="${i}" title="${esc(fecha(h.t))}">${await AV_svg(h.receta, { animado: false })}</button>`))).join('') : `<p class="tenue">${tr('Aún no hay historial.')}</p>`;
    this.hist = hist;
  },
  pintarEditor() {
    const box = $('#avpEditor', this.v); if (!box) return;
    if (this.modo === 'ia') return this.pintarIA(box);
    const r = this.borr, foco = document.activeElement?.id;
    const sw8 = (lista, clave, actual, id) => `<div class="av-paleta">${lista.map(c => `<button class="av-color${c === actual ? ' on' : ''}" data-${clave}="${c}" style="background:${c}" title="${c}"></button>`).join('')}<label class="av-color libre" title="${tr('Color')}"><input type="color" id="${id}" value="${actual}"></label></div>`;
    box.innerHTML = `<div class="caja pad av-bloques">
      <div class="av-bloque"><b>${tr('Silueta')}</b>${r.forma === 'blob' ? `<button class="btn mini" id="avpSemilla">${ic('recargar')}${tr('Otra semilla')}</button>` : ''}
        <div class="av-formas">${AVF.FORMAS.map(f => `<button class="av-op${f === r.forma ? ' on' : ''}" data-forma="${f}" title="${esc(tr(AVP_FORMA_TXT[f]))}">${AVP_mini({ ...r, tipo: 'forma', forma: f, accesorio: 'ninguno', fondo: { tipo: 'transparente' } })}</button>`).join('')}</div></div>
      <div class="av-bloque"><b>${tr('Color')}</b>${sw8(AVF.PALETA, 'cuerpo', r.cuerpo, 'avpCuerpo')}</div>
      <div class="av-bloque"><b>${tr('Ojos')}</b><div class="av-ojos">${AVF.OJOS.map(o => `<button class="av-op ancho${o === r.ojos ? ' on' : ''}" data-ojos="${o}">${AVP_mini({ ...r, tipo: 'forma', ojos: o, colorOjos: o === 'casco' && r.ojos !== 'casco' ? '' : r.colorOjos, accesorio: 'ninguno', fondo: { tipo: 'transparente' } })}<span>${tr(AVP_OJOS_TXT[o])}</span></button>`).join('')}</div>
        <small class="tenue">${tr('Color de ojos')}</small>${sw8(AVP_OJOS_COL, 'colojos', r.colorOjos, 'avpOjos')}</div>
      <div class="av-bloque"><b>${tr('Detalles')}</b><div class="av-fila"><span>${tr('Mejillas')}</span>${sw('avMejillas', r.mejillas)}</div>
        <div class="av-chips">${AVF.ACCESORIOS.map(a => `<button class="chip-btn${a === r.accesorio ? ' on' : ''}" data-acc="${a}">${tr(AVP_ACC_TXT[a])}</button>`).join('')}
        ${r.accesorio !== 'ninguno' ? `<label class="av-color libre" title="${tr('Color')}" style="background:${r.colorAccesorio}"><input type="color" id="avpAcc" value="${r.colorAccesorio}"></label>` : ''}</div></div>
      <div class="av-bloque"><b>${tr('Fondo')}</b><div class="av-fila">${seg('avFondo', [['transparente', 'Transparente'], ['color', 'Color'], ['degradado', 'Degradado']], r.fondo.tipo)}</div>
        ${r.fondo.tipo !== 'transparente' ? `${sw8(AVP_FONDO_COL, 'fondo1', r.fondo.c1, 'avpF1')}${r.fondo.tipo === 'degradado' ? `<div class="av-fila"><small class="tenue">→</small><label class="av-color libre" style="background:${r.fondo.c2}"><input type="color" id="avpF2" value="${r.fondo.c2}"></label></div>` : ''}` : ''}</div></div>`;
    if (foco && $('#' + foco, box)) $('#' + foco, box).focus();
  },
  async pintarIA(box) {
    const m = this.d.motores || [], listos = m.filter(x => x.listo);
    const f = this.formIA || (this.formIA = { descripcion: '', pelo: '', colores: '', ropa: '', accesorio: '', estilo: '3d', ojos: this.borr.ojos, genero: '', edad: '', desdeForma: true, motor: listos[0]?.id || '' });
    const op = (lista, val) => lista.map(([v, t]) => `<option value="${v}"${v === val ? ' selected' : ''}>${esc(tr(t))}</option>`).join('');
    box.innerHTML = `<div class="caja pad av-ia av-bloques">
      <div class="av-bloque"><b>${tr('Generadores de imagen')}</b><div class="av-chips">${m.map(x => `<button class="chip-btn${x.listo ? '' : ' apagado'}${x.id === f.motor ? ' on' : ''}" data-motor="${x.id}" ${x.listo ? '' : 'disabled'} title="${esc(tr(x.falta || ''))}">${x.listo ? ic('check') : ic('x')}${esc(x.nombre)} · <small>${esc(x.modelo)}</small></button>`).join('')}</div>
        ${listos.length ? '' : `<div class="av-sinmotor">${ic('info')}<div><b>${tr('No hay ningún generador de imágenes configurado.')}</b><p class="tenue">${tr('Añade una API key de OpenAI o de Gemini en Configuración → Claves de API. El modo Forma funciona sin nada de esto.')}</p><a class="btn mini" href="#/ajustes/claves">${ic('llave')}${tr('Ir a Claves de API')}</a></div></div>`}</div>
      <div class="av-bloque"><b>${tr('Describe a tu personaje')}</b><textarea id="avpDesc" rows="3" maxlength="600" placeholder="${esc(tr('Qué es, qué le gusta, cómo se mueve… (en tu idioma)'))}">${esc(f.descripcion)}</textarea>
        <div class="av-campos">${[['pelo', 'Pelo'], ['colores', 'Colores'], ['ropa', 'Ropa'], ['accesorio', 'Accesorio']].map(([k, t]) => `<label><small>${tr(t)}</small><input data-ia="${k}" maxlength="80" value="${esc(f[k])}"></label>`).join('')}
          <label><small>${tr('Estilo')}</small><select data-ia="estilo">${op([['3d', 'Juguete 3D'], ['2d', 'Ilustración 2D']], f.estilo)}</select></label>
          <label><small>${tr('Ojos')}</small><select data-ia="ojos">${op(AVF.OJOS.map(o => [o, AVP_OJOS_TXT[o]]), f.ojos)}</select></label>
          <label><small>${tr('Género (opcional)')}</small><select data-ia="genero">${op([['', 'Sin especificar (neutro)'], ['femenino', 'Femenino'], ['masculino', 'Masculino'], ['neutro', 'Andrógino']], f.genero)}</select></label>
          <label><small>${tr('Edad aparente (opcional)')}</small><select data-ia="edad">${op([['', 'Sin especificar'], ['nino', 'Niño/a'], ['joven', 'Joven'], ['adulto', 'Adulto/a'], ['mayor', 'Mayor']], f.edad)}</select></label></div>
        <label class="av-check"><input type="checkbox" data-ia="desdeForma" ${f.desdeForma ? 'checked' : ''}> ${tr('Partir de mi avatar Forma (mantiene su color y sus ojos)')}</label>
        <p class="tenue av-nota">${ic('escudo')}${tr('Nunca deducimos edad ni género: si no los eliges, el personaje es neutro.')}</p>
        <button class="btn pri" id="avpGenerar" ${listos.length ? '' : 'disabled'}>${ic('chispa')}${tr('Ver coste y generar')}</button></div>
      <div class="av-bloque"><b>${tr('Tus personajes IA')}</b><div class="av-galeria" id="avpGal">${this.d.ia?.length ? '' : `<p class="tenue av-todo">${tr('Aún no has generado ninguno.')}</p>`}</div></div></div>`;
    const gal = $('#avpGal', box);
    for (const x of this.d.ia || []) {
      const url = await AV_urlIA(x.id);
      const el = document.createElement('div'); el.className = 'av-ia-item' + (this.borr.tipo === 'ia' && this.borr.ia?.id === x.id ? ' on' : '');
      el.innerHTML = `<img src="${esc(url)}" alt="" title="${esc(x.descripcion || '')}"><div class="flex"><button class="btn mini" data-usar-ia="${esc(x.id)}">${tr('Usar')}</button><button class="btn mini fantasma" data-borrar-ia="${esc(x.id)}" title="${tr('Borrar')}">${ic('basura')}</button></div><small class="tenue">${esc(x.motor)} · ${esc(fecha(x.t))}</small>`;
      gal.append(el);
    }
  },
  control(id, val) {
    if (id === 'avQuien') { this.quien = val; this.formIA = null; this.cargarBorrador(); this.estado = 'reposo'; $$('[data-seg="avModo"] button', this.v).forEach(b => b.classList.toggle('on', b.dataset.v === this.modo)); return this.pintarTodo(); }
    if (id === 'avModo') { this.modo = val; return this.pintarEditor(); }
    if (id === 'avMejillas') return this.cambiar({ mejillas: val });
    if (id === 'avFondo') return this.cambiar({ fondo: { ...this.borr.fondo, tipo: val } });
    if (id === 'avIsla' || id === 'avOverlay') {
      api('PATCH', '/avatar', id === 'avIsla' ? { usarEnIsla: val } : { enOverlay: val }).then(r => { Object.assign(this.d, r); aviso('Guardado'); }).catch(e => aviso(e.message, true));
    }
  },
  entrada(e) {
    const t = e.target;
    if (t.dataset.ia) { const f = this.formIA; f[t.dataset.ia] = t.type === 'checkbox' ? t.checked : t.value; return; }
    if (t.id === 'avpDesc') { this.formIA.descripcion = t.value; return; }
    const c = { avpCuerpo: v => ({ cuerpo: v }), avpOjos: v => ({ colorOjos: v }), avpAcc: v => ({ colorAccesorio: v }), avpF1: v => ({ fondo: { ...this.borr.fondo, c1: v } }), avpF2: v => ({ fondo: { ...this.borr.fondo, c2: v } }) }[t.id];
    if (c) { clearTimeout(this.tCol); this.tCol = setTimeout(() => this.cambiar(c(t.value)), 60); }
  },
  async clic(e) {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    const ds = b.dataset;
    if (ds.est) { this.estado = ds.est; return this.pintarTodo(); }
    if (ds.forma) return this.cambiar({ forma: ds.forma, tipo: 'forma', colorOjos: ds.forma === 'casco' && this.borr.ojos !== 'casco' ? '' : this.borr.colorOjos });
    if (ds.cuerpo) return this.cambiar({ cuerpo: ds.cuerpo });
    if (ds.ojos) return this.cambiar({ ojos: ds.ojos, colorOjos: ds.ojos === 'casco' ? '#46d7be' : (this.borr.ojos === 'casco' ? '' : this.borr.colorOjos) });
    if (ds.colojos) return this.cambiar({ colorOjos: ds.colojos });
    if (ds.acc) return this.cambiar({ accesorio: ds.acc });
    if (ds.fondo1) return this.cambiar({ fondo: { ...this.borr.fondo, c1: ds.fondo1 } });
    if (ds.preset !== undefined) { this.borr = AVF.normalizar(AVF.PRESETS[+ds.preset]); this.sucio = true; this.modo = 'forma'; this.syncModo(); return this.pintarTodo(); }
    if (ds.hist !== undefined) { this.borr = AVF.normalizar(this.hist[+ds.hist].receta); this.sucio = true; this.modo = this.borr.tipo === 'ia' ? 'ia' : 'forma'; this.syncModo(); return this.pintarTodo(); }
    if (ds.motor) { this.formIA.motor = ds.motor; return this.pintarEditor(); }
    if (ds.usarIa) { this.cambiar({ tipo: 'ia', ia: { id: ds.usarIa } }); return; }
    if (ds.borrarIa) {
      if (!await confirmar('¿Borrar esta imagen?', 'Se borra del disco. Si era tu avatar, vuelves al modo Forma.', true)) return;
      try { await api('DELETE', `/avatar/ia/${ds.borrarIa}`); this.d = AV_G.datos = await api('GET', '/avatar'); if (this.borr.tipo === 'ia' && this.borr.ia?.id === ds.borrarIa) this.borr = AVF.normalizar({ ...this.borr, tipo: 'forma' }); AV_aplicarGlobal(); this.pintarTodo(); } catch (er) { aviso(er.message, true); }
      return;
    }
    if (b.id === 'avpSemilla') return this.cambiar({ semilla: Math.floor(Math.random() * 1e6) });
    if (b.id === 'avpAzar') { this.borr = AVF.aleatoria(Math.floor(Math.random() * 2 ** 31)); this.sucio = true; this.modo = 'forma'; this.syncModo(); return this.pintarTodo(); }
    if (b.id === 'avpGuardar') return this.guardar();
    if (b.id === 'avpPng') return this.exportar('png');
    if (b.id === 'avpSvg') return this.exportar('svg');
    if (b.id === 'avpGenerar') return this.generar(b);
  },
  syncModo() { $$('[data-seg="avModo"] button', this.v).forEach(x => x.classList.toggle('on', x.dataset.v === this.modo)); },
  async guardar() {
    try {
      const { receta } = await api('PUT', `/avatar/${this.quien}`, { receta: this.borr });
      this.d = AV_G.datos = await api('GET', '/avatar');
      this.borr = receta; this.sucio = false; aviso('Guardado');
      AV_aplicarGlobal(); this.pintarTodo();
    } catch (e) { aviso(e.message, true); }
  },
  async exportar(tipo) {
    const nombre = `avatar-${this.quien}`;
    try {
      if (tipo === 'svg') return AVP_descargar(new Blob([await AV_svg(this.borr, { estado: this.estado, animado: false, comoData: true })], { type: 'image/svg+xml' }), nombre + '.svg');
      if (this.borr.tipo === 'ia') { const r = await fetch(await AV_urlIA(this.borr.ia.id)); return AVP_descargar(await r.blob(), nombre + '.png'); }
      AVP_descargar(await AVF.aPNG(AVF.svg(this.borr, { estado: this.estado, animado: false }), 1024), nombre + '.png'); aviso('PNG descargado');
    } catch (e) { aviso(e.message, true); }
  },
  async generar(b) {
    const f = this.formIA, cuerpo = { descripcion: f.descripcion, motor: f.motor || undefined, desdeForma: !!f.desdeForma, receta: f.desdeForma ? { ...this.borr, tipo: 'forma' } : undefined,
      opciones: { pelo: f.pelo, colores: f.colores, ropa: f.ropa, accesorio: f.accesorio, estilo: f.estilo, ojos: f.ojos, genero: f.genero || undefined, edad: f.edad || undefined } };
    let pre;
    try { pre = (await api('POST', '/avatar/generar-ia', cuerpo)).presupuesto; } catch (e) { return aviso(e.message, true); }
    const ok = await modal({ titulo: '¿Generar el personaje?', ancho: 560,
      cuerpo: `<p style="margin-top:0">${esc(tr('Se generará 1 imagen con {m} ({mod}).', { m: pre.nombre, mod: pre.modelo }))}</p>
        <div class="av-coste"><b>${tr('Coste aproximado')}: ${esc(pre.coste.aprox)}</b><small class="tenue">${esc(tr(pre.coste.nota))}</small></div>
        ${pre.motor === 'gemini' && f.desdeForma ? `<p class="tenue">${tr('Se manda también tu avatar Forma como referencia.')}</p>` : ''}
        <details class="av-prompt"><summary>${tr('Prompt que se enviará')}</summary><pre>${esc(pre.prompt)}</pre></details>`,
      botones: [{ txt: 'Cancelar', valor: null }, { txt: 'Generar 1 imagen', cls: 'pri', valor: true }] });
    if (!ok) return;
    b.disabled = true; const antes = b.innerHTML; b.innerHTML = `<span class="av-girando"></span>${tr('Generando… (puede tardar un minuto)')}`;
    try {
      if (pre.motor === 'gemini' && f.desdeForma) {
        const png = await AVF.aPNG(AVF.svg({ ...this.borr, tipo: 'forma', fondo: { tipo: 'color', c1: '#ffffff' } }, { animado: false }), 512);
        cuerpo.referencia = await new Promise(ok2 => { const fr = new FileReader(); fr.onload = () => ok2(String(fr.result).split(',')[1]); fr.readAsDataURL(png); });
      }
      const r = await api('POST', '/avatar/generar-ia', { ...cuerpo, motor: pre.motor, confirmar: true });
      this.d = AV_G.datos = await api('GET', '/avatar');
      aviso('Personaje generado');
      this.cambiar({ tipo: 'ia', ia: { id: r.imagen.id } });
    } catch (e) { aviso(e.message, true); }
    finally { if (b.isConnected) { b.disabled = false; b.innerHTML = antes; } }
  },
  alEvento(e) { if (e?.tipo === 'avatar' && !this.sucio && this.v) api('GET', '/avatar').then(d => { this.d = AV_G.datos = d; this.cargarBorrador(); this.pintarTodo(); }).catch(() => { }); },
};

// ---------- Configuración → Apariencia: sección "Avatares" ----------
{
  const V = VISTAS['ajustes/apariencia'], pintar0 = V.pintar;
  V.claves = (V.claves || '') + ' avatar perfil skin casco isla';
  V.pintar = function (v) {
    pintar0.call(this, v);
    const cajas = $$('.caja', v); if (!cajas.length) return;
    const sec = document.createElement('div');
    sec.innerHTML = `<div class="seccion">${tr('Avatares')}</div><div class="caja" id="avAp"><p class="tenue" style="padding:12px 14px;margin:0">…</p></div>`;
    cajas[0].after(...sec.children);
    (async () => {
      try { AV_G.datos = await api('GET', '/avatar'); } catch { return; }
      const d = AV_G.datos, el = $('#avAp', v); if (!el) return;
      const mini = async r => `<span class="av-mini">${r ? await AV_svg(r, { animado: false }) : ''}</span>`;
      el.innerHTML = fila('Tu avatar', 'Tu foto de perfil en el panel, el móvil y el Wrapped.', `${await mini(d.usuario)}${d.usuario ? '' : `<small class="tenue">${tr('sin elegir')}</small>`}<a class="btn" href="#/avatar/usuario">${ic('carita')}${tr('Editar')}</a>`)
        + fila(tr('Avatar de {n}', { n: E.estado?.nombre || 'APOLO' }), 'Una skin 2D opcional para el compañero (isla y overlay).', `${await mini(d.apolo || AVF.PRESETS[0])}<a class="btn" href="#/avatar/apolo">${ic('carita')}${tr('Editar')}</a>`)
        + fila('Usar avatar en lugar del casco', 'En la isla, el casco 3D se cambia por este avatar 2D (gasta menos).', sw('avApIsla', d.usarEnIsla))
        + fila('Mostrar también en el overlay de streaming', 'Solo si usas el avatar en lugar del casco.', sw('avApOverlay', d.enOverlay));
      el.addEventListener('click', ev => {
        const s = ev.target.closest('[data-sw]'); if (!s) return;
        ev.stopPropagation();                                          // lo cambio yo (no el enlazarControles de la página)
        const val = s.getAttribute('aria-checked') !== 'true'; s.setAttribute('aria-checked', val);
        api('PATCH', '/avatar', s.dataset.sw === 'avApIsla' ? { usarEnIsla: val } : { enOverlay: val }).then(() => aviso('Guardado')).catch(e => aviso(e.message, true));
      });
    })();
  };
}

// ---------- asistente de bienvenida: paso "Avatar" (antes de "Listo") ----------
{
  const i = BV_PASOS.findIndex(p => p[0] === 'listo');
  BV_PASOS.splice(i < 0 ? BV_PASOS.length : i, 0, ['avatar', 'Avatar', 'carita']);
  const B = VISTAS.bienvenida;
  I18N.dic.en['Seis pasos, menos de dos minutos. Primero: ¿en qué idioma hablamos?'] = 'Six steps, under two minutes. First: which language do we speak?';
  const pasoIdioma = B.paso_idioma;                     // ahora hay un paso más
  B.paso_idioma = function () { return pasoIdioma.call(this).replace(tr('Cinco pasos, menos de dos minutos. Primero: ¿en qué idioma hablamos?'), tr('Seis pasos, menos de dos minutos. Primero: ¿en qué idioma hablamos?')); };
  B.paso_avatar = function () {
    const n = BV_PASOS.findIndex(p => p[0] === 'avatar') + 1, actual = AV_G.datos?.usuario;
    const firma = actual ? JSON.stringify(actual) : '';
    return `<small class="bv-eti">${tr('Paso {a} de {b}', { a: n, b: BV_PASOS.length })}</small>
      <h1>${tr('Elige tu avatar')}</h1>
      <p class="bv-sub">${tr('Es tu cara en el panel, el móvil y el Wrapped. Luego puedes diseñarlo a tu gusto en Avatar.')}</p>
      <div class="av-bv">${AVF.PRESETS.map((p, k) => `<button class="av-carta${firma === JSON.stringify(p) ? ' on' : ''}" data-bvav="${k}" title="${esc(p.nombre)}">${AVP_mini(p)}<span>${esc(p.nombre)}</span></button>`).join('')}
        <button class="av-carta" data-bvav="azar" title="${tr('Aleatorio')}"><span class="av-dado">${ic('chispa')}</span><span>${tr('Aleatorio')}</span></button></div>
      <p class="bv-nota">${tr('Personalizarlo después')}: ${ic('carita')} ${tr('Avatar')}</p>`;
  };
  B.enlazar_avatar = function (p) {
    if (!AV_G.datos) AV_cargarGlobal();
    p.onclick = async e => {
      const b = e.target.closest('[data-bvav]'); if (!b) return;
      const r = b.dataset.bvav === 'azar' ? AVF.aleatoria(Math.floor(Math.random() * 2 ** 31)) : AVF.PRESETS[+b.dataset.bvav];
      try {
        await api('PUT', '/avatar/usuario', { receta: r });
        $$('[data-bvav]', p).forEach(x => x.classList.toggle('on', x === b));
        if (b.dataset.bvav === 'azar') b.querySelector('.av-dado').innerHTML = AVP_mini(r);
        await AV_cargarGlobal(); this.gesto?.('guino', 1.6, tr('Ya'));
      } catch (er) { aviso(er.message, true); }
    };
  };
}
