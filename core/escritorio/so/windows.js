// Implementación Windows (la de siempre): PowerShell + .NET (System.Drawing, UI Automation, SendInput, System.Speech) y wt.exe.
const path = require('path');
const { execFile, spawn } = require('child_process');
const { fuera } = require('../../rutas');

const PS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File'];
const script = n => fuera(path.join(__dirname, '..', n));               // core/escritorio/<n>.ps1 (desempaquetado en el .exe)
const raiz = n => fuera(path.join(__dirname, '..', '..', '..', n));    // archivos de la app (tools/…)

function ejecutarPantalla(args, { timeout = 20_000 } = {}) {
  return new Promise((ok, mal) => {
    execFile('powershell.exe', [...PS, script('pantalla.ps1'), ...args],
      { windowsHide: true, timeout, maxBuffer: 8 << 20, encoding: 'utf8' }, (err, out, errOut) => {
        if (err) return mal(new Error((errOut || err.message).trim().split('\n')[0]));
        try { ok(JSON.parse(out.trim().replace(/^﻿/, ''))); } catch { mal(new Error('salida no válida del capturador')); }
      });
  });
}

const lanzarManos = () => spawn('powershell.exe', [...PS, script('manos.ps1')], { windowsHide: true });
// grabadora de reuniones (grabar.ps1): WASAPI micrófono + loopback del sistema en trozos WAV 16 kHz; mismo protocolo JSON por líneas
// escritorio remoto (flujo.ps1): captura continua con tapado de ventanas protegidas; binario por stdout, JSON por stdin
const lanzarFlujo = (args = []) => spawn('powershell.exe', [...PS, script('flujo.ps1'), ...args], { windowsHide: true });
const lanzarGrabadora = () => spawn('powershell.exe', [...PS, script('grabar.ps1')], { windowsHide: true });

function escribirEnTerminal({ hwnd, archivo, timeout = 15_000 }) {
  return new Promise((ok, mal) => execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', raiz('tools/escribir.ps1'), '-Hwnd', String(hwnd), '-File', archivo],
    { windowsHide: true, timeout }, (e, out) => (e ? mal(e) : ok(String(out || '').trim()))));
}

const abrirTerminal = (dir, args = []) => execFile('wt.exe', ['-w', 'new', '-d', dir, ...args], { windowsHide: false }, () => { });

const voz = {
  // reserva sin Python: System.Speech (listen.ps1). hablar: la voz de Windows la gestiona hoy la isla (speechSynthesis).
  escuchar: (timeout = 15_000) => new Promise(ok => execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', raiz('tools/listen.ps1')],
    { windowsHide: true, timeout, encoding: 'utf8' }, (e, out) => ok(e ? '' : String(out || '').trim()))),
  hablar: null,
};

module.exports = { nombre: 'windows', soportado: true, ejecutarPantalla, lanzarManos, lanzarFlujo, lanzarGrabadora, escribirEnTerminal, abrirTerminal, voz };
