// Detecta peticiones de permiso peligrosas. Lo usan main.js (require) y la isla (<script>).
(function (root) {
  const REGLAS = [
    [/\brm\s+(-\w*r\w*f|-\w*f\w*r|-r|-R|--recursive)\b/, 'borrado recursivo'],
    [/\bRemove-Item\b[^\n]*-Recurse/i, 'borrado recursivo'],
    [/\b(del|erase)\s+[^\n]*\/s\b/i, 'borrado recursivo'],
    [/\b(rmdir|rd)\s+[^\n]*\/s\b/i, 'borrado de carpeta'],
    [/\bgit\s+push\b[^\n]*(--force|-f\b|--force-with-lease)/, 'push forzado'],
    [/\bgit\s+reset\s+--hard\b/, 'reset --hard (pierde cambios)'],
    [/\bgit\s+clean\s+-\w*f/, 'git clean (borra archivos)'],
    [/\bgit\s+(checkout|restore)\s+(--\s+)?\.(\s|$)/, 'descarta cambios locales'],
    [/\bgit\s+branch\s+-D\b/, 'borra rama'],
    [/\bdrop\s+(table|database|schema)\b/i, 'borra base de datos'],
    [/\btruncate\s+table\b/i, 'vacía tabla'],
    [/\b(shutdown|reboot|Restart-Computer|Stop-Computer)\b/i, 'apaga/reinicia el equipo'],
    [/\b(format|mkfs|diskpart)\b/i, 'formatea disco'],
    [/\bdd\s+if=/, 'escritura directa a disco'],
    [/\bchmod\s+-R\s+777\b/, 'permisos abiertos'],
    [/(curl|wget|iwr|Invoke-WebRequest)[^\n|]*\|\s*(sh|bash|iex|Invoke-Expression)/i, 'ejecuta script de internet'],
    [/\breg(\.exe)?\s+delete\b/i, 'borra registro de Windows'],
    [/\b(npm|pnpm|yarn)\s+publish\b/, 'publica paquete'],
    [/\bsudo\b/, 'sudo'],
    [/\b(kill|taskkill|Stop-Process)\b[^\n]*(-9|\/F|-Force)/i, 'mata procesos a la fuerza'],
  ];
  function esPeligroso(tool, input) {
    input = input || {};
    const texto = tool === 'Bash' || tool === 'PowerShell' ? String(input.command || '') : '';
    for (const [re, motivo] of REGLAS) if (re.test(texto)) return motivo;
    const f = String(input.file_path || '').replace(/\\/g, '/').toLowerCase();
    if ((tool === 'Write' || tool === 'Edit') && /(^|\/)(\.env|\.ssh\/|\.git\/|windows\/system32\/)|settings\.json$|id_rsa/.test(f)) return 'toca archivo sensible';
    return '';
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = esPeligroso; else root.esPeligroso = esPeligroso;
})(this);
