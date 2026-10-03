# Grabadora de reuniones (Windows, sin dependencias): proceso persistente, órdenes JSON por stdin (una por línea),
# eventos JSON por stdout. C# compilado una vez con Add-Type; captura WASAPI en modo compartido:
#   - "mic"     = micrófono por defecto (eCapture)            → lo que dices TÚ
#   - "sistema" = loopback del altavoz por defecto (eRender)  → lo que dicen ELLOS (Discord, Zoom, Teams, llamadas…)
# Cada fuente se corta en trozos de N s → WAV mono 16 kHz PCM16 (lo que mejor traga whisper). Los silencios del
# loopback (Windows no entrega paquetes si nada suena) se rellenan con ceros según el reloj: los trozos cuadran con el tiempo real.
#   {"op":"empezar","dir":"C:\\...","prefijo":"r1","trozoSeg":30,"mic":true,"sistema":true}
#   {"op":"parar"}            → escribe lo que quede (≥ 1 s) y emite {"evento":"parado"}
#   {"op":"salir"}
# Eventos: {"evento":"listo"} · {"evento":"grabando","fuente":..,"hz":..,"canales":..} · {"evento":"trozo","fuente":..,"ruta":..,"n":..,"inicioMs":..,"durMs":..,"rms":..,"pico":..}
#          {"evento":"error","fuente":..,"error":..} · {"evento":"parado"}
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[Console]::InputEncoding = [Text.Encoding]::UTF8
Add-Type -ReferencedAssemblies System.Web.Extensions -TypeDefinition @'
using System; using System.IO; using System.Text; using System.Threading; using System.Collections.Generic;
using System.Runtime.InteropServices; using System.Web.Script.Serialization;

