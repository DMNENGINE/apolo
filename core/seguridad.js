// Utilidades de seguridad compartidas (FASE 9): redacción de secretos, entorno limpio para procesos de terceros,
// rutas sensibles y validación de Host/Origin del daemon (anti DNS rebinding / CSRF).
const path = require('path');
const os = require('os');

// ---------- secretos ----------
// patrones de claves conocidas (OpenAI/Anthropic sk-, Google AIza/AQ., GitHub, Slack, Discord bot, JWT, PEM, "password=…")
const PATRONES = [
  /sk-(ant-)?[A-Za-z0-9_-]{16,}/g,
  /AIza[0-9A-Za-z_-]{30,}/g,
  /\bAQ\.[A-Za-z0-9_-]{30,}/g,
  /\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bhf_[A-Za-z0-9]{30,}/g,
  /\b[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27,}/g,                  // token de bot de Discord
  /\beyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{10,}/g,                    // JWT
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\b(Bearer)\s+[A-Za-z0-9._~+/-]{20,}=*/gi,
  /\b((?:contrase[nñ]a|password|passwd|pwd|api[ _-]?key|secret|token)\s*[:=]\s*)["']?[^\s"',;]{6,}/gi,
];
const conocidos = new Set();                     // valores exactos (claves de la bóveda, token del daemon…)
function registrarSecreto(v) { v = String(v || ''); if (v.length >= 8 && !/^(ollama|lm-studio)$/.test(v)) conocidos.add(v); }
function olvidarSecreto(v) { conocidos.delete(String(v || '')); }
// tapa los secretos de un texto. patrones=false → solo los valores exactos conocidos (salidas de herramientas: no romper código con ejemplos)
function redactar(texto, { patrones = true } = {}) {
  let t = String(texto ?? '');
  for (const v of conocidos) if (t.includes(v)) t = t.split(v).join('[REDACTADO]');
  if (patrones) for (const re of PATRONES) t = t.replace(re, (m, g1) => (typeof g1 === 'string' && /[:=]\s*$/.test(g1) ? g1 + '[REDACTADO]' : '[REDACTADO]'));
  return t;
}
const pareceSecreto = texto => PATRONES.some(re => { re.lastIndex = 0; const r = re.test(String(texto || '')); re.lastIndex = 0; return r; });

// ---------- entorno para procesos de terceros (scripts de skills, shell de plugins) ----------
const ENV_SECRETO = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|COOKIE|SESSION|AUTH)/i;
function envLimpio(env = process.env, extra = {}) {
  const r = {};
  for (const [k, v] of Object.entries(env)) {
    if (ENV_SECRETO.test(k) && !/^(PATHEXT|PROCESSOR_|NUMBER_OF)/i.test(k)) continue;
    if (/^(CLAUDE|CLAUDECODE|ROBOT_|NUCLEO_|APOLO_GOOGLE|APOLO_MS|ELECTRON_)/i.test(k)) continue;
    r[k] = v;
  }
  return { ...r, ...extra };
}

// ---------- rutas sensibles ----------
// leerlas pide permiso (y nunca vale "permitir siempre"): token del daemon, config con claves, bóveda, ssh, .env, credenciales
function rutaSensible(f, { dirNucleo } = {}) {
  const n = path.resolve(String(f || '')).replace(/\\/g, '/').toLowerCase();
  const home = os.homedir().replace(/\\/g, '/').toLowerCase();
  if (dirNucleo) {
    const d = path.resolve(dirNucleo).replace(/\\/g, '/').toLowerCase();
    if (n === d || n.startsWith(d + '/')) {
      const rel = n.slice(d.length + 1);
      if (/^(token|config\.json|boveda\.json|boveda\.key|reglas\.json|movil\.json|nodos\.json|auditoria\.jsonl|panico\.json|stream\/(secretos\.json|clave))$/.test(rel)) return 'datos privados de APOLO';
    }
  }
  if (/(^|\/)\.env(\.[\w-]+)?$/.test(n)) return 'archivo .env';
  if (/(^|\/)\.ssh\/|(^|\/)id_(rsa|ed25519|ecdsa|dsa)(\.pub)?$|\.(pem|pfx|p12|kdbx|key)$/.test(n)) return 'clave privada';
  if (/(^|\/)\.(aws|azure|kube|docker|gnupg)\/|(^|\/)\.(npmrc|pypirc|netrc|git-credentials)$|(^|\/)\.gemini\/\.env$/.test(n)) return 'credenciales';
  if (n.startsWith(home + '/.claude/') && /(robot-companion\.token|\.credentials\.json)$/.test(n)) return 'credenciales de Claude/robot';
  if (/\/robot-companion\/(discord|voz|conectores|whatsapp|telegram)\.json$|\/robot-companion\/whatsapp-auth\//.test(n)) return 'credenciales de la app';
  if (/\/(google\/chrome|microsoft\/edge|bravesoftware\/brave-browser)\/user data\/.*(login data|cookies|local state)/.test(n)) return 'contraseñas/cookies del navegador';
  return '';
}

// ---------- red ----------
const ipLiteral = h => /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || /^\[[0-9a-f:.]+\]$/i.test(h) || /^[0-9a-f:]+:[0-9a-f:]*$/i.test(h);
// Host aceptado por el daemon: localhost o cualquier IP literal (un ataque de DNS rebinding siempre trae un NOMBRE de dominio),
// más los nombres configurados (cfg.red.urlMovil para Tailscale/Cloudflare y cfg.red.hosts)
function hostPermitido(hostHeader, extras = []) {
  if (!hostHeader) return true;                                  // HTTP/1.0 sin Host: clientes locales viejos
  let h = String(hostHeader).trim().toLowerCase();
  h = h.startsWith('[') ? h.slice(0, h.indexOf(']') + 1) : h.replace(/:\d+$/, '');
  if (h === 'localhost' || h.endsWith('.localhost') || ipLiteral(h)) return true;
  return extras.map(x => String(x || '').toLowerCase()).filter(Boolean).includes(h);
}
// nombre de host de una URL configurada ("https://pc.tail1234.ts.net/m/" → "pc.tail1234.ts.net")
const hostDeUrl = u => { try { return new URL(String(u)).hostname.toLowerCase(); } catch { return ''; } };
// Origin aceptado en peticiones del navegador: el propio origen del daemon (mismo Host), extensiones del navegador o nada
function origenPermitido(origin, hostHeader) {
  if (!origin) return true;
  if (/^(chrome|moz|safari-web)-extension:\/\//i.test(origin)) return true;
  if (origin === 'null') return false;
  try { return new URL(origin).host.toLowerCase() === String(hostHeader || '').toLowerCase(); } catch { return false; }
}
// IP privada / loopback en una URL (SSRF desde la herramienta web)
function urlPrivada(url) {
  let h; try { h = new URL(String(url)).hostname.toLowerCase().replace(/^\[|\]$/g, ''); } catch { return false; }
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h === '0.0.0.0') return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) { const [a, b] = [+m[1], +m[2]]; return a === 127 || a === 10 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127); }
  if (/^\d+$/.test(h) || /^0x/i.test(h)) return true;           // IPs en decimal/hex (http://2130706433/)
  return h === '::1' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || /^::ffff:/.test(h);
}

module.exports = { redactar, registrarSecreto, olvidarSecreto, pareceSecreto, envLimpio, rutaSensible, hostPermitido, hostDeUrl, origenPermitido, urlPrivada, PATRONES };
