// Sandbox en macOS / Linux: TODAVÍA NO IMPLEMENTADO. Mensaje claro y la elección cae a "normal" con aviso
// (o "bloqueado" si cfg.seguridad.sandbox.sinSoporte = 'bloquear'). Futuro: sandbox-exec (mac), bubblewrap/firejail + cgroups (linux).
const NOMBRE = { darwin: 'macOS', linux: 'Linux' };
const FUTURO = { darwin: 'sandbox-exec + límites de recursos', linux: 'bubblewrap (bwrap) + cgroups' };

function para(plataforma) {
  const so = NOMBRE[plataforma] || plataforma;
  const motivo = `el sandbox de APOLO aún no existe en ${so} (previsto: ${FUTURO[plataforma] || 'sin plan'}); el script corre SIN aislamiento, solo con entorno limpio`;
  const no = () => { throw new Error(motivo); };
  return {
    disponible: () => ({ restringido: false, aislado: false, motivoRestringido: motivo, motivoAislado: motivo }),
    prepararRestringido: async () => no(), lanzarRestringido: no, ejecutarAislado: async () => no(),
  };
}

module.exports = { para };
