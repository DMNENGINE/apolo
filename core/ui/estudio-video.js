// Estudio de vídeo (#/estudio-video): el servicio local del usuario en un iframe (core/estudio-video.js).
// La pestaña sale si hay estudio o si la skill estudio-creativo está instalada (GET /v1/estudio-video → visible, disponible, motivo).
'use strict';
let EV_disponible = false, EV_motivo = '';
NAV_APP.push(['estudio-video', 'Estudio de vídeo', 'play', () => EV_disponible]);
{ const antes = cargarVistasPlugin;                         // se comprueba al arrancar el panel y cuando cambian los plugins
  cargarVistasPlugin = async (...a) => {
    const [cambio, r] = await Promise.all([antes(...a), api('GET', '/estudio-video').catch(() => null)]);
    const ahora = !!(r?.visible ?? r?.disponible), cambia = ahora !== EV_disponible;
    EV_disponible = ahora; EV_motivo = r?.disponible === false ? (r.motivo || '') : '';
    return cambio || cambia;
  }; }
VISTAS['estudio-video'] = {
  salir() { this.themeObserver?.disconnect(); this.themeObserver = null; if (this.onReady) window.removeEventListener('message', this.onReady); this.onReady = null; },
  async pintar(v) {
    this.salir();
    if (EV_motivo) {                                          // skill instalada pero sin estudio todavía: decir qué falta
      v.innerHTML = `<div style="padding:24px"><p class="suave" role="status"></p><a class="btn mini pri" href="#/skills/estudio-creativo">${tr('Abrir estudio-creativo')}</a></div>`;
      v.querySelector('p').textContent = EV_motivo;
      return;
    }
    v.innerHTML = '<p class="suave" role="status" style="padding:24px">Abriendo el estudio…</p>';
    try {
      const r = await api('POST', '/estudio-video/abrir', {});
      if (!v.isConnected || E.vista !== this) return;
      const frame = document.createElement('iframe'); frame.src = r.url + (r.url.includes('?') ? '&' : '?') + 'v=' + Date.now(); frame.title = 'Estudio de vídeo';
      frame.style.cssText = 'display:block;width:100%;height:100%;min-height:650px;border:0;background:var(--fondo)';
      const sendTheme = () => {
        const css = getComputedStyle(document.documentElement), vars = {};
        for (const key of ['acento','sobre-acento','fondo','capa','capa-2','capa-3','borde','txt','txt-2','txt-3','sans']) vars['--'+key] = css.getPropertyValue('--'+key);
        frame.contentWindow?.postMessage({type:'apolo-video-theme', vars, scheme:css.colorScheme}, new URL(r.url).origin);
      };
      this.onReady = e => {if(e.source === frame.contentWindow && e.origin === new URL(r.url).origin && e.data?.type === 'apolo-video-ready') sendTheme();};
      window.addEventListener('message', this.onReady);
      frame.onload = sendTheme;
      this.themeObserver = new MutationObserver(sendTheme);
      this.themeObserver.observe(document.documentElement, {attributes:true, attributeFilter:['data-modo','data-tema','style']});
      v.replaceChildren(frame);
    } catch(e) {if(v.isConnected) v.querySelector('p').textContent = e.message + ' Si acabas de instalar la pestaña, reinicia APOLO.';}
  }
};
