// Modo Gamer fase 2: temperaturas y uso SIN admin.
// - GPU NVIDIA: nvidia-smi (viene con el driver) → temp, uso, reloj, potencia y "clocks event/throttle reasons" (bits NVML).
// - CPU: contadores de rendimiento por WMI (Win32_PerfFormattedData_Counters_ProcessorInformation: uso, % de la frecuencia máxima)
//   + zonas térmicas ACPI (ThermalZoneInformation: temperatura APROXIMADA de la placa, no del núcleo; PercentPassiveLimit < 100 = el firmware frena la CPU).
//   La temperatura real por núcleo (y GPU AMD/Intel) la da LibreHardwareMonitor, pero su driver necesita ADMIN → no se usa (documentado).
const { execFile } = require('child_process');

const BITS = {                     // nvmlClocksEventReasons
  0x1: 'reposo', 0x2: 'reloj fijado por app', 0x4: 'límite de potencia (SW)', 0x8: 'frenado por hardware', 0x10: 'sync boost',
  0x20: 'térmico (SW)', 0x40: 'térmico (HW)', 0x80: 'freno de potencia (HW)', 0x100: 'reloj de pantalla',
};
const TERMICO = 0x20 | 0x40 | 0x8, POTENCIA = 0x4 | 0x80;
const CAMPOS = 'name,temperature.gpu,utilization.gpu,clocks.gr,clocks.max.gr,power.draw,power.limit';
const num = x => { const n = parseFloat(x); return Number.isFinite(n) ? n : null; };

function razones(hex) {
  const v = parseInt(String(hex || '').trim(), 16);
  if (!Number.isFinite(v) || !v) return { mascara: 0, lista: [], termico: false, potencia: false };
  const lista = []; for (let b = 1; b <= 0x100000; b <<= 1) if (v & b) lista.push(BITS[b] || `otro (0x${b.toString(16)})`);
  return { mascara: v, lista, termico: !!(v & TERMICO), potencia: !!(v & POTENCIA) };
}

// "NVIDIA GeForce RTX 5060, 37, 6, 1185, 3090, 21.87, 145.00, 0x0000000000000400" (una línea por GPU)
function parsearNvidiaSmi(txt) {
  return String(txt || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => l.split(',').map(x => x.trim())).filter(c => c.length >= 7).map(c => {
    const rz = razones(c[7]);
    return { nombre: c[0], temp: num(c[1]), uso: num(c[2]), reloj: num(c[3]), relojMax: num(c[4]), potencia: num(c[5]), limite: num(c[6]), razones: rz.lista, throttleTermico: rz.termico, throttlePotencia: rz.potencia };
  });
}

const PS_CPU = "$c = Get-CimInstance Win32_PerfFormattedData_Counters_ProcessorInformation -Filter \"Name='_Total'\" -ErrorAction SilentlyContinue | Select-Object PercentProcessorUtility,PercentProcessorTime,PercentofMaximumFrequency,ProcessorFrequency; " +
  '$z = @(Get-CimInstance Win32_PerfFormattedData_Counters_ThermalZoneInformation -ErrorAction SilentlyContinue | Select-Object Name,HighPrecisionTemperature,PercentPassiveLimit); ' +
  '[pscustomobject]@{ cpu = $c; zonas = $z } | ConvertTo-Json -Compress -Depth 4';
function parsearCpu(txt) {
  let j; try { j = JSON.parse(String(txt || '').trim().replace(/^﻿/, '')); } catch { return null; }
  const c = j.cpu || {}, zonas = [].concat(j.zonas || []).filter(Boolean);
  const temps = zonas.map(z => num(z.HighPrecisionTemperature)).filter(t => t > 0).map(t => Math.round(t / 10 - 273.15));   // décimas de kelvin → °C
  const lim = zonas.map(z => num(z.PercentPassiveLimit)).filter(x => x !== null);
  return {
    uso: num(c.PercentProcessorUtility) ?? num(c.PercentProcessorTime), frecPct: num(c.PercentofMaximumFrequency), frecMHz: num(c.ProcessorFrequency),
    zonaTemp: temps.length ? Math.max(...temps) : null, limitePasivo: lim.length ? Math.min(...lim) : null,
  };
}

