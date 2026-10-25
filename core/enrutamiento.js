function elegir(cfg, sesion, texto) {
  if (!cfg.enrutamiento?.habilitado || sesion.enrutamiento !== true) return sesion.modelo;
  const t = String(texto).toLowerCase();
  const regla = (cfg.enrutamiento.reglas || []).find(r => r.palabras?.some(p => t.includes(String(p).toLowerCase())));
  const candidato = regla?.modelo || sesion.modelo;
  const local = id => cfg.proveedores?.[String(id).split('/')[0]]?.local === true;
  if (local(sesion.modelo) && !local(candidato) && cfg.recuperacion?.permitirNube !== true) return sesion.modelo;
  return candidato;
}
module.exports = { elegir };
