# Flujo de pantalla para el escritorio remoto (Windows, sin dependencias): proceso persistente que captura UN monitor a N fps,
# lo escala, TAPA EN NEGRO las ventanas protegidas (bancos, gestores de contraseñas… cfg.escritorio.bloqueadas) y solo envía lo que
# cambió (hash por bloques de 32 px → recorte del rectángulo sucio en JPEG). C# compilado una vez; todo el bucle va en C#.
# stdin (JSON por líneas):
#   {"op":"config","monitor":1 (0 = el principal),"ancho":1280,"calidad":60,"fps":8,"bloqueadas":["banco",...]}   (reinicia: el siguiente es fotograma clave)
#   {"op":"credito"}    control de flujo: cada fotograma gasta un crédito; node devuelve uno cuando el anterior salió por el socket
#   {"op":"parar"}
# stdout (binario): [u32 BE L][u16 BE H][cabecera JSON (H bytes)][JPEG (L-2-H bytes)]
#   cabecera de fotograma: {x,y,w,h, W,H, mon, origen:{x,y}, mw, mh, escala, clave, tapadas:[{x,y,ancho,alto}], fgProt, ms}
#   eventos (sin JPEG): {"evento":"listo","monitores":[...]} · {"evento":"error","error":".."}
# -Prueba: sin capturar la pantalla real (imagen gris sintética) y con ventanas falsas (config.ventanasPrueba) → tests offline.
param([switch]$Prueba)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type -ReferencedAssemblies System.Windows.Forms, System.Drawing, System.Web.Extensions -TypeDefinition @'
using System; using System.IO; using System.Text; using System.Threading; using System.Collections; using System.Collections.Generic;
using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices; using System.Text.RegularExpressions;
using System.Web.Script.Serialization; using System.Windows.Forms; using System.Diagnostics;

public static class Flujo {
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
  [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int val, int size);

  class Ventana { public string titulo, proceso; public Rectangle r; public bool fg; }
  static readonly JavaScriptSerializer js = new JavaScriptSerializer();
  static readonly object cerrojo = new object(), cerrojoSalida = new object();
  static readonly AutoResetEvent senal = new AutoResetEvent(false);
  static Stream salida;
  static int creditos = 0;
  static volatile bool fin = false, reiniciar = true, prueba = false;
  static int monitor = 1, ancho = 1280, calidad = 60, fps = 8;
  static Regex bloqueo = null;
  static List<Ventana> falsas = new List<Ventana>();
  static Dictionary<uint, string> procesos = new Dictionary<uint, string>();
  static long limpiarProcesos = 0; static readonly Stopwatch relojP = Stopwatch.StartNew();
  const int BLK = 32;

  static void Enviar(Dictionary<string, object> cab, byte[] jpg) {
    byte[] h = Encoding.UTF8.GetBytes(js.Serialize(cab));
    int j = jpg == null ? 0 : jpg.Length, L = 2 + h.Length + j;
    byte[] t = new byte[4 + L];
    t[0] = (byte)(L >> 24); t[1] = (byte)(L >> 16); t[2] = (byte)(L >> 8); t[3] = (byte)L;
    t[4] = (byte)(h.Length >> 8); t[5] = (byte)h.Length;
    Buffer.BlockCopy(h, 0, t, 6, h.Length);
    if (j > 0) Buffer.BlockCopy(jpg, 0, t, 6 + h.Length, j);
    lock (cerrojoSalida) { salida.Write(t, 0, t.Length); salida.Flush(); }
  }
  static int N(Dictionary<string, object> o, string k, int def) { return o.ContainsKey(k) && o[k] != null ? Convert.ToInt32(o[k]) : def; }