function crearSensores({ exec } = {}) {
  const correr = exec || ((bin, args, t = 8000) => new Promise(ok => execFile(bin, args, { windowsHide: true, timeout: t, encoding: 'utf8' }, (e, out) => ok(e ? null : out))));
  let campoRazon = 'clocks_event_reasons.active';                // drivers nuevos; los viejos usan clocks_throttle_reasons.active
  async function gpu() {
    let out = await correr('nvidia-smi', [`--query-gpu=${CAMPOS},${campoRazon}`, '--format=csv,noheader,nounits']);
    if (out === null && campoRazon.startsWith('clocks_event')) { campoRazon = 'clocks_throttle_reasons.active'; out = await correr('nvidia-smi', [`--query-gpu=${CAMPOS},${campoRazon}`, '--format=csv,noheader,nounits']); }
    return out === null ? [] : parsearNvidiaSmi(out);
  }
  async function cpu() {
    if (process.platform !== 'win32' && !exec) return null;
    return parsearCpu(await correr('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS_CPU], 15_000));
  }
  async function leer() { const [g, c] = await Promise.all([gpu().catch(() => []), cpu().catch(() => null)]); return { t: Date.now(), gpu: g[0] || null, gpus: g, cpu: c }; }
  return { leer, gpu, cpu };
}

// agrega muestras de una medición → resumen + alertas de thermal throttling
function resumir(muestras = []) {
  const m = (xs, f) => { const v = xs.filter(x => x !== null && x !== undefined); return v.length ? f(v) : null; };
  const media = v => Math.round(v.reduce((a, b) => a + b, 0) / v.length), max = v => Math.max(...v), min = v => Math.min(...v);
  const g = muestras.map(s => s.gpu).filter(Boolean), c = muestras.map(s => s.cpu).filter(Boolean);
  const r = {
    muestras: muestras.length,
    gpu: g.length ? {
      nombre: g[0].nombre, tempMax: m(g.map(x => x.temp), max), tempMedia: m(g.map(x => x.temp), media), usoMedio: m(g.map(x => x.uso), media),
      relojMedio: m(g.map(x => x.reloj), media), relojMax: g[0].relojMax, potenciaMedia: m(g.map(x => x.potencia), media), limite: g[0].limite,
      throttleTermico: g.filter(x => x.throttleTermico).length, throttlePotencia: g.filter(x => x.throttlePotencia).length,
    } : null,
    cpu: c.length ? { usoMedio: m(c.map(x => x.uso), media), frecPctMin: m(c.map(x => x.frecPct), min), frecMHzMedia: m(c.map(x => x.frecMHz), media), zonaTempMax: m(c.map(x => x.zonaTemp), max), limitePasivoMin: m(c.map(x => x.limitePasivo), min) } : null,
  };
  r.alertas = alertas(r);
  return r;
}
function alertas(r) {
  const a = [];
  if (r.gpu && (r.gpu.throttleTermico || r.gpu.tempMax >= 87)) {
    a.push(`Tu GPU llegó a ${r.gpu.tempMax} °C${r.gpu.throttleTermico ? ' y está bajando reloj por temperatura' : ''}: limpia el polvo, revisa la curva de ventiladores y que el aire salga bien de la caja.`);
  }
  if (r.cpu && r.cpu.limitePasivoMin !== null && r.cpu.limitePasivoMin < 100) a.push(`El firmware está frenando la CPU por temperatura (límite pasivo ${r.cpu.limitePasivoMin} %): revisa el disipador y la pasta térmica.`);
  else if (r.cpu && r.cpu.frecPctMin !== null && r.cpu.frecPctMin < 60 && r.cpu.usoMedio >= 60) a.push(`La CPU bajó al ${r.cpu.frecPctMin} % de su frecuencia con carga alta: puede ser temperatura o el plan de energía.`);
  return a;
}

module.exports = { crearSensores, parsearNvidiaSmi, parsearCpu, razones, resumir, alertas, PS_CPU };
