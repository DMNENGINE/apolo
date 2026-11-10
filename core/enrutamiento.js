// pedidos que necesitan herramientas (mirar/tocar el PC, la web, programar algo…): el modelo propio ligero no tiene manos
const MANOS = /\b(abr[eií]\w*|[aá]breme|cre[aá]\w*|haz(me)?|hac(er|e)lo|busc\w*|mira|m[ií]rame|revis\w*|l[eé]e(me)?|ejecut\w*|corre|instal\w*|descarg\w*|b[aá]ja(me|lo)?|sub[ei]\w*|borr\w*|elimin\w*|mueve|copi[ae]\w*|renombr\w*|edit\w*|arregl\w*|program[ae]\w*|recu[eé]rdame|av[ií]same|mand[ae]\w*|env[ií]\w*|guard[ae]\w*|captur\w*|pantalla|carpeta|archivo|fichero|navega\w*|entra en|clic|suelta|arañas?|scrap\w*|precio|cotiza\w*|clima|noticias|ahora mismo|cu[aá]nt[oa]s .{0,40} hay)\b|[a-z]:\\|https?:\/\//i;

function elegir(cfg, sesion, texto) {
  const local = id => cfg.proveedores?.[String(id).split('/')[0]]?.local === true;
  // modelo propio ligero (apolo-v4): charla él; si el pedido necesita manos, ese turno lo hace el modelo con herramientas
  const prov = cfg.proveedores?.[String(sesion.modelo).split('/')[0]];
  if (prov?.ligero && sesion.enrutamiento !== false) {
    const extra = (cfg.enrutamiento?.palabrasManos || []).some(p => String(texto).toLowerCase().includes(String(p).toLowerCase()));
    if (MANOS.test(String(texto)) || extra) return prov.manos || cfg.modeloPorDefecto || sesion.modelo;
    return sesion.modelo;
  }
  if (!cfg.enrutamiento?.habilitado || sesion.enrutamiento !== true) return sesion.modelo;
  const t = String(texto).toLowerCase();
  const regla = (cfg.enrutamiento.reglas || []).find(r => r.palabras?.some(p => t.includes(String(p).toLowerCase())));
  const candidato = regla?.modelo || sesion.modelo;
  if (local(sesion.modelo) && !local(candidato) && cfg.recuperacion?.permitirNube !== true) return sesion.modelo;
  return candidato;
}
module.exports = { elegir, MANOS };