  static void Leer() {
    string l;
    try {
      while ((l = Console.In.ReadLine()) != null) {
        if (l.Trim().Length == 0) continue;
        try {
          var o = js.Deserialize<Dictionary<string, object>>(l);
          string op = (string)o["op"];
          if (op == "credito") { Interlocked.Increment(ref creditos); senal.Set(); }
          else if (op == "parar") break;
          else if (op == "config") {
            lock (cerrojo) {
              monitor = N(o, "monitor", monitor); ancho = Math.Max(320, Math.Min(3840, N(o, "ancho", ancho)));
              calidad = Math.Max(20, Math.Min(90, N(o, "calidad", calidad))); fps = Math.Max(1, Math.Min(30, N(o, "fps", fps)));
              if (o.ContainsKey("bloqueadas") && o["bloqueadas"] is IEnumerable) {
                var partes = new List<string>();
                foreach (object x in (IEnumerable)o["bloqueadas"]) { string p = Convert.ToString(x); try { new Regex(p); partes.Add("(?:" + p + ")"); } catch { } }
                bloqueo = partes.Count > 0 ? new Regex(string.Join("|", partes.ToArray()), RegexOptions.IgnoreCase) : null;
              }
              if (o.ContainsKey("ventanasPrueba") && o["ventanasPrueba"] is IEnumerable) {
                falsas = new List<Ventana>();
                foreach (object x in (IEnumerable)o["ventanasPrueba"]) {
                  var v = (Dictionary<string, object>)x;
                  falsas.Add(new Ventana { titulo = Convert.ToString(v["titulo"]), proceso = v.ContainsKey("proceso") ? Convert.ToString(v["proceso"]) : "",
                    r = new Rectangle(N(v, "x", 0), N(v, "y", 0), N(v, "ancho", 100), N(v, "alto", 100)), fg = v.ContainsKey("fg") && Convert.ToBoolean(v["fg"]) });
                }
              }
              reiniciar = true;
            }
            senal.Set();
          }
        } catch (Exception e) { Enviar(new Dictionary<string, object> { { "evento", "error" }, { "error", e.Message } }, null); }
      }
    } catch { }
    fin = true; senal.Set();
  }

