# Manos del robot (Windows, sin dependencias): proceso persistente que lee órdenes JSON por stdin (una por línea)
# y contesta JSON por stdout. C# compilado una vez → cada acción tarda milisegundos.
#   {"id":1,"op":"info","x":..,"y":..}      ventana activa, elemento con foco y elemento en ese punto
#   {"id":2,"op":"mover|clic|arrastrar|scroll|escribir|tecla", ...}   (coordenadas de PANTALLA reales)
#   {"id":3,"op":"armar"} / {"op":"desarmar"}  vigilante: si el usuario mueve el ratón, hace clic o pulsa una tecla
#                                              (o Ctrl+Alt+Esc), emite {"evento":"panico","motivo":..} y se desarma
#   {"id":4,"op":"grabar"} / {"op":"parar"}    macro por demostración: gancho de bajo nivel (WH_MOUSE_LL/WH_KEYBOARD_LL) SOLO
#                                              mientras graba; emite {"evento":"demo","tipo":"clic|scroll|tecla",...} (nunca el
#                                              texto de un campo de contraseña) y {"evento":"demo-fin"} con Ctrl+Alt+Esc
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[Console]::InputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, WindowsBase
Add-Type -ReferencedAssemblies UIAutomationClient, UIAutomationTypes, WindowsBase, System.Web.Extensions -TypeDefinition @'
using System; using System.Text; using System.Threading; using System.Collections.Generic;
using System.Runtime.InteropServices; using System.Web.Script.Serialization; using System.Windows.Automation;

