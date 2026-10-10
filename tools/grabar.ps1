# Grabadora del micrófono SIN Python (para whisper.cpp): proceso persistente, C# compilado una vez (waveIn de winmm).
# Mismo criterio que tools/whisper_srv.py: mide 0,3 s de ruido de fondo, espera a que hables (hasta 6 s)
# y corta tras 1 s de silencio (máx. 15 s). Graba WAV 16 kHz mono 16 bits, lo que lee whisper-cli.
# Protocolo (una línea JSON por respuesta):
#   arranque          -> {"listo":true}
#   "grabar <ruta>"   -> {"ok":true,"segundos":2.4} | {"vacio":true} | {"error":"..."}
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

public static class Grabadora {
  public static double Pico, Umbral;                       // diagnóstico: nivel máximo oído y umbral de voz
  [StructLayout(LayoutKind.Sequential)]
  struct WAVEFORMATEX { public ushort wFormatTag, nChannels; public uint nSamplesPerSec, nAvgBytesPerSec; public ushort nBlockAlign, wBitsPerSample, cbSize; }
  [StructLayout(LayoutKind.Sequential)]
  struct WAVEHDR { public IntPtr lpData; public uint dwBufferLength, dwBytesRecorded; public IntPtr dwUser; public uint dwFlags, dwLoops; public IntPtr lpNext, reserved; }
  [DllImport("winmm.dll")] static extern int waveInOpen(out IntPtr h, int dev, ref WAVEFORMATEX f, IntPtr cb, IntPtr inst, int flags);
  [DllImport("winmm.dll")] static extern int waveInPrepareHeader(IntPtr h, IntPtr hdr, int size);
  [DllImport("winmm.dll")] static extern int waveInUnprepareHeader(IntPtr h, IntPtr hdr, int size);
  [DllImport("winmm.dll")] static extern int waveInAddBuffer(IntPtr h, IntPtr hdr, int size);
  [DllImport("winmm.dll")] static extern int waveInStart(IntPtr h);
  [DllImport("winmm.dll")] static extern int waveInReset(IntPtr h);
  [DllImport("winmm.dll")] static extern int waveInClose(IntPtr h);

  const int SR = 16000, BLOQUE = 480, NBUF = 16;          // bloques de 30 ms
  const int OFF_GRABADOS = 12, OFF_FLAGS = 24;            // offsets en WAVEHDR (x64)