  static string Proceso(uint pid) {
    string n;
    if (procesos.TryGetValue(pid, out n)) return n;
    try { n = Process.GetProcessById((int)pid).ProcessName; } catch { n = ""; }
    procesos[pid] = n; return n;
  }
  static List<Ventana> Ventanas() {
    if (prueba) return falsas;
    if (relojP.ElapsedMilliseconds > limpiarProcesos) { procesos.Clear(); limpiarProcesos = relojP.ElapsedMilliseconds + 30000; }
    var lista = new List<Ventana>(); IntPtr fg = GetForegroundWindow();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h) || IsIconic(h)) return true;
      int largo = GetWindowTextLength(h); if (largo <= 0) return true;
      int oculta = 0; if (DwmGetWindowAttribute(h, 14, out oculta, 4) == 0 && oculta != 0) return true;   // DWMWA_CLOAKED (apps UWP en segundo plano)
      RECT r; if (!GetWindowRect(h, out r) || r.R - r.L < 2 || r.B - r.T < 2) return true;
      var sb = new StringBuilder(largo + 1); GetWindowText(h, sb, sb.Capacity);
      uint pid; GetWindowThreadProcessId(h, out pid);
      lista.Add(new Ventana { titulo = sb.ToString(), proceso = Proceso(pid), r = Rectangle.FromLTRB(r.L, r.T, r.R, r.B), fg = h == fg });
      return true;
    }, IntPtr.Zero);
    return lista;
  }

  static ImageCodecInfo codec;
  static byte[] Jpeg(Bitmap b, int q) {
    var par = new EncoderParameters(1); par.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (long)q);
    using (var ms = new MemoryStream()) { b.Save(ms, codec, par); return ms.ToArray(); }
  }

  public static void Run(bool esPrueba) {
    prueba = esPrueba;
    SetProcessDPIAware();
    salida = Console.OpenStandardOutput();
    foreach (var c in ImageCodecInfo.GetImageEncoders()) if (c.MimeType == "image/jpeg") codec = c;
    var lector = new Thread(Leer); lector.IsBackground = true; lector.Start();
    var pantallas = Screen.AllScreens;
    var mons = new List<object>();
    for (int i = 0; i < pantallas.Length; i++) { var b = pantallas[i].Bounds; mons.Add(new Dictionary<string, object> { { "n", i + 1 }, { "x", b.X }, { "y", b.Y }, { "ancho", b.Width }, { "alto", b.Height }, { "primario", pantallas[i].Primary } }); }
    Enviar(new Dictionary<string, object> { { "evento", "listo" }, { "monitores", mons } }, null);

    Bitmap grande = null, peq = null; uint[] previo = null; int pCols = 0, pFilas = 0;
    var reloj = Stopwatch.StartNew();
    long ultimoClave = 0;
    while (!fin) {
      if (Volatile.Read(ref creditos) <= 0) { senal.WaitOne(1000); continue; }
      long t0 = reloj.ElapsedMilliseconds;
      int mon, an, cal, f; Regex rx; bool reset;
      lock (cerrojo) { mon = monitor; an = ancho; cal = calidad; f = fps; rx = bloqueo; reset = reiniciar; reiniciar = false; }
      Rectangle bm;
      if (prueba) bm = new Rectangle(0, 0, 1920, 1080);
      else { pantallas = Screen.AllScreens; if (mon < 1 || mon > pantallas.Length) { mon = 1; for (int i = 0; i < pantallas.Length; i++) if (pantallas[i].Primary) mon = i + 1; } bm = pantallas[mon - 1].Bounds; }
      double esc = Math.Max(1.0, bm.Width / (double)an);
      int w = (int)Math.Round(bm.Width / esc), h = (int)Math.Round(bm.Height / esc);
      if (grande == null || grande.Width != bm.Width || grande.Height != bm.Height) { if (grande != null) grande.Dispose(); grande = new Bitmap(bm.Width, bm.Height, PixelFormat.Format32bppRgb); reset = true; }
      if (peq == null || peq.Width != w || peq.Height != h) { if (peq != null) peq.Dispose(); peq = new Bitmap(w, h, PixelFormat.Format32bppRgb); reset = true; }
      string aviso = null;
      using (var g = Graphics.FromImage(grande)) {
        if (prueba) { g.Clear(Color.FromArgb(128, 128, 128)); g.FillRectangle(Brushes.White, 100, 100, 300, 200); }
        else { try { g.CopyFromScreen(bm.X, bm.Y, 0, 0, bm.Size, CopyPixelOperation.SourceCopy); } catch { g.Clear(Color.Black); aviso = "pantalla bloqueada o aviso de UAC"; } }
      }
      using (var g = Graphics.FromImage(peq)) {
        g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.Bilinear;
        g.DrawImage(grande, 0, 0, w, h);
        // ventanas protegidas: rectángulo negro (aunque estén tapadas por otras: mejor de más que de menos)
        var tapadas = new List<object>(); bool fgProt = false;
        if (rx != null) foreach (var v in Ventanas()) {
          if (!rx.IsMatch(v.titulo + " " + v.proceso)) continue;
          if (v.fg) fgProt = true;
          var r = Rectangle.Intersect(v.r, bm); if (r.Width <= 0 || r.Height <= 0) continue;
          tapadas.Add(new Dictionary<string, object> { { "x", r.X }, { "y", r.Y }, { "ancho", r.Width }, { "alto", r.Height } });
          var rs = new Rectangle((int)Math.Floor((r.X - bm.X) / esc), (int)Math.Floor((r.Y - bm.Y) / esc), (int)Math.Ceiling(r.Width / esc) + 1, (int)Math.Ceiling(r.Height / esc) + 1);
          g.FillRectangle(Brushes.Black, rs);
          using (var fnt = new Font("Segoe UI", 12f, FontStyle.Bold, GraphicsUnit.Pixel)) {
            var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
            g.DrawString("VENTANA PROTEGIDA", fnt, Brushes.DimGray, rs, sf);
          }
        }
        // puntero (CopyFromScreen no lo incluye)
        POINT cp; if (!prueba && GetCursorPos(out cp) && bm.Contains(cp.X, cp.Y)) {
          float cx = (float)((cp.X - bm.X) / esc), cy = (float)((cp.Y - bm.Y) / esc);
          g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
          var flecha = new PointF[] { new PointF(cx, cy), new PointF(cx, cy + 16), new PointF(cx + 4.5f, cy + 12), new PointF(cx + 11, cy + 11) };
          g.FillPolygon(Brushes.White, flecha); using (var lp = new Pen(Color.Black, 1.2f)) g.DrawPolygon(lp, flecha);
        }
        // hash por bloques
        int cols = (w + BLK - 1) / BLK, filas = (h + BLK - 1) / BLK;
        var hs = new uint[cols * filas];
        for (int i = 0; i < hs.Length; i++) hs[i] = 2166136261;
        var datos = peq.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format32bppRgb);
        var fila = new int[w];
        for (int y = 0; y < h; y++) {
          Marshal.Copy(IntPtr.Add(datos.Scan0, y * datos.Stride), fila, 0, w);
          int bf = (y / BLK) * cols;
          for (int x = 0; x < w; x++) { int bi = bf + x / BLK; hs[bi] = (hs[bi] ^ (uint)(fila[x] & 0xFFFFFF)) * 16777619; }
        }
        // en prueba: color del centro de cada ventana tapada (comprobación de que de verdad se ve negro)
        var muestras = new List<object>();
        if (prueba) foreach (Dictionary<string, object> t in tapadas) {
          int mx = (int)(((int)t["x"] + (int)t["ancho"] / 4 - bm.X) / esc), my = (int)(((int)t["y"] + (int)t["alto"] / 4 - bm.Y) / esc);
          if (mx >= 0 && mx < w && my >= 0 && my < h) { int px = Marshal.ReadInt32(IntPtr.Add(datos.Scan0, my * datos.Stride + mx * 4)) & 0xFFFFFF; muestras.Add(px); }
        }
        peq.UnlockBits(datos);
        bool clave = reset || previo == null || pCols != cols || pFilas != filas || reloj.ElapsedMilliseconds - ultimoClave > 30000;
        int x0 = cols, y0 = filas, x1 = -1, y1 = -1;
        if (clave) { x0 = 0; y0 = 0; x1 = cols - 1; y1 = filas - 1; }
        else for (int i = 0; i < hs.Length; i++) if (hs[i] != previo[i]) { int bx = i % cols, by = i / cols; if (bx < x0) x0 = bx; if (bx > x1) x1 = bx; if (by < y0) y0 = by; if (by > y1) y1 = by; }
        if (x1 >= 0) {
          var rr = Rectangle.Intersect(new Rectangle(x0 * BLK, y0 * BLK, (x1 - x0 + 1) * BLK, (y1 - y0 + 1) * BLK), new Rectangle(0, 0, w, h));
          if (rr.Width * rr.Height > w * h * 0.6) rr = new Rectangle(0, 0, w, h);
          byte[] jpg;
          if (rr.Width == w && rr.Height == h) jpg = Jpeg(peq, cal);
          else using (var rec = peq.Clone(rr, PixelFormat.Format32bppRgb)) jpg = Jpeg(rec, cal);
          if (clave) ultimoClave = reloj.ElapsedMilliseconds;
          var cab = new Dictionary<string, object> { { "x", rr.X }, { "y", rr.Y }, { "w", rr.Width }, { "h", rr.Height }, { "W", w }, { "H", h }, { "mon", mon },
            { "origen", new Dictionary<string, object> { { "x", bm.X }, { "y", bm.Y } } }, { "mw", bm.Width }, { "mh", bm.Height }, { "escala", Math.Round(esc, 4) },
            { "clave", clave }, { "tapadas", tapadas }, { "fgProt", fgProt }, { "ms", reloj.ElapsedMilliseconds - t0 } };
          if (aviso != null) cab["aviso"] = aviso;
          if (prueba) cab["muestras"] = muestras;
          Interlocked.Decrement(ref creditos);
          Enviar(cab, jpg);
        }
        previo = hs; pCols = cols; pFilas = filas;
      }
      int espera = (int)(1000 / f - (reloj.ElapsedMilliseconds - t0));
      if (espera > 0) Thread.Sleep(espera);
    }
  }
}
'@
[Flujo]::Run([bool]$Prueba)