public static class Manos {
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
  [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint flags);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern short VkKeyScan(char c);
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] i, int size);

  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Explicit)] struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION u; }

  const uint M_LDOWN = 0x2, M_LUP = 0x4, M_RDOWN = 0x8, M_RUP = 0x10, M_MDOWN = 0x20, M_MUP = 0x40, M_WHEEL = 0x800;
  const uint K_UP = 0x2, K_UNICODE = 0x4, K_EXT = 0x1;

  static readonly object salida = new object();
  static readonly JavaScriptSerializer js = new JavaScriptSerializer();
  static volatile bool armado = false, ocupado = false;
  static long graciaHasta = 0;
  static int espX, espY;

  static void Escribir(object o) { lock (salida) { Console.Out.WriteLine(js.Serialize(o)); Console.Out.Flush(); } }
  static long Ahora() { return DateTime.UtcNow.Ticks / 10000; }

  static void Mouse(uint flags, uint data = 0) {
    var i = new INPUT[1]; i[0].type = 0; i[0].u.mi.dwFlags = flags; i[0].u.mi.mouseData = data;
    SendInput(1, i, Marshal.SizeOf(typeof(INPUT)));
  }
  static void Tecla(ushort vk, bool arriba) {
    var i = new INPUT[1]; i[0].type = 1; i[0].u.ki.wVk = vk;
    i[0].u.ki.dwFlags = (arriba ? K_UP : 0) | (EsExtendida(vk) ? K_EXT : 0);
    SendInput(1, i, Marshal.SizeOf(typeof(INPUT)));
  }
  static bool EsExtendida(ushort vk) { return (vk >= 0x21 && vk <= 0x2E) || vk == 0x5B || vk == 0x5C; }
  static void Unicode(char c) {
    var i = new INPUT[2];
    for (int k = 0; k < 2; k++) { i[k].type = 1; i[k].u.ki.wScan = c; i[k].u.ki.dwFlags = K_UNICODE | (k == 1 ? K_UP : 0); }
    SendInput(2, i, Marshal.SizeOf(typeof(INPUT)));
  }
  static void Mover(int x, int y) { espX = x; espY = y; SetCursorPos(x, y); }

  static readonly Dictionary<string, ushort> VK = new Dictionary<string, ushort> {
    {"ctrl",0x11},{"control",0x11},{"alt",0x12},{"shift",0x10},{"mayus",0x10},{"win",0x5B},{"enter",0x0D},{"intro",0x0D},{"esc",0x1B},{"escape",0x1B},
    {"tab",0x09},{"backspace",0x08},{"retroceso",0x08},{"delete",0x2E},{"supr",0x2E},{"insert",0x2D},{"space",0x20},{"espacio",0x20},
    {"up",0x26},{"arriba",0x26},{"down",0x28},{"abajo",0x28},{"left",0x25},{"izquierda",0x25},{"right",0x27},{"derecha",0x27},
    {"home",0x24},{"inicio",0x24},{"end",0x23},{"fin",0x23},{"pageup",0x21},{"repag",0x21},{"pagedown",0x22},{"avpag",0x22},
    {"capslock",0x14},{"printscreen",0x2C},{"menu",0x5D}
  };
  static ushort CodigoTecla(string n) {
    n = n.Trim().ToLowerInvariant();
    ushort v; if (VK.TryGetValue(n, out v)) return v;
    if (n.Length > 1 && n[0] == 'f') { int f; if (int.TryParse(n.Substring(1), out f) && f >= 1 && f <= 24) return (ushort)(0x70 + f - 1); }
    if (n.Length == 1) { short s = VkKeyScan(n[0]); if (s != -1) return (ushort)(s & 0xFF); }
    throw new Exception("tecla desconocida: " + n);
  }

  // ---------- información para las comprobaciones de seguridad ----------
  static Dictionary<string, object> Elem(AutomationElement e) {
    if (e == null) return null;
    try {
      var c = e.Current;
      var r = new Dictionary<string, object> { {"tipo", c.ControlType.ProgrammaticName.Replace("ControlType.", "")}, {"nombre", c.Name ?? ""}, {"password", c.IsPassword} };
      if (!c.IsPassword) {   // texto del campo (para comprobar que escribir funcionó); nunca el de una contraseña
        try { object vp; if (e.TryGetCurrentPattern(ValuePattern.Pattern, out vp)) { string v = ((ValuePattern)vp).Current.Value ?? ""; r["valor"] = v.Length > 300 ? v.Substring(v.Length - 300) : v; } } catch { }
      }
      return r;
    } catch { return null; }
  }
  static Dictionary<string, object> Info(Dictionary<string, object> o) {
    var h = GetForegroundWindow(); var sb = new StringBuilder(512); GetWindowText(h, sb, 512);
    uint pid; GetWindowThreadProcessId(h, out pid);
    string proc = ""; try { proc = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch { }
    POINT p; GetCursorPos(out p);
    var r = new Dictionary<string, object> { {"ventana", new Dictionary<string, object> { {"titulo", sb.ToString()}, {"proceso", proc} }}, {"cursor", new int[] { p.X, p.Y }} };
    try { r["foco"] = Elem(AutomationElement.FocusedElement); } catch { }
    if (o.ContainsKey("x") && o.ContainsKey("y")) {
      try { r["enPunto"] = Elem(AutomationElement.FromPoint(new System.Windows.Point(Convert.ToDouble(o["x"]), Convert.ToDouble(o["y"])))); } catch { }
      try {   // ventana (raíz) que hay en ese punto: si no es la activa, el clic caería detrás o en otra ventana
        POINT q; q.X = Convert.ToInt32(o["x"]); q.Y = Convert.ToInt32(o["y"]);
        var raiz = GetAncestor(WindowFromPoint(q), 2);
        if (raiz != IntPtr.Zero && raiz != GetAncestor(h, 2)) {
          var sb2 = new StringBuilder(512); GetWindowText(raiz, sb2, 512); uint pid2; GetWindowThreadProcessId(raiz, out pid2);
          string proc2 = ""; try { proc2 = System.Diagnostics.Process.GetProcessById((int)pid2).ProcessName; } catch { }
          r["ventanaEnPunto"] = new Dictionary<string, object> { {"titulo", sb2.ToString()}, {"proceso", proc2} };
        }
      } catch { }
    }
    return r;
  }

  // ---------- acciones ----------
  static void Hacer(Dictionary<string, object> o) {
    string op = (string)o["op"];
    Func<string, int> I = k => Convert.ToInt32(o[k]);
    switch (op) {
      case "mover": Mover(I("x"), I("y")); break;
      case "clic": {
        Mover(I("x"), I("y")); Thread.Sleep(40);
        string b = o.ContainsKey("boton") ? (string)o["boton"] : "izq";
        uint d = b == "der" ? M_RDOWN : b == "medio" ? M_MDOWN : M_LDOWN, u = b == "der" ? M_RUP : b == "medio" ? M_MUP : M_LUP;
        int veces = o.ContainsKey("doble") && Convert.ToBoolean(o["doble"]) ? 2 : 1;
        for (int k = 0; k < veces; k++) { Mouse(d); Thread.Sleep(25); Mouse(u); Thread.Sleep(60); }
        break;
      }
      case "arrastrar": {
        Mover(I("x"), I("y")); Thread.Sleep(50); Mouse(M_LDOWN); Thread.Sleep(80);
        int x2 = I("x2"), y2 = I("y2"), x1 = I("x"), y1 = I("y");
        for (int k = 1; k <= 12; k++) { Mover(x1 + (x2 - x1) * k / 12, y1 + (y2 - y1) * k / 12); Thread.Sleep(20); }
        Thread.Sleep(60); Mouse(M_LUP); break;
      }
      case "scroll": {
        if (o.ContainsKey("x")) { Mover(I("x"), I("y")); Thread.Sleep(30); }
        int n = I("cantidad");
        for (int k = 0; k < Math.Abs(n); k++) { Mouse(M_WHEEL, unchecked((uint)(n > 0 ? -120 : 120))); Thread.Sleep(30); }
        break;
      }
      case "escribir": {
        foreach (char c in (string)o["texto"]) {
          if (c == '\n') { Tecla(0x0D, false); Tecla(0x0D, true); }
          else if (c == '\t') { Tecla(0x09, false); Tecla(0x09, true); }
          else if (c != '\r') Unicode(c);
          Thread.Sleep(8);
        }
        break;
      }
      case "tecla": {
        var partes = ((string)o["combo"]).Split('+');
        var vks = new List<ushort>(); foreach (var p in partes) vks.Add(CodigoTecla(p));
        foreach (var v in vks) { Tecla(v, false); Thread.Sleep(15); }
        for (int k = vks.Count - 1; k >= 0; k--) { Tecla(vks[k], true); Thread.Sleep(15); }
        break;
      }
      default: throw new Exception("orden desconocida: " + op);
    }
  }

  // ---------- vigilante: el usuario recupera el control ----------
  static void Vigilar() {
    while (true) {
      Thread.Sleep(40);
      if (!armado || ocupado || Ahora() < graciaHasta) continue;
      string motivo = null;
      POINT p; GetCursorPos(out p);
      if ((GetAsyncKeyState(0x11) & 0x8000) != 0 && (GetAsyncKeyState(0x12) & 0x8000) != 0 && (GetAsyncKeyState(0x1B) & 0x8000) != 0) motivo = "teclas";
      else if (Math.Abs(p.X - espX) > 4 || Math.Abs(p.Y - espY) > 4) motivo = "raton";
      else if ((GetAsyncKeyState(0x01) & 0x8000) != 0 || (GetAsyncKeyState(0x02) & 0x8000) != 0) motivo = "clic";
      else for (int vk = 0x08; vk <= 0xFE; vk++) {
        if (vk >= 0x01 && vk <= 0x06) continue;
        if ((GetAsyncKeyState(vk) & 0x8000) != 0) { motivo = "teclado"; break; }
      }
      if (motivo != null) { armado = false; Escribir(new Dictionary<string, object> { {"evento", "panico"}, {"motivo", motivo} }); }
    }
  }

  // ---------- grabación de demostraciones (gancho de bajo nivel SOLO mientras graba) ----------
  delegate IntPtr ProcGancho(int n, IntPtr w, IntPtr l);
  [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetWindowsHookEx(int id, ProcGancho fn, IntPtr mod, uint hilo);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h, int n, IntPtr w, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam, lParam; public uint time; public POINT pt; }
  [DllImport("user32.dll")] static extern int GetMessage(out MSG m, IntPtr h, uint a, uint b);
  [DllImport("user32.dll")] static extern bool PeekMessage(out MSG m, IntPtr h, uint a, uint b, uint quitar);
  [DllImport("user32.dll")] static extern bool PostThreadMessage(uint hilo, uint msg, IntPtr w, IntPtr l);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string n);
  [DllImport("user32.dll")] static extern short GetKeyState(int vk);
  [DllImport("user32.dll")] static extern IntPtr GetKeyboardLayout(uint hilo);
  [DllImport("user32.dll")] static extern int ToUnicodeEx(uint vk, uint scan, byte[] estado, StringBuilder sb, int n, uint flags, IntPtr hkl);
  [StructLayout(LayoutKind.Sequential)] struct MSLL { public POINT pt; public uint mouseData, flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct KBLL { public uint vk, scan, flags, time; public IntPtr extra; }

  class Ev { public string tipo, boton; public int x, y, delta; public uint vk, scan; public bool ctrl, alt, shift, win, caps; public long t; }
  static readonly System.Collections.Concurrent.BlockingCollection<Ev> cola = new System.Collections.Concurrent.BlockingCollection<Ev>();
  static ProcGancho procRaton, procTeclado;            // referencias vivas: que el recolector no se lleve los delegados
  static IntPtr ganchoRaton = IntPtr.Zero, ganchoTeclado = IntPtr.Zero;
  static uint hiloGancho = 0; static Thread hiloG = null, trabajador = null;
  static volatile bool grabando = false;
  static bool Pulsada(int vk) { return (GetAsyncKeyState(vk) & 0x8000) != 0; }

  // el gancho solo encola (tiene que contestar rapidísimo o Windows lo quita); el trabajador hace lo lento (UIA)
  static IntPtr Raton(int n, IntPtr w, IntPtr l) {
    if (n >= 0 && grabando) {
      var d = (MSLL)Marshal.PtrToStructure(l, typeof(MSLL));
      if ((d.flags & 1) == 0) {                         // LLMHF_INJECTED: lo que hace el propio robot no cuenta
        int m = w.ToInt32();
        if (m == 0x201 || m == 0x204 || m == 0x207) cola.Add(new Ev { tipo = "clic", x = d.pt.X, y = d.pt.Y, boton = m == 0x201 ? "izq" : m == 0x204 ? "der" : "medio", t = Ahora() });
        else if (m == 0x20A) cola.Add(new Ev { tipo = "scroll", x = d.pt.X, y = d.pt.Y, delta = (short)((d.mouseData >> 16) & 0xFFFF), t = Ahora() });
      }
    }
    return CallNextHookEx(IntPtr.Zero, n, w, l);
  }
  static IntPtr Teclado(int n, IntPtr w, IntPtr l) {
    if (n >= 0 && grabando) {
      var d = (KBLL)Marshal.PtrToStructure(l, typeof(KBLL));
      int m = w.ToInt32();
      if ((d.flags & 0x10) == 0 && (m == 0x100 || m == 0x104))   // LLKHF_INJECTED fuera; WM_KEYDOWN / WM_SYSKEYDOWN
        cola.Add(new Ev { tipo = "tecla", vk = d.vk, scan = d.scan, ctrl = Pulsada(0x11), alt = Pulsada(0x12), shift = Pulsada(0x10),
          win = Pulsada(0x5B) || Pulsada(0x5C), caps = (GetKeyState(0x14) & 1) != 0, t = Ahora() });
    }
    return CallNextHookEx(IntPtr.Zero, n, w, l);
  }

  static Dictionary<string, object> VentanaActiva() {
    var h = GetForegroundWindow(); var sb = new StringBuilder(512); GetWindowText(h, sb, 512);
    uint pid; GetWindowThreadProcessId(h, out pid);
    string proc = ""; try { proc = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch { }
    return new Dictionary<string, object> { {"titulo", sb.ToString()}, {"proceso", proc} };
  }
  static Dictionary<string, object> ElemDemo(AutomationElement e) {
    if (e == null) return null;
    try {
      var c = e.Current; string nom = (c.Name ?? ""); if (nom.Length > 100) nom = nom.Substring(0, 100);
      return new Dictionary<string, object> { {"tipo", c.ControlType.ProgrammaticName.Replace("ControlType.", "")}, {"nombre", nom}, {"id", c.AutomationId ?? ""}, {"password", c.IsPassword} };
    } catch { return null; }
  }
  static string NombreTecla(uint vk) {
    if (vk >= 0x41 && vk <= 0x5A) return ((char)('a' + vk - 0x41)).ToString();
    if (vk >= 0x30 && vk <= 0x39) return ((char)('0' + vk - 0x30)).ToString();
    if (vk >= 0x70 && vk <= 0x87) return "f" + (vk - 0x6F);
    switch (vk) {
      case 0x0D: return "enter"; case 0x1B: return "esc"; case 0x09: return "tab"; case 0x08: return "backspace"; case 0x2E: return "delete";
      case 0x2D: return "insert"; case 0x20: return "space"; case 0x26: return "up"; case 0x28: return "down"; case 0x25: return "left"; case 0x27: return "right";
      case 0x24: return "home"; case 0x23: return "end"; case 0x21: return "pageup"; case 0x22: return "pagedown"; case 0x2C: return "printscreen"; case 0x5D: return "menu";
    }
    return null;
  }
  static bool EsModificador(uint vk) { return vk == 0x10 || vk == 0x11 || vk == 0x12 || (vk >= 0xA0 && vk <= 0xA5) || vk == 0x5B || vk == 0x5C || vk == 0x14 || vk == 0x90 || vk == 0x91; }
  static long focoT = 0; static Dictionary<string, object> focoCache = null;

  static void Trabajar() {
    foreach (var ev in cola.GetConsumingEnumerable()) {
      try {
        var r = new Dictionary<string, object> { {"evento", "demo"}, {"tipo", ev.tipo}, {"t", ev.t} };
        if (ev.tipo == "clic" || ev.tipo == "scroll") {
          r["x"] = ev.x; r["y"] = ev.y;
          if (ev.tipo == "clic") {
            r["boton"] = ev.boton; Dictionary<string, object> el = null;
            try { el = ElemDemo(AutomationElement.FromPoint(new System.Windows.Point(ev.x, ev.y))); } catch { }
            r["elemento"] = el; focoCache = null;
          } else r["delta"] = ev.delta;
          r["ventana"] = VentanaActiva();
        } else {
          if (EsModificador(ev.vk)) continue;
          if (ev.ctrl && ev.alt && ev.vk == 0x1B) { Escribir(new Dictionary<string, object> { {"evento", "demo-fin"}, {"motivo", "Ctrl+Alt+Esc"} }); continue; }
          if (focoCache == null || Ahora() - focoT > 400) { try { focoCache = ElemDemo(AutomationElement.FocusedElement); } catch { focoCache = null; } focoT = Ahora(); }
          r["ventana"] = VentanaActiva(); r["foco"] = focoCache;
          bool secreto = focoCache != null && focoCache.ContainsKey("password") && (bool)focoCache["password"];
          string nombre = NombreTecla(ev.vk);
          bool altGr = ev.ctrl && ev.alt;
          if ((ev.ctrl || ev.alt || ev.win) && !altGr) {     // combinación: ctrl+s, alt+tab, win+e…
            var partes = new List<string>();
            if (ev.ctrl) partes.Add("ctrl"); if (ev.alt) partes.Add("alt"); if (ev.shift) partes.Add("shift"); if (ev.win) partes.Add("win");
            partes.Add(nombre ?? ("vk" + ev.vk)); r["combo"] = string.Join("+", partes);
          } else if (nombre != null && nombre.Length > 1 && ev.vk != 0x20) {   // especiales: enter, tab, flechas, F5…
            r["combo"] = ev.shift ? "shift+" + nombre : nombre;
          } else if (secreto) {
            r["secreto"] = true;                              // campo de contraseña: NUNCA el carácter
          } else {
            var est = new byte[256]; if (ev.shift) est[0x10] = 0x80; if (ev.caps) est[0x14] = 0x01; if (altGr) { est[0x11] = 0x80; est[0x12] = 0x80; }
            var sb = new StringBuilder(8); uint pid;
            var hkl = GetKeyboardLayout(GetWindowThreadProcessId(GetForegroundWindow(), out pid));
            int k = ToUnicodeEx(ev.vk, ev.scan, est, sb, 8, 4, hkl);   // flag 4: no altera el estado de teclas muertas del usuario
            if (k <= 0) continue;
            r["texto"] = sb.ToString(0, k);
          }
        }
        Escribir(r);
      } catch { }
    }
  }

  static void Grabar() {
    if (armado) throw new Exception("el robot tiene el control: no se puede grabar a la vez");
    if (hiloG != null) return;
    if (trabajador == null) { trabajador = new Thread(Trabajar); trabajador.IsBackground = true; trabajador.Start(); }
    string error = null; var listo = new ManualResetEvent(false);
    hiloG = new Thread(() => {
      hiloGancho = GetCurrentThreadId();
      MSG m; PeekMessage(out m, IntPtr.Zero, 0, 0, 0);       // crea la cola de mensajes del hilo antes de avisar
      procRaton = Raton; procTeclado = Teclado;
      IntPtr mod = GetModuleHandle(null);
      ganchoRaton = SetWindowsHookEx(14, procRaton, mod, 0);
      ganchoTeclado = SetWindowsHookEx(13, procTeclado, mod, 0);
      if (ganchoRaton == IntPtr.Zero || ganchoTeclado == IntPtr.Zero) {
        error = "no pude instalar el gancho (" + Marshal.GetLastWin32Error() + ")";
        if (ganchoRaton != IntPtr.Zero) UnhookWindowsHookEx(ganchoRaton);
        if (ganchoTeclado != IntPtr.Zero) UnhookWindowsHookEx(ganchoTeclado);
        ganchoRaton = IntPtr.Zero; ganchoTeclado = IntPtr.Zero; listo.Set(); return;
      }
      grabando = true; listo.Set();
      while (GetMessage(out m, IntPtr.Zero, 0, 0) > 0) { }
      grabando = false;
      UnhookWindowsHookEx(ganchoRaton); UnhookWindowsHookEx(ganchoTeclado);
      ganchoRaton = IntPtr.Zero; ganchoTeclado = IntPtr.Zero;
    });
    hiloG.IsBackground = true; hiloG.Start();
    if (!listo.WaitOne(5000)) throw new Exception("el gancho no arrancó");
    if (error != null) { hiloG = null; throw new Exception(error); }
  }
  static void Parar() {
    if (hiloG == null) return;
    grabando = false;
    for (int k = 0; k < 10 && hiloG.IsAlive; k++) { PostThreadMessage(hiloGancho, 0x0012, IntPtr.Zero, IntPtr.Zero); hiloG.Join(300); }   // WM_QUIT
    hiloG = null;
  }

  public static void Run() {
    SetProcessDPIAware();
    var t = new Thread(Vigilar); t.IsBackground = true; t.Start();
    Escribir(new Dictionary<string, object> { {"evento", "listo"} });
    string linea;
    while ((linea = Console.In.ReadLine()) != null) {
      if (linea.Trim().Length == 0) continue;
      object id = null;
      try {
        var o = js.Deserialize<Dictionary<string, object>>(linea);
        id = o.ContainsKey("id") ? o["id"] : null;
        string op = (string)o["op"];
        Dictionary<string, object> r;
        if (op == "info") r = Info(o);
        else if (op == "armar") { POINT p; GetCursorPos(out p); espX = p.X; espY = p.Y; graciaHasta = Ahora() + 300; armado = true; r = new Dictionary<string, object>(); }
        else if (op == "desarmar") { armado = false; r = new Dictionary<string, object>(); }
        else if (op == "grabar") { Grabar(); r = new Dictionary<string, object> { {"grabando", true} }; }
        else if (op == "parar") { Parar(); r = new Dictionary<string, object> { {"grabando", false} }; }
        else {
          if (o.ContainsKey("armadoRequerido") && Convert.ToBoolean(o["armadoRequerido"]) && !armado) throw new Exception("el control está desactivado");
          ocupado = true;
          try { Hacer(o); } finally { POINT p; GetCursorPos(out p); espX = p.X; espY = p.Y; graciaHasta = Ahora() + 250; ocupado = false; }
          r = new Dictionary<string, object>();
        }
        r["id"] = id; r["ok"] = true; Escribir(r);
      } catch (Exception e) { Escribir(new Dictionary<string, object> { {"id", id}, {"ok", false}, {"error", e.Message} }); }
    }
  }
}
'@
[Manos]::Run()