  // devuelve segundos grabados (0 = no habló) o lanza excepción
  public static double Grabar(string ruta, double maxS, double esperaS, double colaS) {
    var f = new WAVEFORMATEX { wFormatTag = 1, nChannels = 1, nSamplesPerSec = SR, nAvgBytesPerSec = SR * 2, nBlockAlign = 2, wBitsPerSample = 16, cbSize = 0 };
    IntPtr h;
    int r = waveInOpen(out h, -1, ref f, IntPtr.Zero, IntPtr.Zero, 0);
    if (r != 0) throw new Exception("no se pudo abrir el micrófono (waveIn " + r + ")");
    int tam = Marshal.SizeOf(typeof(WAVEHDR));
    var hdrs = new IntPtr[NBUF]; var datos = new IntPtr[NBUF];
    var audio = new List<short>(); var ruido = new List<double>();
    try {
      for (int i = 0; i < NBUF; i++) {
        datos[i] = Marshal.AllocHGlobal(BLOQUE * 2);
        var w = new WAVEHDR { lpData = datos[i], dwBufferLength = BLOQUE * 2 };
        hdrs[i] = Marshal.AllocHGlobal(tam); Marshal.StructureToPtr(w, hdrs[i], false);
        waveInPrepareHeader(h, hdrs[i], tam); waveInAddBuffer(h, hdrs[i], tam);
      }
      waveInStart(h);
      bool empezo = false; double silencio = 0, umbral = 0, t = 0; int sig = 0; Pico = 0;
      var muestras = new short[BLOQUE];
      var reloj = System.Diagnostics.Stopwatch.StartNew();
      while (true) {
        if ((Marshal.ReadInt32(hdrs[sig], OFF_FLAGS) & 1) == 0) {      // WHDR_DONE
          if (reloj.Elapsed.TotalSeconds > maxS + 3) throw new Exception("el micrófono no entrega audio");
          Thread.Sleep(5); continue;
        }
        int n = Marshal.ReadInt32(hdrs[sig], OFF_GRABADOS) / 2;
        Marshal.Copy(datos[sig], muestras, 0, n);
        waveInUnprepareHeader(h, hdrs[sig], tam);
        Marshal.WriteInt32(hdrs[sig], OFF_FLAGS, 0);
        waveInPrepareHeader(h, hdrs[sig], tam); waveInAddBuffer(h, hdrs[sig], tam);
        sig = (sig + 1) % NBUF;
        double s2 = 0; for (int i = 0; i < n; i++) { double v = muestras[i] / 32768.0; s2 += v * v; }
        double rms = n > 0 ? Math.Sqrt(s2 / n) : 0;
        t += (double)n / SR;
        if (ruido.Count < 10) {                                         // 0,3 s para medir el ruido de fondo
          ruido.Add(rms);
          if (ruido.Count == 10) { var o = new List<double>(ruido); o.Sort(); umbral = Math.Max(0.012, (o[4] + o[5]) / 2 * 3.2); }
          continue;
        }
        if (rms > Pico) Pico = rms; Umbral = umbral;
        if (rms > umbral) { empezo = true; silencio = 0; }
        else if (empezo) silencio += (double)n / SR;
        if (empezo) for (int i = 0; i < n; i++) audio.Add(muestras[i]);
        if ((!empezo && t > esperaS) || (empezo && silencio > colaS) || t > maxS) break;
      }
    } finally {
      waveInReset(h);
      for (int i = 0; i < NBUF; i++) { if (hdrs[i] != IntPtr.Zero) { waveInUnprepareHeader(h, hdrs[i], tam); Marshal.FreeHGlobal(hdrs[i]); } if (datos[i] != IntPtr.Zero) Marshal.FreeHGlobal(datos[i]); }
      waveInClose(h);
    }
    if (audio.Count < SR * 0.3) return 0;
    using (var bw = new BinaryWriter(File.Create(ruta))) {
      int bytes = audio.Count * 2;
      bw.Write(new[] { 'R', 'I', 'F', 'F' }); bw.Write(36 + bytes); bw.Write(new[] { 'W', 'A', 'V', 'E' });
      bw.Write(new[] { 'f', 'm', 't', ' ' }); bw.Write(16); bw.Write((short)1); bw.Write((short)1); bw.Write(SR); bw.Write(SR * 2); bw.Write((short)2); bw.Write((short)16);
      bw.Write(new[] { 'd', 'a', 't', 'a' }); bw.Write(bytes);
      foreach (var m in audio) bw.Write(m);
    }
    return (double)audio.Count / SR;
  }
}
'@
function Responder($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress)); [Console]::Out.Flush() }
Responder @{ listo = $true }
while ($null -ne ($linea = [Console]::In.ReadLine())) {
  $linea = $linea.Trim()
  if (-not $linea.StartsWith('grabar ')) { continue }
  try {
    $seg = [Grabadora]::Grabar($linea.Substring(7), 15, 6, 1.0)
    if ($seg -le 0) { Responder @{ vacio = $true; pico = [math]::Round([Grabadora]::Pico, 4); umbral = [math]::Round([Grabadora]::Umbral, 4) } } else { Responder @{ ok = $true; segundos = [math]::Round($seg, 1) } }
  } catch { $e = $_.Exception; if ($e.InnerException) { $e = $e.InnerException }; Responder @{ error = $e.Message } }
}
