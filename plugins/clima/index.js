// Plugin de ejemplo: el tiempo con Open-Meteo (gratis, sin clave). Demuestra el SDK: herramienta + comando + almacén + config.
// Config opcional en config.json del núcleo: "plugins": { "clima": { "ciudadPorDefecto": "Madrid", "unidades": "celsius" } }
const { definirPlugin } = require('@apolo/sdk');

const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const PREVISION = 'https://api.open-meteo.com/v1/forecast';
const CODIGOS = {
  0: 'despejado', 1: 'casi despejado', 2: 'parcialmente nublado', 3: 'nublado', 45: 'niebla', 48: 'niebla con escarcha',
  51: 'llovizna débil', 53: 'llovizna', 55: 'llovizna intensa', 56: 'llovizna helada', 57: 'llovizna helada intensa',
  61: 'lluvia débil', 63: 'lluvia', 65: 'lluvia fuerte', 66: 'lluvia helada', 67: 'lluvia helada fuerte',
  71: 'nieve débil', 73: 'nieve', 75: 'nieve fuerte', 77: 'granos de nieve', 80: 'chubascos débiles', 81: 'chubascos', 82: 'chubascos fuertes',
  85: 'chubascos de nieve', 86: 'chubascos de nieve fuertes', 95: 'tormenta', 96: 'tormenta con granizo', 99: 'tormenta con granizo fuerte',
};
const CACHE_MS = 10 * 60_000;

module.exports = definirPlugin({
  async activar(apolo) {
    const cache = new Map();
    const unidad = apolo.config.unidades === 'fahrenheit' ? 'fahrenheit' : 'celsius';

    async function json(url, signal) {
      const r = await fetch(url, { signal: signal || AbortSignal.timeout(15_000), headers: { 'user-agent': 'APOLO-plugin-clima' } });
      if (!r.ok) throw new Error(`Open-Meteo respondió HTTP ${r.status}`);
      return r.json();
    }

    async function clima(ciudad, signal) {
      ciudad = String(ciudad || apolo.config.ciudadPorDefecto || apolo.almacen.leer('ultima', '')).trim();
      if (!ciudad) return 'error: dime de qué ciudad';
      const k = ciudad.toLowerCase();
      const c = cache.get(k); if (c && Date.now() - c.t < CACHE_MS) return c.texto;
      const g = await json(`${GEO}?name=${encodeURIComponent(ciudad)}&count=1&language=es&format=json`, signal);
      const lugar = g.results?.[0];
      if (!lugar) return `No encuentro la ciudad "${ciudad}".`;
      const q = new URLSearchParams({
        latitude: lugar.latitude, longitude: lugar.longitude, timezone: 'auto', forecast_days: '3', temperature_unit: unidad,
        current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      });
      const p = await json(`${PREVISION}?${q}`, signal);
      const u = unidad === 'fahrenheit' ? '°F' : '°C', a = p.current || {}, d = p.daily || {};
      const donde = [lugar.name, lugar.admin1, lugar.country].filter(Boolean).join(', ');
      const dias = (d.time || []).map((f, i) => `- ${i === 0 ? 'hoy' : i === 1 ? 'mañana' : f}: ${CODIGOS[d.weather_code[i]] || 'código ' + d.weather_code[i]}, ` +
        `${Math.round(d.temperature_2m_min[i])}–${Math.round(d.temperature_2m_max[i])}${u}, lluvia ${d.precipitation_probability_max?.[i] ?? '?'}%`);
      const texto = `${donde} (ahora, hora local ${String(a.time || '').slice(11, 16)}): ${CODIGOS[a.weather_code] || 'código ' + a.weather_code}, ` +
        `${Math.round(a.temperature_2m)}${u} (sensación ${Math.round(a.apparent_temperature)}${u}), humedad ${a.relative_humidity_2m}%, viento ${Math.round(a.wind_speed_10m)} km/h` +
        `${a.precipitation ? `, precipitación ${a.precipitation} mm` : ''}.\nPrevisión:\n${dias.join('\n')}\n(Fuente: Open-Meteo)`;
      cache.set(k, { t: Date.now(), texto });
      apolo.almacen.guardar('ultima', ciudad);
      return texto;
    }

    apolo.registrarHerramienta({
      nombre: 'clima',
      descripcion: 'Tiempo actual y previsión de 3 días de una ciudad.',
      parametros: { type: 'object', properties: { ciudad: { type: 'string', description: 'nombre de la ciudad, ej. "Madrid" o "La Habana"' } }, required: ['ciudad'] },
      riesgo: 'lectura',
      ejecutar: (args, ctx) => clima(args.ciudad, ctx.signal),
    });
    apolo.registrarComando({ nombre: 'clima', descripcion: '/clima <ciudad>', ejecutar: (texto, ctx) => clima(texto, ctx.signal) });
    apolo.log('clima listo');
  },
});