namespace ApoloAudio {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCo { }
  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int flujo, int estado, out IntPtr lista);
    int GetDefaultAudioEndpoint(int flujo, int rol, out IMMDevice disp);
  }
  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    int Activate(ref Guid iid, int ctx, IntPtr param, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
  }
  [ComImport, Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioClient {
    int Initialize(int modo, int flags, long buffer, long periodo, IntPtr formato, IntPtr sesion);
    int GetBufferSize(out uint n);
    int GetStreamLatency(out long l);
    int GetCurrentPadding(out uint p);
    int IsFormatSupported(int modo, IntPtr formato, out IntPtr cercano);
    int GetMixFormat(out IntPtr formato);
    int GetDevicePeriod(out long def, out long min);
    int Start(); int Stop(); int Reset();
    int SetEventHandle(IntPtr h);
    int GetService(ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object svc);
  }
  [ComImport, Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioCaptureClient {
    int GetBuffer(out IntPtr datos, out uint frames, out uint flags, out ulong pos, out ulong qpc);
    int ReleaseBuffer(uint frames);
    int GetNextPacketSize(out uint frames);
  }

  public static class Salida {
    static readonly object cerrojo = new object();
    static readonly JavaScriptSerializer js = new JavaScriptSerializer();
    public static void Emitir(Dictionary<string, object> d) { lock (cerrojo) { Console.Out.WriteLine(js.Serialize(d)); Console.Out.Flush(); } }
    public static void Error(string fuente, string msg) { Emitir(new Dictionary<string, object> { { "evento", "error" }, { "fuente", fuente }, { "error", msg } }); }
  }

  public class Fuente {
    public string Nombre; bool loopback; string dir, prefijo; int trozoSeg;
    Thread hilo; volatile bool parar; DateTime t0;
    public Fuente(string nombre, bool loopback, string dir, string prefijo, int trozoSeg, DateTime t0) {
      Nombre = nombre; this.loopback = loopback; this.dir = dir; this.prefijo = prefijo; this.trozoSeg = Math.Max(1, trozoSeg); this.t0 = t0;
    }
    public void Empezar() { hilo = new Thread(Bucle); hilo.IsBackground = true; hilo.SetApartmentState(ApartmentState.MTA); hilo.Start(); }
    public void Parar() { parar = true; if (hilo != null) hilo.Join(5000); }

    int hz, canales, bits; bool flotante;
    double arranqueMs = 0; List<float> buf = new List<float>(); long framesTotales = 0, framesTrozo0 = 0; int n = 0;

    void Bucle() {
      IAudioClient cliente = null; IntPtr fmt = IntPtr.Zero;
      try {
        var en = (IMMDeviceEnumerator)new MMDeviceEnumeratorCo();
        IMMDevice disp; int hr = en.GetDefaultAudioEndpoint(loopback ? 0 : 1, loopback ? 0 : 2, out disp);   // eRender/eConsole · eCapture/eCommunications
        if (hr != 0 || disp == null) { Salida.Error(Nombre, loopback ? "no hay altavoz/salida de audio por defecto" : "no hay micrófono por defecto"); return; }
        Guid iid = typeof(IAudioClient).GUID; object o;
        Marshal.ThrowExceptionForHR(disp.Activate(ref iid, 23, IntPtr.Zero, out o));
        cliente = (IAudioClient)o;
        Marshal.ThrowExceptionForHR(cliente.GetMixFormat(out fmt));
        int tag = Marshal.ReadInt16(fmt, 0) & 0xFFFF; canales = Marshal.ReadInt16(fmt, 2); hz = Marshal.ReadInt32(fmt, 4); bits = Marshal.ReadInt16(fmt, 14);
        flotante = tag == 3;
        if (tag == 0xFFFE) { byte[] g = new byte[16]; Marshal.Copy(new IntPtr(fmt.ToInt64() + 24), g, 0, 16); flotante = new Guid(g) == new Guid("00000003-0000-0010-8000-00aa00389b71"); }
        Marshal.ThrowExceptionForHR(cliente.Initialize(0, loopback ? 0x00020000 : 0, 10000000, 0, fmt, IntPtr.Zero));
        Guid iidC = typeof(IAudioCaptureClient).GUID; object oc;
        Marshal.ThrowExceptionForHR(cliente.GetService(ref iidC, out oc));
        var cap = (IAudioCaptureClient)oc;
        Marshal.ThrowExceptionForHR(cliente.Start());
        Salida.Emitir(new Dictionary<string, object> { { "evento", "grabando" }, { "fuente", Nombre }, { "hz", hz }, { "canales", canales }, { "bits", bits }, { "flotante", flotante } });
        int bpf = canales * bits / 8; byte[] tmp = new byte[0];
        DateTime inicio = DateTime.UtcNow; arranqueMs = (inicio - t0).TotalMilliseconds;
        while (!parar) {
          Thread.Sleep(15);
          uint paquete; cap.GetNextPacketSize(out paquete);
          while (paquete > 0) {
            IntPtr p; uint frames, flags; ulong a, b;
            Marshal.ThrowExceptionForHR(cap.GetBuffer(out p, out frames, out flags, out a, out b));
            int bytes = (int)frames * bpf;
            if ((flags & 2) != 0) { for (int i = 0; i < frames; i++) buf.Add(0f); }        // AUDCLNT_BUFFERFLAGS_SILENT
            else {
              if (tmp.Length < bytes) tmp = new byte[bytes];
              Marshal.Copy(p, tmp, 0, bytes);
              for (int f = 0; f < frames; f++) {
                double s = 0;
                for (int c = 0; c < canales; c++) s += Muestra(tmp, f * bpf + c * bits / 8);
                buf.Add((float)(s / canales));
              }
            }
            framesTotales += frames;
            cap.ReleaseBuffer(frames);
            cap.GetNextPacketSize(out paquete);
          }
          // relleno de silencio: el loopback no entrega nada si no suena nada → cuadrar con el reloj (huecos > 200 ms)
          long esperados = (long)((DateTime.UtcNow - inicio).TotalSeconds * hz);
          if (esperados - framesTotales > hz / 5) { long faltan = esperados - framesTotales - hz / 20; for (long i = 0; i < faltan; i++) buf.Add(0f); framesTotales += faltan; }
          if (buf.Count >= (long)hz * trozoSeg) Volcar(hz * trozoSeg);
        }
        cliente.Stop();
        if (buf.Count >= hz) Volcar(buf.Count);
      } catch (Exception e) { Salida.Error(Nombre, e.Message); }
      finally { if (fmt != IntPtr.Zero) Marshal.FreeCoTaskMem(fmt); }
    }

    double Muestra(byte[] b, int i) {
      if (flotante) return bits == 64 ? BitConverter.ToDouble(b, i) : BitConverter.ToSingle(b, i);
      if (bits == 16) return BitConverter.ToInt16(b, i) / 32768.0;
      if (bits == 24) return ((b[i] << 8 | b[i + 1] << 16 | b[i + 2] << 24) >> 8) / 8388608.0;
      if (bits == 32) return BitConverter.ToInt32(b, i) / 2147483648.0;
      return 0;
    }

    void Volcar(int cuantos) {
      float[] src = buf.GetRange(0, cuantos).ToArray(); buf.RemoveRange(0, cuantos);
      long inicioMs = (long)(framesTrozo0 * 1000.0 / hz + arranqueMs);
      framesTrozo0 += cuantos; n++;
      // remuestreo lineal a 16 kHz mono PCM16
      int m = (int)((long)cuantos * 16000 / hz); short[] dst = new short[m];
      double paso = (double)hz / 16000, suma2 = 0, pico = 0;
      for (int i = 0; i < m; i++) {
        double x = i * paso; int k = (int)x; double fr = x - k;
        double v = k + 1 < src.Length ? src[k] * (1 - fr) + src[k + 1] * fr : src[Math.Min(k, src.Length - 1)];
        if (v > 1) v = 1; if (v < -1) v = -1;
        suma2 += v * v; if (Math.Abs(v) > pico) pico = Math.Abs(v);
        dst[i] = (short)(v * 32767);
      }
      string ruta = Path.Combine(dir, string.Format("{0}-{1}-{2:000}.wav", prefijo, Nombre, n));
      using (var w = new BinaryWriter(File.Create(ruta))) {
        int datos = m * 2;
        w.Write(Encoding.ASCII.GetBytes("RIFF")); w.Write(36 + datos); w.Write(Encoding.ASCII.GetBytes("WAVEfmt "));
        w.Write(16); w.Write((short)1); w.Write((short)1); w.Write(16000); w.Write(32000); w.Write((short)2); w.Write((short)16);
        w.Write(Encoding.ASCII.GetBytes("data")); w.Write(datos);
        foreach (var s in dst) w.Write(s);
      }
      Salida.Emitir(new Dictionary<string, object> { { "evento", "trozo" }, { "fuente", Nombre }, { "ruta", ruta }, { "n", n }, { "inicioMs", inicioMs },
        { "durMs", (long)(cuantos * 1000.0 / hz) }, { "rms", Math.Round(Math.Sqrt(suma2 / Math.Max(1, m)), 5) }, { "pico", Math.Round(pico, 4) } });
    }
  }

  public static class Grabadora {
    static List<Fuente> fuentes = new List<Fuente>();
    public static void Ejecutar() {
      var js = new JavaScriptSerializer(); string linea;
      Salida.Emitir(new Dictionary<string, object> { { "evento", "listo" } });
      while ((linea = Console.In.ReadLine()) != null) {
        linea = linea.Trim(); if (linea.Length == 0) continue;
        Dictionary<string, object> o;
        try { o = js.Deserialize<Dictionary<string, object>>(linea); } catch { Salida.Error("", "orden no válida"); continue; }
        string op = o.ContainsKey("op") ? Convert.ToString(o["op"]) : "";
        try {
          if (op == "empezar") {
            PararTodo(false);
            string dir = Convert.ToString(o["dir"]); Directory.CreateDirectory(dir);
            string pre = o.ContainsKey("prefijo") ? Convert.ToString(o["prefijo"]) : "r";
            int seg = o.ContainsKey("trozoSeg") ? Convert.ToInt32(o["trozoSeg"]) : 30;
            var t0 = DateTime.UtcNow;
            if (!o.ContainsKey("mic") || Convert.ToBoolean(o["mic"])) fuentes.Add(new Fuente("mic", false, dir, pre, seg, t0));
            if (!o.ContainsKey("sistema") || Convert.ToBoolean(o["sistema"])) fuentes.Add(new Fuente("sistema", true, dir, pre, seg, t0));
            foreach (var f in fuentes) f.Empezar();
          } else if (op == "parar") PararTodo(true);
          else if (op == "salir") { PararTodo(false); return; }
          else Salida.Error("", "op desconocida: " + op);
        } catch (Exception e) { Salida.Error("", e.Message); }
      }
      PararTodo(false);
    }
    static void PararTodo(bool avisar) {
      foreach (var f in fuentes) f.Parar();
      fuentes.Clear();
      if (avisar) Salida.Emitir(new Dictionary<string, object> { { "evento", "parado" } });
    }
  }
}
'@
[ApoloAudio.Grabadora]::Ejecutar()
