// Detecta peticiones de permiso peligrosas. Lo usan main.js (require), core/permisos.js y la isla (<script>).
// FASE 9: el comando se NORMALIZA antes de comprobarlo (mayúsculas, ^ de cmd, `acentos graves` de PowerShell, comillas partidas,
// rutas y .exe en el ejecutable) y analizar() dice además si es compuesto (; && || | $( )) o un envoltorio (cmd /c, powershell -c…):
// en esos casos las reglas "permitir siempre" por primera palabra NO valen (core/permisos.js).
// Ofuscación (powershell -enc, FromBase64String, iex, & $variable) = peligroso: no se puede saber qué hace.
(function (root) {
  const REGLAS = [
    [/\brm\s+(-\w*r\w*f|-\w*f\w*r|-r|-R|--recursive|-recurse)\b/i, 'borrado recursivo'],
    [/\brm\s+[^\n]*\s-(r|recurse)\b/i, 'borrado recursivo'],
    [/\b(Remove-Item|ri|rmdir|rd|del|erase)\b[^\n]*\s-r(ecurse)?\b/i, 'borrado recursivo'],
    [/\b(del|erase)\s+[^\n]*\/s\b/i, 'borrado recursivo'],
    [/\b(rmdir|rd)\s+[^\n]*\/s\b/i, 'borrado de carpeta'],
    [/\bgit\s+push\b[^\n]*(--force|\s-f\b|--force-with-lease|\s\+[\w/.-]+)/i, 'push forzado'],
    [/\bgit\s+reset\s+--hard\b/i, 'reset --hard (pierde cambios)'],
    [/\bgit\s+clean\s+-\w*f/i, 'git clean (borra archivos)'],
    [/\bgit\s+(checkout|restore)\s+(--\s+)?\.(\s|$)/i, 'descarta cambios locales'],
    [/\bgit\s+branch\s+-D\b/, 'borra rama'],
    [/\bgit\s+filter-(branch|repo)\b/i, 'reescribe el historial de git'],
    [/\bdrop\s+(table|database|schema)\b/i, 'borra base de datos'],
    [/\btruncate\s+table\b/i, 'vacía tabla'],
    [/\b(shutdown|reboot|halt|poweroff|Restart-Computer|Stop-Computer|logoff)\b/i, 'apaga/reinicia el equipo'],
    [/\b(format|mkfs(\.\w+)?|diskpart|Format-Volume|Clear-Disk|Initialize-Disk|Remove-Partition)\b/i, 'formatea disco'],
    [/\bdd\s+if=/i, 'escritura directa a disco'],
    [/\bcipher\s+\/w\b/i, 'borrado seguro de disco'],
    [/\b(vssadmin|wbadmin)\b[^\n]*\bdelete\b/i, 'borra copias de seguridad'],
    [/\bbcdedit\b/i, 'toca el arranque de Windows'],
    [/\bchmod\s+-R\s+777\b/, 'permisos abiertos'],
    [/\b(icacls|takeown|cacls)\b[^\n]*(\/grant|\/reset|\/setowner|\/f\b)/i, 'cambia permisos de archivos'],
    [/(curl|wget|iwr|irm|Invoke-WebRequest|Invoke-RestMethod|DownloadString|DownloadFile|Net\.WebClient|Start-BitsTransfer)[^\n]*\|\s*(sh|bash|zsh|python\d?|node|iex|Invoke-Expression|powershell|pwsh|cmd)\b/i, 'ejecuta script de internet'],
    [/\b(iex|Invoke-Expression)\b/i, 'ejecuta texto como código (Invoke-Expression)'],
    [/\bcertutil\b[^\n]*(-urlcache|-decode)/i, 'descarga/decodifica con certutil'],
    [/\bbitsadmin\b[^\n]*\/transfer/i, 'descarga con bitsadmin'],
    [/\bmshta\b|\bregsvr32\b[^\n]*\/i:|\brundll32\b[^\n]*javascript:/i, 'ejecución por binario del sistema (LOLBin)'],
    [/\breg\s+(delete|add|import)\b|\b(Remove-ItemProperty|Set-ItemProperty|New-ItemProperty)\b[^\n]*(HKLM|HKCU|Registry::)/i, 'modifica el registro de Windows'],
    [/\bschtasks\b[^\n]*\/create|\bRegister-ScheduledTask\b|\bNew-Service\b|\bsc\s+(create|config)\b/i, 'crea tarea/servicio persistente'],
    [/\bSet-MpPreference\b|\bAdd-MpPreference\b[^\n]*Exclusion|\bnetsh\s+(advfirewall|firewall)\b|\bSet-NetFirewall/i, 'desactiva protecciones (Defender/firewall)'],
    [/\bSet-ExecutionPolicy\b/i, 'cambia la política de ejecución'],
    [/\b(npm|pnpm|yarn)\s+publish\b|\b(twine|cargo)\s+(upload|publish)\b/i, 'publica paquete'],
    [/\b(sudo|runas|gsudo)\b|-Verb\s+RunAs\b/i, 'eleva privilegios'],
    [/\b(kill|pkill|killall|taskkill|Stop-Process)\b[^\n]*(-9|\/F\b|-Force)/i, 'mata procesos a la fuerza'],
    [/(^|[\s;|&])>{1,2}\s*["']?[a-z]:[\\/](windows|program files)/i, 'escribe en carpetas del sistema'],
  ];
  // ofuscación: no se puede saber qué ejecuta → siempre pregunta (y nunca "permitir siempre")
  const OFUSCADO = [
    [/\b(powershell|pwsh)\b[^\n]*\s[-/](e|ec|en|enc|enco|encod|encode|encoded|encodedcommand)\s+[A-Za-z0-9+/=]{12,}/i, 'comando codificado (powershell -enc)'],
    [/FromBase64String|\[convert\]::from|-join\s*\(?\s*\[char/i, 'código ofuscado (base64/char)'],
    [/(^|[\s;|&(])&\s*\(?\s*\$|\[scriptblock\]::create|\$ExecutionContext|Invoke-Command\b[^\n]*ScriptBlock/i, 'ejecuta un comando guardado en una variable'],
    [/%[a-z_]*:~-?\d+(,-?\d+)?%/i, 'ofuscación con variables de cmd'],
  ];
  // variantes normalizadas: sin ^ (cmd), sin ` (PowerShell), sin comillas partidas ("r""m" → rm), ejecutable sin ruta ni .exe
  function variantes(t) {
    t = String(t || '');
    const a = t.replace(/\^(.)/g, '$1').replace(/`(.)/g, '$1');
    const b = a.replace(/(\w)["']{1,2}(\w)/g, '$1$2');
    const c = b.replace(/(^|[\s;|&(])(?:[a-z]:|\.{1,2})?(?:[\\/][^\s\\/;|&"']+)+[\\/]([\w.-]+?)(?:\.exe|\.cmd|\.bat|\.com)?(?=[\s;|&)]|$)/gi, '$1$2')
      .replace(/(^|[\s;|&(])([\w.-]+?)\.(exe|cmd|bat|com)(?=[\s;|&)]|$)/gi, '$1$2');
    return [...new Set([t, a, b, c])];
  }
  const SEPARADORES = /;|&&|\|\||\||\r?\n|(?<![<>0-9])&(?![>&])/;
  const ENVOLTORIO = /^\s*(&\s*)?(cmd\s+\/[ckr]|cmd\s*$|powershell|pwsh|bash|sh|zsh|wsl|python\d?\s+-c|node\s+-[ep]|Start-Process|Invoke-Command|start(\s|$)|call\s|\.\s)/i;
  function analizar(comando) {
    const t = String(comando || '');
    const vs = variantes(t);
    let peligro = '';
    for (const v of vs) {
      for (const [re, motivo] of OFUSCADO) if (!peligro && re.test(v)) peligro = motivo;
      for (const [re, motivo] of REGLAS) if (!peligro && re.test(v)) peligro = motivo;
      if (peligro) break;
    }
    const sinComillas = v => v.replace(/'[^']*'/g, "''");                         // dentro de '…' no hay encadenado; en "…" sí puede haber $( )
    const compuesto = vs.some(v => SEPARADORES.test(sinComillas(v).replace(/"[^"$`]*"/g, '""'))) || /\$\(|`[^`\n]+`|<\(|>\(|%\w+%/.test(t);
    const ultima = vs[vs.length - 1];
    const envoltorio = vs.some(v => ENVOLTORIO.test(v));
    const primera = (ultima.trim().split(/\s+/)[0] || '').toLowerCase();
    return { peligro, compuesto, envoltorio, primera };
  }
  function esPeligroso(tool, input) {
    input = input || {};
    const texto = tool === 'Bash' || tool === 'PowerShell' ? String(input.command || '') : '';
    if (texto) { const p = analizar(texto).peligro; if (p) return p; }
    const f = String(input.file_path || '').replace(/\\/g, '/').toLowerCase();
    if ((tool === 'Write' || tool === 'Edit') && /(^|\/)(\.env(\.[\w-]+)?$|\.ssh\/|\.git\/|\.gnupg\/|windows\/system32\/)|settings(\.local)?\.json$|id_rsa|\/start menu\/programs\/startup\/|\.(bashrc|zshrc|profile|bash_profile)$|microsoft\.powershell_profile\.ps1$/.test(f)) return 'toca archivo sensible';
    return '';
  }
  esPeligroso.analizar = analizar;
  esPeligroso.variantes = variantes;
  if (typeof module !== 'undefined' && module.exports) module.exports = esPeligroso; else root.esPeligroso = esPeligroso;
})(this);
