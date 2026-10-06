// Asistente de bienvenida: paso "Estilo" de la nube flotante (tras "Avatar", antes de "Listo").
// Deja elegir el estilo de cristal al entrar por primera vez; el resto (color de fondo/borde) se afina en Ajustes → Apariencia.
{
  const i = BV_PASOS.findIndex(p => p[0] === 'listo');
  BV_PASOS.splice(i < 0 ? BV_PASOS.length : i, 0, ['estilo', 'Estilo', 'paleta']);
  const B = VISTAS.bienvenida;

  // un paso más que con avatar: "Seis" → "Siete"
  I18N.dic.en['Siete pasos, menos de dos minutos. Primero: ¿en qué idioma hablamos?'] = 'Seven steps, under two minutes. First: which language do we speak?';
  const pasoIdioma = B.paso_idioma;
  B.paso_idioma = function () {
    return pasoIdioma.call(this).replace(
      tr('Seis pasos, menos de dos minutos. Primero: ¿en qué idioma hablamos?'),
      tr('Siete pasos, menos de dos minutos. Primero: ¿en qué idioma hablamos?'));
  };

  const ISO_DEMO = {
    glass: 'background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.35);backdrop-filter:blur(3px)',
    liquid: 'background:linear-gradient(135deg,rgba(255,255,255,.28),rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.4);box-shadow:inset 0 1px 0 rgba(255,255,255,.5),0 6px 16px rgba(0,0,0,.35)',
    solido: 'background:#3a3f4a;border:1px solid #525a66',
  };
  const ESTILOS = [
    ['glass', 'Glassmorphism', 'Cristal esmerilado translúcido'],
    ['liquid', 'Liquid glass', 'Cristal líquido con brillo y profundidad'],
    ['solido', 'Color sólido', 'Un color plano, sin transparencia'],
  ];

  B.paso_estilo = function () {
    const n = BV_PASOS.findIndex(p => p[0] === 'estilo') + 1;
    const estilo = (E.config && E.config.isla && E.config.isla.estilo) || 'glass';
    return `<small class="bv-eti">${tr('Paso {a} de {b}', { a: n, b: BV_PASOS.length })}</small>
      <h1>${tr('Estilo de la nube')}</h1>
      <p class="bv-sub">${tr('La nube flotante es tu compañero en el escritorio. Elige cómo se ve; luego puedes cambiar el color del fondo y del borde en Ajustes → Apariencia.')}</p>
      <div class="av-bv">${ESTILOS.map(([k, nom, desc]) => `<button class="av-carta${estilo === k ? ' on' : ''}" data-iso="${k}" title="${esc(desc)}">
        <span style="width:46px;height:30px;border-radius:9px;${ISO_DEMO[k]}"></span><span>${tr(nom)}</span></button>`).join('')}</div>
      <p class="bv-nota">${tr('Puedes cambiarlo cuando quieras')}: ${ic('paleta')} ${tr('Apariencia')}</p>`;
  };

  B.enlazar_estilo = function (p) {
    p.onclick = async e => {
      const b = e.target.closest('[data-iso]'); if (!b) return;
      try {
        E.config = await api('PATCH', '/config', { isla: { ...(E.config.isla || {}), estilo: b.dataset.iso } });
        $$('[data-iso]', p).forEach(x => x.classList.toggle('on', x === b));
        this.gesto?.('guino', 1.4, tr('Ya'));
      } catch (er) { aviso(er.message, true); }
    };
  };
}
